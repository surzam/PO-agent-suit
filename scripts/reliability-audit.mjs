import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createRuntime} from '../core/runtime.mjs';
import {createHarnessRegistry} from '../core/registry.mjs';
import {briefHarness} from '../harnesses/brief.mjs';
import {workflowDefinition} from '../app/workflows.mjs';
import {createProviderScheduler} from '../core/provider-scheduler.mjs';

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
  console.log('reliability audit: workflow · typed timeout · completion · recovery · cancellation · provider admission · PASS');
}finally{await fs.rm(temp,{recursive:true,force:true})}
