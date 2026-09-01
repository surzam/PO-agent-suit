import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import {HttpAgent} from '@ag-ui/client';
import {EventType} from '@ag-ui/core';
import {projectAgUiRun,safeArtifactDescriptors} from '../interop/ag-ui/projection.mjs';
import {parseAgUiInput} from '../interop/ag-ui/input-adapter.mjs';
import {createRuntime} from '../core/runtime.mjs';
import {createHarnessRegistry} from '../core/registry.mjs';
import {briefHarness} from '../harnesses/brief.mjs';
import {serveAgentSuite} from '../api/agentsuite-api.mjs';

const at='2026-09-01T00:00:00.000Z',runId='11111111-1111-4111-8111-111111111111';
const makeEvent=(sequence,type,payload={})=>({id:`${runId}:${String(sequence).padStart(8,'0')}`,eventId:`${runId}:${String(sequence).padStart(8,'0')}`,sequence,type,runId,at,payload});
const run={id:runId,parentRunId:null,role:'product-owner',intent:'Safe intent',status:'completed',reasonCode:null,activeOperationIds:[],artifacts:[{id:'artifact-safe',type:'Presentation',sourceArtifactIds:[],file:'artifacts/safe.json'}],events:[
  makeEvent(1,'RunStarted'),makeEvent(2,'HarnessStarted',{stage:'research',harnessId:'research'}),
  makeEvent(3,'InferenceStarted',{stage:'research',operationId:'model-op-1',capability:'MODEL',displayInput:'model.infer("research")',deadline:'2026-09-01T00:01:00.000Z'}),
  makeEvent(4,'InferenceCompleted',{stage:'research',operationId:'model-op-1',capability:'MODEL',durationMs:10}),
  makeEvent(5,'CapabilityStarted',{stage:'research',operationId:'source-op-1',capability:'WEB',displayInput:'web.open("https://example.test/private?q=secret")'}),
  makeEvent(6,'SourceRead',{stage:'research',operationId:'source-op-1',capability:'WEB',sourceId:'web:one',sourceKind:'web',safeDisplayName:'source',safeUri:'https://user:pass@example.test/a?q=secret'}),
  makeEvent(7,'EvidenceCollected',{stage:'research',sources:[{sourceId:'web:one',safeDisplayName:'source'}]}),
  makeEvent(8,'ArtifactCreated',{artifactId:'artifact-safe',type:'Presentation',producedByOperationId:'different-op'}),
  makeEvent(9,'HarnessCompleted',{stage:'research',harnessId:'research'}),makeEvent(10,'RunCompleted',{artifacts:['artifact-safe']})
]};
const projected=projectAgUiRun(run),types=projected.map(item=>item.event.type),serialized=JSON.stringify(projected);
assert.equal(types[0],EventType.RUN_STARTED);assert.equal(types.at(-1),EventType.RUN_FINISHED);assert.equal(types.filter(type=>type===EventType.RUN_STARTED).length,1);
assert.equal(projected.filter(item=>item.event.type===EventType.TOOL_CALL_START).length,1,'only WEB becomes ToolCall');
assert.ok(!projected.some(item=>item.event.type===EventType.TOOL_CALL_START&&item.event.toolCallId==='model-op-1'),'MODEL is not a ToolCall');
assert.ok(projected.some(item=>item.event.type===EventType.CUSTOM&&item.event.name==='agentsuite.inference.started'));
assert.ok(projected.some(item=>item.event.type===EventType.CUSTOM&&item.event.name==='agentsuite.evidence.collected'));
assert.ok(!serialized.includes('secret'));assert.ok(!serialized.includes('user:pass'));
const fileRun={...run,events:[makeEvent(1,'RunStarted'),makeEvent(2,'CapabilityStarted',{operationId:'file-op',capability:'FILES',displayInput:'files.read("/home/private/project/architecture.md")'}),makeEvent(3,'CapabilityCompleted',{operationId:'file-op',capability:'FILES'}),makeEvent(4,'RunCompleted')]};const fileProjection=JSON.stringify(projectAgUiRun(fileRun));assert.ok(fileProjection.includes('architecture.md'));assert.ok(!fileProjection.includes('/home/private'));
assert.deepEqual(projectAgUiRun(run),projected,'same journal has deterministic projection');
assert.equal(safeArtifactDescriptors({...run,id:'current-run',artifacts:[{...run.artifacts[0],runId:'owner-run',ownerRunId:'owner-run',reused:true}]})[0].runId,'current-run','artifact reference resolves through the current Run');
assert.ok(projected.every((item,index,all)=>!index||item.sequence>all[index-1].sequence||item.sequence===all[index-1].sequence&&item.ordinal>all[index-1].ordinal));

const needs={...run,status:'needs-context',events:[makeEvent(1,'RunStarted'),makeEvent(2,'RunNeedsContext',{reasonCode:'insufficient-context'})]};
const interrupt=projectAgUiRun(needs).at(-1).event;assert.equal(interrupt.type,EventType.RUN_FINISHED);assert.equal(interrupt.outcome.type,'interrupt');assert.equal(interrupt.outcome.interrupts[0].id,`${runId}:needs-context:2`);
const cancelled={...run,status:'cancelled',events:[makeEvent(1,'RunStarted'),makeEvent(2,'RunCancelled',{reasonCode:'user-cancelled',physicalOperationSettled:false}),makeEvent(3,'RunCancellationSettled',{reasonCode:'user-cancelled',physicalOperationSettled:true})]};
const cancelledProjection=projectAgUiRun(cancelled);assert.equal(cancelledProjection.at(-1).event.type,EventType.RUN_ERROR);assert.ok(cancelledProjection.some(item=>item.event.name==='agentsuite.run.cancellation-settled'));
const prestartInterrupted={...run,status:'interrupted',events:[makeEvent(1,'RunLaunching'),makeEvent(2,'RunInterrupted',{reasonCode:'runtime-interrupted'})]};assert.equal(projectAgUiRun(prestartInterrupted)[0].event.type,EventType.RUN_ERROR,'pre-start recovery remains a valid AG-UI terminal stream');

const validInput={threadId:'thread-safe',runId,state:{},messages:[],tools:[],context:[],forwardedProps:{agentsuite:{mode:'random'}}};
assert.equal(parseAgUiInput(validInput).mode,'random');assert.throws(()=>parseAgUiInput({...validInput,runId:'../../bad'}),error=>error.code==='AG_UI_RUN_ID_INVALID');assert.throws(()=>parseAgUiInput({...validInput,resume:[{interruptId:'x',status:'resolved'}]}),error=>error.code==='AG_UI_RESUME_UNSUPPORTED');

const temp=await fs.mkdtemp(path.join(os.tmpdir(),'agentsuite-ag-ui-'));
let hangModel=false;const model=http.createServer(async(req,res)=>{for await(const _ of req){}if(hangModel)return;const value={status:'discovered',question:'Как canonical journal обеспечивает AG-UI interoperability?',reason:'В проекте есть persisted events.',relevance:'Проверяет protocol boundary.',expectedDecision:'Принять adapter contract.',requiredContext:[]};res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({choices:[{message:{content:JSON.stringify(value)}}]}))});
try{
  const runtime=createRuntime({rootDir:temp,registry:createHarnessRegistry([briefHarness]),runtimeInstanceId:'ag-ui-audit'}),proposed=crypto.randomUUID();
  const first=await runtime.run({proposedRunId:proposed,intent:'Identity',stages:[{id:'brief',harnessId:'brief'}]});assert.equal(first.id,proposed);
  await assert.rejects(runtime.run({proposedRunId:proposed,intent:'Collision',stages:[{id:'brief',harnessId:'brief'}]}),error=>error.code==='RUN_ID_CONFLICT');
  await assert.rejects(runtime.run({proposedRunId:'../../escape',intent:'Unsafe',stages:[{id:'brief',harnessId:'brief'}]}),error=>error.code==='INVALID_RUN_ID');

  await new Promise(resolve=>model.listen(0,'127.0.0.1',resolve));process.env.LLAMA_BASE_URL=`http://127.0.0.1:${model.address().port}/v1`;
  const apiRoot=path.join(temp,'api'),server=await serveAgentSuite({host:'127.0.0.1',port:0,rootDir:apiRoot});
  try{
    const port=server.address().port,externalRunId=crypto.randomUUID(),events=[];
    const agent=new HttpAgent({url:`http://127.0.0.1:${port}/api/ag-ui`,threadId:'official-client-thread'});
    await agent.runAgent({runId:externalRunId,forwardedProps:{agentsuite:{mode:'custom',intent:'Проверить стандартный AG-UI запуск',workflow:'brief',launchRequestId:`ag-ui:${externalRunId}`}}},{onEvent:({event})=>events.push(event)});
    assert.equal(events[0].type,EventType.RUN_STARTED);assert.equal(events.at(-1).type,EventType.RUN_FINISHED);assert.equal(events[0].runId,externalRunId);
    const persisted=JSON.parse(await fs.readFile(path.join(apiRoot,'runs',externalRunId,'run.json'),'utf8'));assert.equal(persisted.id,externalRunId);assert.equal(persisted.interopMetadata.agUi.threadId,'official-client-thread');assert.equal(persisted.status,'completed');
    const duplicate=await fetch(`http://127.0.0.1:${port}/api/ag-ui`,{method:'POST',headers:{'content-type':'application/json','accept':'text/event-stream'},body:JSON.stringify({threadId:'official-client-thread',runId:externalRunId,state:{},messages:[],tools:[],context:[],forwardedProps:{agentsuite:{mode:'custom',intent:'duplicate',workflow:'brief'}}})});assert.equal(duplicate.status,409);
    const replayEvents=[],replayAgent=new HttpAgent({url:`http://127.0.0.1:${port}/api/ag-ui`,threadId:'official-client-thread'}),cursor=events[Math.floor(events.length/2)].metadata.agentsuite.projectedEventId;await replayAgent.runAgent({runId:externalRunId,forwardedProps:{agentsuite:{mode:'custom',intent:'ignored',workflow:'brief',observe:true,afterEventId:cursor}}},{onEvent:({event})=>replayEvents.push(event)});assert.equal(replayEvents[0].type,EventType.RUN_STARTED);assert.equal(replayEvents.at(-1).type,EventType.RUN_FINISHED);assert.ok(replayEvents.length<events.length,'cursor omits already observed non-framing events');
    const randomRunId=crypto.randomUUID(),randomEvents=[],randomAgent=new HttpAgent({url:`http://127.0.0.1:${port}/api/ag-ui`,threadId:'random-thread'});await randomAgent.runAgent({runId:randomRunId,forwardedProps:{agentsuite:{mode:'random',workflow:'brief',launchRequestId:`ag-ui:${randomRunId}`}}},{onEvent:({event})=>randomEvents.push(event)});assert.equal(randomEvents[0].type,EventType.RUN_STARTED);assert.equal(randomEvents.at(-1).type,EventType.RUN_FINISHED);const randomPersisted=JSON.parse(await fs.readFile(path.join(apiRoot,'runs',randomRunId,'run.json'),'utf8'));assert.match(randomPersisted.intent,/canonical journal/);assert.ok(randomPersisted.events.some(event=>event.type==='IntentDiscoveryRequested'),'Random uses real Intent Discovery without a human message');
    const forkRunId=crypto.randomUUID(),forkEvents=[],forkAgent=new HttpAgent({url:`http://127.0.0.1:${port}/api/ag-ui`,threadId:'official-client-thread'});await new Promise((resolve,reject)=>forkAgent.run({threadId:'official-client-thread',runId:forkRunId,parentRunId:externalRunId,state:{},messages:[],tools:[],context:[],forwardedProps:{agentsuite:{mode:'custom',workflow:'brief',fromStage:'brief',launchRequestId:`ag-ui:${forkRunId}`}}}).subscribe({next:event=>forkEvents.push(event),error:reject,complete:resolve}));assert.equal(forkEvents[0].parentRunId,externalRunId);assert.ok(forkEvents.some(event=>event.type===EventType.CUSTOM&&event.name==='agentsuite.artifact.reused'));const forkPersisted=JSON.parse(await fs.readFile(path.join(apiRoot,'runs',forkRunId,'run.json'),'utf8'));assert.equal(forkPersisted.parentRunId,externalRunId);assert.equal(forkPersisted.interopMetadata.agUi.threadId,'official-client-thread');
    const resume=await fetch(`http://127.0.0.1:${port}/api/ag-ui`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({...validInput,runId:crypto.randomUUID(),resume:[{interruptId:'pending',status:'resolved'}]})});assert.equal(resume.status,400);assert.equal((await resume.json()).error,'AG_UI_RESUME_UNSUPPORTED');
    const invalid=await fetch(`http://127.0.0.1:${port}/api/ag-ui`,{method:'POST',headers:{'content-type':'application/json','accept':'text/event-stream'},body:JSON.stringify({...validInput,runId:'../unsafe'})});assert.equal(invalid.status,400);
    hangModel=true;const cancelRunId=crypto.randomUUID(),cancelEvents=[],cancelAgent=new HttpAgent({url:`http://127.0.0.1:${port}/api/ag-ui`,threadId:'cancel-thread'}),cancelPromise=cancelAgent.runAgent({runId:cancelRunId,forwardedProps:{agentsuite:{mode:'random',workflow:'brief',launchRequestId:`ag-ui:${cancelRunId}`}}},{onEvent:({event})=>cancelEvents.push(event)}).catch(error=>error);
    const cancelFile=path.join(apiRoot,'runs',cancelRunId,'run.json');for(let attempt=0;attempt<200;attempt+=1){const current=await fs.readFile(cancelFile,'utf8').then(JSON.parse).catch(()=>null);if(current?.events?.some(event=>event.type==='InferenceStarted'))break;await new Promise(resolve=>setTimeout(resolve,5))}
    const cancelResponse=await fetch(`http://127.0.0.1:${port}/api/ag-ui/runs/${cancelRunId}/cancel`,{method:'POST'});assert.equal(cancelResponse.status,202);await cancelPromise;const cancelledRun=JSON.parse(await fs.readFile(cancelFile,'utf8'));assert.equal(cancelledRun.status,'cancelled');assert.ok(cancelEvents.some(event=>event.type===EventType.CUSTOM&&event.name==='agentsuite.run.cancelled'));assert.equal(cancelEvents.at(-1).type,EventType.RUN_ERROR);hangModel=false;
  }finally{server.closeIdleConnections?.();server.closeAllConnections?.();await new Promise(resolve=>server.close(resolve))}
  console.log('AG-UI audit: schemas · deterministic projection · safe CUSTOM · MODEL not ToolCall · interrupt · identity · official HttpAgent launch · PASS');
}finally{model.closeIdleConnections?.();model.closeAllConnections?.();model.close();await fs.rm(temp,{recursive:true,force:true})}
