import crypto from 'node:crypto';
import {capabilityAvailability} from './capabilities.mjs';
import {dispatchCapability} from './capability-dispatch.mjs';

const stable=value=>Array.isArray(value)?value.map(stable):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,stable(value[key])])):value;
export const capabilityInvocationFingerprint=({capabilityId,sourceRunId,input})=>crypto.createHash('sha256').update(JSON.stringify(stable({capabilityId,sourceRunId,input}))).digest('hex');

export function createRuntimeCapabilityDispatcher({registry,allRuns,inspect,observationForRun,execution,serializeLaunch,launches,getActiveForeground,setActiveForeground}={}){
  async function lookupInvocation(invocationId){
    if(!invocationId)return null;
    for(const run of await allRuns()){
      const metadata=run.interopMetadata?.capabilityInvocation;
      if(metadata?.invocationId===invocationId)return{fingerprint:metadata.fingerprint,acknowledgement:{runId:run.id,status:run.status,parentRunId:run.parentRunId||metadata.sourceRunId}};
      const event=run.events.find(item=>item.payload?.invocationId===invocationId&&['RunCancelled','HumanResponseReceived'].includes(item.type));if(!event)continue;
      if(event.type==='RunCancelled')return{fingerprint:event.payload.invocationFingerprint,acknowledgement:{runId:run.id,status:'cancelled'}};
      return{fingerprint:event.payload.invocationFingerprint,acknowledgement:{runId:run.id,status:run.status,interruptId:event.payload.interruptId}};
    }
    return null;
  }

  async function contextFor(invocation){const source=await inspect(invocation.sourceRunId).catch(()=>null);if(!source)return null;const view=await observationForRun(source),pendingInterrupt=source.events.some(event=>event.type==='HumanInterruptCreated'&&!source.events.some(next=>['HumanInterruptResolved','HumanInterruptCancelled'].includes(next.type)&&next.payload?.interruptId===event.payload?.interrupt?.id)),hasResearchContext=Boolean(view.evidence?.items?.length||view.contextWorld?.sources?.length);return{source,view,availability:{runStatus:source.status,pendingInterrupt,hasResearchContext,roleId:source.role}};}

  async function childHandler(input,capability,{fingerprint},invocation,context){return serializeLaunch(async()=>{
    const applied=await lookupInvocation(invocation.invocationId);if(applied){if(applied.fingerprint!==fingerprint)return{accepted:false,reasonCode:'INVOCATION_CONFLICT'};return{...applied.acknowledgement,accepted:true,idempotent:true};}
    const launchRequestId=`capability:${invocation.invocationId}`,prior=launches.get(launchRequestId);if(prior){const run=await inspect(prior),record=run.interopMetadata?.capabilityInvocation;if(record?.fingerprint!==fingerprint)return{accepted:false,reasonCode:'INVOCATION_CONFLICT'};return{accepted:true,runId:run.id,status:run.status,parentRunId:run.parentRunId,idempotent:true};}
    const activeId=getActiveForeground();if(activeId){const active=await inspect(activeId).catch(()=>null);if(active&&['created','launching','running','waiting-for-human'].includes(active.status))return{accepted:false,runId:context.source.id,reasonCode:'CAPABILITY_UNAVAILABLE'};setActiveForeground(null);}
    if(capability.id==='context.add')execution.addContext({name:input.name,text:input.content,ownerRunId:context.source.id});
    const {runtime,stages,definition}=execution.runtime(context.source.workflow,'custom');let launched;
    const invocationMetadata={capabilityInvocation:{invocationId:invocation.invocationId,capabilityId:capability.id,sourceRunId:context.source.id,fingerprint}};
    if(capability.id==='question.change')launched=await runtime.launch({intent:input.text,role:context.source.role,workflow:context.source.workflow,stages,launchRequestId,workflowDefinition:definition,interopMetadata:invocationMetadata,initialEvents:[{type:'HumanCapabilityInvoked',payload:{capabilityId:capability.id,invocationId:invocation.invocationId,invocationFingerprint:fingerprint,origin:'human',sourceRunId:context.source.id}}]});
    else {
      const fromStage=capability.id==='research.extend'||capability.id==='context.add'?'research':String(input.fromStage||'synthesis'),role=capability.id==='run.branch'&&input.role?String(input.role):context.source.role,extendedStages=capability.id==='research.extend'?stages.map(stage=>stage.id==='research'?{...stage,config:{...(stage.config||{}),extensionFocus:input.focus||`Продолжить проверку ${input.evidenceRef||input.sourceRef}`,sourceRef:input.sourceRef,evidenceRef:input.evidenceRef}}:stage):stages;
      if(input.evidenceRef&&!context.view.evidence?.items?.some(item=>String(item.id)===input.evidenceRef))return{accepted:false,runId:context.source.id,reasonCode:'CAPABILITY_SUBJECT_INVALID'};
      if(input.sourceRef&&!context.view.contextWorld?.sources?.some(item=>String(item.sourceId)===input.sourceRef))return{accepted:false,runId:context.source.id,reasonCode:'CAPABILITY_SUBJECT_INVALID'};
      launched=await runtime.launchFork({sourceRunId:context.source.id,fromStage,intent:capability.id==='research.extend'&&input.focus?`${context.source.intent} — ${input.focus}`:context.source.intent,role,workflow:context.source.workflow,stages:extendedStages,launchRequestId,workflowDefinition:definition,interopMetadata:invocationMetadata,initialEvents:[{type:'HumanCapabilityInvoked',payload:{capabilityId:capability.id,invocationId:invocation.invocationId,invocationFingerprint:fingerprint,origin:'human',sourceRunId:context.source.id,sourceRef:input.sourceRef,evidenceRef:input.evidenceRef,focus:input.focus}}]});
    }
    launches.set(launchRequestId,launched.run.id);setActiveForeground(launched.run.id);launched.completion.finally(()=>{if(getActiveForeground()===launched.run.id)setActiveForeground(null)});return{accepted:true,runId:launched.run.id,status:launched.run.status,parentRunId:context.source.id};
  });}

  async function invoke(invocation){
    const context=await contextFor(invocation);if(!context)return{accepted:false,runId:invocation.sourceRunId,reasonCode:'RUN_NOT_FOUND'};
    const handlers={
      'run.cancel':async(input,capability,{fingerprint})=>{const mode=context.source.events.some(event=>event.type==='IntentDiscoveryRequested')?'random':'custom',cancelled=await execution.runtime(context.source.workflow,mode).runtime.cancel(context.source.id,{invocationId:invocation.invocationId,invocationFingerprint:fingerprint});return{accepted:true,runId:cancelled.id,status:cancelled.status};},
      'run.respond-to-interrupt':async(input,capability,{fingerprint})=>{const mode=context.source.events.some(event=>event.type==='IntentDiscoveryRequested')?'random':'custom',{runtime,stages,definition}=execution.runtime(context.source.workflow,mode),result=await runtime.respondToInterrupt(input.interruptId,input.response,{stages,workflowDefinition:definition,invocationId:invocation.invocationId,invocationFingerprint:fingerprint});if(result.accepted&&result.completion){setActiveForeground(context.source.id);result.completion.finally(()=>{if(getActiveForeground()===context.source.id)setActiveForeground(null)});}const acknowledgement={accepted:result.accepted,runId:result.runId||context.source.id,status:result.status,reasonCode:result.reasonCode};if(result.completion)Object.defineProperty(acknowledgement,'completion',{value:result.completion,enumerable:false});return acknowledgement;},
      'run.retry':(input,capability,details)=>childHandler(input,capability,details,invocation,context),
      'run.branch':(input,capability,details)=>childHandler(input,capability,details,invocation,context),
      'context.add':(input,capability,details)=>childHandler(input,capability,details,invocation,context),
      'question.change':(input,capability,details)=>childHandler(input,capability,details,invocation,context),
      'research.extend':(input,capability,details)=>childHandler(input,capability,details,invocation,context)
    };
    return dispatchCapability({registry,capabilityId:invocation.capabilityId,input:invocation.input,sourceRunId:invocation.sourceRunId,invocationId:invocation.invocationId,availabilityContext:context.availability,fingerprint:capabilityInvocationFingerprint,lookupInvocation,handlers});
  }
  return{invoke,lookupInvocation,publicCapabilities:()=>registry.list().map(({id,title,description,scope,invocationMode,permissions})=>({id,title,description,scope,invocationMode,permissionsPolicy:'metadata-only',permissions:[...permissions]}))};
}
