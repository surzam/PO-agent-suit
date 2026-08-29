const FLOW = [
  ['intent-discovery','DISCOVERY'], ['intent','INTENT'], ['brief','BRIEF'],
  ['research','RESEARCH'], ['validation','VALIDATION'], ['synthesis','SYNTHESIS'],
  ['narrative','NARRATIVE'], ['data','DATA'], ['slides','PRESENTATION']
];

const ARTIFACT_STAGE = { Intent:'intent', Brief:'brief', EvidenceSet:'research', ValidationReport:'validation', SynthesisPlan:'synthesis', Narrative:'narrative', DataArtifact:'data', Presentation:'slides' };
const REQUEST_STAGE = { IntentDiscoveryRequested:'intent-discovery', BriefRequested:'brief', ResearchRequested:'research', ValidationRequested:'validation', SynthesisRequested:'synthesis', NarrativeRequested:'narrative', DataRequested:'data', PresentationRequested:'slides' };

function stageFor(event) {
  const explicit=String(event?.payload?.stage || event?.payload?.harnessId || '').toLowerCase();
  const match=FLOW.find(([id])=>explicit===id || explicit.includes(id));
  return match?.[0] || REQUEST_STAGE[event?.type] || ARTIFACT_STAGE[event?.payload?.type] || null;
}
function ordered(events) { return events.map((event,index)=>({...event,sequence:Number(event.sequence || index+1)})).sort((a,b)=>a.sequence-b.sequence); }
function safeDisplay(payload={}) { const value=String(payload.displayInput || ''); return value && value.length<=180 && !/[\r\n]/.test(value) ? value : null; }

export function projectObservation(run,{capabilities=[]}={}) {
  const events=ordered(Array.isArray(run?.events)?run.events:[]);
  const stageState=new Map(FLOW.map(([id])=>[id,'future']));
  const capabilityState=new Map(capabilities.map(value=>[String(value).toUpperCase(),'idle']));
  const consoleLines=[]; const artifacts=[]; const reused=[];
  let activeStage=null; let currentHarness=null; let intent=null; let role={id:run?.role || null,label:run?.role || null};
  let evidenceCount=0, validationCount=0, validationUnknown=0;
  for (const event of events) {
    const payload=event.payload || {}; const stage=stageFor(event);
    if (event.type==='HarnessStarted' && stage) { if (activeStage && stageState.get(activeStage)==='active') stageState.set(activeStage,'completed'); activeStage=stage; stageState.set(stage,'active'); currentHarness=payload.harnessId || stage; }
    if (event.type==='HarnessCompleted' && stage) { stageState.set(stage,'completed'); if (activeStage===stage) activeStage=null; }
    if (event.type==='HarnessFailed' && stage) { stageState.set(stage,'failed'); if (activeStage===stage) activeStage=null; }
    if (event.type==='IntentDiscovered') intent=payload.question || intent;
    if (event.type==='RoleContextLoaded') role={id:payload.roleId,label:payload.label || payload.roleId};
    if (event.type==='ArtifactCreated') { artifacts.push({artifactId:payload.artifactId,type:payload.type,stage:ARTIFACT_STAGE[payload.type]||stage,reused:false,sequence:event.sequence}); }
    if (event.type==='ArtifactReused') { const value={artifactId:payload.artifactId,type:payload.type,stage:ARTIFACT_STAGE[payload.type]||stage,reused:true,sourceRunId:payload.sourceRunId,sequence:event.sequence}; reused.push(value); artifacts.push(value); if(value.stage)stageState.set(value.stage,'reused'); }
    if (event.type==='EvidenceCollected') evidenceCount=Number(payload.count || payload.evidenceIds?.length || evidenceCount);
    if (event.type==='EvidenceValidated') { validationCount=Number(payload.validCount ?? (payload.valid?payload.checked:0) ?? 0); validationUnknown=Number(payload.invalidCount ?? (payload.valid?0:payload.checked) ?? 0); }
    const capability=String(payload.capability || (event.type.startsWith('Inference')?'MODEL':'')).toUpperCase();
    if (capability) {
      if (!capabilityState.has(capability)) capabilityState.set(capability,'idle');
      if (/Requested$/.test(event.type)) capabilityState.set(capability,'requested');
      if (/Started$/.test(event.type)) capabilityState.set(capability,'active');
      if (/Completed$/.test(event.type)) capabilityState.set(capability,'complete');
      if (/Failed$/.test(event.type)) capabilityState.set(capability,'failed');
    }
    consoleLines.push({eventId:event.eventId || event.id,sequence:event.sequence,at:event.at,type:event.type,stage,capability:capability || null,displayInput:safeDisplay(payload),payload});
  }
  if (!intent) intent=run?.intent || null;
  return {
    runId:run?.id || null,status:run?.status || null,intent,activeStage,currentHarness,role,
    stages:FLOW.map(([id,label])=>({id,label,state:stageState.get(id),active:activeStage===id})),
    capabilities:[...capabilityState].map(([id,state])=>({id,state,active:state==='active'})),
    evidence:{count:evidenceCount,validated:validationCount,unknown:validationUnknown},
    consoleLines,artifacts,reusedArtifacts:reused,lastSequence:events.at(-1)?.sequence || 0
  };
}
