import assert from 'node:assert/strict';
import {createProviderScheduler} from '../core/provider-scheduler.mjs';
import {createIntentDiscoveryHarness,discoveryContext} from '../harnesses/intent-discovery.mjs';
import {loadShowcaseCatalog} from '../showcase/catalog.mjs';

const providerId=`wait-audit-${process.pid}`;
const firstScheduler=createProviderScheduler({providerId,crossProcess:false});
const secondScheduler=createProviderScheduler({providerId,crossProcess:false});
let unblock;
const blocked=firstScheduler.schedule(()=>new Promise(resolve=>{unblock=resolve}));
await new Promise(resolve=>setImmediate(resolve));
let executed=false;
await assert.rejects(secondScheduler.schedule(()=>{executed=true},{timeoutMs:20}),{code:'INFERENCE_TIMEOUT'});
assert.equal(executed,false);
const cancel=new AbortController();
const pending=firstScheduler.schedule(()=>{executed=true},{signal:cancel.signal});
cancel.abort();
await assert.rejects(pending,{code:'ABORTED'});
unblock();await blocked;
await secondScheduler.schedule(()=>assert.equal(executed,false));
await assert.rejects(firstScheduler.schedule(signal=>new Promise((_,reject)=>signal.addEventListener('abort',()=>reject(signal.reason),{once:true})),{timeoutMs:20}),{code:'INFERENCE_TIMEOUT'});
assert.equal(await firstScheduler.schedule(()=>42),42);

const documents=Array.from({length:20},(_,i)=>({file:`document-${i}`,content:'а'.repeat(4000)}));
const before=JSON.stringify(documents);
assert.equal(discoveryContext(documents).length,8);
assert.ok(discoveryContext(documents).every(doc=>doc.content.length===1600&&doc.truncated));
let calls=0;
const question='Стоит ли попробовать короткие уроки, чтобы учиться после работы было проще?';
const harness=createIntentDiscoveryHarness({modelJson:async(system,user)=>{
  const input=JSON.parse(user);assert.equal(input.contextIsExcerpt,true);assert.equal(input.availableContext.length,8);
  calls++;return {status:'discovered',question:calls===1?'очень '.repeat(50):question};
}});
const output=await harness.execute({context:{availableContext:documents},role:'product-owner',artifacts:[],run:{id:'test'}});
assert.equal(calls,2);assert.equal(output.artifacts[0].data.question,question);assert.equal(JSON.stringify(documents),before);
const catalog=await loadShowcaseCatalog();
assert.ok(catalog.find(pack=>pack.id==='language-learning')?.documents.length>=3);
console.log('PASS: queue deadline; queued cancellation; shared scheduler ordering; active abort; bounded discovery; long question repair; original context preserved; relatable example loaded');
