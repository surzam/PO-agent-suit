import {
  ActivitySnapshotEventSchema,CustomEventSchema,RunErrorEventSchema,RunFinishedEventSchema,RunStartedEventSchema,
  StateSnapshotEventSchema,StepFinishedEventSchema,StepStartedEventSchema,ToolCallArgsEventSchema,
  ToolCallEndEventSchema,ToolCallResultEventSchema,ToolCallStartEventSchema
} from '@ag-ui/core';

const SCHEMAS={
  ACTIVITY_SNAPSHOT:ActivitySnapshotEventSchema,CUSTOM:CustomEventSchema,RUN_ERROR:RunErrorEventSchema,
  RUN_FINISHED:RunFinishedEventSchema,RUN_STARTED:RunStartedEventSchema,STATE_SNAPSHOT:StateSnapshotEventSchema,
  STEP_FINISHED:StepFinishedEventSchema,STEP_STARTED:StepStartedEventSchema,TOOL_CALL_ARGS:ToolCallArgsEventSchema,
  TOOL_CALL_END:ToolCallEndEventSchema,TOOL_CALL_RESULT:ToolCallResultEventSchema,TOOL_CALL_START:ToolCallStartEventSchema
};
const text=(value,max=240)=>String(value??'').replace(/[\r\n]+/g,' ').trim().slice(0,max);
const id=(value,max=200)=>/^[\p{L}\p{N}._:-]{1,200}$/u.test(String(value||''))?String(value).slice(0,max):undefined;
const safeUri=value=>{try{const url=new URL(String(value));url.username='';url.password='';url.search='';url.hash='';return url.toString()}catch{return undefined}};
export function safeDescriptor(value){const input=text(value,180),match=input.match(/^([a-z][a-z0-9.-]+\.[a-z][a-z0-9.-]+)\("([^"]*)"\)$/i);if(!match)return undefined;let argument=match[2];if(/^https?:\/\//i.test(argument)){try{const url=new URL(argument);url.username='';url.password='';url.search='';url.hash='';argument=url.toString()}catch{return undefined}}else if(argument.includes('/')||argument.includes('\\'))argument=argument.split(/[\\/]/).filter(Boolean).at(-1)||'source';return`${match[1]}(${JSON.stringify(argument)})`}

export function safeFields(payload={},keys=[]){const result={};for(const key of keys){const value=payload[key];if(value==null)continue;if(['operationId','producedByOperationId','artifactId','sourceId','harnessId','roleId'].includes(key)){const clean=id(value);if(clean)result[key]=clean;continue}if(key==='safeDisplayName'){result[key]=text(String(value).split(/[\\/]/).filter(Boolean).at(-1)||'source',160);continue}if(key==='safeUri'){const clean=safeUri(value);if(clean)result[key]=clean;continue}if(Array.isArray(value))result[key]=value.map(item=>typeof item==='string'?text(item,160):item&&typeof item==='object'?safeFields(item,['sourceId','sourceKind','safeDisplayName','evidenceIds']):null).filter(Boolean).slice(0,100);else if(typeof value==='number'||typeof value==='boolean')result[key]=value;else result[key]=text(value)}return result}

export function customEnvelope(event,data={}){return{schemaVersion:1,runId:event.runId,eventId:event.eventId,sequence:event.sequence,...(id(event.payload?.operationId)?{operationId:id(event.payload.operationId)}:{}),...(text(event.payload?.stage||event.payload?.harnessId,80)?{stageId:text(event.payload?.stage||event.payload?.harnessId,80)}:{}),data}}

export function validateAgUiEvent(event){const schema=SCHEMAS[event.type];if(!schema)throw new Error(`Unsupported AG-UI event type: ${event.type}`);return schema.parse(event)}

export function serializeSse(record){return`id: ${record.projectedId}\ndata: ${JSON.stringify(record.event)}\n\n`}
