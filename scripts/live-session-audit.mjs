import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createLiveSessionState,materializeUiIntent,projectActivity,snapshotDelta,UI_COMPONENT_CATALOG} from '../interop/ag-ui/session.mjs';
import {createStateSnapshot,projectAgUiRun} from '../interop/ag-ui/projection.mjs';
import {projectObservation} from '../core/observation.mjs';
import {createRuntime} from '../core/runtime.mjs';
import {createHarnessRegistry} from '../core/registry.mjs';
import {createAgUiEndpoint} from '../interop/ag-ui/endpoint.mjs';

const event=(sequence,type,payload={})=>({sequence,eventId:`live:${String(sequence).padStart(8,'0')}`,runId:'live-run',type,at:`2026-09-10T00:00:${String(sequence).padStart(2,'0')}.000Z`,payload});
const artifact={id:'data-1',runId:'live-run',type:'DataArtifact',createdAt:'2026-09-10T00:00:04.000Z',data:{rows:[]}};
const run={id:'live-run',status:'completed',intent:'Проверить Live Session',role:'product-owner',activeOperationIds:[],artifacts:[{id:'data-1',type:'DataArtifact',file:'artifacts/data-1.json',sourceArtifactIds:[]}],events:[
  event(1,'RunRequested',{intent:'Проверить Live Session'}),event(2,'RunStarted',{}),event(3,'SourceOpened',{operationId:'source-op',capability:'WEB',sourceId:'web:one',sourceKind:'web',safeDisplayName:'source-01.md',displayInput:'web.read("source-01.md")'}),event(4,'SourceRead',{operationId:'source-op',capability:'WEB',sourceId:'web:one',sourceKind:'web',safeDisplayName:'source-01.md'}),event(5,'ArtifactCreated',{artifactId:'data-1',type:'DataArtifact'}),event(6,'RunCompleted',{})
]};
const observation=projectObservation(run,{capabilities:['WEB'],artifacts:[artifact]});
const session=createLiveSessionState(run,{observation,threadId:'thread-live'});
assert.equal(session.session.runId,'live-run','Runtime truth produces a Session identity');
assert.equal(session.workspace.files.find(node=>node.artifactId==='data-1').path,'workspace/runs/current/outputs/data.json','artifact event produces filesystem node without exposing Runtime identity');
assert.equal(projectActivity({id:'quiet',events:[]}).items.length,0,'no event means no activity');
assert.ok(session.activity.items.some(item=>item.label.includes('Читаю источник')),'source event becomes human activity');
assert.equal(materializeUiIntent({type:'SHOW_TABLE',data:{}},UI_COMPONENT_CATALOG).component,'table','registered component materializes declaratively');
assert.equal(materializeUiIntent({type:'SHOW_TABLE',data:{}},['text']),null,'unregistered component cannot mount');
assert.equal(materializeUiIntent({type:'SHOW_TABLE',data:{html:'<script>bad()</script>'}},UI_COMPONENT_CATALOG).data.html,'<script>bad()</script>','intent stays data-only; renderer receives no executable surface');

const snapshot=createStateSnapshot(run,{observation,threadId:'thread-live'}),state=structuredClone(snapshot);const next={...session,session:{...session.session,status:'completed'}};
for(const operation of snapshotDelta(next)){assert.equal(operation.path,'/session');state.session=operation.value;}
assert.deepEqual(state.session,next,'STATE_DELTA reconstructs the same Session value as a snapshot');
const events=projectAgUiRun(run,{observation,threadId:'thread-live'}).map(record=>record.event);
for(const type of ['RUN_STARTED','STATE_SNAPSHOT','MESSAGES_SNAPSHOT','ACTIVITY_SNAPSHOT','STATE_DELTA','ACTIVITY_DELTA','TEXT_MESSAGE_START','TEXT_MESSAGE_CONTENT','TEXT_MESSAGE_END','TOOL_CALL_START','TOOL_CALL_ARGS','TOOL_CALL_END','TOOL_CALL_RESULT','RUN_FINISHED'])assert.ok(events.some(event=>event.type===type),`${type} is emitted from canonical Runtime facts`);
const historical=createLiveSessionState(run,{observation,threadId:'thread-live'});assert.deepEqual(historical,session,'historical load rebuilds a static projection without replay state');

const root=await fs.mkdtemp(path.join(os.tmpdir(),'agentsuite-live-session-'));let release;
const runtime=createRuntime({rootDir:root,observability:true,registry:createHarnessRegistry([{id:'waiting',inputs:[],outputs:[],async execute({signal}){await new Promise((resolve,reject)=>{release=()=>reject(Object.assign(new Error('cancelled'),{code:'ABORTED'}));signal.addEventListener('abort',release,{once:true})});return{}}}])});
const launched=await runtime.launch({intent:'cancel through AG-UI input',stages:[{id:'waiting',harnessId:'waiting'}]});
while(!release)await new Promise(resolve=>setTimeout(resolve,2));
const endpoint=createAgUiEndpoint({inspect:id=>runtime.inspect(id),observation:async current=>projectObservation(current),subscribe:()=>()=>{},launch:async()=>{throw new Error('unused')},cancel:id=>runtime.cancel(id),artifact:async()=>null,session:async current=>createLiveSessionState(current,{observation:projectObservation(current)}),input:async value=>{if(value.type!=='CANCEL_RUN')return{accepted:false};const cancelled=await runtime.cancel(value.runId);return{accepted:true,runId:cancelled.id,status:cancelled.status};}});
const server=http.createServer((req,res)=>endpoint(req,res,new URL(req.url,'http://127.0.0.1')));await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const response=await fetch(`http://127.0.0.1:${server.address().port}/api/ag-ui/runs/${launched.run.id}/input`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({type:'CANCEL_RUN',payload:{}})});assert.equal(response.status,202);assert.equal((await response.json()).accepted,true,'frontend input reaches runtime acknowledgement');await launched.completion;const cancelled=await runtime.inspect(launched.run.id);assert.ok(cancelled.events.some(item=>item.type==='RunCancelled'),'cancel acknowledgement is a real Runtime event');server.close();await fs.rm(root,{recursive:true,force:true});
console.log('live session audit: runtime → AG-UI → rebuildable session · activity · workspace · safe UI intents · PASS');
