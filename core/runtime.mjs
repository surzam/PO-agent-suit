import fs from 'node:fs/promises';
import path from 'node:path';
import { createArtifact, createEvent, createRun } from './contracts.mjs';

function resultContract(result) {
  if (!result || typeof result !== 'object') throw new Error('Harness must return a result object');
  if (result.artifacts !== undefined && !Array.isArray(result.artifacts)) throw new Error('Harness result artifacts must be an array');
  if (result.events !== undefined && !Array.isArray(result.events)) throw new Error('Harness result events must be an array');
  for (const artifact of result.artifacts || []) if (!artifact?.type) throw new Error('Harness artifact requires type');
  for (const event of result.events || []) if (!event?.type) throw new Error('Harness event requires type');
  return { artifacts: result.artifacts || [], events: result.events || [], failure: result.failure || null, halt: result.halt || null };
}

export function createRuntime({ rootDir, registry, roles = null, contextProvider = null, defaultAllowEmptyIntent = false, observability = false, eventSink = null }) {
  if (!registry?.get) throw new Error('Runtime requires a Harness Registry');
  const runsDir = path.resolve(rootDir, 'runs');

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
    const sequence = Number(run.events.at(-1)?.sequence || 0) + 1;
    const event = createEvent({ type, runId: run.id, payload:safePayload, sequence });
    run.events.push(event);
    run.updatedAt = event.at;
    await fs.appendFile(path.join(runsDir, run.id, 'events.jsonl'), `${JSON.stringify(event)}\n`);
    await saveRun(run);
    if (typeof eventSink === 'function') await eventSink(event, run);
    return event;
  }

  async function start({ intent, role = 'product-owner', workflow = 'brief', parentRunId = null, reusedArtifactIds = [], allowEmptyIntent = false } = {}) {
    if (!allowEmptyIntent && !String(intent || '').trim()) throw new Error('A run requires an intent');
    const run = createRun({ intent, role, workflow, parentRunId, reusedArtifactIds });
    await fs.mkdir(path.join(runsDir, run.id, 'artifacts'), { recursive: true });
    await fs.writeFile(path.join(runsDir, run.id, 'events.jsonl'), '');
    await saveRun(run);
    await appendEvent(run, 'RunRequested', { intent: run.intent, role: run.role, workflow: run.workflow });
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

  async function prepareFork({ sourceRunId, fromStage, intent, role, workflow, stages = [] } = {}) {
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
    const run = await start({ intent: intent || sourceRun.intent, role: role || sourceRun.role, workflow: workflow || sourceRun.workflow, parentRunId: sourceRun.id, reusedArtifactIds });
    const context = { artifacts: [] };
    for (const metadata of reusable) {
      const artifact = await loadArtifact(sourceRun, metadata);
      run.artifacts.push({ ...metadata, runId: artifact.runId, ownerRunId: artifact.runId, reused: true });
      context.artifacts.push(artifact);
      await appendEvent(run, 'ArtifactReused', { artifactId: metadata.id, type: metadata.type, sourceRunId: sourceRun.id });
    }
    return { run, context, stages:selectedStages };
  }

  async function execute(run, stages, context) {
    let activeStage = null;
    try {
      run.status = 'running';
      await saveRun(run);
      for (const stage of stages) {
        activeStage = stage;
        const outcome = await dispatch(run, stage, context);
        if (outcome.halt) {
          run.status = outcome.halt.status || 'needs-context';
          await appendEvent(run, 'RunCompleted', { status:run.status, cause:outcome.halt.cause || null, artifacts:run.artifacts.map(item => item.id) });
          return run;
        }
      }
      run.status = 'completed';
      await appendEvent(run, 'RunCompleted', { artifacts: run.artifacts.map(item => item.id) });
    } catch (error) {
      const providerUnavailable = error.code === 'PROVIDER_FAILURE' || error.code === 'provider-failure' || /fetch failed|ECONNREFUSED|ENOTFOUND|timed out|timeout|model.*unavailable/i.test(String(error.message || ''));
      const message = providerUnavailable
        ? 'Не удалось продолжить работу: локальная модель недоступна. Запустите модель и попробуйте снова.'
        : error.message;
      const code = providerUnavailable ? 'PROVIDER_UNAVAILABLE' : (error.code || 'HARNESS_FAILED');
      run.status = 'failed';
      await appendEvent(run, 'HarnessFailed', { harnessId: activeStage?.harnessId || 'unknown', message, code });
      await appendEvent(run, 'RunFailed', { message, code });
    }
    return run;
  }

  async function launchFork(options = {}) {
    const prepared = await prepareFork(options);
    const completion = execute(prepared.run, prepared.stages, prepared.context);
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

  async function dispatch(run, stage, context) {
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

  async function launch({ intent, role = 'product-owner', workflow = 'brief', stages = [], allowEmptyIntent = false } = {}) {
    if (!Array.isArray(stages) || !stages.length) throw new Error('A workflow requires at least one harness stage');
    const run = await start({ intent, role, workflow, allowEmptyIntent: allowEmptyIntent || defaultAllowEmptyIntent });
    const completion = execute(run, stages, { artifacts: [] });
    return { run, completion };
  }

  async function run(options = {}) {
    const launched = await launch(options);
    return launched.completion;
  }

  async function inspect(id) {
    return JSON.parse(await fs.readFile(path.join(runsDir, id, 'run.json'), 'utf8'));
  }

  return { start, launch, run, launchFork, fork, dispatch, inspect, runsDir };
}
