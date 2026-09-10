import {SURFACE_KINDS} from './surfaces.mjs';

export const UI_INTENT_DEFINITIONS=Object.freeze({
  SHOW_SOURCE:{type:'SHOW_SOURCE',surfaceKind:'source',authorityClass:'presentation-only',requiredRefs:['sourceRef']},
  SHOW_EVIDENCE:{type:'SHOW_EVIDENCE',surfaceKind:'evidence',authorityClass:'presentation-only',requiredRefs:['evidenceRef']},
  SHOW_VALIDATION:{type:'SHOW_VALIDATION',surfaceKind:'validation',authorityClass:'presentation-only',requiredRefs:[]},
  SHOW_TABLE:{type:'SHOW_TABLE',surfaceKind:'table',authorityClass:'presentation-only',requiredRefs:['artifactRef']},
  SHOW_RESULT:{type:'SHOW_RESULT',surfaceKind:'result',authorityClass:'presentation-only',requiredRefs:['artifactRef']},
  SHOW_COMPARISON:{type:'SHOW_COMPARISON',surfaceKind:'comparison',authorityClass:'presentation-only',requiredRefs:['left','right']},
  SHOW_PROGRESS:{type:'SHOW_PROGRESS',surfaceKind:'progress',authorityClass:'presentation-only',requiredRefs:['activityRef']},
  REQUEST_INPUT:{type:'REQUEST_INPUT',surfaceKind:'input',authorityClass:'human-interaction',requiredRefs:['interruptRef']},
  REQUEST_APPROVAL:{type:'REQUEST_APPROVAL',surfaceKind:'approval',authorityClass:'human-interaction',requiredRefs:['interruptRef']},
  REQUEST_CHOICE:{type:'REQUEST_CHOICE',surfaceKind:'choice',authorityClass:'human-interaction',requiredRefs:['interruptRef']}
});

const stable=value=>String(value||'').replace(/[^A-Za-z0-9._:-]/g,'_');
const refsOf=intent=>intent?.refs&&typeof intent.refs==='object'&&!Array.isArray(intent.refs)?intent.refs:{};
const all=(session,key)=>Array.isArray(session?.[key])?session[key]:[];
const findBy=(items,keys,value)=>items.find(item=>keys.some(key=>String(item?.[key]||'')===String(value)));

export function getUIIntentDefinition(type){return UI_INTENT_DEFINITIONS[String(type||'')]||null;}
export function availableUIIntents({rendererCapabilities=null}={}){return Object.values(UI_INTENT_DEFINITIONS).filter(def=>!rendererCapabilities?.surfaces||rendererCapabilities.surfaces.includes(def.surfaceKind)||def.surfaceKind==='result').map(def=>def.type);}

export function validateUIIntent(intent,session,{rendererCapabilities=null}={}){
  const definition=getUIIntentDefinition(intent?.type);
  if(!definition)return{valid:false,code:'UI_INTENT_UNSUPPORTED'};
  if(!intent||typeof intent!=='object'||Array.isArray(intent)||intent.source&&!['agent','workflow','session','runtime-projection'].includes(intent.source))return{valid:false,code:'UI_INTENT_INVALID'};
  if(rendererCapabilities&&!availableUIIntents({rendererCapabilities}).includes(definition.type))return{valid:false,code:'UI_INTENT_RENDERER_UNSUPPORTED'};
  const refs=refsOf(intent);
  for(const key of definition.requiredRefs)if(!String(refs[key]||''))return{valid:false,code:'UI_INTENT_REF_REQUIRED',field:key};
  if(definition.authorityClass==='human-interaction'){
    const pending=session?.ui?.pendingInteraction;
    if(!refs.interruptRef||!pending||String(pending.interruptId)!==String(refs.interruptRef)||pending.state!=='pending')return{valid:false,code:'UI_INTENT_NO_CANONICAL_INTERRUPT'};
  }
  const sources=all(session?.research,'sources'),evidence=all(session?.research,'evidence'),validation=all(session?.research,'validation'),artifacts=all(session?.outputs,'artifacts');
  if(definition.type==='SHOW_SOURCE'&&!findBy(sources,['sourceId','id'],refs.sourceRef))return{valid:false,code:'UI_INTENT_SOURCE_NOT_FOUND'};
  if(definition.type==='SHOW_EVIDENCE'&&!findBy(evidence,['evidenceId','id'],refs.evidenceRef))return{valid:false,code:'UI_INTENT_EVIDENCE_NOT_FOUND'};
  if(definition.type==='SHOW_COMPARISON'&&(!findBy(evidence,['evidenceId','id'],refs.left)||!findBy(evidence,['evidenceId','id'],refs.right)))return{valid:false,code:'UI_INTENT_EVIDENCE_NOT_FOUND'};
  if(['SHOW_TABLE','SHOW_RESULT'].includes(definition.type)&&!findBy(artifacts,['artifactId','id'],refs.artifactRef))return{valid:false,code:'UI_INTENT_ARTIFACT_NOT_FOUND'};
  if(definition.type==='SHOW_TABLE'&&findBy(artifacts,['artifactId','id'],refs.artifactRef)?.type!=='DataArtifact')return{valid:false,code:'UI_INTENT_NOT_TABLE'};
  if(definition.type==='SHOW_VALIDATION'&&!validation.length)return{valid:false,code:'UI_INTENT_VALIDATION_NOT_FOUND'};
  if(definition.type==='SHOW_PROGRESS'&&!session?.activity)return{valid:false,code:'UI_INTENT_ACTIVITY_NOT_FOUND'};
  if(JSON.stringify(intent).match(/<\/?script|javascript:|\bon(?:click|load)\s*=|\b(?:html|css|js|x|y|width|height)\s*:/i))return{valid:false,code:'UI_INTENT_EXECUTABLE_CONTENT'};
  return{valid:true,definition,refs};
}

const materialized=(id,kind,scope,sourceRefs,content,sequence,extra={})=>({id,kind,scope,sourceRefs:[...sourceRefs],provenance:{sourceRefs:[...sourceRefs],...(Number.isSafeInteger(sequence)?{eventSequence:sequence}:{})},lifecycle:'active',content:structuredClone(content),actions:[],requiredRendererCapabilities:[kind],presentationHints:{emphasis:'secondary',origin:'agent-requested'},...extra});

export function materializeUIIntent({intent,session,surfaces=[],rendererCapabilities=null}={}){
  const result=validateUIIntent(intent,session,{rendererCapabilities});if(!result.valid)return{surface:null,reasonCode:result.code};
  const {definition,refs}=result,existing=[...(surfaces||[])],sequence=Number(session?.session?.lastSequence||0),source=all(session?.research,'sources'),evidence=all(session?.research,'evidence'),artifacts=all(session?.outputs,'artifacts');
  let surface=null;
  if(definition.type==='SHOW_SOURCE'){const id=`surface:source:${stable(refs.sourceRef)}`;surface=existing.find(item=>item.id===id)||materialized(id,'source','source',[String(refs.sourceRef)],findBy(source,['sourceId','id'],refs.sourceRef),sequence);}
  if(definition.type==='SHOW_EVIDENCE'){const id=`surface:evidence:${stable(refs.evidenceRef)}`;surface=existing.find(item=>item.id===id)||materialized(id,'evidence','evidence',[String(refs.evidenceRef)],findBy(evidence,['evidenceId','id'],refs.evidenceRef),sequence);}
  if(definition.type==='SHOW_VALIDATION'){const id=`surface:validation:${session.session.runId}`;surface=existing.find(item=>item.id===id)||materialized(id,'validation','validation',[],{items:all(session?.research,'validation')},sequence);}
  if(definition.type==='SHOW_TABLE'||definition.type==='SHOW_RESULT'){const artifact=findBy(artifacts,['artifactId','id'],refs.artifactRef),kind=definition.type==='SHOW_TABLE'?'table':({'Narrative':'story','DataArtifact':'table','Presentation':'presentation'}[artifact.type]||null);if(kind){const id=`surface:artifact:${stable(artifact.artifactId||artifact.id)}`;surface=existing.find(item=>item.id===id)||materialized(id,kind,'artifact',[String(artifact.artifactId||artifact.id)],artifact,sequence,{presentationHints:{emphasis:'primary',origin:'agent-requested'}});}}
  if(definition.type==='SHOW_COMPARISON'){const pair=[String(refs.left),String(refs.right)].sort(),id=`surface:comparison:${stable(pair[0])}:${stable(pair[1])}`;const facts=pair.map(ref=>findBy(evidence,['evidenceId','id'],ref));surface=existing.find(item=>item.id===id)||materialized(id,'comparison','comparison',pair,{items:facts.map(fact=>({id:fact.id,claim:fact.claim,sourceId:fact.sourceId}))},sequence);}
  if(definition.type==='SHOW_PROGRESS'){surface=materialized(`surface:progress:${stable(refs.activityRef)}`,'progress','session',[String(refs.activityRef)],session.activity,sequence);}
  if(definition.type==='REQUEST_INPUT'||definition.type==='REQUEST_APPROVAL'||definition.type==='REQUEST_CHOICE'){const pending=session.ui.pendingInteraction,kind=definition.type==='REQUEST_INPUT'?'input':definition.type==='REQUEST_APPROVAL'?'approval':'choice';surface=existing.find(item=>item.id===`surface:interrupt:${pending.interruptId}`)||materialized(`surface:interrupt:${pending.interruptId}`,kind,'interrupt',[pending.interruptId],pending,sequence,{lifecycle:'active'});}
  if(!surface||!SURFACE_KINDS.includes(surface.kind))return{surface:null,reasonCode:'UI_INTENT_SURFACE_UNSUPPORTED'};
  return{surface,reasonCode:null,reused:existing.some(item=>item.id===surface.id)};
}

export const intentIdentity=intent=>{const refs=refsOf(intent);const canonical=intent?.type==='SHOW_COMPARISON'&&refs.left&&refs.right?{left:[String(refs.left),String(refs.right)].sort()[0],right:[String(refs.left),String(refs.right)].sort()[1]}:refs;const normalized={type:intent?.type,refs:Object.fromEntries(Object.entries(canonical).sort(([a],[b])=>a.localeCompare(b)))};return `ui-intent:${stable(normalized.type)}:${stable(JSON.stringify(normalized.refs))}`;};
