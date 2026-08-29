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
const harness={id:'probe',inputs:[],outputs:['Probe'],async execute({observe}){await observe('CapabilityStarted',{capability:'FILES',displayInput:'files.read("architecture.md")'});await observe('CapabilityCompleted',{capability:'FILES'});return{artifacts:[{type:'Probe',data:{ok:true}}],events:[]}}};
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

const apiRoot=path.join(temp,'api');const api=await createAgentSuiteApi({rootDir:apiRoot});
const server=http.createServer((req,res)=>api.handle(req,res));await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base=`http://127.0.0.1:${server.address().port}`;
const start=await fetch(base+'/api/runs',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({mode:'custom',intent:'SSE contract',workflow:'brief'})});
assert.equal(start.status,202);const {runId}=await start.json();
let run;for(let i=0;i<30;i+=1){run=await fetch(base+'/api/runs/'+runId).then(r=>r.json());if(run.status==='completed')break;await new Promise(resolve=>setTimeout(resolve,10));}
const sse=await fetch(base+`/api/runs/${runId}/events`);const text=await sse.text();
const ids=[...text.matchAll(/^id: (.+)$/gm)].map(x=>x[1]);assert.deepEqual(ids,run.events.map(e=>e.eventId),'SSE replay follows canonical journal order');
const after=run.events.at(-2).eventId;const tail=await fetch(base+`/api/runs/${runId}/events?after=${encodeURIComponent(after)}`).then(r=>r.text());assert.equal((tail.match(/^id:/gm)||[]).length,1,'reconnect resumes after eventId');
server.close();await fs.rm(temp,{recursive:true,force:true});
console.log('observation audit: launch/run engine · monotonic journal · reload projection · SSE replay/reconnect · PASS');
