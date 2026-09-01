import {CUSTOM_NAMES,isToolOperation,deterministicThreadId} from './mapping.mjs';
import {customEnvelope,safeDescriptor,safeFields,validateAgUiEvent} from './serializer.mjs';

const terminalTypes=new Set(['RUN_FINISHED','RUN_ERROR']);
const timestamp=event=>Number.isFinite(Date.parse(event.at))?Date.parse(event.at):undefined;
const metadata=(event,projectedId)=>({agentsuite:{eventId:event.eventId,projectedEventId:projectedId,sequence:event.sequence}});
const projected=(event,ordinal,value)=>{const projectedId=`${event.eventId}:${String(ordinal).padStart(2,'0')}`;const candidate={...value,timestamp:timestamp(event),metadata:metadata(event,projectedId)};return{projectedId,sequence:event.sequence,ordinal,event:validateAgUiEvent(candidate)}};
const custom=(event,name,data,ordinal=1)=>projected(event,ordinal,{type:'CUSTOM',name,value:customEnvelope(event,data)});
const safeReason=event=>String(event.payload?.reasonCode||event.payload?.code||'agentsuite-error').slice(0,120);
const safeMessage=event=>`AgentSuite run failed: ${safeReason(event)}`;

export function safeArtifactDescriptors(run){return(run?.artifacts||[]).map(item=>({artifactId:item.id,type:item.type,runId:run.id,ownerRunId:item.ownerRunId||item.runId||run.id,reused:Boolean(item.reused),sourceArtifactIds:(item.sourceArtifactIds||[]).map(String),href:`/api/ag-ui/runs/${encodeURIComponent(run.id)}/artifacts/${encodeURIComponent(item.id)}`}))}

export function createStateSnapshot(run,{observation=null}={}){const sources=(observation?.contextWorld?.sources||[]).map(item=>safeFields(item,['sourceId','sourceKind','safeDisplayName','contextRootId','state','tracking']));const outputs={};for(const artifact of safeArtifactDescriptors(run))if(['Narrative','DataArtifact','Presentation'].includes(artifact.type))outputs[artifact.type]=artifact;return{agentsuite:{schemaVersion:1,run:{id:run.id,parentRunId:run.parentRunId||null,status:run.status,reasonCode:run.reasonCode||null},intent:{summary:String(observation?.intent||run.intent||'').slice(0,300)},role:{id:run.role,displayName:observation?.role?.label||run.role},flow:{stages:(observation?.stages||[]).map(stage=>({id:stage.id,state:stage.state})),activeStage:observation?.activeStage||null},active:{operationId:run.activeOperationIds?.at(-1)||null,capability:observation?.capabilities?.find(item=>item.active)?.id||null},artifacts:safeArtifactDescriptors(run),outputs,context:{sources}}}};

export function projectAgUiRun(run,{observation=null,threadId=null}={}){
  const events=[...(run.events||[])].sort((a,b)=>a.sequence-b.sequence),records=[],tools=new Map(),resolvedThreadId=threadId||deterministicThreadId(run);let protocolStarted=false;
  if(!events.some(event=>event.type==='RunStarted')){const terminal=[...events].reverse().find(event=>['RunFailed','RunCancelled','RunInterrupted'].includes(event.type));return terminal?[projected(terminal,1,{type:'RUN_ERROR',message:safeMessage(terminal),code:terminal.type==='RunCancelled'?'cancelled':safeReason(terminal)})]:[]}
  for(const event of events){
    let ordinal=1;const payload=event.payload||{};
    if(event.type==='RunStarted'){records.push(projected(event,ordinal++,{type:'RUN_STARTED',threadId:resolvedThreadId,runId:run.id,...(run.parentRunId?{parentRunId:run.parentRunId}:{})}));protocolStarted=true}
    else if(!protocolStarted)continue;
    else if(event.type==='RunCompleted'){records.push(projected(event,ordinal++,{type:'STATE_SNAPSHOT',snapshot:createStateSnapshot(run,{observation})}));records.push(projected(event,ordinal++,{type:'RUN_FINISHED',threadId:resolvedThreadId,runId:run.id,outcome:{type:'success'}}))}
    else if(event.type==='RunFailed'){records.push(projected(event,ordinal++,{type:'STATE_SNAPSHOT',snapshot:createStateSnapshot(run,{observation})}));records.push(projected(event,ordinal++,{type:'RUN_ERROR',message:safeMessage(event),code:safeReason(event)}))}
    else if(event.type==='RunCancelled'){records.push(custom(event,CUSTOM_NAMES.RunCancelled,safeFields(payload,['reasonCode','physicalOperationSettled']),ordinal++));if(payload.physicalOperationSettled){records.push(projected(event,ordinal++,{type:'STATE_SNAPSHOT',snapshot:createStateSnapshot(run,{observation})}));records.push(projected(event,ordinal++,{type:'RUN_ERROR',message:'Run cancelled',code:'cancelled'}))}}
    else if(event.type==='RunCancellationSettled'){records.push(custom(event,CUSTOM_NAMES.RunCancellationSettled,safeFields(payload,['reasonCode','physicalOperationSettled','durationMs']),ordinal++));records.push(projected(event,ordinal++,{type:'STATE_SNAPSHOT',snapshot:createStateSnapshot(run,{observation})}));records.push(projected(event,ordinal++,{type:'RUN_ERROR',message:'Run cancelled',code:'cancelled'}))}
    else if(event.type==='RunInterrupted'){records.push(custom(event,CUSTOM_NAMES.RunInterrupted,safeFields(payload,['reasonCode']),ordinal++));records.push(projected(event,ordinal++,{type:'STATE_SNAPSHOT',snapshot:createStateSnapshot(run,{observation})}));records.push(projected(event,ordinal++,{type:'RUN_ERROR',message:'Runtime interrupted',code:'runtime-interrupted'}))}
    else if(event.type==='RunNeedsContext'){const interruptId=`${run.id}:needs-context:${event.sequence}`;records.push(projected(event,ordinal++,{type:'STATE_SNAPSHOT',snapshot:createStateSnapshot(run,{observation})}));records.push(projected(event,ordinal++,{type:'RUN_FINISHED',threadId:resolvedThreadId,runId:run.id,outcome:{type:'interrupt',interrupts:[{id:interruptId,reason:'input_required',message:'Additional context is required',metadata:{reasonCode:safeReason(event)}}]}}))}
    else if(event.type==='HarnessStarted')records.push(projected(event,ordinal++,{type:'STEP_STARTED',stepName:String(payload.stage||payload.harnessId||'stage').slice(0,120)}));
    else if(event.type==='HarnessCompleted')records.push(projected(event,ordinal++,{type:'STEP_FINISHED',stepName:String(payload.stage||payload.harnessId||'stage').slice(0,120)}));
    else if(isToolOperation(event)){
      const operationId=payload.operationId,existing=tools.get(operationId)||{started:false,ended:false};
      if(!existing.started&&(/Requested$|Started$/.test(event.type)||event.type==='SourceOpened')){records.push(projected(event,ordinal++,{type:'TOOL_CALL_START',toolCallId:operationId,toolCallName:String(payload.capability).toLowerCase()}));const descriptor=safeDescriptor(payload.displayInput);if(descriptor)records.push(projected(event,ordinal++,{type:'TOOL_CALL_ARGS',toolCallId:operationId,delta:JSON.stringify({descriptor})}));existing.started=true}
      if(existing.started&&!existing.ended&&(/Completed$|Failed$/.test(event.type)||event.type==='SourceRead')){records.push(projected(event,ordinal++,{type:'TOOL_CALL_END',toolCallId:operationId}));records.push(projected(event,ordinal++,{type:'TOOL_CALL_RESULT',messageId:`${operationId}:result`,toolCallId:operationId,content:JSON.stringify({status:/Failed$/.test(event.type)?'failed':'completed',code:payload.code||undefined})}));existing.ended=true}
      tools.set(operationId,existing);
      if(CUSTOM_NAMES[event.type])records.push(custom(event,CUSTOM_NAMES[event.type],safeFields(payload,['operationId','capability','sourceId','sourceKind','safeDisplayName','safeUri','durationMs','deadline','code']),ordinal++));
    } else if(CUSTOM_NAMES[event.type])records.push(custom(event,CUSTOM_NAMES[event.type],safeFields(payload,['operationId','producedByOperationId','capability','sourceId','sourceKind','safeDisplayName','safeUri','artifactId','type','sourceRunId','roleId','label','reasonCode','code','durationMs','deadline','found','accepted','batch','batches','sources','artifacts','valid','slides','renderer']),ordinal++));
  }
  return records.sort((a,b)=>a.sequence-b.sequence||a.ordinal-b.ordinal);
}

export function isAgUiTerminal(record){return terminalTypes.has(record?.event?.type)}
