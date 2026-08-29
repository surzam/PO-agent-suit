export const EVENT_TYPES = Object.freeze([
  'RunRequested',
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
  'EvidenceCollected',
  'ResearchCompleted',
  'ResearchFailed',
  'ResearchContextRequired',
  'ArtifactCreated',
  'RunCompleted',
  'RunFailed'
]);

export function createRun({ intent, role = 'product-owner', workflow = 'brief', parentRunId = null, reusedArtifactIds = [] } = {}) {
  const now = new Date().toISOString();
  return {
    id: `run-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    intent: String(intent || '').trim(),
    role,
    workflow,
    parentRunId,
    reusedArtifactIds: [...reusedArtifactIds],
    status: 'created',
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
