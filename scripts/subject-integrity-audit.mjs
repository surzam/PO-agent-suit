import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {parseCSV,sourceTableFromDocument,deriveCellMetric,subjectMetricsFromTables} from '../core/subject-data.mjs';
import {resolveSubjectMetric,resolveChartSpec} from '../core/metric-chart.mjs';
import {deriveHypothesisPlan} from '../core/po-hypothesis.mjs';
import {createResearchService} from '../research/service.mjs';
import {createArtifactStore} from '../research/storage.mjs';
import {createResearchHarness} from '../harnesses/research.mjs';
import {validationHarness} from '../harnesses/validation.mjs';
import {createDataHarness} from '../harnesses/data.mjs';
import {createNarrativeHarness} from '../harnesses/narrative.mjs';
import {createSlidesHarness} from '../harnesses/slides.mjs';
import {documentForSubject} from '../public/ui/data-table.js';
import {JSDOM} from 'jsdom';
import {dataFromEvidence} from '../research/service.mjs';
import {chartSpecsFromDataArtifact} from '../core/metric-chart.mjs';
import {createSynthesisHarness} from '../harnesses/synthesis.mjs';
import {planPresentationStory} from '../harnesses/presentation-story-planner.mjs';
import {bindClaimEpistemics,presentEpistemicClaim} from '../core/claim-epistemics.mjs';
import {presentHumanSurface} from '../public/ui/human-view.js';

test('42%, 48.6%, 6.6pp from cells, and table/chart ignore forged cached values',()=>{
  const table=sourceTableFromDocument({sourceId:'fixture',sourceTitle:'test.csv',text:'group,sessions,purchase_completed\ncontrol,1000,420\nnew_mobile,1000,486\n'});
  const data={sourceTables:[table],subjectMetrics:subjectMetricsFromTables([table])};
  const ratios=data.subjectMetrics.filter(m=>m.operator==='ratio');
  assert.deepEqual(ratios.map(m=>m.value),[.42,.486]);
  assert.ok(Math.abs(data.subjectMetrics.find(m=>m.operator==='percentage-point-difference').value-6.6)<1e-10);
  ratios[0].value=999;
  assert.equal(resolveSubjectMetric(data,ratios[0]),.42);
  const dom=new JSDOM(documentForSubject(data));
  assert.match(dom.window.document.querySelector(`[data-metric-id="${ratios[0].id}"]`).textContent,/: 42 percent/);
  assert.doesNotMatch(dom.window.document.body.textContent,/999/);
  const percentTable=sourceTableFromDocument({sourceId:'percent',sourceTitle:'p.csv',text:'rate\n48.6%\n42%\n'});
  const pp=deriveCellMetric({operator:'percentage-point-difference',cells:percentTable.rows.map(r=>r.cells[0]),rowRefs:percentTable.rows.map(r=>r.id),sourceTableRef:percentTable.id});
  assert.ok(Math.abs(resolveSubjectMetric({sourceTables:[percentTable]},pp)-6.6)<1e-10);
  assert.equal(resolveSubjectMetric(data,{...ratios[0],unit:'days'}),null);
});

test('source statistical claims stay attributed; interpretations cannot become observations',()=>{
  const claim={id:'C',kind:'evidence-backed',claim:'Invented result',evidenceIds:['E']};
  const statistical=bindClaimEpistemics(claim,[{id:'E',kind:'fact',claim:'Источник считает изменение статистически значимым',sourceUri:'fixture:report'}]);
  assert.match(presentEpistemicClaim(statistical),/^Источник сообщает:/);
  assert.equal(statistical.epistemic.statisticalAuthority,'not-verified');
  const interpreted=bindClaimEpistemics(claim,[{id:'E',kind:'interpretation',claim:'Возможна связь',sourceUri:'fixture:report'}]);
  assert.equal(interpreted.epistemic.class,'interpretation');
  assert.match(presentEpistemicClaim(interpreted),/^Непроверенная интерпретация:/);
});

test('A: checkout product charts must not select diagnostic counters',()=>{
  const data=dataFromEvidence({question:'Сравнить завершение покупки'}, {evidence:[],needs:[],sourceCalls:7});
  const specs=chartSpecsFromDataArtifact({id:'data',data});
  assert.equal(specs.length,0,'no measured subject data means no product chart');
});

test('CSV quoting, newlines, unicode, missing values and no formula execution',()=>{
  assert.deepEqual(parseCSV('\uFEFFname,value\r\n"Привет, мир","say ""yes"""\r\n"two\nlines",\n'),[['name','value'],['Привет, мир','say "yes"'],['two\nlines','']]);
  assert.throws(()=>parseCSV('a,b\n"broken,b'));
  assert.throws(()=>parseCSV('a,b\n1,2,3'));
  const t=sourceTableFromDocument({sourceId:'s',sourceTitle:'x.csv',text:'name,value\nformula,=1+2\nempty,\npercent,12%\ninvalid,12oops'});
  assert.equal(t.rows[0].cells[1].parsedValue,undefined);
  assert.equal(t.rows[1].cells[1].parsedValue,undefined);
  assert.equal(t.rows[2].cells[1].parsedValue,12);
  assert.equal(t.rows[2].cells[1].unit,'percent');
  assert.equal(t.rows[3].cells[1].parsedValue,undefined);
});

test('safe arithmetic: missing, zero denominator, mismatched units, NaN never zero',()=>{
  const cell=(id,value,unit='count')=>({id,parsedValue:value,unit});
  const run=cells=>deriveCellMetric({operator:'ratio',cells,name:'ratio',sourceTableRef:'t'});
  assert.equal(run([cell('a',3),cell('b',0)]),null);
  assert.equal(run([cell('a',undefined),cell('b',2)]),null);
  assert.equal(run([cell('a',3,'days'),cell('b',2,'count')]),null);
  assert.equal(run([cell('a',NaN),cell('b',2)]),null);
  assert.equal(run([cell('a',0),cell('b',2)]).value,0);
  assert.equal(deriveCellMetric({operator:'difference',cells:[cell('a',7,'days'),cell('b',3,'days')]}).value,4);
});

test('checkout cells → rates → pp difference → chart; stable IDs and no diagnostic hypothesis',async()=>{
  const document={sourceId:'checkout',sourceTitle:'funnel.csv',sourceUri:'example://checkout/funnel.csv',sourceKind:'example',text:await fs.readFile(new URL('../showcase/checkout-conversion/data/funnel.csv',import.meta.url),'utf8')};
  const table=sourceTableFromDocument(document);
  assert.deepEqual(sourceTableFromDocument(document),table);
  const data=dataFromEvidence({question:'Checkout'},{evidence:[],sourceTables:[table],needs:[]});
  const mobile=data.subjectMetrics.filter(m=>m.operator==='ratio'&&m.name.endsWith('mobile'));
  assert.equal(mobile.length,2);
  assert.equal(mobile[0].value,32731/51870);assert.equal(mobile[1].value,31126/52400);
  const difference=data.subjectMetrics.find(m=>m.operator==='percentage-point-difference'&&m.cellRefs.includes(mobile[0].cellRefs[0]));
  assert.equal(difference.value,(31126/52400-32731/51870)*100);
  assert.equal(resolveSubjectMetric(data,difference),difference.value);
  const artifact={id:'data',data},specs=chartSpecsFromDataArtifact(artifact);
  assert.equal(specs.length,2);
  assert.deepEqual(chartSpecsFromDataArtifact(artifact),specs);
  for(const spec of specs){const resolved=resolveChartSpec(artifact,spec);assert.ok(resolved.every(m=>m.cellRefs.length===2));assert.ok(spec.rowRefs.every(id=>table.rows.some(row=>row.id===id)));}
  assert.equal(deriveHypothesisPlan({dataArtifact:artifact}).primaryMetric.metricClass,'subject');
  assert.equal(deriveHypothesisPlan({dataArtifact:{id:'legacy',data:{numericMetrics:[['evidence_count',8,'count']]}}}).primaryMetric,null);
  const bad=structuredClone(data);bad.subjectMetrics[0].cellRefs=['missing'];assert.equal(resolveSubjectMetric(bad,bad.subjectMetrics[0]),null);
  const dom=new JSDOM(documentForSubject(data));
  assert.match(dom.window.document.body.textContent,/Учебный пример/);
  assert.equal(dom.window.document.querySelectorAll('[data-cell-id]').length,24);
  assert.ok(dom.window.document.querySelector(`[data-metric-id="${mobile[0].id}"]`).textContent.includes(String(mobile[0].value*100)));
});

for(const [name,claim] of [
  ['B: attributed evidence cannot become unqualified fact','Конверсия выросла'],
  ['C: temporal source cannot acquire causal authority','Обновление повысило конверсию'],
  ['D: significance cannot be invented','Рост конверсии статистически значим'],
]) test(name,async()=>{
  const evidence={id:'E1',claim:'После обновления конверсия выросла',quote:'После обновления конверсия выросла',kind:'fact',confidence:'direct',sourceId:'S1',sourceUri:'example://notes'};
  const result=await createSynthesisHarness({modelJson:async()=>({objective:'Сравнить конверсию',keyClaims:[{id:'C1',claim,evidenceIds:['E1'],kind:'evidence-backed'}]})}).execute({run:{id:'r'},role:'product-owner',artifacts:[{id:'b',type:'Brief',data:{question:'Сравнить конверсию'}},{id:'e',type:'EvidenceSet',data:{items:[evidence]}},{id:'v',type:'ValidationReport',data:{valid:true,items:[]}}]});
  const synthesis={id:'s',data:result.artifacts[0].data};
  const story=planPresentationStory(synthesis,{id:'d',data:{rows:[],numericMetrics:[],provenance:{rows:[],metrics:[]}}});
  const subject=story.scenes.find(s=>s.intent==='key-claim');
  console.log(JSON.stringify({reproduction:name,actualSlideThesis:subject?.thesis}));
  if(name.startsWith('C:'))assert.doesNotMatch(subject.thesis,/повысило/);
  if(name.startsWith('D:'))assert.doesNotMatch(subject.thesis,/статистически значим/);
  assert.equal(subject.thesis,evidence.claim);
  assert.equal(subject.humanStatement.attributionLabel,'Источник сообщает');
  assert.equal(subject.humanStatement.statusLabel,'Утверждение источника');
  assert.ok(subject?.epistemicClaims?.length,'actual scene must retain epistemic references');
});

test('real Research → EvidenceSet → Data → Narrative → Story → HTML retains tables and authority',async()=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'subject-e2e-'));
  try{
    const csv=await fs.readFile(new URL('../showcase/checkout-conversion/data/funnel.csv',import.meta.url),'utf8');
    const documents=[{sourceId:'notes',sourceUri:'example://notes.md',sourceTitle:'notes.md',sourceKind:'example',text:'После обновления конверсия изменилась. Статистический тест не проводился.'},{sourceId:'funnel',sourceUri:'example://funnel.csv',sourceTitle:'funnel.csv',sourceKind:'example',text:csv}];
    const modelJson=async(system,user)=>{
      if(system.includes('планировщик deep research'))return{needs:[1,2].map(i=>({title:`Проверка ${i}`,query:'checkout',dods:[{criterion:'Источник'}]}))};
      if(system.includes('извлекаешь Evidence'))return{evidence:[{claim:'Обновление вызвало статистически значимый рост',quote:'После обновления конверсия изменилась.',sourceRef:'S1',confidence:'direct',kind:'fact'}]};
      if(system.includes('Synthesis Harness'))return{objective:'Сравнить группы',keyClaims:[{id:'C1',claim:'Обновление повысило конверсию статистически значимо',evidenceIds:['E001'],kind:'evidence-backed'}]};
      throw new Error('Unexpected model request');
    };
    const store=createArtifactStore(root);await store.initialize();
    const service=createResearchService({modelJson,sources:[{id:'example',async search(){return documents}}],store,limits:{timeoutMs:5000}});
    const run={id:'r'},artifacts=[{id:'intent',type:'Intent',data:{question:'Checkout'}},{id:'brief',type:'Brief',data:{question:'Checkout'}}];
    const execute=async(harness,id)=>{const result=await harness.execute({run,artifacts,role:'product-owner'});const artifact={...result.artifacts[0],id};artifacts.push(artifact);return artifact;};
    const evidence=await execute(createResearchHarness({researchService:service,artifactStore:store}),'ev');
    assert.equal(evidence.data.sourceTables.length,1);
    assert.equal(evidence.data.items[0].claim,'После обновления конверсия изменилась.');
    await execute(validationHarness,'validation');
    const human=presentHumanSurface({kind:'evidence',content:evidence.data.items[0]},{research:{validation:artifacts.find(a=>a.type==='ValidationReport').data.items}});
    assert.equal(human.label,'Утверждение источника');
    const synthesis=await execute(createSynthesisHarness({modelJson}),'synthesis');
    const data=await execute(createDataHarness({dataFromEvidence}),'data');
    const narrative=await execute(createNarrativeHarness(),'narrative');
    assert.match(narrative.data.content,/Учебный пример/);
    assert.doesNotMatch(narrative.data.content,/повысило|значимый рост/);
    assert.equal(narrative.data.claimDetails[0].epistemic.class,'source-attributed-claim');
    assert.equal(narrative.data.observations.find(s=>s.semanticUnit==='percentage-points').display.value,-3.701);
    assert.match(narrative.data.content,/Причинность не установлена/);
    const story={id:'story',type:'PresentationStoryPlan',data:planPresentationStory(synthesis,data)};artifacts.push(story);
    process.env.PO_AGENT_NO_LISTEN='1';
    process.env.PO_WORKSPACE_DIR=root;
    const {slidesHtml,resolvePresentationStyle}=await import('../server.mjs');
    const presentation=await execute(createSlidesHarness({slidesHtml,resolvePresentationStyle}),'presentation');
    const dom=new JSDOM(presentation.data.html);
    assert.ok(story.data.observations.some(s=>s.display.value===63.102));
    assert.ok(story.data.observations.some(s=>s.display.value===59.401));
    assert.match(dom.window.document.body.textContent,/Учебный пример/);
    assert.ok(dom.window.document.querySelector('.epistemic-notes'));
    for(const limitation of story.data.limitations)assert.ok(dom.window.document.querySelector('.epistemic-notes').textContent.includes(limitation.text));
    assert.doesNotMatch(dom.window.document.body.textContent,/evidence_count|source_calls|pipeline_stages|повысило|значимый рост/);
    assert.ok(dom.window.document.querySelector('[data-chart-id]'));
    for(const node of dom.window.document.querySelectorAll('[data-value]')){
      const metric=data.data.subjectMetrics.find(m=>m.id===node.dataset.metricId);
      assert.equal(Number(node.dataset.value),resolveSubjectMetric(data.data,metric));
    }
    assert.deepEqual(presentation.data.slides.find(s=>s.intent==='key-claim').epistemicClaims[0].evidenceRefs,['E001']);
    const persisted=JSON.stringify(data);
    assert.deepEqual(chartSpecsFromDataArtifact(JSON.parse(persisted)),chartSpecsFromDataArtifact(data));
  }finally{await fs.rm(root,{recursive:true,force:true});}
});
