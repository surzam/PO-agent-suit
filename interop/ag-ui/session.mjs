import {projectHumanInterrupts} from '../../core/human-interrupt.mjs';
import {projectSurfaces} from './surfaces.mjs';
import {displayCapabilitiesForRole} from '../../core/capabilities.mjs';
import {projectSurfaceGraph} from './surface-graph.mjs';
import {composeSurfaces} from './composition.mjs';
// Live Session is a rebuildable view of Runtime journal + persisted artifacts.
// It is intentionally pure: no session record is written and no UI choice can
// alter Runtime truth without an acknowledged Runtime interaction.
export const UI_COMPONENT_CATALOG=Object.freeze(['text','markdown','table','chart','file-tree','source','evidence','validation','timeline','diff','story','presentation','approval','choice','input','progress']);
export const UI_INTERACTION_CATALOG=Object.freeze(['select','expand','collapse','edit','approve','reject','cancel','retry','branch','filter','sort','invoke','add-context']);
export const UI_INTENT_CATALOG=Object.freeze(['SHOW_SOURCE','SHOW_FILE','SHOW_DIRECTORY','SHOW_EVIDENCE','SHOW_VALIDATION','SHOW_TABLE','SHOW_CHART','SHOW_RESULT','REQUEST_INPUT','REQUEST_APPROVAL','SHOW_COMPARISON','SHOW_DIFF','SHOW_PROGRESS']);
export const UI_INPUT_TYPES=Object.freeze(['CANCEL_RUN','RETRY_RUN','BRANCH_RUN','ADD_CONTEXT','SELECT_SOURCE','SHOW_ARTIFACT','SHOW_EVIDENCE','CHANGE_QUESTION','APPROVE','REJECT','INVOKE_CAPABILITY','RESPOND_TO_INTERRUPT']);

const clip=(value,max=320)=>String(value??'').replace(/\s+/g,' ').trim().slice(0,max);
const humanActivity=(event={})=>{
  const type=event.type||'', p=event.payload||{};
  if(type==='IntentDiscoveryRequested')return'Формирую вопрос';
  if(type==='ResearchRequested'||type==='ResearchProgressed')return'Ищу источники';
  if(type==='SourceOpened')return`Читаю источник: ${clip(p.safeDisplayName||p.sourceId||'источник',96)}`;
  if(type==='SourceRead')return`Прочитал источник: ${clip(p.safeDisplayName||p.sourceId||'источник',96)}`;
  if(type==='EvidenceCollected')return'Собираю проверяемые факты';
  if(type==='ValidationRequested'||type==='ValidationCompleted')return'Проверяю утверждения';
  if(type==='DataRequested'||type==='DataCompleted')return'Собираю данные';
  if(type==='NarrativeRequested'||type==='NarrativeCompleted')return'Готовлю рассказ';
  if(type==='PresentationRequested'||type==='PresentationCompleted')return'Готовлю слайды';
  if(type==='ArtifactCreated')return`Сохранил: ${clip(p.type||'артефакт',64)}`;
  if(type==='ArtifactReused')return`Использую сохранённый материал: ${clip(p.type||'артефакт',64)}`;
  if(type==='RunCompleted')return'Исследование завершено';
  if(type==='RunCancelled')return'Исследование отменено';
  if(type==='RunWaitingForHuman')return'Жду вашего решения';
  if(type==='RunResumed')return'Продолжаю после вашего решения';
  if(type==='RunFailed')return'Исследование не завершилось';
  return null;
};

export function projectActivity(run){
  const items=[];
  for(const event of (run?.events||[]).slice().sort((a,b)=>a.sequence-b.sequence)){
    const label=humanActivity(event);if(!label)continue;
    const operationId=event.payload?.operationId||null;
    if(operationId&&(/Completed$/.test(event.type)||/Failed$/.test(event.type)||event.type==='SourceRead'))for(const item of items)if(item.operationId===operationId&&item.status==='active')item.status='completed';
    items.push({id:`activity:${event.eventId||event.sequence}`,sequence:event.sequence,label,status:/Failed$/.test(event.type)?'failed':['RunCompleted','RunCancelled','RunInterrupted'].includes(event.type)?'completed':event.type==='SourceOpened'||/Requested$/.test(event.type)?'active':'completed',eventType:event.type,operationId,at:event.at});
  }
  if(['completed','failed','cancelled','interrupted','needs-context','waiting-for-human'].includes(run?.status))for(const item of items)if(item.status==='active')item.status='completed';
  const current=[...items].reverse().find(item=>item.status==='active')||null;
  return {current:current?{id:current.id,label:current.label}:null,items};
}

export function createLiveSessionState(run,{observation={},threadId=null,capabilities=[]}={}){
  const filesystem=observation.filesystem||{rootId:'workspace',nodes:[],currentPath:'workspace'};
  const outputs=(observation.outputs||[]).filter(item=>['Narrative','DataArtifact','Presentation'].includes(item.type));
  const messages=[];
  if(run?.intent)messages.push({id:`user:${run.id}`,role:'user',content:clip(run.intent,1200)});
  const activity=projectActivity(run);
  const interrupts=projectHumanInterrupts(run?.events||[]),pending=interrupts.find(item=>item.state==='pending')||null;
  const state={
    schemaVersion:1,
    session:{threadId:threadId||`agentsuite-thread:${run?.id||'run'}`,runId:run?.id||null,status:run?.status||'unknown',lastSequence:observation.lastSequence||run?.lastAppliedSequence||run?.events?.at(-1)?.sequence||0},
    role:{id:run?.role||'product-owner',displayCapabilities:displayCapabilitiesForRole(run?.role||'product-owner')},
    intent:{text:clip(observation.intent||run?.intent||'',1200),status:run?.status||'unknown'},
    activity,
    workspace:{root:filesystem.rootId,directories:filesystem.nodes.filter(node=>['workspace','directory'].includes(node.kind)),files:filesystem.nodes.filter(node=>!['workspace','directory'].includes(node.kind)),selectedNode:null,currentPath:filesystem.currentPath},
    research:{sources:observation.contextWorld?.sources||[],evidence:observation.evidence?.items||[],validation:observation.validationDecisions||[]},
    outputs:{artifacts:outputs},
    ui:{surfaces:['CHAT','ACTIVITY','WORKSPACE','RESULTS'],selectedSurface:'CHAT',pendingInteraction:pending?{interruptId:pending.id,kind:pending.kind,prompt:pending.prompt,options:pending.options,state:pending.state}:null,interactionHistory:interrupts.filter(item=>item.state!=='pending').map(item=>({kind:item.kind,prompt:item.prompt,state:item.state,response:item.response,resolvedAt:item.resolvedAt})),capabilities:{components:UI_COMPONENT_CATALOG,interactions:UI_INTERACTION_CATALOG,available:capabilities.filter(item=>UI_COMPONENT_CATALOG.includes(item))}},
    messages
  };
  state.surfaceState=projectSurfaces(state,{historical:['completed','failed','cancelled','interrupted'].includes(run?.status)});
  state.surfaceGraph=projectSurfaceGraph({sessionId:state.session.runId,surfaces:state.surfaceState.items,updatedFromSequence:state.session.lastSequence});
  state.surfaceComposition=composeSurfaces({session:state,surfaces:state.surfaceState.items,graph:state.surfaceGraph,role:state.role});
  return state;
}

// AG-UI StateSnapshot owns the outer interoperability state. Keep deltas scoped
// to its `session` key so a client can apply them with standard JSON Patch.
export const snapshotDelta=state=>[{op:'replace',path:'/session',value:state}];

export function validateUiInput(value){
  if(!value||typeof value!=='object'||Array.isArray(value))throw Object.assign(new Error('UI input must be an object'),{code:'UI_INPUT_INVALID'});
  const type=String(value.type||'');if(!UI_INPUT_TYPES.includes(type))throw Object.assign(new Error('Unsupported UI input'),{code:'UI_INPUT_UNSUPPORTED'});
  const runId=String(value.runId||'');if(!/^[A-Za-z0-9][A-Za-z0-9._:-]{7,159}$/.test(runId)||runId.includes('..'))throw Object.assign(new Error('Invalid Run identity'),{code:'UI_INPUT_RUN_INVALID'});
  const payload=value.payload&&typeof value.payload==='object'&&!Array.isArray(value.payload)?value.payload:{};
  if(type==='INVOKE_CAPABILITY'){
    if(!/^[A-Za-z0-9][A-Za-z0-9._:-]{7,159}$/.test(String(payload.invocationId||''))||!String(payload.capabilityId||'')||!payload.input||typeof payload.input!=='object'||Array.isArray(payload.input))throw Object.assign(new Error('Capability invocation is invalid'),{code:'UI_INPUT_INVALID'});
  }
  if(type==='RESPOND_TO_INTERRUPT'&&(!/^[A-Za-z0-9][A-Za-z0-9._:-]{3,199}$/.test(String(payload.interruptId||''))||payload.response===undefined))throw Object.assign(new Error('Interrupt response is invalid'),{code:'UI_INPUT_INVALID'});
  return {type,runId,payload};
}

export function materializeUiIntent(intent,registeredComponents=[]){
  const allowed=new Set(registeredComponents);const required={SHOW_SOURCE:'source',SHOW_FILE:'file-tree',SHOW_DIRECTORY:'file-tree',SHOW_EVIDENCE:'evidence',SHOW_VALIDATION:'validation',SHOW_TABLE:'table',SHOW_CHART:'chart',SHOW_RESULT:'story',REQUEST_INPUT:'input',REQUEST_APPROVAL:'approval',SHOW_COMPARISON:'diff',SHOW_DIFF:'diff',SHOW_PROGRESS:'progress'}[intent?.type];
  if(!required||!allowed.has(required))return null;
  // This is declarative metadata only. It never contains executable markup.
  return {component:required,intent:intent.type,data:intent.data&&typeof intent.data==='object'?structuredClone(intent.data):{}};
}
