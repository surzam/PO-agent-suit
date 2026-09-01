export const AG_UI_SCHEMA_VERSION=1;
export const TOOL_CAPABILITIES=new Set(['FILES','LOCAL','WEB','MCP','SHELL','BROWSER']);
export const CUSTOM_NAMES=Object.freeze({
  RunCancelled:'agentsuite.run.cancelled',RunCancellationSettled:'agentsuite.run.cancellation-settled',RunInterrupted:'agentsuite.run.interrupted',HarnessFailed:'agentsuite.step.failed',
  InferenceRequested:'agentsuite.inference.requested',InferenceStarted:'agentsuite.inference.started',InferenceCompleted:'agentsuite.inference.completed',InferenceFailed:'agentsuite.inference.failed',
  SourceOpened:'agentsuite.source.opened',SourceRead:'agentsuite.source.read',EvidenceCollected:'agentsuite.evidence.collected',ArtifactCreated:'agentsuite.artifact.created',ArtifactReused:'agentsuite.artifact.reused',RoleContextLoaded:'agentsuite.role.loaded',ResearchProgressed:'agentsuite.research.progressed',ResearchCompleted:'agentsuite.research.completed',ValidationCompleted:'agentsuite.validation.completed',SynthesisCompleted:'agentsuite.synthesis.completed',DataCompleted:'agentsuite.data.completed',NarrativeCompleted:'agentsuite.narrative.completed',PresentationCompleted:'agentsuite.presentation.completed'
});

export function isToolOperation(event){const capability=String(event?.payload?.capability||'').toUpperCase();return Boolean(event?.payload?.operationId&&TOOL_CAPABILITIES.has(capability)&&!event.type.startsWith('Inference'))}

export function deterministicThreadId(run,lookup=()=>null){const explicit=run?.interopMetadata?.agUi?.threadId;if(explicit)return explicit;let current=run,guard=0;while(current?.parentRunId&&guard++<100){const parent=lookup(current.parentRunId);if(!parent)break;current=parent}return `agentsuite-thread:${current?.id||run?.id}`}
