const FLOW=[['intent-discovery','DISCOVERY'],['intent','INTENT'],['brief','BRIEF'],['research','RESEARCH'],['validation','VALIDATION'],['synthesis','SYNTHESIS'],['data','DATA'],['interactive-result','INTERACTIVE'],['narrative','STORY'],['slides','PRESENTATION']];
const ARTIFACT_STAGE={Intent:'intent',Brief:'brief',EvidenceSet:'research',ValidationReport:'validation',SynthesisPlan:'synthesis',DataArtifact:'data',InteractiveResult:'interactive-result',PresentationStoryPlan:'presentation-story',Narrative:'narrative',Presentation:'slides'};
const REQUEST_STAGE={IntentDiscoveryRequested:'intent-discovery',BriefRequested:'brief',ResearchRequested:'research',ValidationRequested:'validation',SynthesisRequested:'synthesis',DataRequested:'data',InteractiveResultRequested:'interactive-result',PresentationStoryRequested:'presentation-story',NarrativeRequested:'narrative',PresentationRequested:'slides'};
const RELATION_CONTRACT_VERSION=1;
const RELATIONS={
  'Intent>Brief':'supplies','Brief>EvidenceSet':'supplies','EvidenceSet>ValidationReport':'validates',
  'Intent>SynthesisPlan':'supplies','Brief>SynthesisPlan':'supplies','EvidenceSet>SynthesisPlan':'supplies','ValidationReport>SynthesisPlan':'validates',
  'SynthesisPlan>DataArtifact':'selects','EvidenceSet>DataArtifact':'supplies','ValidationReport>DataArtifact':'validates',
  'SynthesisPlan>Narrative':'frames','DataArtifact>Narrative':'grounds',
  'SynthesisPlan>Presentation':'frames','DataArtifact>Presentation':'grounds'
};
const COMPACT_FLOW=[['intent-discovery','intent'],['intent','brief'],['brief','research'],['research','validation'],['validation','synthesis'],['synthesis','data'],['data','narrative'],['data','slides']];

const clip=(value,max=240)=>{const text=String(value||'').replace(/\s+/g,' ').trim();return text.length>max?`${text.slice(0,max-1)}…`:text};
const ordered=events=>(events||[]).map((event,index)=>({...event,sequence:Number(event.sequence||index+1)})).sort((a,b)=>a.sequence-b.sequence);
const safeDisplay=(payload={})=>{const value=String(payload.displayInput||'');return value&&value.length<=180&&!/[\r\n]/.test(value)?value:null};
const stageFor=event=>{const value=String(event?.payload?.stage||event?.payload?.harnessId||'').toLowerCase();return FLOW.find(([id])=>value===id||value.includes(id))?.[0]||REQUEST_STAGE[event?.type]||ARTIFACT_STAGE[event?.payload?.type]||null};
const sourceMeta=(value={})=>{const sourceId=String(value.sourceId||'').slice(0,160),sourceKind=String(value.sourceKind||'unknown').slice(0,32);return{sourceId,sourceKind,safeDisplayName:String(value.safeDisplayName||value.sourceTitle||sourceId||'source').split(/[\\/]/).at(-1).slice(0,160),contextRootId:value.contextRootId||(sourceKind==='example'||sourceId.startsWith('example:')?'showcase':sourceId.startsWith('local-added:')?'user-added':sourceId.startsWith('local:')?'project':['web','mcp'].includes(sourceKind)?sourceKind:null)}};
const eventChannel=event=>{const type=String(event.type),capability=String(event.payload?.capability||'').toUpperCase();if(type.startsWith('Inference')||capability==='MODEL')return'MODEL';if(type.startsWith('Source')||['FILES','LOCAL','WEB','MCP'].includes(capability))return'SOURCES';if(type.startsWith('Artifact')||capability==='PRESENTATION')return'ARTIFACTS';return'ALL'};
const relationFor=(fromType,toType)=>RELATIONS[`${fromType}>${toType}`]||'upstream';

function actionOutcome(events,artifacts){
  const failed=[...events].reverse().find(event=>/Failed$/.test(event.type));if(failed)return failed.payload?.message||failed.payload?.code||'Operation failed';
  if(artifacts.length)return`${artifacts.map(item=>item.type).join(', ')} created`;
  const completed=[...events].reverse().find(event=>/Completed$/.test(event.type)||event.type==='SourceRead');
  if(!completed)return null;
  if(completed.type==='SourceRead')return'Source read';
  if(Number.isFinite(Number(completed.payload?.found)))return`${completed.payload.found} sources found`;
  return completed.type.replace(/([a-z])([A-Z])/g,'$1 $2');
}

function projectActions(events,artifactById){
  const operations=new Map();
  for(const event of events){
    const id=event.payload?.operationId;if(!id)continue;
    const action=operations.get(id)||{id:`action:${id}`,correlationId:id,firstSequence:event.sequence,lastSequence:event.sequence,stageId:stageFor(event),harnessId:event.payload?.harnessId||null,capability:String(event.payload?.capability||(event.type.startsWith('Inference')?'MODEL':'')).toUpperCase()||null,displayInput:null,status:'requested',resultSummary:null,relatedEventIds:[],relatedArtifactIds:[]};
    action.firstSequence=Math.min(action.firstSequence,event.sequence);action.lastSequence=Math.max(action.lastSequence,event.sequence);action.relatedEventIds.push(event.eventId||event.id);action.displayInput=action.displayInput||safeDisplay(event.payload);
    if(/Started$/.test(event.type)||event.type==='SourceOpened')action.startedAt=action.startedAt||event.at;
    if(/Completed$|Failed$/.test(event.type)||event.type==='SourceRead'){action.finishedAt=event.at;const explicit=Number(event.payload?.durationMs);const measured=action.startedAt?Date.parse(event.at)-Date.parse(action.startedAt):NaN;action.durationMs=Number.isFinite(explicit)&&explicit>=0?explicit:Number.isFinite(measured)&&measured>=0?measured:null}
    if(/Started$/.test(event.type)||event.type==='SourceOpened')action.status='running';if(/Completed$/.test(event.type)||event.type==='SourceRead')action.status='completed';if(/Failed$/.test(event.type))action.status='failed';operations.set(id,action);
  }
  for(const event of events){const operationId=event.type==='ArtifactCreated'?event.payload?.producedByOperationId:null;if(operationId&&operations.has(operationId))operations.get(operationId).relatedArtifactIds.push(event.payload.artifactId)}
  const actions=[...operations.values()].filter(action=>action.displayInput).sort((a,b)=>a.firstSequence-b.firstSequence);
  for(const action of actions){const relatedEvents=events.filter(event=>action.relatedEventIds.includes(event.eventId||event.id)),relatedArtifacts=action.relatedArtifactIds.map(id=>artifactById.get(id)).filter(Boolean);action.resultSummary=actionOutcome(relatedEvents,relatedArtifacts)}
  return actions;
}

function artifactPreview(item){
  const data=item.data||{},base={artifactId:item.id,type:item.type,sourceArtifactIds:item.sourceArtifactIds||[]};
  if(item.type==='Intent')return{...base,question:data.question,status:data.status,reason:data.reason,expectedDecision:data.expectedDecision};
  if(item.type==='Brief')return{...base,question:data.question,goal:data.goal,audience:data.audience,expectedDecision:data.expectedDecision,constraints:data.constraints||[]};
  if(item.type==='EvidenceSet')return{...base,count:(data.items||[]).length,summary:data.summary};
  if(item.type==='ValidationReport')return{...base,valid:data.valid,decisions:data.items||[],conflicts:data.conflicts||[],unknowns:data.unknowns||[]};
  if(item.type==='SynthesisPlan')return{...base,objective:data.objective,audience:data.audience,claims:data.keyClaims||[],uncertainties:data.uncertainties||[]};
  if(item.type==='DataArtifact')return{...base,title:data.title,columns:data.columns||[],rows:data.rows||[],metrics:data.numericMetrics||[],insights:data.insights||[],provenance:data.provenance||{}};
  if(item.type==='InteractiveResult')return{...base,surfaceId:data.surfaceId,catalogId:data.catalogId,protocolVersion:data.protocolVersion,planner:data.planner||null};
  if(item.type==='Narrative')return{...base,audience:data.audience,excerpt:clip(data.content,360),sections:data.sections||[]};
  if(item.type==='Presentation')return{...base,slides:data.slides||[]};
  return base;
}

export function projectObservation(run,{capabilities=[],configuration={},artifacts=[],contracts=[]}={}){
  const events=ordered(run?.events),states=new Map(FLOW.map(([id])=>[id,'future'])),caps=new Map(capabilities.map(value=>[String(value).toUpperCase(),'idle'])),consoleLines=[],sources=new Map(),roots=new Map(),failures=new Map();
  let activeStage=null,currentHarness=null,intent=null,role={id:run?.role||null,label:run?.role||null};
  for(const root of configuration.roots||[])roots.set(root.id,{id:root.id,label:root.label||root.id,kind:root.kind||'project',state:'available'});
  for(const value of configuration.sources||[]){const item=sourceMeta(value);if(item.sourceId)sources.set(item.sourceId,{...item,state:value.state||'available',tracking:'SNAPSHOT',evidenceIds:[]});if(value.contextRootId&&!roots.has(value.contextRootId))roots.set(value.contextRootId,{id:value.contextRootId,label:String(value.contextRootId).replace(/-/g,' ').toUpperCase(),kind:'user-added',state:'available'})}
  for(const event of events){
    const payload=event.payload||{},stage=stageFor(event);
    if(event.type==='HarnessStarted'&&stage){activeStage=stage;states.set(stage,'active');currentHarness=payload.harnessId||stage}if(event.type==='HarnessCompleted'&&stage){states.set(stage,'completed');if(activeStage===stage){activeStage=null;currentHarness=null}}if(event.type==='HarnessFailed'&&stage){states.set(stage,'failed');failures.set(stage,{message:payload.message,code:payload.code});if(activeStage===stage){activeStage=null;currentHarness=null}}
    if(event.type==='IntentDiscovered')intent=payload.question||intent;if(event.type==='RoleContextLoaded')role={id:payload.roleId,label:payload.label||payload.roleId};if(event.type==='ArtifactCreated'&&payload.type==='Intent')states.set('intent','completed');if(event.type==='ArtifactReused'&&ARTIFACT_STAGE[payload.type])states.set(ARTIFACT_STAGE[payload.type],'reused');
    if(event.type==='SourceOpened'||event.type==='SourceRead'){const item=sourceMeta(payload);if(item.sourceId){if(item.contextRootId&&!roots.has(item.contextRootId))roots.set(item.contextRootId,{id:item.contextRootId,label:item.contextRootId==='showcase'?'Демонстрационный контекст':item.contextRootId.toUpperCase(),kind:item.sourceKind,state:'observed'});const old=sources.get(item.sourceId)||{...item,state:'available',tracking:'SNAPSHOT',evidenceIds:[]};sources.set(item.sourceId,{...old,...item,state:event.type==='SourceRead'?'read':'opened',tracking:event.type==='SourceOpened'?'LIVE':'SNAPSHOT',sequence:event.sequence,capability:payload.capability||null})}}
    if(event.type==='EvidenceCollected')for(const ref of payload.sources||[]){const item=sourceMeta(ref);if(!item.sourceId)continue;if(item.contextRootId&&!roots.has(item.contextRootId))roots.set(item.contextRootId,{id:item.contextRootId,label:item.contextRootId==='showcase'?'Демонстрационный контекст':item.contextRootId.toUpperCase(),kind:item.sourceKind,state:'observed'});const old=sources.get(item.sourceId)||{...item,state:'available',tracking:'SNAPSHOT',evidenceIds:[]};sources.set(item.sourceId,{...old,...item,state:'used-as-evidence',tracking:'SNAPSHOT',evidenceIds:[...new Set([...(old.evidenceIds||[]),...(ref.evidenceIds||[])])]})}
    const capability=String(payload.capability||(event.type.startsWith('Inference')?'MODEL':'')).toUpperCase();if(capability&&caps.has(capability)){if(/Requested$/.test(event.type))caps.set(capability,'requested');if(/Started$/.test(event.type)||event.type==='SourceOpened')caps.set(capability,'active');if(/Completed$/.test(event.type)||event.type==='SourceRead')caps.set(capability,'complete');if(/Failed$/.test(event.type))caps.set(capability,'failed')}
    consoleLines.push({eventId:event.eventId||event.id,sequence:event.sequence,at:event.at,type:event.type,stage,capability:capability||null,channel:eventChannel(event),displayInput:safeDisplay(payload),payload});
  }
  const artifactById=new Map(artifacts.map(item=>[item.id,item])),byType=new Map(artifacts.map(item=>[item.type,item])),metadataById=new Map((run?.artifacts||[]).map(item=>[item.id,item]));
  const dependencies=[];
  for(const item of artifacts)for(const sourceId of item.sourceArtifactIds||[]){const source=artifactById.get(sourceId),fromType=source?.type||metadataById.get(sourceId)?.type||'Unknown';dependencies.push({fromArtifactId:sourceId,toArtifactId:item.id,fromType,toType:item.type,relation:relationFor(fromType,item.type),persisted:true})}
  for(const event of events.filter(item=>item.type==='ArtifactReused'))dependencies.push({fromArtifactId:event.payload.artifactId,toArtifactId:null,fromType:event.payload.type,toType:null,relation:'reuses',persisted:true,eventId:event.eventId});
  const actions=projectActions(events,artifactById),actionEventIds=new Set(actions.flatMap(action=>action.relatedEventIds));
  const terminalRecords=[];
  for(const action of actions)terminalRecords.push({kind:'action',sequence:action.firstSequence,channel:action.capability==='MODEL'?'MODEL':['FILES','LOCAL','WEB','MCP'].includes(action.capability)?'SOURCES':action.capability||String(action.displayInput).startsWith('presentation.')?'ARTIFACTS':'ALL',action});
  for(const line of consoleLines)if(!actionEventIds.has(line.eventId)||line.type==='ArtifactCreated'&&!line.payload?.producedByOperationId)terminalRecords.push({kind:'event',sequence:line.sequence,channel:line.channel,event:line});
  terminalRecords.sort((a,b)=>a.sequence-b.sequence);
  const evidenceSet=byType.get('EvidenceSet')?.data||{},validation=byType.get('ValidationReport')?.data||{},synthesis=byType.get('SynthesisPlan')?.data||{},dataArtifact=byType.get('DataArtifact')?.data||{},validationByEvidence=new Map((validation.items||[]).map(item=>[String(item.evidenceId),item])),dataRefsByEvidence=new Map();
  for(const group of ['rows','metrics','insights'])for(const item of dataArtifact.provenance?.[group]||[])for(const id of item.evidenceIds||[]){const current=dataRefsByEvidence.get(String(id))||{rowIds:[],metricIds:[],insightIds:[]},key=group==='rows'?'rowIds':group==='metrics'?'metricIds':'insightIds';current[key].push(item.rowId||item.metricId||item.insightId);dataRefsByEvidence.set(String(id),current)}
  const evidence=(evidenceSet.items||[]).map(item=>({...item,validation:validationByEvidence.get(String(item.id))||null,usedBy:[],dataRefs:dataRefsByEvidence.get(String(item.id))||{rowIds:[],metricIds:[],insightIds:[]}})),evidenceById=new Map(evidence.map(item=>[String(item.id),item])),claims=(synthesis.keyClaims||[]).map(claim=>({...claim,evidenceIds:(claim.evidenceIds||[]).map(String),outputTypes:[]})),claimById=new Map(claims.map(item=>[String(item.id),item]));
  for(const claim of claims)for(const id of claim.evidenceIds)evidenceById.get(id)?.usedBy.push(claim.id);
  const artifactRefs=artifacts.map(item=>({...artifactPreview(item),stage:ARTIFACT_STAGE[item.type]||null,reused:Boolean(metadataById.get(item.id)?.reused),producedByOperationId:metadataById.get(item.id)?.producedByOperationId||null}));
  const outputs=artifactRefs.filter(item=>['Narrative','DataArtifact','Presentation'].includes(item.type)).map(item=>{const claimIds=new Set(),evidenceIds=new Set(),dataRefs={rowIds:new Set(),metricIds:new Set(),insightIds:new Set()};for(const row of item.provenance?.rows||[])for(const id of row.claimIds||[])claimIds.add(String(id));for(const part of [...(item.sections||[]),...(item.slides||[])]){for(const id of part.claimIds||[])claimIds.add(String(id));for(const id of part.evidenceIds||[])evidenceIds.add(String(id));for(const key of Object.keys(dataRefs))for(const id of part.dataRefs?.[key]||[])dataRefs[key].add(String(id))}for(const id of evidenceIds)for(const claimId of evidenceById.get(id)?.usedBy||[])claimIds.add(String(claimId));return{artifactId:item.artifactId,type:item.type,reused:item.reused,claimIds:[...claimIds],evidenceIds:[...evidenceIds],dataRefs:Object.fromEntries(Object.entries(dataRefs).map(([key,value])=>[key,[...value]]))}});
  outputs.push(...artifactRefs.filter(item=>item.type==='InteractiveResult').map(item=>({artifactId:item.artifactId,type:item.type,reused:item.reused,claimIds:[],evidenceIds:[],dataRefs:{rowIds:[],metricIds:[],insightIds:[]}})));
  for(const output of outputs)for(const id of output.claimIds)claimById.get(id)?.outputTypes.push(output.type);
  const stages=FLOW.map(([id,label])=>{const stageArtifacts=artifactRefs.filter(item=>item.stage===id),activeActionIds=actions.filter(action=>action.stageId===id&&['requested','running'].includes(action.status)).map(action=>action.id);return{id,label,state:states.get(id),active:activeStage===id,result:{artifacts:stageArtifacts.filter(item=>!item.reused),reusedArtifacts:stageArtifacts.filter(item=>item.reused),observableOutcome:stageArtifacts.length?`${stageArtifacts.map(item=>item.type).join(', ')} ready`:null,activeActionIds,failure:failures.get(id)||null}}});
  const fullStageEdges=[];
  for(const contract of contracts||[])for(const input of contract.inputs||[])for(const output of contract.outputs||[]){const from=ARTIFACT_STAGE[input],to=ARTIFACT_STAGE[output];if(from&&to&&from!==to)fullStageEdges.push({from,to,inputType:input,outputType:output,relation:relationFor(input,output)})}
  const flowEdges=COMPACT_FLOW.map(([from,to])=>({from,to}));
  if(!intent)intent=byType.get('Intent')?.data?.question||run?.intent||null;
  const startedAt=events.find(event=>event.type==='RunRequested')?.at||run?.createdAt||null;
  const finishedAt=[...events].reverse().find(event=>['RunCompleted','RunFailed'].includes(event.type))?.at||null;
  const elapsedMs=startedAt?Math.max(0,Date.parse(finishedAt||new Date().toISOString())-Date.parse(startedAt)):0;
  return{runId:run?.id||null,status:run?.status||null,intent,brief:byType.get('Brief')?.data||null,activeStage,currentHarness,role,stages,flowEdges,fullStageEdges,dependencyContractVersion:RELATION_CONTRACT_VERSION,dependencies,agentActions:actions,terminalRecords,safeInputEvents:actions.map(action=>({sequence:action.firstSequence,operationId:action.correlationId,displayInput:action.displayInput,capability:action.capability,stageId:action.stageId})),capabilities:[...caps].map(([id,state])=>({id,state,active:state==='active'})),contextWorld:{roots:[...roots.values()],sources:[...sources.values()],activeSourceId:[...sources.values()].find(item=>item.tracking==='LIVE')?.sourceId||null},evidence:{count:evidence.length,validated:[...validationByEvidence.values()].filter(item=>item.valid).length,unknown:[...validationByEvidence.values()].filter(item=>!item.valid).length,items:evidence},validationDecisions:validation.items||[],claims,outputs,artifacts:artifactRefs,artifactRefs,reusedArtifacts:artifactRefs.filter(item=>item.reused),consoleLines,startedAt,finishedAt,elapsedMs,lastSequence:events.at(-1)?.sequence||0};
}
