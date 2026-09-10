import crypto from 'node:crypto';

export const HUMAN_INTERRUPT_KINDS=Object.freeze(['choice','approval','clarification','confirmation','context-request']);
const safeId=(value,label)=>{const text=String(value||'');if(!/^[A-Za-z0-9][A-Za-z0-9._:-]{3,199}$/.test(text)||text.includes('..'))throw Object.assign(new Error(`Invalid ${label}`),{code:'HUMAN_INTERRUPT_INVALID'});return text};
const text=(value,max,label)=>{const result=String(value??'').trim();if(!result||Buffer.byteLength(result,'utf8')>max)throw Object.assign(new Error(`Invalid ${label}`),{code:'HUMAN_RESPONSE_INVALID'});return result};

export function createHumanInterrupt({id=null,runId,operationId=null,kind,prompt,options=[],subjectRefs=[],contextRefs=[],responseSchema=null,continuation}={}){
  if(!HUMAN_INTERRUPT_KINDS.includes(kind))throw Object.assign(new Error('Unsupported HumanInterrupt kind'),{code:'HUMAN_INTERRUPT_INVALID'});
  const normalizedOptions=kind==='choice'?(Array.isArray(options)?options:[]).map(item=>({id:safeId(item?.id,'option identity'),label:text(item?.label,240,'option label')})):[];
  if(kind==='choice'&&(!normalizedOptions.length||new Set(normalizedOptions.map(item=>item.id)).size!==normalizedOptions.length))throw Object.assign(new Error('Choice requires unique options'),{code:'HUMAN_INTERRUPT_INVALID'});
  if(!continuation?.workflowId||!continuation?.stageId)throw Object.assign(new Error('Declarative continuation is required'),{code:'HUMAN_INTERRUPT_INVALID'});
  return{id:id?safeId(id,'interrupt identity'):`interrupt-${crypto.randomUUID()}`,runId:safeId(runId,'Run identity'),operationId:operationId?safeId(operationId,'operation identity'):null,kind,state:'pending',prompt:text(prompt,4096,'prompt'),options:normalizedOptions,subjectRefs:[...new Set(subjectRefs.map(String))],contextRefs:[...new Set(contextRefs.map(String))],responseSchema:responseSchema&&typeof responseSchema==='object'?structuredClone(responseSchema):null,continuation:{workflowId:safeId(continuation.workflowId,'workflow identity'),stageId:safeId(continuation.stageId,'stage identity'),operationId:continuation.operationId?safeId(continuation.operationId,'operation identity'):null,artifactRefs:[...new Set((continuation.artifactRefs||[]).map(String))]},createdAt:new Date().toISOString(),resolvedAt:null,response:null};
}

export function validateHumanResponse(interrupt,response){
  if(interrupt.kind==='choice'){const optionId=String(response?.optionId||response||'');if(!interrupt.options.some(item=>item.id===optionId))throw Object.assign(new Error('Unknown choice option'),{code:'HUMAN_RESPONSE_INVALID'});return{optionId};}
  if(interrupt.kind==='approval'){const decision=String(response?.decision||response||'');if(!['approve','reject'].includes(decision))throw Object.assign(new Error('Approval must be approve or reject'),{code:'HUMAN_RESPONSE_INVALID'});return{decision};}
  if(interrupt.kind==='confirmation'){const confirmed=typeof response?.confirmed==='boolean'?response.confirmed:response;if(typeof confirmed!=='boolean')throw Object.assign(new Error('Confirmation must be boolean'),{code:'HUMAN_RESPONSE_INVALID'});return{confirmed};}
  return{text:text(response?.text??response,16*1024,'human response')};
}

export function projectHumanInterrupts(events=[]){
  const values=new Map();
  for(const event of events){const p=event.payload||{};if(event.type==='HumanInterruptCreated'&&p.interrupt?.id)values.set(p.interrupt.id,structuredClone(p.interrupt));if(event.type==='HumanResponseReceived'&&values.has(p.interruptId))values.get(p.interruptId).response=structuredClone(p.response);if(event.type==='HumanInterruptResolved'&&values.has(p.interruptId)){const value=values.get(p.interruptId);value.state='resolved';value.resolvedAt=event.at;}if(event.type==='HumanInterruptCancelled'&&values.has(p.interruptId)){const value=values.get(p.interruptId);value.state='cancelled';value.resolvedAt=event.at;}}
  return[...values.values()];
}
