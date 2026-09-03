import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createRuntime } from '../core/runtime.mjs';
import { createHarnessRegistry } from '../core/registry.mjs';
import { createArtifactStore } from '../research/storage.mjs';
import { createResearchService,dataFromEvidence } from '../research/service.mjs';
import { createIntentDiscoveryHarness } from '../harnesses/intent-discovery.mjs';
import { briefHarness } from '../harnesses/brief.mjs';
import { createResearchHarness } from '../harnesses/research.mjs';
import { validationHarness } from '../harnesses/validation.mjs';
import { createSynthesisHarness } from '../harnesses/synthesis.mjs';
import { createDataHarness } from '../harnesses/data.mjs';
import { createPresentationStoryPlannerHarness } from '../harnesses/presentation-story-planner.mjs';
import { createNarrativeHarness } from '../harnesses/narrative.mjs';
import { createSlidesHarness } from '../harnesses/slides.mjs';
import { workflowDefinition } from '../app/workflows.mjs';
import { loadShowcaseCatalog,selectShowcasePack } from '../showcase/catalog.mjs';

process.env.PO_AGENT_NO_LISTEN='1';
const {narrativeMarkdown,slidesHtml,resolvePresentationStyle}=await import('../server.mjs');
const catalog=await loadShowcaseCatalog();
assert.equal(catalog.length,5);
for(const pack of catalog){assert.equal(pack.sourceKind,'example');assert.equal(pack.displayLabel,'Демонстрационный контекст');assert.ok(pack.documents.length>=3);assert.ok(!pack.documents.some(document=>/answer|final-conclusion|recommended-decision/i.test(document.file)))}
assert.equal(selectShowcasePack(catalog,'stable-seed').id,selectShowcasePack(catalog,'stable-seed').id);
assert.deepEqual(workflowDefinition('research-presentation','random').stages.slice(1).map(stage=>stage.harnessId),workflowDefinition('research-presentation','custom').stages.slice(1).map(stage=>stage.harnessId),'Random and Custom share every downstream harness');

const root=await fs.mkdtemp(path.join(os.tmpdir(),'agentsuite-showcase-')),reports=[];
try{
  for(const pack of catalog){
    const packRoot=path.join(root,pack.id),store=createArtifactStore(path.join(packRoot,'legacy'));await store.initialize();
    const source={id:'example',provider:'showcase',operationTimeoutMs:1000,async search(){return pack.documents.map((document,index)=>({sourceId:`example:${pack.id}:${index}`,sourceUri:`example://${pack.id}/${index}`,sourceTitle:document.file,sourceKind:'example',text:document.content}))}};
    const modelJson=async(system,user)=>{
      if(system.includes('Intent Discovery Harness'))return{status:'discovered',question:`Какое решение следует принять по сценарию ${pack.name}?`,reason:'Контекст содержит измеримые сигналы и позиции участников.',relevance:'Нужно выбрать следующий продуктовый шаг.',expectedDecision:'Выбрать действие с учётом риска.',requiredContext:[]};
      if(system.includes('планировщик deep research'))return{needs:[1,2,3].map(index=>({title:`Линия ${index}`,query:`${pack.id} evidence-${index}`,dods:[{criterion:`Проверить source unit ${index}`}]}))};
      if(system.includes('извлекаешь Evidence')){const input=JSON.parse(user),ordinal=Number(String(input.need.query).match(/evidence-(\d)/)?.[1]||1);return{evidence:input.sources.slice(0,3).map(item=>{const statements=String(item.text).split(/\r?\n/).flatMap(line=>line.match(/[^.!?]+[.!?]?/g)||[]).map(value=>value.trim()).filter(value=>value&&!value.startsWith('#'));const claim=statements[(ordinal-1)%statements.length];return{claim,quote:claim,sourceRef:item.ref,confidence:'direct',kind:'fact'}}),conflicts:ordinal===2?['Две позиции участников требуют выбора при неполной оценке стоимости.']:[],unknowns:ordinal===3?['Один фактор требует дополнительной проверки.']:[]}}
      if(system.includes('Synthesis Harness AgentSuite'))return{objective:`Принять решение: ${pack.name}`,audience:'Product Owner и продуктовая команда',keyClaims:[1,2,3,4].map(index=>({id:`C00${index}`,claim:`Проверяемый вывод ${index} для ${pack.name}`,evidenceIds:[`E${String(index).padStart(3,'0')}`],kind:index===4?'recommendation':'evidence-backed'})),uncertainties:['Один фактор требует дополнительной проверки.'],structure:['ситуация','доказательства','решение'],requestedOutputs:['presentation']};
      throw new Error(`Unexpected model prompt: ${system.slice(0,60)}`);
    };
    const research=createResearchService({modelJson,sources:[source],render:async()=>{throw new Error('researchOnly boundary violated')},store,limits:{timeoutMs:5000,maxSourceCalls:20,maxWebPages:0}});
    const registry=createHarnessRegistry([createIntentDiscoveryHarness({modelJson}),briefHarness,createResearchHarness({researchService:research,artifactStore:store}),validationHarness,createSynthesisHarness({modelJson}),createDataHarness({dataFromEvidence}),createPresentationStoryPlannerHarness(),createNarrativeHarness({narrativeMarkdown}),createSlidesHarness({slidesHtml,resolvePresentationStyle})]);
    const definition=workflowDefinition('research-presentation','random'),runtime=createRuntime({rootDir:packRoot,registry,observability:true,defaultAllowEmptyIntent:true,contextProvider:()=>({availableContext:pack.documents,showcase:{id:pack.id,name:pack.name,description:pack.description,sourceKind:'example',displayLabel:pack.displayLabel,seedKey:pack.seedKey,recommendedStyleId:pack.recommendedStyleId,researchProfile:'showcase'}})});
    const started=Date.now(),run=await runtime.run({intent:'',role:'product-owner',workflow:'research-presentation',allowEmptyIntent:true,launchRequestId:`showcase-${pack.seedKey}`,workflowDefinition:definition,stages:definition.stages});
    assert.equal(run.status,'completed',JSON.stringify(run.events.slice(-5)));
    const read=async type=>{const meta=run.artifacts.find(item=>item.type===type);assert.ok(meta,`${pack.id}: ${type} persisted`);return JSON.parse(await fs.readFile(path.join(packRoot,'runs',run.id,meta.file),'utf8'))};
    const evidence=await read('EvidenceSet'),data=await read('DataArtifact'),story=await read('PresentationStoryPlan'),presentation=await read('Presentation'),synthesis=await read('SynthesisPlan');
    const sourceUnits=new Set(evidence.data.items.map(item=>item.sourceId));assert.ok(sourceUnits.size>=3);assert.ok(evidence.data.items.every(item=>item.sourceKind==='example'));assert.ok(evidence.data.items.length>=8&&evidence.data.items.length<=16);
    assert.ok(data.data.rows.length>=8);assert.ok(data.data.insights.length>=3);assert.ok(data.data.researchContext.conflicts.length);assert.ok(story.data.unknowns.includes(data.data.researchContext.conflicts[0]));assert.ok(story.data.scenes.length>=8&&story.data.scenes.length<=12);
    const visualTypes=new Set(story.data.scenes.map(scene=>scene.visualType));assert.ok(visualTypes.size>=4);assert.ok(!(visualTypes.size===1&&visualTypes.has('statement')));
    const provenance=data.data.provenance,allowed={claimIds:new Set(synthesis.data.keyClaims.map(item=>item.id)),rowIds:new Set(provenance.rows.map(item=>item.rowId)),metricIds:new Set(provenance.metrics.map(item=>item.metricId)),insightIds:new Set(provenance.insights.map(item=>item.insightId)),evidenceIds:new Set(evidence.data.items.map(item=>item.id))};
    for(const scene of story.data.scenes)for(const key of Object.keys(allowed))for(const id of scene[key]||[])assert.ok(allowed[key].has(id),`${pack.id}: ${scene.id} resolves ${key}:${id}`);
    assert.equal(presentation.data.metadata.styleId,pack.recommendedStyleId);assert.equal(presentation.data.slides.length,story.data.scenes.length);
    reports.push({scenario:pack.id,evidence:evidence.data.items.length,sources:sourceUnits.size,rows:data.data.rows.length,metrics:data.data.numericMetrics.length,insights:data.data.insights.length,slides:story.data.scenes.length,visualTypes:[...visualTypes],styleId:presentation.data.metadata.styleId,durationMs:Date.now()-started});
  }
  console.log(JSON.stringify(reports,null,2));console.log('showcase audit: canonical Random · example provenance · rich Data · grounded story plans · deterministic styles · PASS');
}finally{await fs.rm(root,{recursive:true,force:true})}
