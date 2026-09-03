export const EVENT_TYPES = Object.freeze([
  'RunRequested',
  'RunLaunching',
  'RunStarted',
  'RunNeedsContext',
  'RunCancelled',
  'RunCancellationSettled',
  'RunInterrupted',
  'IntentDiscoveryRequested',
  'IntentDiscovered',
  'IntentDiscoveryInsufficientContext',
  'IntentDiscoveryFailed',
  'HarnessStarted',
  'HarnessCompleted',
  'CapabilityRequested',
  'CapabilityStarted',
  'CapabilityCompleted',
  'CapabilityFailed',
  'SourceOpened',
  'SourceRead',
  'InferenceRequested',
  'InferenceStarted',
  'InferenceCompleted',
  'InferenceFailed',
  'RoleContextLoaded',
  'BriefCreated',
  'ResearchRequested',
  'ResearchProgressed',
  'EvidenceCollected',
  'ResearchCompleted',
  'ResearchFailed',
  'ResearchContextRequired',
  'ArtifactCreated',
  'RunCompleted',
  'RunFailed',
  'InteractiveResultRequested',
  'InteractiveResultCreated',
  'InteractiveResultCompleted',
  'OptionalMaterializationFailed',
  'PresentationStoryRequested',
  'PresentationStoryPlanned'
]);

export function validateRunId(value) {
  const id=String(value||'');
  if(!/^[A-Za-z0-9][A-Za-z0-9._:-]{7,159}$/.test(id)||id.includes('..'))throw Object.assign(new Error('Invalid Run identity'),{code:'INVALID_RUN_ID'});
  return id;
}

export function createRun({ id = null, intent, role = 'product-owner', workflow = 'brief', parentRunId = null, reusedArtifactIds = [], runtimeInstanceId = null, launchRequestId = null, interopMetadata = null } = {}) {
  const now = new Date().toISOString();
  return {
    id: id ? validateRunId(id) : `run-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    intent: String(intent || '').trim(),
    role,
    workflow,
    parentRunId,
    reusedArtifactIds: [...reusedArtifactIds],
    status: 'created',
    reasonCode: null,
    ownerRuntimeInstanceId: runtimeInstanceId,
    launchRequestId,
    interopMetadata:interopMetadata&&typeof interopMetadata==='object'?structuredClone(interopMetadata):null,
    lastRuntimeActivityAt: now,
    lastAppliedSequence: 0,
    activeOperationIds: [],
    operations: [],
    createdAt: now,
    updatedAt: now,
    events: [],
    artifacts: []
  };
}

export function createEvent({ type, runId, payload = {}, sequence = 0 } = {}) {
  if (typeof type !== 'string' || !type.trim()) throw new Error('Event requires a non-empty type');
  const value = Number(sequence);
  if (!Number.isSafeInteger(value) || value < 1) throw new Error('Event requires a positive integer sequence');
  const eventId = `${runId}:${String(value).padStart(8, '0')}`;
  return { id:eventId, eventId, sequence:value, type: type.trim(), runId, at: new Date().toISOString(), payload };
}

export function createArtifact({ runId, type, data, sourceArtifactIds = [] } = {}) {
  return { id: `artifact-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, runId, type, sourceArtifactIds: [...sourceArtifactIds], createdAt: new Date().toISOString(), data };
}
