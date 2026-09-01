import fs from 'node:fs/promises';
import path from 'node:path';
import { createArtifact, createEvent, createRun } from './contracts.mjs';

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

export function createRuntime({ rootDir, registry, roles = null, contextProvider = null, defaultAllowEmptyIntent = false, observability = false, eventSink = null, artifactValidators = {}, runtimeInstanceId = `runtime-${process.pid}-${Date.now()}` }) {
  if (!registry?.get) throw new Error('Runtime requires a Harness Registry');
  const runsDir = path.resolve(rootDir, 'runs');
  const controllers=new Map();

  async function saveRun(run) {
    const target=path.join(runsDir,run.id,'run.json');
    const temporary=path.join(runsDir,run.id,`.run-${process.pid}.tmp`);
    await fs.writeFile(temporary,`${JSON.stringify(run,null,2)}\n`);
    await fs.rename(temporary,target);
  }

  async function appendEvent(run, type, payload = {}) {
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
    await fs.appendFile(path.join(runsDir, run.id, 'events.jsonl'), `${JSON.stringify(event)}\n`);
    await saveRun(run);
    if (typeof eventSink === 'function') await eventSink(event, run);
    return event;
  }

  async function start({ intent, role = 'product-owner', workflow = 'brief', parentRunId = null, reusedArtifactIds = [], allowEmptyIntent = false, launchRequestId = null } = {}) {
    if (!allowEmptyIntent && !String(intent || '').trim()) throw new Error('A run requires an intent');
    const run = createRun({ intent, role, workflow, parentRunId, reusedArtifactIds, runtimeInstanceId, launchRequestId });
    await fs.mkdir(path.join(runsDir, run.id, 'artifacts'), { recursive: true });
    await fs.writeFile(path.join(runsDir, run.id, 'events.jsonl'), '');
    await saveRun(run);
    await appendEvent(run, 'RunRequested', { intent: run.intent, role: run.role, workflow: run.workflow });
    run.status='launching';
    await appendEvent(run,'RunLaunching',{runtimeInstanceId});
    const definition = roles?.get?.(run.role) || null;
    if (definition) await appendEvent(run, 'RoleContextLoaded', { roleId:definition.id, label:definition.label || definition.id });
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

  async function prepareFork({ sourceRunId, fromStage, intent, role, workflow, stages = [], launchRequestId = null } = {}) {
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
    const run = await start({ intent: intent || sourceRun.intent, role: role || sourceRun.role, workflow: workflow || sourceRun.workflow, parentRunId: sourceRun.id, reusedArtifactIds,launchRequestId });
    const context = { artifacts: [] };
    for (const metadata of reusable) {
      const artifact = await loadArtifact(sourceRun, metadata);
      run.artifacts.push({ ...metadata, runId: artifact.runId, ownerRunId: artifact.runId, reused: true });
      context.artifacts.push(artifact);
      await appendEvent(run, 'ArtifactReused', { artifactId: metadata.id, type: metadata.type, sourceRunId: sourceRun.id });
    }
    return { run, context, stages:selectedStages };
  }

  async function verifyRequiredOutputs(run,definition={}){
    for(const type of definition.requiredArtifacts||[]){
      const metadata=[...run.artifacts].reverse().find(item=>item.type===type);
      if(!metadata)throw Object.assign(new Error(`Required output is missing: ${type}`),{code:'ARTIFACT_UNAVAILABLE'});
      const value=await loadArtifact(run,metadata);
      if(!value||value.type!==type)throw Object.assign(new Error(`Required output cannot be read: ${type}`),{code:'ARTIFACT_UNAVAILABLE'});
      if(typeof artifactValidators[type]==='function')artifactValidators[type](value);
    }
    for(const requirement of definition.requiredMaterializations||[]){
      const metadata=[...run.artifacts].reverse().find(item=>item.type===requirement.type);
      const value=metadata?await loadArtifact(run,metadata):null;
      const materialized=value?.data?.[requirement.field];
      if(materialized==null||materialized===''||(Array.isArray(materialized)&&!materialized.length))throw Object.assign(new Error(`Required materialization is unavailable: ${requirement.type}.${requirement.field}`),{code:'ARTIFACT_UNAVAILABLE'});
      if(value&&typeof artifactValidators[requirement.type]==='function')artifactValidators[requirement.type](value);
    }
  }

  async function execute(run, stages, context, definition={}) {
    let activeStage = null;
    const controller=new AbortController();controllers.set(run.id,{controller,run,cancellationRecorded:false});
    try {
      run.status = 'running';
      run.reasonCode=null;
      await appendEvent(run,'RunStarted',{runtimeInstanceId});
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
      run.status = 'completed';
      run.reasonCode=null;
      await appendEvent(run, 'RunCompleted', { artifacts: run.artifacts.map(item => item.id) });
    } catch (error) {
      const reasonCode=failureReason(error),cancelled=reasonCode==='user-cancelled';
      run.status=cancelled?'cancelled':'failed';run.reasonCode=reasonCode;
      const message=String(error.message||error);
      if(!cancelled)await appendEvent(run, 'HarnessFailed', { harnessId: activeStage?.harnessId || 'unknown', message, code:error.code||'HARNESS_FAILED',reasonCode });
      if(!cancelled||run.events.at(-1)?.type!=='RunCancelled')await appendEvent(run,cancelled?'RunCancelled':'RunFailed',{message,code:error.code||'HARNESS_FAILED',reasonCode,physicalOperationSettled:true});
      else await appendEvent(run,'RunCancellationSettled',{reasonCode,physicalOperationSettled:true});
    } finally {
      controllers.delete(run.id);
    }
    return run;
  }

  async function launchFork(options = {}) {
    const prepared = await prepareFork(options);
    const completion = execute(prepared.run, prepared.stages, prepared.context,options.workflowDefinition||{});
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
    run.artifacts.push({ id: value.id, type: value.type, sourceArtifactIds, file: relativeFile, ...(producedByOperationId ? { producedByOperationId } : {}) });
    await fs.writeFile(path.join(runsDir, run.id, relativeFile), `${JSON.stringify(value, null, 2)}\n`);
    await appendEvent(run, 'ArtifactCreated', { artifactId: value.id, type: value.type, ...(producedByOperationId ? { producedByOperationId } : {}) });
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

  async function launch({ intent, role = 'product-owner', workflow = 'brief', stages = [], allowEmptyIntent = false, launchRequestId = null, workflowDefinition = {} } = {}) {
    if (!Array.isArray(stages) || !stages.length) throw new Error('A workflow requires at least one harness stage');
    const run = await start({ intent, role, workflow, allowEmptyIntent: allowEmptyIntent || defaultAllowEmptyIntent,launchRequestId });
    const completion = execute(run, stages, { artifacts: [] },workflowDefinition);
    return { run, completion };
  }

  async function run(options = {}) {
    const launched = await launch(options);
    return launched.completion;
  }

  async function inspect(id) {
    return JSON.parse(await fs.readFile(path.join(runsDir, id, 'run.json'), 'utf8'));
  }

  async function cancel(id){
    const run=await inspect(id);if(TERMINAL_STATES.has(run.status))return run;
    const active=controllers.get(id),target=active?.run||run;target.status='cancelled';target.reasonCode='user-cancelled';
    await appendEvent(target,'RunCancelled',{reasonCode:target.reasonCode,message:'Run cancelled by user',physicalOperationSettled:false});
    if(active){active.cancellationRecorded=true;active.controller.abort()}
    return inspect(id);
  }

  async function recoverOrphanedRuns(){
    await fs.mkdir(runsDir,{recursive:true});
    const entries=await fs.readdir(runsDir,{withFileTypes:true}).catch(()=>[]),recovered=[];
    for(const entry of entries.filter(item=>item.isDirectory())){
      let run;try{run=await inspect(entry.name)}catch{continue}
      if(!['launching','running'].includes(run.status)||run.ownerRuntimeInstanceId===runtimeInstanceId)continue;
      run.status='interrupted';run.reasonCode='runtime-interrupted';run.activeOperationIds=[];
      await appendEvent(run,'RunInterrupted',{reasonCode:'runtime-interrupted',previousRuntimeInstanceId:run.ownerRuntimeInstanceId,runtimeInstanceId});
      recovered.push(run.id);
    }
    return recovered;
  }

  return { start, launch, run, launchFork, fork, dispatch, inspect, cancel, recoverOrphanedRuns, verifyRequiredOutputs, runtimeInstanceId, runsDir };
}
