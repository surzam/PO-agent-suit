import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createRuntime} from '../core/runtime.mjs';
import {createHarnessRegistry} from '../core/registry.mjs';
import {briefHarness} from '../harnesses/brief.mjs';
import {workflowDefinition} from '../app/workflows.mjs';
import {createProviderScheduler} from '../core/provider-scheduler.mjs';
import {validatePresentationMaterialization} from '../harnesses/presentation-validation.mjs';
import {evidenceFromDataArtifact} from '../harnesses/data-substrate.mjs';

const temp=await fs.mkdtemp(path.join(os.tmpdir(),'agentsuite-reliability-'));
try{
  const full=workflowDefinition('research-presentation','custom');
  assert.deepEqual(full.stages.map(stage=>stage.id),['intent','brief','research','validation','synthesis','data','narrative','slides']);
  assert.ok(full.stages.findIndex(stage=>stage.id==='data')<full.stages.findIndex(stage=>stage.id==='narrative'),'Data precedes Narrative');
  assert.deepEqual(workflowDefinition('research','custom').requiredArtifacts,['EvidenceSet'],'research-only has workflow-specific completion');

  const timeoutHarness={id:'timeout',inputs:[],outputs:[],async execute(){throw Object.assign(new Error('LLM request timed out'),{code:'INFERENCE_TIMEOUT'})}};
  const timeoutRuntime=createRuntime({rootDir:temp,registry:createHarnessRegistry([timeoutHarness]),runtimeInstanceId:'boot-timeout'});
  const timeout=await timeoutRuntime.run({intent:'timeout',stages:[{id:'timeout',harnessId:'timeout'}]});
  assert.equal(timeout.status,'failed');assert.equal(timeout.reasonCode,'inference-timeout');assert.notEqual(timeout.reasonCode,'provider-unavailable');

  const missingRuntime=createRuntime({rootDir:temp,registry:createHarnessRegistry([briefHarness]),runtimeInstanceId:'boot-output'});
  const missing=await missingRuntime.run({intent:'missing output',stages:[{id:'brief',harnessId:'brief'}],workflowDefinition:{requiredArtifacts:['Presentation']}});
  assert.equal(missing.status,'failed');assert.equal(missing.reasonCode,'artifact-unavailable');assert.ok(!missing.events.some(event=>event.type==='RunCompleted'));

  const corruptHarness={id:'corrupt-presentation',inputs:[],outputs:['Presentation'],async execute(){return{artifacts:[{type:'Presentation',data:{slides:[{}],html:'<!doctype html><html><head><style>:root{--bg:undefined}</style></head><body>not a deck</body></html>'}}]}}};
  const corruptRuntime=createRuntime({rootDir:temp,registry:createHarnessRegistry([corruptHarness]),artifactValidators:{Presentation:validatePresentationMaterialization},runtimeInstanceId:'boot-corrupt'});
  const corrupt=await corruptRuntime.run({intent:'corrupt deck',stages:[{id:'slides',harnessId:'corrupt-presentation'}],workflowDefinition:{requiredArtifacts:['Presentation'],requiredMaterializations:[{type:'Presentation',field:'html'}]}});
  assert.equal(corrupt.status,'failed');assert.equal(corrupt.reasonCode,'artifact-unavailable');assert.ok(!corrupt.events.some(event=>event.type==='RunCompleted'),'non-empty malformed Presentation cannot complete');

  const orphanRuntime=createRuntime({rootDir:temp,registry:createHarnessRegistry([briefHarness]),runtimeInstanceId:'boot-old'});
  const orphan=await orphanRuntime.start({intent:'orphan'});assert.equal(orphan.status,'launching');
  const recovery=createRuntime({rootDir:temp,registry:createHarnessRegistry([briefHarness]),runtimeInstanceId:'boot-new'});assert.deepEqual(await recovery.recoverOrphanedRuns(),[orphan.id]);
  const interrupted=await recovery.inspect(orphan.id);assert.equal(interrupted.status,'interrupted');assert.equal(interrupted.reasonCode,'runtime-interrupted');assert.equal(interrupted.events.at(-1).type,'RunInterrupted');

  let release;const blocking={id:'blocking',inputs:[],outputs:[],async execute({signal}){await new Promise((resolve,reject)=>{release=()=>setTimeout(()=>reject(Object.assign(new Error('cancelled'),{code:'ABORTED'})),50);signal.addEventListener('abort',release,{once:true})});return{}}};
  const cancelRuntime=createRuntime({rootDir:temp,registry:createHarnessRegistry([blocking]),runtimeInstanceId:'boot-cancel'}),launched=await cancelRuntime.launch({intent:'cancel',stages:[{id:'blocking',harnessId:'blocking'}]});
  while(!release)await new Promise(resolve=>setTimeout(resolve,1));const cancelled=await cancelRuntime.cancel(launched.run.id);assert.equal(cancelled.status,'cancelled');assert.equal(cancelled.reasonCode,'user-cancelled');assert.equal(cancelled.events.at(-1).payload.physicalOperationSettled,false);await launched.completion;const settled=await cancelRuntime.inspect(launched.run.id);assert.equal(settled.events.filter(event=>event.type==='RunCancelled').length,1);assert.equal(settled.events.at(-1).type,'RunCancellationSettled');

  const scheduler=createProviderScheduler({providerId:`audit-${Date.now()}`,crossProcess:false}),order=[];
  const first=scheduler.schedule(async()=>{order.push('first-start');await new Promise(resolve=>setTimeout(resolve,40));order.push('first-end')});
  const second=scheduler.schedule(async()=>{order.push('second-start');order.push('second-end')});await Promise.all([first,second]);assert.deepEqual(order,['first-start','first-end','second-start','second-end']);

  const settlementScheduler=createProviderScheduler({providerId:`settlement-${Date.now()}`,crossProcess:false});
  const abortController=new AbortController();let operationAStarted=false,abortObserved=false,physicallySettled=false,secondEntered=false;
  const operationA=settlementScheduler.schedule(()=>new Promise((resolve,reject)=>{operationAStarted=true;abortController.signal.addEventListener('abort',()=>{abortObserved=true;setTimeout(()=>{physicallySettled=true;reject(Object.assign(new Error('cancelled after provider settlement'),{code:'ABORTED'}))},45)},{once:true})}),{signal:abortController.signal}).catch(error=>error);
  while(!operationAStarted)await new Promise(resolve=>setTimeout(resolve,1));abortController.abort();while(!abortObserved)await new Promise(resolve=>setTimeout(resolve,1));
  const operationB=settlementScheduler.schedule(async()=>{secondEntered=true;assert.equal(physicallySettled,true,'provider lease remains held until operation A physically settles')});
  await new Promise(resolve=>setTimeout(resolve,15));assert.equal(secondEntered,false,'operation B cannot enter while cancelled operation A is physically busy');
  await Promise.all([operationA,operationB]);assert.equal(secondEntered,true);

  const deadlineHarness={id:'deadline',inputs:[],outputs:[],async execute({observe,createOperationId}){const operationId=createOperationId('inference'),deadline=new Date(Date.now()+1000).toISOString();await observe('InferenceStarted',{operationId,capability:'MODEL',deadline});await new Promise(resolve=>setTimeout(resolve,5));await observe('InferenceCompleted',{operationId,capability:'MODEL'});return{}}};
  const deadlineRuntime=createRuntime({rootDir:temp,registry:createHarnessRegistry([deadlineHarness]),observability:true,runtimeInstanceId:'boot-deadline'});
  const deadlineRun=await deadlineRuntime.run({intent:'deadline',stages:[{id:'deadline',harnessId:'deadline'}]});const operation=deadlineRun.operations[0];
  assert.match(operation.deadline,/Z$/);assert.ok(operation.durationMs>=0);assert.ok(deadlineRun.events.find(event=>event.type==='InferenceCompleted').payload.durationMs>=0);

  const stableData={id:'data-stable',data:{rows:[['E-B','row B'],['E-A','wrong positional row']],structuredRows:[{rowId:'row-B',values:['E-B','row B']},{rowId:'row-A',values:['E-A','row A']}],provenance:{rows:[{rowId:'row-A',rowIndex:0,kind:'fact',evidenceIds:['E-A']}]}}};
  assert.equal(evidenceFromDataArtifact(stableData)[0].claim,'row A','rowId survives physical row/provenance reorder');
  const providerSource=await fs.readFile(new URL('../server.mjs',import.meta.url),'utf8');
  for(const functionName of ['generateMotto','llama','refineScenes']){const body=providerSource.slice(providerSource.indexOf(`async function ${functionName}`),providerSource.indexOf('\n}',providerSource.indexOf(`async function ${functionName}`))+2);assert.match(body,/modelScheduler\.schedule/,`${functionName} routes through the shared provider scheduler`)}
  console.log('reliability audit: workflow · typed timeout · completion · recovery · cancellation · provider admission · PASS');
}finally{await fs.rm(temp,{recursive:true,force:true})}
