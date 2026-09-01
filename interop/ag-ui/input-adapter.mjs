import {RunAgentInputSchema} from '@ag-ui/core';

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SAFE_THREAD=/^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/;
const fail=(message,code)=>Object.assign(new Error(message),{code,statusCode:400});

export function parseAgUiInput(value){
  const parsed=RunAgentInputSchema.safeParse(value);if(!parsed.success)throw fail('Invalid AG-UI RunAgentInput','AG_UI_INPUT_INVALID');
  const input=parsed.data;
  if(input.resume?.length)throw fail('AG-UI resume is not supported in R13.6','AG_UI_RESUME_UNSUPPORTED');
  if(!UUID.test(input.runId))throw fail('AG-UI runId must be a UUID','AG_UI_RUN_ID_INVALID');
  if(!SAFE_THREAD.test(input.threadId)||input.threadId.includes('..'))throw fail('Invalid AG-UI threadId','AG_UI_THREAD_ID_INVALID');
  if(input.parentRunId&&(!SAFE_THREAD.test(input.parentRunId)||input.parentRunId.includes('..')))throw fail('Invalid parentRunId','AG_UI_PARENT_RUN_ID_INVALID');
  const extension=input.forwardedProps?.agentsuite;if(!extension||typeof extension!=='object'||Array.isArray(extension))throw fail('forwardedProps.agentsuite is required','AG_UI_EXTENSION_REQUIRED');
  const mode=extension.mode==='random'?'random':'custom',intent=String(extension.intent||'').trim();
  if(mode==='custom'&&!intent&&!input.parentRunId)throw fail('Custom AG-UI Run requires agentsuite.intent','AG_UI_INTENT_REQUIRED');
  const workflow=String(extension.workflow||'research-presentation'),role=String(extension.role||'product-owner');
  const launchRequestId=String(extension.launchRequestId||`ag-ui:${input.runId}`);
  if(!/^[A-Za-z0-9._:-]{8,160}$/.test(launchRequestId))throw fail('Invalid launchRequestId','AG_UI_LAUNCH_REQUEST_ID_INVALID');
  if(!/^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/.test(workflow)||!/^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/.test(role))throw fail('Invalid workflow or Role identity','AG_UI_EXECUTION_ID_INVALID');
  const fromStage=String(extension.fromStage||'synthesis');if(!/^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/.test(fromStage))throw fail('Invalid rerun stage identity','AG_UI_STAGE_ID_INVALID');
  return{input,runId:input.runId,threadId:input.threadId,parentRunId:input.parentRunId||null,mode,intent,workflow,role,launchRequestId,observe:Boolean(extension.observe),fromStage};
}
