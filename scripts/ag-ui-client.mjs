#!/usr/bin/env node
import {HttpAgent} from '@ag-ui/client';

const url=process.argv[2]||'http://127.0.0.1:8080/api/ag-ui',mode=process.argv[3]==='random'?'random':'custom',intent=process.argv.slice(4).join(' ')||'Проверить AG-UI interoperability AgentSuite';
const runId=crypto.randomUUID(),threadId=crypto.randomUUID(),events=[];
const agent=new HttpAgent({url,threadId});
await agent.runAgent({runId,forwardedProps:{agentsuite:{mode,workflow:'research-presentation',...(mode==='custom'?{intent}:{}),launchRequestId:`ag-ui:${runId}`}}},{onEvent:({event})=>{events.push(event);const detail=event.type==='CUSTOM'?event.name:event.type==='STEP_STARTED'||event.type==='STEP_FINISHED'?event.stepName:event.type.startsWith('TOOL_CALL')?event.toolCallId:'';console.log(`${event.type}${detail?` · ${detail}`:''}`)}});
console.log(`Run ${runId} finished · ${events.length} AG-UI events`);
