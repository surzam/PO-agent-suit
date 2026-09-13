import test from 'node:test';
import assert from 'node:assert/strict';
import {createSynthesisHarness} from '../harnesses/synthesis.mjs';
import {createNarrativeHarness} from '../harnesses/narrative.mjs';
import {planPresentationStory,validatePresentationStoryPlan} from '../harnesses/presentation-story-planner.mjs';
import {sourceTableFromDocument,subjectMetricsFromTables} from '../core/subject-data.mjs';
import {metricStatements,metricStatement,validateMetricWording} from '../core/epistemic-text.mjs';
import {bindClaimEpistemics} from '../core/claim-epistemics.mjs';
import fs from 'node:fs/promises';

const limitation='Неизвестно, сопоставимы ли группы по составу пользователей.';
async function pipeline(response){
  const evidence={id:'E1',claim:'После изменения наблюдалось снижение completion.',quote:'После изменения наблюдалось снижение completion.',quoteVerified:true,epistemicClass:'source-attributed-claim',kind:'fact',confidence:'inferred',sourceUri:'fixture:report.md',sourceId:'S1'};
  const artifacts=[{id:'brief',type:'Brief',data:{question:'Сравнить completion между группами.'}},
    {id:'evidence',type:'EvidenceSet',data:{items:[evidence],metadata:{unknowns:[limitation]}}},
    {id:'validation',type:'ValidationReport',data:{valid:true,items:[{...evidence,evidenceId:'E1',evidenceKind:'fact',structurallyValid:true,epistemicStatus:'uncertain'}],unknowns:[limitation]}}];
  const base={objective:'Сравнить completion',keyClaims:[{id:'C1',claim:evidence.claim,kind:'evidence-backed',evidenceIds:['E1']}],uncertainties:[]};
  const result=await createSynthesisHarness({modelJson:async()=>({...base,...response})}).execute({run:{id:'r'},role:'product-owner',artifacts});
  const synthesis={...result.artifacts[0],id:'synthesis'};artifacts.push(synthesis);
  const data={id:'data',type:'DataArtifact',data:{sourceKind:'example',rows:[],provenance:{rows:[],metrics:[]}}};artifacts.push(data);
  const narrative=(await createNarrativeHarness().execute({run:{id:'r'},artifacts})).artifacts[0];
  const story=planPresentationStory(synthesis,data);
  return{synthesis,narrative,story,data};
}

test('RED A: objective is task framing, never model-authored result',async()=>{
  const injected='Новая версия ухудшила checkout conversion.';
  const {synthesis,narrative,story}=await pipeline({objective:injected});
  console.log('A objective actual:',synthesis.data.objective);
  assert.notEqual(synthesis.data.objective,injected);
  assert.ok(!narrative.data.content.includes(injected));
  assert.ok(!JSON.stringify(story).includes(injected));
});
test('RED B: interpretation cannot assert causal effect from association',async()=>{
  const injected='Новый checkout снизил conversion на 3.701 п.п.';
  const {narrative,story}=await pipeline({keyClaims:[{id:'C1',claim:injected,kind:'interpretation',evidenceIds:['E1']}]});
  console.log('B interpretation actual:',narrative.data.content);
  assert.ok(!narrative.data.content.includes(injected));
  assert.ok(!story.scenes.some(s=>s.thesis.includes(injected)));
});
test('RED C: model interpretation cannot self-award statistical significance',async()=>{
  const injected='Разница статистически значима.';
  const {narrative,story}=await pipeline({keyClaims:[{id:'C1',claim:injected,kind:'interpretation',evidenceIds:['E1']}]});
  console.log('C interpretation actual:',story.scenes.find(s=>s.intent==='key-claim').thesis);
  assert.ok(!narrative.data.content.includes(injected));
  assert.ok(!story.scenes.some(s=>s.thesis.includes(injected)));
});
test('RED D: model omission cannot erase material canonical uncertainty from Story',async()=>{
  const {synthesis,story}=await pipeline({uncertainties:[]});
  console.log('D uncertainty actual:',story.unknowns);
  assert.ok(synthesis.data.uncertainties.some(s=>s.includes(limitation)));
  assert.ok(story.scenes.some(s=>[s.thesis,...s.evidence].some(t=>t.includes(limitation))));
});

test('numeric wording resolves real checkout cells, rounds only display and rejects invented values',async()=>{
  const text=await fs.readFile(new URL('../showcase/checkout-conversion/data/funnel.csv',import.meta.url),'utf8');
  const table=sourceTableFromDocument({sourceId:'fixture',sourceTitle:'funnel.csv',text});
  const artifact={id:'data',data:{sourceTables:[table],subjectMetrics:subjectMetricsFromTables([table])}};
  const statements=metricStatements(artifact),difference=statements.find(s=>s.semanticUnit==='percentage-points');
  assert.equal(difference.display.value,-3.701);
  const metric=artifact.data.subjectMetrics.find(m=>m.id===difference.metricRefs[0]);
  const rounded=metricStatement(artifact,metric,{digits:1});
  assert.equal(rounded.display.value,-3.7);
  assert.equal(rounded.semanticValue,difference.semanticValue);
  assert.equal(difference.causalAuthority,false);
  assert.ok(difference.cellRefs.length>0);
  assert.equal(validateMetricWording({metricRefs:[metric.id],text:difference.text},artifact).accepted,true);
  for(const text of ['Рост 99%','Новый checkout снизил conversion на 3.701 п.п.','Разница статистически значима.']){
    const result=validateMetricWording({metricRefs:[metric.id],text,epistemicClass:'verified'},artifact);
    assert.equal(result.accepted,false);assert.deepEqual(result.statement,difference);
  }
  assert.equal(validateMetricWording({metricRefs:['missing'],text:'42%'},artifact).accepted,false);
  metric.value=999;
  assert.deepEqual(metricStatement(artifact,metric),difference);
});

test('valid references cannot self-award authority; explicit source significance remains attributed',()=>{
  const evidence=[{id:'E',kind:'fact',quoteVerified:true,claim:'Разница статистически значима.',sourceId:'source',confidence:'conflicted'}];
  const claim=bindClaimEpistemics({id:'C',kind:'evidence-backed',claim:'Доказано',evidenceIds:['E'],epistemic:{class:'verified',causalAuthority:true}},evidence);
  assert.equal(claim.epistemic.class,'source-attributed-claim');
  assert.equal(claim.epistemic.causalAuthority,false);
  assert.equal(claim.epistemic.statisticalAuthority,'not-verified');
  assert.match(claim.claim,/Есть расхождения.*Источник сообщает:/);
  assert.deepEqual(claim.statement.evidenceRefs,['E']);
  assert.equal(claim.statement.validation.accepted,false);
  const missing=bindClaimEpistemics({id:'C',kind:'interpretation',claim:'Любая категорическая формулировка',evidenceIds:[]},[]);
  assert.equal(missing.statement.interpretationStrength,'unsupported');
  assert.ok(!missing.claim.includes('Любая категорическая'));
});

test('Narrative and Story retain attributed wording, uncertainty and system demo marker',async()=>{
  const {synthesis,narrative,story}=await pipeline({objective:'Доказано',uncertainties:['Всё известно']});
  assert.equal(synthesis.data.textContext.task.epistemicClass,'task-framing');
  assert.match(narrative.data.content,/Источник сообщает:/);
  assert.match(narrative.data.content,/Учебный пример/);
  assert.ok(narrative.data.content.includes(limitation));
  assert.ok(story.limitations.some(l=>l.text.includes(limitation)));
  assert.ok(story.scenes.every(s=>s.demo));
  assert.equal(story.centralThesis,story.resultClosure.currentConclusion);
  assert.ok(story.scenes.some(s=>s.humanStatement?.text===narrative.data.claimDetails[0].statement.text&&s.humanStatement.attributionLabel==='Источник сообщает'));
});

test('Story validator rejects altered wording even with valid claim references',async()=>{
  const {synthesis,data,story}=await pipeline({});
  assert.equal(validatePresentationStoryPlan(story,synthesis,data),story);
  const changed=structuredClone(story);changed.scenes[0].thesis='Это доказанный результат.';
  assert.throws(()=>validatePresentationStoryPlan(changed,synthesis,data),/Noncanonical presentation wording/);
});
