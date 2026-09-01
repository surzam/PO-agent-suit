import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { createRuntime } from '../core/runtime.mjs';
import { createHarnessRegistry } from '../core/registry.mjs';
import { projectObservation } from '../core/observation.mjs';
import { createAgentSuiteApi } from '../api/agentsuite-api.mjs';

const temp=await fs.mkdtemp(path.join(os.tmpdir(),'agentsuite-observation-'));
const harness={id:'probe',inputs:[],outputs:['Probe'],async execute({observe,createOperationId}){const operationId=createOperationId('files-read');await observe('CapabilityStarted',{operationId,capability:'FILES',displayInput:'files.read("architecture.md")'});await observe('CapabilityCompleted',{operationId,capability:'FILES'});return{artifacts:[{type:'Probe',data:{ok:true},producedByOperationId:operationId}],events:[]}}};
const runtime=createRuntime({rootDir:temp,registry:createHarnessRegistry([harness]),observability:true});
const launched=await runtime.launch({intent:'journal ordering',stages:[{id:'probe',harnessId:'probe'}]});
assert.equal(launched.run.status,'running','launch returns the existing run before completion');
const completed=await launched.completion;
assert.equal(completed.status,'completed');
assert.deepEqual(completed.events.map(e=>e.sequence),completed.events.map((_,i)=>i+1));
assert.ok(completed.events.every(e=>e.eventId===`${completed.id}:${String(e.sequence).padStart(8,'0')}`));
const projection=projectObservation(await runtime.inspect(completed.id),{capabilities:['FILES','MODEL']});
assert.equal(projection.status,'completed');assert.equal(projection.capabilities.find(x=>x.id==='FILES').state,'complete');
assert.equal(projection.consoleLines.find(x=>x.type==='CapabilityStarted').displayInput,'files.read("architecture.md")');
assert.equal(projection.agentActions.length,1);assert.equal(projection.agentActions[0].relatedArtifactIds.length,1,'Artifact is attached only by producer operation correlation');
assert.equal(projection.capabilities.find(x=>x.id==='MODEL').state,'idle','configuration does not imply activity');
const lineageRun={id:'lineage-run',role:'product-owner',status:'completed',events:[
  {sequence:1,eventId:'lineage-run:00000001',id:'lineage-run:00000001',type:'SourceOpened',at:new Date().toISOString(),payload:{sourceId:'local:docs/architecture/runtime.md',sourceKind:'local',safeDisplayName:'runtime.md',contextRootId:'project',sourceUri:'/private/secret?token=hidden'}},
  {sequence:2,eventId:'lineage-run:00000002',id:'lineage-run:00000002',type:'SourceRead',at:new Date().toISOString(),payload:{sourceId:'local:docs/architecture/runtime.md',sourceKind:'local',safeDisplayName:'runtime.md',contextRootId:'project'}},
  {sequence:3,eventId:'lineage-run:00000003',id:'lineage-run:00000003',type:'EvidenceCollected',at:new Date().toISOString(),payload:{count:1,sources:[{sourceId:'local:docs/architecture/runtime.md',sourceKind:'local',safeDisplayName:'runtime.md',evidenceIds:['E004']}]}}
]};
const lineage=projectObservation(lineageRun,{capabilities:['FILES'],configuration:{roots:[{id:'project',label:'PROJECT',kind:'project'}],sources:[{sourceId:'local:docs/architecture/runtime.md',sourceKind:'local',safeDisplayName:'runtime.md',contextRootId:'project'}]},artifacts:[
  {id:'evidence-artifact',type:'EvidenceSet',data:{items:[{id:'E004',claim:'Runtime persists events',sourceId:'local:docs/architecture/runtime.md',sourceTitle:'runtime.md',confidence:'direct',kind:'fact'}]}},
  {id:'synthesis-artifact',type:'SynthesisPlan',data:{keyClaims:[{id:'C002',claim:'The journal is inspectable',kind:'evidence-backed',evidenceIds:['E004']}]}},
  {id:'narrative-artifact',type:'Narrative',data:{sections:[{evidenceIds:['E004']}]}},
  {id:'presentation-artifact',type:'Presentation',data:{slides:[{claimIds:['C002'],evidenceIds:['E004']}]}}
]});
assert.equal(lineage.contextWorld.sources[0].sourceId,'local:docs/architecture/runtime.md');
assert.equal(lineage.contextWorld.sources[0].state,'used-as-evidence');
assert.equal(lineage.contextWorld.sources[0].safeUri,undefined,'unsafe raw URI is not projected');
assert.deepEqual(lineage.evidence.items[0].usedBy,['C002']);
assert.deepEqual(lineage.claims[0].outputTypes.sort(),['Narrative','Presentation']);

const sameDescriptor={id:'ops',role:'product-owner',status:'completed',events:[
  {sequence:1,eventId:'ops:00000001',type:'CapabilityStarted',at:new Date().toISOString(),payload:{operationId:'op-a',capability:'FILES',displayInput:'files.read("same.md")'}},
  {sequence:2,eventId:'ops:00000002',type:'CapabilityCompleted',at:new Date().toISOString(),payload:{operationId:'op-a',capability:'FILES'}},
  {sequence:3,eventId:'ops:00000003',type:'CapabilityStarted',at:new Date().toISOString(),payload:{operationId:'op-b',capability:'FILES',displayInput:'files.read("same.md")'}},
  {sequence:4,eventId:'ops:00000004',type:'CapabilityCompleted',at:new Date().toISOString(),payload:{operationId:'op-b',capability:'FILES'}},
  {sequence:5,eventId:'ops:00000005',type:'CapabilityStarted',at:new Date().toISOString(),payload:{capability:'FILES',displayInput:'files.read("uncorrelated.md")'}},
  {sequence:6,eventId:'ops:00000006',type:'ArtifactCreated',at:new Date().toISOString(),payload:{artifactId:'free-artifact',type:'Probe'}}
]};
const operationProjection=projectObservation(sameDescriptor,{capabilities:['FILES'],artifacts:[{id:'free-artifact',type:'Probe',data:{}}]});
assert.equal(operationProjection.agentActions.length,2,'same descriptor with different operation correlation remains distinct');
assert.equal(operationProjection.agentActions.every(action=>action.relatedArtifactIds.length===0),true,'same stage or chronology never implies artifact correlation');
assert.ok(operationProjection.terminalRecords.some(record=>record.kind==='event'&&record.event.sequence===5),'missing correlation remains a separate terminal record');
assert.ok(operationProjection.terminalRecords.some(record=>record.kind==='event'&&record.event.type==='ArtifactCreated'),'uncorrelated ArtifactCreated remains separate');
assert.deepEqual(projectObservation(sameDescriptor,{capabilities:['FILES'],artifacts:[{id:'free-artifact',type:'Probe',data:{}}]}).agentActions,operationProjection.agentActions,'same journal rebuilds same terminal actions');

const typed=projectObservation({id:'typed',role:'product-owner',status:'completed',events:[]},{artifacts:[
  {id:'s',type:'SynthesisPlan',data:{}},{id:'d',type:'DataArtifact',sourceArtifactIds:['s'],data:{}},{id:'n',type:'Narrative',sourceArtifactIds:['s','d'],data:{}}
],contracts:[{stageId:'narrative',inputs:['SynthesisPlan','DataArtifact'],outputs:['Narrative']} ]});
assert.deepEqual(typed.dependencies.filter(edge=>edge.toArtifactId==='n').map(edge=>edge.relation),['frames','grounds'],'Inspector lineage retains both typed direct responsibilities');
const rendererSource=await fs.readFile(path.join(process.cwd(),'public/ui/app.js'),'utf8');assert.doesNotMatch(rendererSource,/runs\s*\[\s*0\s*\]/,'renderer never guesses current Run from runs[0]');assert.match(rendererSource,/localStorage\.getItem\('agentsuite\.currentRunId'\)/,'current Run selection survives Electron restart');assert.match(rendererSource,/screen\('result'\)/,'terminal Run has an explicit Result transition');
const resultMarkup=await fs.readFile(path.join(process.cwd(),'public/index.html'),'utf8');
assert.ok(resultMarkup.indexOf('id="resultStatus"')<resultMarkup.indexOf('id="resultArtifacts"'),'result actions follow the current Run status');
assert.ok(resultMarkup.indexOf('id="resultArtifacts"')<resultMarkup.indexOf('id="resultNavigation"'),'materialized outputs precede secondary navigation');
const resultStyles=await fs.readFile(path.join(process.cwd(),'public/ui/app.css'),'utf8');
assert.match(resultStyles,/\.result-screen\s*\{[^}]*overflow-y\s*:\s*auto/s,'Result remains reachable at short viewport heights');
assert.match(resultStyles,/-webkit-line-clamp\s*:/,'long generated Intent cannot consume the whole Result surface');

const apiRoot=path.join(temp,'api');const api=await createAgentSuiteApi({rootDir:apiRoot});
const server=http.createServer((req,res)=>api.handle(req,res));await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base=`http://127.0.0.1:${server.address().port}`;
const scopedPresentation=await fetch(base+'/api/runs/demo-po-run/artifacts/demo-po-presentation');assert.equal(scopedPresentation.status,200,'current Run can open its Presentation directly');assert.equal((await scopedPresentation.json()).type,'Presentation');
const foreignPresentation=await fetch(base+'/api/runs/demo-po-run/artifacts/demo-cto-presentation');assert.equal(foreignPresentation.status,404,'artifact viewer cannot leak an output from another Run');
const start=await fetch(base+'/api/runs',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({launchRequestId:'observation-audit-launch',mode:'custom',intent:'SSE contract',workflow:'brief'})});
assert.equal(start.status,202);const {runId}=await start.json();
const duplicate=await fetch(base+'/api/runs',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({launchRequestId:'observation-audit-launch',mode:'custom',intent:'different body is ignored for same key',workflow:'brief'})});assert.equal(duplicate.status,200);assert.equal((await duplicate.json()).runId,runId,'same launchRequestId returns same canonical Run');
const missingKey=await fetch(base+'/api/runs',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({mode:'custom',intent:'missing key',workflow:'brief'})});assert.equal(missingKey.status,400,'launchRequestId is mandatory');
let run;for(let i=0;i<30;i+=1){run=await fetch(base+'/api/runs/'+runId).then(r=>r.json());if(run.status==='completed')break;await new Promise(resolve=>setTimeout(resolve,10));}
const sse=await fetch(base+`/api/runs/${runId}/events`);const text=await sse.text();
const ids=[...text.matchAll(/^id: (.+)$/gm)].map(x=>x[1]);assert.deepEqual(ids,run.events.map(e=>e.eventId),'SSE replay follows canonical journal order');
const after=run.events.at(-2).eventId;const tail=await fetch(base+`/api/runs/${runId}/events?after=${encodeURIComponent(after)}`).then(r=>r.text());assert.equal((tail.match(/^id:/gm)||[]).length,1,'reconnect resumes after eventId');
const diagnostics=await fetch(base+'/api/diagnostics').then(r=>r.json());assert.equal(diagnostics.lastCompletedRunId,runId);assert.ok(diagnostics.records.every(record=>record.eventId&&Number.isInteger(record.sequence)),'safe diagnostics retain canonical event identity');
server.close();

async function admissionServer(name){const instance=await createAgentSuiteApi({rootDir:path.join(temp,name)}),listener=http.createServer((req,res)=>instance.handle(req,res));await new Promise(resolve=>listener.listen(0,'127.0.0.1',resolve));return{listener,base:`http://127.0.0.1:${listener.address().port}`}}
async function waitForTerminal(baseUrl,runId){for(let attempt=0;attempt<100;attempt+=1){const value=await fetch(`${baseUrl}/api/runs/${runId}`).then(response=>response.json());if(['completed','failed','cancelled','interrupted','needs-context'].includes(value.status))return value;await new Promise(resolve=>setTimeout(resolve,10))}throw new Error(`Run ${runId} did not settle`)}
const sameAdmission=await admissionServer('same-admission');
const sameBody=JSON.stringify({launchRequestId:'same-concurrent-launch',mode:'custom',intent:'same admission',workflow:'brief'});
const sameResponses=await Promise.all([fetch(sameAdmission.base+'/api/runs',{method:'POST',headers:{'content-type':'application/json'},body:sameBody}),fetch(sameAdmission.base+'/api/runs',{method:'POST',headers:{'content-type':'application/json'},body:sameBody})]);
assert.deepEqual(sameResponses.map(response=>response.status).sort(),[200,202]);const sameValues=await Promise.all(sameResponses.map(response=>response.json()));assert.equal(new Set(sameValues.map(value=>value.runId)).size,1,'concurrent identical launch keys resolve to one Run');await waitForTerminal(sameAdmission.base,sameValues[0].runId);sameAdmission.listener.close();

const competingAdmission=await admissionServer('competing-admission');
const competingResponses=await Promise.all(['launch-one-key','launch-two-key'].map((launchRequestId,index)=>fetch(competingAdmission.base+'/api/runs',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({launchRequestId,mode:'custom',intent:`competing ${index}`,workflow:'brief'})})));
assert.deepEqual(competingResponses.map(response=>response.status).sort(),[202,409]);const competingValues=await Promise.all(competingResponses.map(async response=>({status:response.status,value:await response.json()}))),conflict=competingValues.find(item=>item.status===409).value,accepted=competingValues.find(item=>item.status===202).value;assert.equal(conflict.error,'ACTIVE_RUN_EXISTS');assert.equal(conflict.activeRunId,accepted.runId);await waitForTerminal(competingAdmission.base,accepted.runId);competingAdmission.listener.close();

await fs.rm(temp,{recursive:true,force:true});
console.log('observation audit: launch/run engine · monotonic journal · reload projection · SSE replay/reconnect · PASS');
