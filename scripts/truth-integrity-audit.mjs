import assert from 'node:assert/strict';
import {test} from 'node:test';
import {JSDOM} from 'jsdom';
import {validationHarness} from '../harnesses/validation.mjs';
import {buildNarrativeArgument,deriveNarrativeStrength,materializeNarrativeMarkdown} from '../core/narrative-argument.mjs';
import {presentValidationDecision} from '../public/ui/validation-presentation.js';
import {presentHumanSurface} from '../public/ui/human-view.js';
import {createSynthesisHarness} from '../harnesses/synthesis.mjs';
import {createNarrativeHarness} from '../harnesses/narrative.mjs';
import {projectObservation} from '../core/observation.mjs';
import {createLiveSessionState} from '../interop/ag-ui/session.mjs';
import {HumanView} from '../public/ui/human-view.js';

const run={id:'truth-test',intent:'Question',status:'completed',role:'product-owner',events:[],artifacts:[]};
const fact=(id,extra={})=>({id,claim:`Claim ${id}`,sourceUri:`fixture://${id}`,sourceId:`source-${id}`,kind:'fact',confidence:'direct',...extra});
async function validate(items,metadata={}){
  const evidence={id:'ev',type:'EvidenceSet',data:{items,metadata}};
  const result=await validationHarness.execute({run,artifacts:[evidence]});
  return {evidence,report:{id:'vr',...result.artifacts[0]}};
}
test('RED A: structural validity cannot confirm conflicted interpretation in actual DOM',async()=>{
  const {evidence,report}=await validate([fact('E1',{kind:'interpretation',confidence:'conflicted'})]);
  assert.equal(report.data.items[0].valid,true);
  const observation=projectObservation(run,{artifacts:[evidence,report]});
  const session=createLiveSessionState(run,{observation});
  const root=new JSDOM('<div id="root"></div>').window.document.getElementById('root');
  new HumanView(root).render({...observation,runId:run.id,session});
  assert.doesNotMatch(root.textContent,/Подтверждено/);
  assert.match(root.textContent,/Интерпретация/);
});
test('RED B: duplicate evidence has zero additional weight',async()=>{
  const {report}=await validate([fact('E1')]);
  const claim={id:'C1',claim:'Claim E1',kind:'evidence-backed',evidenceIds:['E1']};
  const build=keyClaims=>buildNarrativeArgument({synthesis:{objective:'Question',keyClaims},validation:report.data.items});
  const one=build([claim]),two=build([claim,{...claim,id:'C2'}]);
  assert.equal(one.strength,two.strength);
  assert.deepEqual(one.strengthBasis.supportingValidated,two.strengthBasis.supportingValidated);
  assert.deepEqual(build([claim,claim]).supportingClaims,one.supportingClaims);
});
test('RED C: counter evidence uses current vocabulary and survives synthesis selection',async()=>{
  const {report}=await validate([fact('E1'),fact('E2',{confidence:'conflicted'})],{conflicts:['Sources disagree'],unknowns:['Effect not measured']});
  const argument=buildNarrativeArgument({synthesis:{objective:'Question',keyClaims:[{id:'C1',claim:'Claim E1',kind:'evidence-backed',evidenceIds:['E1']},{id:'C2',claim:'Claim E2',kind:'interpretation',evidenceIds:['E2']}]},validation:report.data.items,validationReport:report.data});
  assert.ok(argument.counterClaims.includes('C2'));
  assert.notEqual(argument.strength,'strong');
  assert.ok(JSON.stringify(argument.strengthBasis).includes('E2'));
  const omitted=buildNarrativeArgument({synthesis:{keyClaims:[{id:'C1',claim:'Claim E1',kind:'evidence-backed',evidenceIds:['E1']}]},validation:report.data.items,validationReport:report.data});
  assert.ok(omitted.counterClaims.length);
});
test('RED lineage and markdown use the structured argument',async()=>{
  const {report}=await validate([fact('E1')]);
  const synthesis={id:'sy',type:'SynthesisPlan',data:{objective:'Interpretation question',keyClaims:[{id:'C1',claim:'Exact selected claim',kind:'evidence-backed',evidenceIds:['E1']}],uncertainties:['Unknown effect']}};
  const data={id:'da',type:'DataArtifact',data:{rows:[]}};
  let legacyCalled=false;
  const result=await createNarrativeHarness({narrativeMarkdown:()=>{legacyCalled=true;return 'Independent story';}}).execute({run,artifacts:[synthesis,data,report]});
  const artifact=result.artifacts[0];
  assert.deepEqual(artifact.sourceArtifactIds,['sy','da','vr']);
  assert.equal(legacyCalled,false);
  assert.match(artifact.data.content,/Exact selected claim/);
  assert.match(artifact.data.content,/Unknown effect/);
  assert.equal(artifact.data.content,artifact.data.narrativeMarkdown);
});
test('legacy structural decision cannot add epistemic weight',()=>{
  assert.equal(deriveNarrativeStrength({supportingClaims:[{id:'C',evidenceIds:['E']}],validation:[{evidenceId:'E',valid:true}]}).level,'unsupported');
});
test('validation vocabulary is conservative across all existing kinds/confidences',async()=>{
  for(const kind of ['fact','interpretation','unknown'])for(const confidence of ['direct','corroborated','inferred','conflicted']){
    const {report}=await validate([fact('E',{kind,confidence})]);
    const decision=report.data.items[0];
    assert.equal(decision.structurallyValid,true);
    const expected=confidence==='conflicted'?'conflicted':kind==='fact'&&['direct','corroborated'].includes(confidence)?'supported':'uncertain';
    assert.equal(decision.epistemicStatus,expected);
    const presentation=presentHumanSurface({kind:'evidence',content:fact('E',{kind,confidence})},{research:{validation:[decision]}});
    assert.doesNotMatch(presentation.body,/Подтверждено|над[её]жный|несколькими источниками/);
    if(kind!=='fact'||expected!=='supported')assert.notEqual(presentation.label,'Факт');
  }
  const {report}=await validate([fact('E',{sourceUri:''})]);
  assert.equal(report.data.items[0].structurallyValid,false);
  assert.equal(report.data.items[0].epistemicStatus,'uncertain');
  assert.equal(presentValidationDecision(null),null);
  assert.equal(presentValidationDecision({valid:true,status:'validated'}),'Достоверность не установлена');
});
test('100 duplicates, counter/uncertainty, missing refs and no independence cannot raise strength',async()=>{
  const {report}=await validate([fact('E1'),fact('E2'),fact('E3',{confidence:'conflicted'})]);
  const claim={id:'C1',kind:'evidence-backed',evidenceIds:['E1']};
  const base={supportingClaims:[claim],validation:report.data.items.slice(0,2)};
  const one=deriveNarrativeStrength(base);
  assert.equal(one.level,'weak');
  const repeats=Array.from({length:100},(_,i)=>({...claim,id:`C${i}`,evidenceIds:['E1','E1']}));
  assert.deepEqual(deriveNarrativeStrength({...base,supportingClaims:repeats}),one);
  assert.equal(deriveNarrativeStrength({...base,supportingClaims:[{...claim,evidenceIds:['E1','E2']}]}).level,'weak');
  const limited=deriveNarrativeStrength({...base,counterClaims:[{id:'counter',evidenceIds:['E2']}],unresolvedClaims:[{id:'U'}],unknowns:['missing outcome']});
  assert.equal(limited.level,'weak');
  assert.deepEqual(limited.basis.counterValidated,['E2']);
  assert.deepEqual(limited.basis.unresolved,['U']);
  assert.equal(deriveNarrativeStrength({...base,supportingClaims:[{...claim,evidenceIds:['missing']}]}).level,'unsupported');
  const conflict=deriveNarrativeStrength({...base,validation:report.data.items,supportingClaims:[{...claim,evidenceIds:['E3']}]});
  assert.equal(conflict.level,'unsupported');
  const ambiguous=[report.data.items[0],{...report.data.items[0],epistemicStatus:'uncertain'}];
  assert.equal(deriveNarrativeStrength({...base,validation:ambiguous}).level,'unsupported');
  assert.deepEqual(deriveNarrativeStrength({...base,validation:ambiguous}),deriveNarrativeStrength({...base,validation:ambiguous.reverse()}));
});
test('real Synthesis to Narrative preserves omitted conflict and renders only persisted semantics',async()=>{
  const {evidence,report}=await validate([fact('E1'),fact('E2',{kind:'interpretation',confidence:'conflicted'})],{conflicts:['Unresolved source disagreement'],unknowns:['No experiment']});
  const original=JSON.stringify([evidence,report]);
  const synthesisResult=await createSynthesisHarness({modelJson:async()=>({objective:'A possible explanation',keyClaims:[{id:'C1',claim:'Claim E1',evidenceIds:['E1'],kind:'evidence-backed'},{id:'C2',claim:'Assumed mechanism',evidenceIds:[],kind:'assumption'}],uncertainties:[]})}).execute({run,role:'product-owner',artifacts:[{id:'b',type:'Brief',data:{}},evidence,report]});
  const synthesis={id:'sy',...synthesisResult.artifacts[0]},data={id:'da',type:'DataArtifact',data:{rows:[],insights:['MUST NOT BECOME EVIDENCE']}};
  const args={run,artifacts:[synthesis,data,report]};
  const harness=createNarrativeHarness();
  const a=(await harness.execute(args)).artifacts[0],b=(await harness.execute(args)).artifacts[0];
  assert.deepEqual(a,b);
  assert.equal(JSON.stringify([evidence,report]),original);
  assert.ok(a.data.counterClaims.includes('E2'));
  assert.equal(a.data.claimDetails.find(c=>c.id==='E2').refType,'evidence');
  assert.ok(a.data.assumptions.includes('Assumed mechanism'));
  assert.match(a.data.narrativeMarkdown,/Claim E2/);
  assert.match(a.data.narrativeMarkdown,/No experiment/);
  assert.doesNotMatch(a.data.narrativeMarkdown,/MUST NOT BECOME EVIDENCE|Подтверждено/);
  assert.equal(materializeNarrativeMarkdown(JSON.parse(JSON.stringify(a.data))),a.data.narrativeMarkdown);
  const missing=(await harness.execute({run,artifacts:[synthesis,data]})).artifacts[0];
  assert.equal(missing.data.strength,'unsupported');
  assert.deepEqual(missing.sourceArtifactIds,['sy','da']);
});
