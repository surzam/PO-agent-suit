import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { projectFilesystem, projectObservation } from '../core/observation.mjs';

const at=sequence=>`2026-09-09T10:00:${String(sequence).padStart(2,'0')}.000Z`;
const event=(sequence,type,payload={})=>({sequence,eventId:`fs-run:${String(sequence).padStart(8,'0')}`,type,at:at(sequence),payload});
const source={id:'source-artifact',type:'EvidenceSet',createdAt:at(4),data:{items:[{id:'E1',claim:'A fact',sourceId:'web:source-01',sourceTitle:'source-01.md'}]}};
const data={id:'data-artifact',type:'DataArtifact',createdAt:at(7),producedByOperationId:'data-op',data:{rows:[]}};
const story={id:'story-artifact',type:'Narrative',createdAt:at(8),data:{content:'# Story'}};
const deck={id:'deck-artifact',type:'Presentation',createdAt:at(9),data:{slides:[]}};
const run={id:'fs-run',status:'completed',events:[
  event(1,'SourceOpened',{operationId:'source-op',sourceId:'web:source-01',sourceKind:'web',safeDisplayName:'source-01.md',displayInput:'web.read("source-01.md")'}),
  event(2,'SourceRead',{operationId:'source-op',sourceId:'web:source-01',sourceKind:'web',safeDisplayName:'source-01.md'}),
  event(3,'EvidenceCollected',{count:1,sources:[{sourceId:'web:source-01',sourceKind:'web',safeDisplayName:'source-01.md',evidenceIds:['E1']}]}),
  event(4,'ArtifactCreated',{artifactId:'source-artifact',type:'EvidenceSet'}),
  event(7,'ArtifactCreated',{artifactId:'data-artifact',type:'DataArtifact',producedByOperationId:'data-op'}),
  event(8,'ArtifactCreated',{artifactId:'story-artifact',type:'Narrative'}),
  event(9,'ArtifactCreated',{artifactId:'deck-artifact',type:'Presentation'}),
  event(10,'RunCompleted',{})
]};
const projection=projectFilesystem(run,{artifacts:[source,data,story,deck]});
const find=id=>projection.nodes.find(node=>node.id===id);
assert.equal(find('artifact:data-artifact').path,'workspace/runs/current/outputs/data.json','FS01 canonical artifact has logical output node');
assert.equal(find('artifact:data-artifact').status,'ready','FS02 ArtifactCreated settles as READY in reconstructed history');
assert.equal(find('source:web:source-01').status,'evidence','FS06 historical source is static evidence state, never active replay');
assert.equal(find('source:web:source-01').evidenceCount,1,'research source retains evidence relationship');
assert.equal(projection.nodes.some(node=>node.path.includes('/home/')||node.path.includes('/media/')),false,'FS10 path hides host filesystem');
assert.deepEqual(projectFilesystem(run,{artifacts:[source,data,story,deck]}),projection,'FS11 projection deterministically rebuilds from canonical facts');

const reused=projectFilesystem({...run,events:[event(1,'ArtifactReused',{artifactId:'data-artifact',type:'DataArtifact'})]},{artifacts:[{...data,reused:true}]});
assert.equal(reused.nodes.find(node=>node.artifactId==='data-artifact').status,'reused','FS03 ArtifactReused retains reused marker');

const activeRun={id:'active-run',status:'running',activeOperationIds:['read-op'],events:[event(1,'SourceOpened',{operationId:'read-op',sourceId:'local:brief.md',sourceKind:'local',safeDisplayName:'brief.md'})]};
const active=projectFilesystem(activeRun);assert.equal(active.activeNodeId,'source:local:brief.md','FS04 active operation highlights its exact canonical source node');
const quiet=projectFilesystem({id:'quiet-run',status:'running',events:[]});assert.equal(quiet.nodes.filter(node=>node.status==='active'&&['source','artifact','output'].includes(node.kind)).length,0,'FS05 no event produces no file movement');

const observation=projectObservation(run,{artifacts:[source,data,story,deck]});assert.equal(observation.filesystem.nodes.length,projection.nodes.length,'filesystem is part of the existing Observation response, not an independent API');
const renderer=await fs.readFile(new URL('../public/ui/observation/filesystem-projection.js',import.meta.url),'utf8');
assert.match(renderer,/onInspect/,'FS07/FS08 file clicks delegate to existing inspector/artifact surface');
assert.doesNotMatch(renderer,/fetch\(|XMLHttpRequest|WebSocket|child_process|exec\(/,'FS09 renderer cannot execute shell or network actions');
const css=await fs.readFile(new URL('../public/ui/app.css',import.meta.url),'utf8');
assert.match(css,/max-width:1440px/,'FS12/13 responsive desktop geometry is explicit');assert.match(css,/min-width:1181px/,'FS14 wide desktop geometry is explicit');
console.log('filesystem observation audit: canonical projection · live operation · historical quiet · click boundary · responsive geometry · PASS');
