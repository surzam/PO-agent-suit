import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { createArtifact, createEvent, createRun, validateRunId } from './contracts.mjs';

const TERMINAL_STATES=new Set(['completed','failed','cancelled','interrupted']);
const OPERATION_START=new Set(['CapabilityRequested','CapabilityStarted','InferenceRequested','InferenceStarted','ArtifactRequested','SourceOpened']);
const OPERATION_END=new Set(['CapabilityCompleted','CapabilityFailed','InferenceCompleted','InferenceFailed','ArtifactCompleted','ArtifactFailed','SourceRead']);
function operationStatus(type){if(type==='SourceOpened')return'running';if(type==='SourceRead')return'completed';if(/Requested$/.test(type))return'requested';if(/Started$/.test(type))return'running';if(/Completed$/.test(type))return'completed';if(/Failed$/.test(type))return'failed';return null}

function failureReason(error){
  const code=String(error?.code||'').toLowerCase(),message=String(error?.message||error||'');
  if(code==='abort_err'||code==='aborted'||/\babort(?:ed)?\b/i.test(message))return'user-cancelled';
  if(code.includes('timeout')||/timed out|deadline exceeded|timeout/i.test(message))return code.includes('source')?'source-timeout':code.includes('research')?'research-timeout':'inference-timeout';
  if(code.includes('malformed')||code.includes('invalid_provider_response')||error instanceof SyntaxError||/invalid.*json|unexpected end.*json/i.test(message))return'malformed-response';
  if(code.includes('source'))return'source-unavailable';
  if(code.includes('artifact')||/RequiredArtifactUnavailable/i.test(message))return'artifact-unavailable';
  if(code.includes('provider')||/fetch failed|ECONNREFUSED|ENOTFOUND|model.*unavailable/i.test(message))return'provider-unavailable';
  return code||'harness-failed';
}

function resultContract(result) {
  if (!result || typeof result !== 'object') throw new Error('Harness must return a result object');
  if (result.artifacts !== undefined && !Array.isArray(result.artifacts)) throw new Error('Harness result artifacts must be an array');
  if (result.events !== undefined && !Array.isArray(result.events)) throw new Error('Harness result events must be an array');
  for (const artifact of result.artifacts || []) if (!artifact?.type) throw new Error('Harness artifact requires type');
  for (const event of result.events || []) if (!event?.type) throw new Error('Harness event requires type');
  return { artifacts: result.artifacts || [], events: result.events || [], failure: result.failure || null, halt: result.halt || null };
}

export function createRuntime({ rootDir, registry, roles = null, contextProvider = null, defaultAllowEmptyIntent = false, observability = false, eventSink = null, artifactValidators = {}, runtimeInstanceId = `runtime-${process.pid}-${Date.now()}`, persistenceHooks = {} }) {
  if (!registry?.get) throw new Error('Runtime requires a Harness Registry');
  const runsDir = path.resolve(rootDir, 'runs');
  const controllers=new Map();
  const runLocks=new Map();
  const terminalStates=new Set(['completed','failed','cancelled','interrupted']);

  async function withRunLock(runId, task){
    const previous=runLocks.get(runId)||Promise.resolve();
    let release;
    const current=new Promise(resolve=>{release=resolve});
    const chain=previous.then(()=>current);
    runLocks.set(runId,chain);
    await previous;
    try{return await task()}finally{release();if(runLocks.get(runId)===chain)runLocks.delete(runId)}
  }

  async function syncDirectory(directory){
    try{const handle=await fs.open(directory,'r');try{await handle.sync()}finally{await handle.close()}}catch{}
  }

  async function readJournal(runId){
    const file=path.join(runsDir,runId,'events.jsonl'),text=await fs.readFile(file,'utf8').catch(error=>error?.code==='ENOENT'?'':Promise.reject(error));
    if(!text)return [];
    const lines=text.split('\n'),hasCompleteTail=text.endsWith('\n');if(hasCompleteTail)lines.pop();
    const events=[];
    for(let index=0;index<lines.length;index++){
      if(!lines[index].trim())continue;
      try{events.push(JSON.parse(lines[index]))}catch(error){
        if(index===lines.length-1&&!hasCompleteTail){
          const prefix=lines.slice(0,index).join('\n')+(index?'\n':'');await fs.truncate(file,Buffer.byteLength(prefix));break;
        }
        throw Object.assign(new Error(`Runtime journal is corrupt at line ${index+1}`),{code:'JOURNAL_CORRUPT',cause:error});
      }
    }
    if(!hasCompleteTail&&events.length===lines.length)await fs.appendFile(file,'\n');
    let previous=0;for(const event of events){if(!Number.isSafeInteger(event.sequence)||event.sequence<=previous)throw Object.assign(new Error('Runtime journal sequence is invalid'),{code:'JOURNAL_CORRUPT'});previous=event.sequence}
    return events;
  }

  function applyJournalEvent(run,event,artifactMetadata){
    const payload=event.payload||{};
    if(event.type==='RunRequested'){run.intent=String(payload.intent??run.intent??'');run.role=payload.role||run.role;run.workflow=payload.workflow||run.workflow}
    if(event.type==='RunLaunching')run.status='launching';
    if(event.type==='RunStarted')run.status='running';
    if(event.type==='RunNeedsContext'){run.status='needs-context';run.reasonCode=payload.reasonCode||'insufficient-context'}
    if(event.type==='RunCompleted'){run.status='completed';run.reasonCode=null}
    if(event.type==='RunFailed'){run.status='failed';run.reasonCode=payload.reasonCode||run.reasonCode||'harness-failed'}
    if(event.type==='RunCancelled'){run.status='cancelled';run.reasonCode=payload.reasonCode||'user-cancelled'}
    if(event.type==='RunInterrupted'){run.status='interrupted';run.reasonCode=payload.reasonCode||'runtime-interrupted'}
    if(event.type==='ArtifactCreated'&&payload.artifactId&&!artifactMetadata.has(payload.artifactId))artifactMetadata.set(payload.artifactId,{id:payload.artifactId,type:payload.type,sourceArtifactIds:(payload.sourceArtifactIds||[]).map(String),file:payload.file||`artifacts/${payload.artifactId}.json`,...(payload.producedByOperationId?{producedByOperationId:payload.producedByOperationId}: {})});
    if(payload.operationId){
      run.operations=Array.isArray(run.operations)?run.operations:[];
      let operation=run.operations.find(item=>item.operationId===payload.operationId);
      if(!operation){operation={operationId:payload.operationId,runId:run.id,stageId:payload.stage||null,purpose:payload.purpose||payload.operation||null,startedAt:event.at,lastActivityAt:event.at,deadline:payload.deadline||null,status:operationStatus(event.type)||'requested'};run.operations.push(operation)}
      operation.lastActivityAt=event.at;operation.deadline=operation.deadline||payload.deadline||null;operation.status=operationStatus(event.type)||operation.status;
      if(Number.isFinite(payload.durationMs))operation.durationMs=payload.durationMs;
      if(payload.code==='INFERENCE_TIMEOUT'||payload.code==='SOURCE_TIMEOUT')operation.status='timed-out';
      if(payload.code==='ABORTED')operation.status='cancelled';
      run.activeOperationIds=Array.isArray(run.activeOperationIds)?run.activeOperationIds:[];
      if(OPERATION_START.has(event.type)&&!run.activeOperationIds.includes(payload.operationId))run.activeOperationIds.push(payload.operationId);
      if(OPERATION_END.has(event.type))run.activeOperationIds=run.activeOperationIds.filter(id=>id!==payload.operationId);
    }
    run.updatedAt=event.at;run.lastRuntimeActivityAt=event.at;
  }

  async function reconcileSnapshot(run){
    const journal=await readJournal(run.id);if(!journal.length)return run;
    const snapshotSequence=Number(run.lastAppliedSequence||run.events?.at(-1)?.sequence||0),journalSequence=journal.at(-1).sequence;
    const samePrefix=Array.isArray(run.events)&&run.events.length<=journal.length&&run.events.every((event,index)=>event.eventId===journal[index]?.eventId);
    if(snapshotSequence===journalSequence&&samePrefix)return run;
    const metadata=new Map((run.artifacts||[]).map(item=>[item.id,{...item}]));
    for(const event of journal)applyJournalEvent(run,event,metadata);
    const createdIds=new Set(journal.filter(event=>event.type==='ArtifactCreated').map(event=>event.payload?.artifactId).filter(Boolean));
    run.artifacts=[...metadata.values()].filter(item=>createdIds.has(item.id)||run.reusedArtifactIds?.includes(item.id));
    const intentMetadata=run.artifacts.find(item=>item.type==='Intent');
    if(intentMetadata?.file){
      const intentValue=await fs.readFile(path.join(runsDir,run.id,intentMetadata.file),'utf8').then(JSON.parse).catch(()=>null);
      if(intentValue?.data?.question)run.intent=String(intentValue.data.question).trim();
    }
    run.events=journal;run.lastAppliedSequence=journalSequence;
    await saveRun(run);return run;
  }

  async function transitionRunUnlocked(run,{to,eventType,reasonCode=null,payload={}}={}){
      if(terminalStates.has(run.status))return false;
      if(!['created','launching','running'].includes(run.status))return false;
      run.status=to;run.reasonCode=reasonCode;
      await appendEventUnlocked(run,eventType,{...payload,...(reasonCode?{reasonCode}: {})});
      return true;
  }
  async function commitRunTransition(run,options={}){
    return withRunLock(run.id,()=>transitionRunUnlocked(run,options));
  }

  async function saveRun(run) {
    const target=path.join(runsDir,run.id,'run.json');
    const temporary=path.join(runsDir,run.id,`.run-${process.pid}-${crypto.randomUUID()}.tmp`);
    await persistenceHooks.beforeSnapshot?.(run);
    const handle=await fs.open(temporary,'w');
    try{await handle.writeFile(`${JSON.stringify(run,null,2)}\n`);await handle.sync()}finally{await handle.close()}
    await fs.rename(temporary,target);
    await syncDirectory(path.dirname(target));
    await persistenceHooks.afterSnapshot?.(run);
  }

  async function appendEventUnlocked(run, type, payload = {}) {
    const safePayload = { ...payload };
    if (safePayload.displayInput && !/^(?:files|local|web|mcp|model|research|artifact|presentation)\.(?:read|open|search|infer|call|collect|create|render)\("[\p{L}\p{N} ._:/-]{1,120}"\)$/u.test(String(safePayload.displayInput))) delete safePayload.displayInput;
    for (const key of ['operationId','producedByOperationId']) {
      if (safePayload[key] && !/^[\p{L}\p{N}._:-]{1,200}$/u.test(String(safePayload[key]))) delete safePayload[key];
    }
    run.operations=Array.isArray(run.operations)?run.operations:[];
    const existingOperation=safePayload.operationId?run.operations.find(item=>item.operationId===safePayload.operationId):null;
    if(existingOperation&&OPERATION_END.has(type)&&existingOperation.startedAt){
      const durationMs=Date.now()-Date.parse(existingOperation.startedAt);
      if(Number.isFinite(durationMs)&&durationMs>=0)safePayload.durationMs=durationMs;
    }
    const sequence = Number(run.events.at(-1)?.sequence || 0) + 1;
    const event = createEvent({ type, runId: run.id, payload:safePayload, sequence });
    run.events.push(event);
    run.updatedAt = event.at;
    run.lastRuntimeActivityAt=event.at;
    const operationId=safePayload.operationId;
    if(operationId){
      let operation=existingOperation;
      if(!operation){operation={operationId,runId:run.id,stageId:safePayload.stage||null,purpose:safePayload.purpose||safePayload.operation||null,startedAt:event.at,lastActivityAt:event.at,deadline:safePayload.deadline||null,status:operationStatus(type)||'requested'};run.operations.push(operation)}
      operation.lastActivityAt=event.at;operation.deadline=operation.deadline||safePayload.deadline||null;operation.status=operationStatus(type)||operation.status;if(Number.isFinite(safePayload.durationMs))operation.durationMs=safePayload.durationMs;if(operation.status==='timed-out'||safePayload.code==='INFERENCE_TIMEOUT'||safePayload.code==='SOURCE_TIMEOUT')operation.status='timed-out';if(safePayload.code==='ABORTED')operation.status='cancelled';
    }
    if(operationId&&OPERATION_START.has(type)&&!run.activeOperationIds.includes(operationId))run.activeOperationIds.push(operationId);
    if(operationId&&OPERATION_END.has(type))run.activeOperationIds=run.activeOperationIds.filter(id=>id!==operationId);
    await persistenceHooks.beforeJournalAppend?.(event,run);
    const journal=await fs.open(path.join(runsDir, run.id, 'events.jsonl'),'a');
    try{await journal.write(`${JSON.stringify(event)}\n`);await journal.sync()}finally{await journal.close()}
    run.lastAppliedSequence=event.sequence;
    await saveRun(run);
    if (typeof eventSink === 'function') await eventSink(event, run);
    return event;
  }

  async function appendEvent(run,type,payload={}){return withRunLock(run.id,()=>appendEventUnlocked(run,type,payload))}

  async function start({ intent, role = 'product-owner', workflow = 'brief', parentRunId = null, reusedArtifactIds = [], allowEmptyIntent = false, launchRequestId = null, proposedRunId = null, interopMetadata = null } = {}) {
    if (!allowEmptyIntent && !String(intent || '').trim()) throw new Error('A run requires an intent');
    if(proposedRunId)validateRunId(proposedRunId);
    const run = createRun({ id:proposedRunId,intent, role, workflow, parentRunId, reusedArtifactIds, runtimeInstanceId, launchRequestId,interopMetadata });
    await fs.mkdir(runsDir,{recursive:true});
    try{await fs.mkdir(path.join(runsDir,run.id),{recursive:false})}catch(error){if(error?.code==='EEXIST')throw Object.assign(new Error('Run identity already exists'),{code:'RUN_ID_CONFLICT'});throw error}
    await fs.mkdir(path.join(runsDir, run.id, 'artifacts'));
    await fs.writeFile(path.join(runsDir, run.id, 'events.jsonl'), '');
    await saveRun(run);
    await appendEvent(run, 'RunRequested', { intent: run.intent, role: run.role, workflow: run.workflow });
    run.status='launching';
    await appendEvent(run,'RunLaunching',{runtimeInstanceId});
    return run;
  }

  async function loadArtifact(sourceRun, metadata) {
    const fileName = metadata.file?.split('/').at(-1);
    if (!fileName) throw new Error(`RequiredArtifactUnavailable: ${metadata.id}`);
    try {
      const ownerRunId = metadata.ownerRunId || sourceRun.id;
      return JSON.parse(await fs.readFile(path.join(runsDir, ownerRunId, 'artifacts', fileName), 'utf8'));
    } catch {
      throw new Error(`RequiredArtifactUnavailable: ${metadata.id}`);
    }
  }

  async function prepareFork({ sourceRunId, fromStage, intent, role, workflow, stages = [], launchRequestId = null, proposedRunId = null, interopMetadata = null } = {}) {
    if (!sourceRunId) throw new Error('A rerun requires a source run');
    if (!fromStage) throw new Error('A rerun requires a starting stage');
    const sourceRun = await inspect(sourceRunId);
    const startIndex = stages.findIndex(stage => stage.id === fromStage || stage.harnessId === fromStage);
    if (startIndex < 0) throw new Error(`Unknown rerun stage: ${fromStage}`);
    const selectedStages = stages.slice(startIndex);
    const producedTypes = new Set(selectedStages.flatMap(stage => registry.get(stage.harnessId)?.outputs || []));
    const requiredTypes = [...new Set(selectedStages.flatMap(stage => {
      const harness = registry.get(stage.harnessId);
      return harness?.inputs || [];
    }).filter(type => !producedTypes.has(type)))];
    const reusable = requiredTypes.map(type => sourceRun.artifacts.find(artifact => artifact.type === type));
    const missing = requiredTypes.filter((type, index) => !reusable[index]);
    if (missing.length) throw new Error(`RequiredArtifactUnavailable: ${missing.join(', ')}`);
    const byId = new Map(sourceRun.artifacts.map(artifact => [artifact.id, artifact]));
    const visited = new Set();
    function validateUpstream(metadata) {
      if (!metadata || visited.has(metadata.id)) return;
      visited.add(metadata.id);
      for (const sourceId of metadata.sourceArtifactIds || []) {
        const source = byId.get(sourceId);
        if (!source) throw new Error(`RequiredArtifactUnavailable: ${sourceId}`);
        validateUpstream(source);
      }
    }
    reusable.forEach(validateUpstream);
    const reusedArtifactIds = reusable.map(artifact => artifact.id);
    const run = await start({ intent: intent || sourceRun.intent, role: role || sourceRun.role, workflow: workflow || sourceRun.workflow, parentRunId: sourceRun.id, reusedArtifactIds,launchRequestId,proposedRunId,interopMetadata });
    const context = { artifacts: [] };
    const reuseEvents=[];
    for (const metadata of reusable) {
      const artifact = await loadArtifact(sourceRun, metadata);
      run.artifacts.push({ ...metadata, runId: artifact.runId, ownerRunId: artifact.runId, reused: true });
      context.artifacts.push(artifact);
      reuseEvents.push({ artifactId: metadata.id, type: metadata.type, sourceRunId: sourceRun.id });
    }
    return { run, context, stages:selectedStages,reuseEvents };
  }

  async function verifyRequiredOutputs(run,definition={}){
    for(const type of definition.requiredArtifacts||[]){
      const metadata=[...run.artifacts].reverse().find(item=>item.type===type);
      if(!metadata)throw Object.assign(new Error(`Required output is missing: ${type}`),{code:'ARTIFACT_UNAVAILABLE'});
      const value=await loadArtifact(run,metadata);
      if(!value||value.type!==type)throw Object.assign(new Error(`Required output cannot be read: ${type}`),{code:'ARTIFACT_UNAVAILABLE'});
      if(typeof artifactValidators[type]==='function')await artifactValidators[type](value);
    }
    for(const requirement of definition.requiredMaterializations||[]){
      const metadata=[...run.artifacts].reverse().find(item=>item.type===requirement.type);
      const value=metadata?await loadArtifact(run,metadata):null;
      const materialized=value?.data?.[requirement.field];
      if(materialized==null||materialized===''||(Array.isArray(materialized)&&!materialized.length))throw Object.assign(new Error(`Required materialization is unavailable: ${requirement.type}.${requirement.field}`),{code:'ARTIFACT_UNAVAILABLE'});
      if(value&&typeof artifactValidators[requirement.type]==='function')await artifactValidators[requirement.type](value);
    }
  }

  async function execute(run, stages, context, definition={},initialEvents=[]) {
    let activeStage = null;
    const controller=new AbortController();controllers.set(run.id,{controller,run,cancellationRecorded:false});
    try {
      if(terminalStates.has(run.status))return run;
      run.status = 'running';
      run.reasonCode=null;
      await appendEvent(run,'RunStarted',{runtimeInstanceId});
      const roleDefinition=roles?.get?.(run.role)||null;
      if(roleDefinition)await appendEvent(run,'RoleContextLoaded',{roleId:roleDefinition.id,label:roleDefinition.label||roleDefinition.id});
      for(const event of initialEvents)await appendEvent(run,event.type,event.payload);
      for (const stage of stages) {
        if(controller.signal.aborted)throw Object.assign(new Error('Run cancelled by user'),{code:'ABORTED'});
        activeStage = stage;
        const outcome = await dispatch(run, stage, context,controller.signal);
        if (outcome.halt) {
          run.status = outcome.halt.status || 'needs-context';
          run.reasonCode=outcome.halt.cause||'insufficient-context';
          await appendEvent(run, 'RunNeedsContext', { reasonCode:run.reasonCode, artifacts:run.artifacts.map(item => item.id) });
          return run;
        }
      }
      await verifyRequiredOutputs(run,definition);
      await commitRunTransition(run,{to:'completed',eventType:'RunCompleted',payload:{artifacts: run.artifacts.map(item => item.id)}});
    } catch (error) {
      const reasonCode=failureReason(error),cancelled=reasonCode==='user-cancelled';
      const message=String(error.message||error);
      await withRunLock(run.id,async()=>{
        if(cancelled && run.status==='cancelled' && run.events.some(event=>event.type==='RunCancelled')){
          if(run.events.at(-1)?.type!=='RunCancellationSettled')await appendEventUnlocked(run,'RunCancellationSettled',{reasonCode,physicalOperationSettled:true});
          return;
        }
        if(terminalStates.has(run.status))return;
        if(!cancelled)await appendEventUnlocked(run, 'HarnessFailed', { harnessId: activeStage?.harnessId || 'unknown', message, code:error.code||'HARNESS_FAILED',reasonCode });
        await transitionRunUnlocked(run,{to:cancelled?'cancelled':'failed',eventType:cancelled?'RunCancelled':'RunFailed',reasonCode,payload:{message,code:error.code||'HARNESS_FAILED',reasonCode,physicalOperationSettled:true}});
      });
    } finally {
      controllers.delete(run.id);
    }
    return run;
  }

  async function launchFork(options = {}) {
    const prepared = await prepareFork(options);
    const completion = execute(prepared.run, prepared.stages, prepared.context,options.workflowDefinition||{},prepared.reuseEvents.map(payload=>({type:'ArtifactReused',payload})));
    return { run:prepared.run, completion };
  }

  async function fork(options = {}) {
    const launched = await launchFork(options);
    return launched.completion;
  }

  async function persistArtifact(run, artifact) {
    const sourceArtifactIds = [...new Set(artifact.sourceArtifactIds || artifact.inputs || [])].map(String);
    const knownArtifactIds = new Set(run.artifacts.map(item => item.id));
    const unknownInputs = sourceArtifactIds.filter(id => !knownArtifactIds.has(id));
    if (unknownInputs.length) throw new Error(`Artifact ${artifact.type} references unknown artifacts: ${unknownInputs.join(', ')}`);
    const value = createArtifact({ runId: run.id, type: artifact.type, data: artifact.data, sourceArtifactIds });
    const relativeFile = `artifacts/${value.id}.json`;
    value.file = relativeFile;
    const producedByOperationId = artifact.producedByOperationId || null;
    const target=path.join(runsDir, run.id, relativeFile),temporary=`${target}.tmp-${process.pid}-${crypto.randomUUID()}`;
    await persistenceHooks.beforeArtifactWrite?.(value,run);
    const handle=await fs.open(temporary,'w');
    try{await handle.writeFile(`${JSON.stringify(value, null, 2)}\n`);await handle.sync()}finally{await handle.close()}
    await persistenceHooks.afterArtifactWrite?.(value,run);
    await persistenceHooks.beforeArtifactRename?.(value,run);
    await fs.rename(temporary,target);
    await syncDirectory(path.dirname(target));
    await persistenceHooks.afterArtifactRename?.(value,run);
    const metadata={ id: value.id, type: value.type, sourceArtifactIds, file: relativeFile, ...(producedByOperationId ? { producedByOperationId } : {}) };
    run.artifacts.push(metadata);
    await appendEvent(run, 'ArtifactCreated', { artifactId: value.id, type: value.type, file:relativeFile, sourceArtifactIds, ...(producedByOperationId ? { producedByOperationId } : {}) });
    return value;
  }

  async function dispatch(run, stage, context, signal=null) {
    const harness = registry.get(stage.harnessId);
    if (!harness) throw new Error(`Unknown harness: ${stage.harnessId}`);
    const trigger = stage.requestEvent ? await appendEvent(run, stage.requestEvent, { harnessId: harness.id, stage: stage.id || harness.id }) : run.events.at(-1);
    if (observability) await appendEvent(run, 'HarnessStarted', { harnessId: harness.id, stage: stage.id || harness.id });
    const safeRun = Object.freeze({ ...run, events: [...run.events], artifacts: [...run.artifacts] });
    let operationOrdinal = 0;
    const createOperationId = (kind = 'operation') => `${run.id}:${stage.id || harness.id}:${String(kind).replace(/[^\p{L}\p{N}._-]/gu,'-').slice(0,48) || 'operation'}:${trigger.sequence}:${++operationOrdinal}`;
    const observe = async (type, payload = {}) => observability ? appendEvent(run, type, { ...payload, harnessId:harness.id, stage:stage.id || harness.id }) : null;
    const result = resultContract(await harness.execute({
      run: safeRun,
      event: trigger,
      artifacts: context.artifacts,
      context: typeof contextProvider === 'function' ? await contextProvider({ run: safeRun, event: trigger, artifacts: context.artifacts, role: run.role }) : (contextProvider || {}),
      observe,
      createOperationId,
      role: run.role,
      roleDefinition: roles?.get?.(run.role) || null,
      workflow: run.workflow,
      signal,
      config: stage.config || {}
    }));
    const persisted = [];
    for (const artifact of result.artifacts) {
      const saved = await persistArtifact(run, artifact);
      persisted.push(saved);
      if (saved.type === 'Intent' && saved.data?.question) { run.intent = String(saved.data.question).trim(); await saveRun(run); }
    }
    for (const event of result.events) await appendEvent(run, event.type, { ...event.payload, harnessId: harness.id });
    context.artifacts.push(...persisted);
    if (result.failure) throw Object.assign(new Error(result.failure.message), { code: result.failure.code || 'HARNESS_FAILED' });
    if (observability) await appendEvent(run, 'HarnessCompleted', { harnessId: harness.id, stage: stage.id || harness.id, artifacts: persisted.map(item => item.id) });
    return { harness, trigger, persisted, halt: result.halt || null };
  }

  async function launch({ intent, role = 'product-owner', workflow = 'brief', stages = [], allowEmptyIntent = false, launchRequestId = null, workflowDefinition = {}, proposedRunId = null, interopMetadata = null } = {}) {
    if (!Array.isArray(stages) || !stages.length) throw new Error('A workflow requires at least one harness stage');
    const run = await start({ intent, role, workflow, allowEmptyIntent: allowEmptyIntent || defaultAllowEmptyIntent,launchRequestId,proposedRunId,interopMetadata });
    const completion = execute(run, stages, { artifacts: [] },workflowDefinition);
    return { run, completion };
  }

  async function run(options = {}) {
    const launched = await launch(options);
    return launched.completion;
  }

  async function inspect(id) {
    return reconcileSnapshot(JSON.parse(await fs.readFile(path.join(runsDir, id, 'run.json'), 'utf8')));
  }

  async function cancel(id){
    const run=await inspect(id);const active=controllers.get(id),target=active?.run||run;
    await withRunLock(id,async()=>{
      if(terminalStates.has(target.status))return;
      await transitionRunUnlocked(target,{to:'cancelled',eventType:'RunCancelled',reasonCode:'user-cancelled',payload:{reasonCode:'user-cancelled',message:'Run cancelled by user',physicalOperationSettled:!active}});
      if(active){active.cancellationRecorded=true;active.controller.abort()}
    });
    return inspect(id);
  }

  async function recoverOrphanedRuns(){
    await fs.mkdir(runsDir,{recursive:true});
    const entries=await fs.readdir(runsDir,{withFileTypes:true}).catch(()=>[]),recovered=[];
    for(const entry of entries.filter(item=>item.isDirectory())){
      let run;try{run=await inspect(entry.name)}catch(error){
        if(error.code==='JOURNAL_CORRUPT'){
          const snapshot=await fs.readFile(path.join(runsDir,entry.name,'run.json'),'utf8').then(JSON.parse).catch(()=>null);
          if(snapshot&&!terminalStates.has(snapshot.status)){snapshot.status='interrupted';snapshot.reasonCode='journal-corrupt';snapshot.activeOperationIds=[];await saveRun(snapshot);recovered.push(snapshot.id)}
        }
        continue
      }
      if(!['launching','running'].includes(run.status)||run.ownerRuntimeInstanceId===runtimeInstanceId)continue;
      await withRunLock(run.id,async()=>{if(await transitionRunUnlocked(run,{to:'interrupted',eventType:'RunInterrupted',reasonCode:'runtime-interrupted',payload:{previousRuntimeInstanceId:run.ownerRuntimeInstanceId,runtimeInstanceId}}))recovered.push(run.id);});
    }
    return recovered;
  }

  return { start, launch, run, launchFork, fork, dispatch, inspect, cancel, recoverOrphanedRuns, verifyRequiredOutputs, runtimeInstanceId, runsDir };
}
