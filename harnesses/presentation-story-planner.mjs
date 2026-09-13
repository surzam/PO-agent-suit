import { deriveSlideTitle } from './legacy-story-plan.mjs';
import {presentStatement} from '../public/ui/statement-presentation.js';
import {resultClosure,paginateText} from '../core/result-closure.mjs';
import {presentEpistemicClaim} from '../core/claim-epistemics.mjs';
import {resolveSubjectMetric} from '../core/metric-chart.mjs';
import {objectiveText,limitationStatements,metricStatements,TEXT_POLICY_VERSION} from '../core/epistemic-text.mjs';

const VISUAL_TYPES=new Set(['statement','comparison','table','flow','quote','roadmap']);
const FACTUAL_INTENTS=new Set(['key-claim','evidence','metrics','comparison','conflict']);

function unique(values=[]){return [...new Set(values.filter(Boolean).map(String))]}
function sceneId(index,intent){return `scene-${String(index+1).padStart(2,'0')}-${intent}`}
function evidenceClaims(data,rowIds=[]){
  const wanted=new Set(rowIds.map(String));
  return (data.structuredRows||[]).filter(row=>wanted.has(String(row.rowId))).map(row=>row.epistemicClass==='source-attributed-claim'?`Источник сообщает: ${String(row.values?.[1]||'')}`:'Непроверенная интерпретация: самостоятельный вывод не установлен.').filter(Boolean);
}
function refsForClaims(data,claimIds=[]){
  const wanted=new Set(claimIds.map(String)),provenance=data.provenance||{};
  const rows=(provenance.rows||[]).filter(ref=>(ref.claimIds||[]).some(id=>wanted.has(String(id))));
  const metrics=(provenance.metrics||[]).filter(ref=>(ref.claimIds||[]).some(id=>wanted.has(String(id))));
  const insights=(provenance.insights||[]).filter(ref=>(ref.claimIds||[]).some(id=>wanted.has(String(id))));
  return {rowIds:rows.map(ref=>ref.rowId),metricIds:metrics.map(ref=>ref.metricId),insightIds:insights.map(ref=>ref.insightId),evidenceIds:unique([...rows,...metrics,...insights].flatMap(ref=>ref.evidenceIds||[]))};
}
function makeScene(scenes,{intent,title,thesis,visualType='statement',claimIds=[],rowIds=[],metricIds=[],insightIds=[],evidenceIds=[],evidence=[]}){
  const scene={id:sceneId(scenes.length,intent),index:scenes.length+1,intent,title:deriveSlideTitle(title,88)||title,thesis:String(thesis||title||'').trim(),visualType:VISUAL_TYPES.has(visualType)?visualType:'statement',claimIds:unique(claimIds),rowIds:unique(rowIds),metricIds:unique(metricIds),insightIds:unique(insightIds),evidenceIds:unique(evidenceIds),evidence:unique(evidence).slice(0,4)};
  if(FACTUAL_INTENTS.has(intent)&&![scene.claimIds,scene.rowIds,scene.metricIds,scene.insightIds,scene.evidenceIds].some(values=>values.length))throw new Error(`Factual presentation scene ${scene.id} has no provenance`);
  scenes.push(scene);return scene;
}

export function planPresentationStory(synthesisArtifact,dataArtifact,{minimumScenes=8,maximumScenes=12}={}){
  const input=synthesisArtifact?.data||{},data=dataArtifact?.data||{};
  const limitations=limitationStatements(input),observations=metricStatements(dataArtifact);
  const synthesis={...input,objective:objectiveText(input),uncertainties:limitations.map(l=>l.text)};
  const claims=(Array.isArray(synthesis.keyClaims)?synthesis.keyClaims:[]).map(c=>({...c,claim:presentEpistemicClaim(c)}));
  if(!claims.length)throw new Error('Presentation Story Planner requires at least one Synthesis claim');
  const rowRefs=data.provenance?.rows||[],metricRefs=(data.provenance?.metrics||[]).filter(ref=>ref.metricClass==='subject');
  const scenes=[];
  makeScene(scenes,{intent:'cover',title:synthesis.objective||claims[0].claim,thesis:claims[0].claim,visualType:'statement'});
  const allClaimIds=claims.map(claim=>claim.id),allRefs=refsForClaims(data,allClaimIds);
  makeScene(scenes,{intent:'situation',title:'Что требует решения',thesis:synthesis.objective||claims[0].claim,visualType:'flow',claimIds:[claims[0].id],...refsForClaims(data,[claims[0].id]),evidence:evidenceClaims(data,refsForClaims(data,[claims[0].id]).rowIds)});
  for(const claim of claims.slice(0,6)){
    const refs=refsForClaims(data,[claim.id]);
    makeScene(scenes,{intent:'key-claim',title:claim.claim,thesis:claim.claim,visualType:'statement',claimIds:[claim.id],...refs,evidence:evidenceClaims(data,refs.rowIds)});
  }
  if(rowRefs.length){
    const selected=rowRefs.slice(0,4);
    makeScene(scenes,{intent:'evidence',title:'Утверждения источников',thesis:'Приведены утверждения источников; достоверность не установлена.',visualType:'table',claimIds:unique(selected.flatMap(ref=>ref.claimIds||[])),rowIds:selected.map(ref=>ref.rowId),evidenceIds:unique(selected.flatMap(ref=>ref.evidenceIds||[])),evidence:evidenceClaims(data,selected.map(ref=>ref.rowId))});
  }
  if(claims.length>=2){
    const pair=claims.slice(0,2),refs=refsForClaims(data,pair.map(claim=>claim.id));
    makeScene(scenes,{intent:'comparison',title:'Два сигнала одного решения',thesis:'Сопоставление утверждений; достоверность и причинность не установлены.',visualType:'comparison',claimIds:pair.map(claim=>claim.id),...refs,evidence:pair.map(claim=>claim.claim)});
  }
  if(metricRefs.length){
    const metrics=(data.subjectMetrics||[]).filter(m=>metricRefs.some(ref=>ref.metricId===m.id)).map(m=>({...m,value:resolveSubjectMetric(data,m)})).filter(m=>m.value!==null);
    const selected=[...metrics.filter(m=>m.operator==='ratio'),...metrics.filter(m=>m.operator==='percentage-point-difference'),...metrics.filter(m=>m.operator==='direct')].slice(0,4);
    if(selected.length)makeScene(scenes,{intent:'metrics',title:'Показатели из исходной таблицы',thesis:'Расчёт по предоставленным данным; причинность не установлена.',visualType:'table',metricIds:selected.map(m=>m.id),evidenceIds:unique(metricRefs.filter(ref=>selected.some(m=>m.id===ref.metricId)).flatMap(ref=>ref.evidenceIds||[])),evidence:observations.filter(s=>selected.some(m=>s.metricRefs[0]===m.id)).map(s=>s.text)});
  }
  const unresolved=unique(synthesis.uncertainties);
  if(unresolved.length)makeScene(scenes,{intent:'unknowns',title:data.researchContext?.conflicts?.length?'Противоречия и неизвестности':'Что пока неизвестно',thesis:'Неопределённость остаётся частью решения.',visualType:'comparison',evidence:unresolved.slice(0,4)});
  const recommendation=claims.find(claim=>['recommendation','interpretation'].includes(claim.kind));
  if(recommendation){const refs=refsForClaims(data,[recommendation.id]);makeScene(scenes,{intent:'recommendation',title:'Рекомендуемый следующий ход',thesis:recommendation.claim,visualType:'roadmap',claimIds:[recommendation.id],...refs,evidence:[recommendation.claim,...synthesis.uncertainties||[]]})}
  makeScene(scenes,{intent:'closing',title:'Решение начинается с проверяемой опоры',thesis:synthesis.objective||claims[0].claim,visualType:'roadmap'});
  const closure=resultClosure(input,dataArtifact);
  const titles={cover:'Вопрос исследования',situation:'Что сообщают источники','key-claim':'Сведения из источника',evidence:'Опоры исследования',comparison:'Сопоставление сведений',metrics:'Показатели из данных',unknowns:'Что пока неизвестно',recommendation:'Что проверить дальше',roadmap:'Следующий шаг',closing:'Текущий итог'};
  const bounded=scenes.flatMap((scene)=>{
    const linked=claims.filter(c=>scene.claimIds.includes(c.id));
    const statement=linked.length?presentStatement({epistemic:{sourceClaims:linked.flatMap(c=>c.epistemic?.sourceClaims||[]),class:linked.some(c=>c.epistemic?.class==='interpretation')?'interpretation':'source-attributed-claim'}}):null;
    const substantive=scene.intent==='cover'?synthesis.objective:scene.intent==='closing'?`${closure.currentConclusion}\n\n${closure.nextAction}`:['roadmap','recommendation'].includes(scene.intent)?closure.nextAction:scene.intent==='unknowns'?closure.missingInformation.join('\n\n'):statement?.text||scene.evidence.join('\n\n')||scene.thesis;
    const statusLabel=({cover:'Вопрос исследования',closing:'Текущий итог',recommendation:'Предложение',roadmap:'Предложение',metrics:'Расчёт по предоставленным данным',unknowns:'Ограничения'})[scene.intent]||statement?.statusLabel||'Контекст исследования';
    return paginateText(substantive).map((text,part)=>({...scene,id:part?`${scene.id}-part-${part+1}`:scene.id,title:titles[scene.intent]||'Материалы исследования',thesis:text,evidence:[],humanStatement:{...statement,text,statusLabel},epistemicClaims:linked.map(c=>({claimId:c.id,...c.epistemic})),demo:Boolean(data.showcase||synthesis.showcase||data.sourceKind==='example')}));
  }).map((s,index)=>({...s,index:index+1}));
  return {schemaVersion:1,textPolicyVersion:TEXT_POLICY_VERSION,limitations,observations,resultClosure:closure,runId:synthesis.runId||data.runId||null,synthesisPlanArtifactId:synthesisArtifact.id,dataArtifactId:dataArtifact.id,topic:synthesis.objective||data.title||claims[0].claim,audience:synthesis.audience||'Product Owner',centralThesis:closure.currentConclusion,situation:synthesis.objective||claims[0].claim,evidence:evidenceClaims(data,allRefs.rowIds),unknowns:unresolved,nextStep:closure.nextAction,recommendedStyleId:data.showcase?.recommendedStyleId||synthesis.showcase?.recommendedStyleId||null,showcase:data.showcase||synthesis.showcase||null,scenes:bounded};
}

export function validatePresentationStoryPlan(plan,synthesisArtifact,dataArtifact){
  if(plan?.schemaVersion!==1||!Array.isArray(plan.scenes)||!plan.scenes.length)throw new Error('Invalid PresentationStoryPlan');
  const claims=new Set((synthesisArtifact.data.keyClaims||[]).map(item=>String(item.id))),data=dataArtifact.data,provenance=data.provenance||{};
  const allowed={claimIds:claims,rowIds:new Set((provenance.rows||[]).map(item=>String(item.rowId))),metricIds:new Set((provenance.metrics||[]).map(item=>String(item.metricId))),insightIds:new Set((provenance.insights||[]).map(item=>String(item.insightId))),evidenceIds:new Set((provenance.rows||[]).flatMap(item=>item.evidenceIds||[]).map(String))};
  const ids=new Set();for(const scene of plan.scenes){if(ids.has(scene.id))throw new Error(`Duplicate presentation scene: ${scene.id}`);ids.add(scene.id);for(const key of Object.keys(allowed))for(const id of scene[key]||[])if(!allowed[key].has(String(id)))throw new Error(`Presentation scene ${scene.id} references unknown ${key}: ${id}`);if(FACTUAL_INTENTS.has(scene.intent)&&!Object.keys(allowed).some(key=>(scene[key]||[]).length))throw new Error(`Factual presentation scene ${scene.id} has no provenance`)}
  const expected=planPresentationStory(synthesisArtifact,dataArtifact);
  for(const field of ['topic','centralThesis','situation','unknowns','nextStep','limitations','observations','resultClosure','scenes']){
    if(JSON.stringify(plan[field])!==JSON.stringify(expected[field]))throw new Error(`Noncanonical presentation wording: ${field}`);
  }
  return plan;
}

export function createPresentationStoryPlannerHarness(){
  return {id:'presentation-story',version:1,consumes:['PresentationStoryRequested'],produces:['PresentationStoryPlanned'],inputs:['SynthesisPlan','DataArtifact'],outputs:['PresentationStoryPlan'],async execute({run,artifacts}){
    const synthesis=artifacts.find(item=>item.type==='SynthesisPlan'),data=artifacts.find(item=>item.type==='DataArtifact');
    if(!synthesis||!data)throw new Error('Presentation Story Planner requires SynthesisPlan and DataArtifact');
    const plan=validatePresentationStoryPlan(planPresentationStory(synthesis,data),synthesis,data);
    return {artifacts:[{type:'PresentationStoryPlan',sourceArtifactIds:[synthesis.id,data.id],data:{...plan,runId:run.id}}],events:[{type:'PresentationStoryPlanned',payload:{scenes:plan.scenes.length,visualTypes:unique(plan.scenes.map(scene=>scene.visualType))}}]};
  }};
}
