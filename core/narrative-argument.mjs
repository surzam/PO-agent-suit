import {bindClaimEpistemics,presentEpistemicClaim} from './claim-epistemics.mjs';
import {presentStatement} from '../public/ui/statement-presentation.js';
import {resultClosure} from './result-closure.mjs';
import {objectiveText,limitationStatements,canonicalLimitations,metricStatements} from './epistemic-text.mjs';
const unique=values=>[...new Set(values.filter(v=>v!==undefined&&v!==null).map(String))].sort();
const refs=claims=>unique(claims.flatMap(c=>c.evidenceIds||[]));
const supported=d=>d?.epistemicStatus==='supported'&&d.structurallyValid===true&&d.evidenceKind==='fact';

export function deriveNarrativeStrength({supportingClaims=[],counterClaims=[],unresolvedClaims=[],validation=[],conflicts=[],unknowns=[],assumptions=[],gaps=[]}={}) {
  // Resolve canonical evidence identity before weighting. Ambiguous duplicate
  // decisions fail closed; their order must not choose factual authority.
  const decisions=new Map();
  for(const d of validation){const id=String(d.evidenceId),previous=decisions.get(id);
    decisions.set(id,previous&&JSON.stringify(previous)!==JSON.stringify(d)?{epistemicStatus:'uncertain'}:d);}
  const counterEvidence=unique([...refs(counterClaims),...validation.filter(d=>d.epistemicStatus==='conflicted').map(d=>d.evidenceId)]);
  const support=refs(supportingClaims).filter(id=>!counterEvidence.includes(id));
  const basis={supportingValidated:support.filter(id=>supported(decisions.get(id))),
    supportingUncertain:support.filter(id=>!supported(decisions.get(id))),counterEvidence,
    counterValidated:counterEvidence.filter(id=>supported(decisions.get(id))),
    unresolved:unique(unresolvedClaims.map(c=>c.id||c)),conflicts:unique(conflicts),unknowns:unique(unknowns),
    assumptions:unique(assumptions),gaps:unique(gaps),
    authority:'source-reported support; independence and causal inference not established',ceiling:'weak'};
  // Current truth has no independent verification. Counts cannot justify
  // moderate/strong; unresolved/counter evidence can never increase strength.
  return {level:basis.supportingValidated.length?'weak':'unsupported',basis};
}

export function buildNarrativeArgument({synthesis={},validation=[],validationReport={},dataArtifact=null}={}) {
  const decisions=validationReport.items||validation;
  const byEvidence=new Map(decisions.map(d=>[String(d.evidenceId),d]));
  const details=[],seen=new Set();
  for(const c of synthesis.keyClaims||[]){if(!c.id||seen.has(String(c.id)))continue;seen.add(String(c.id));
    const grounded=c.epistemic?{...c,claim:presentEpistemicClaim(c)}:bindClaimEpistemics(c,decisions);
    details.push({...grounded,id:String(c.id),evidenceIds:unique(c.evidenceIds||[]),refType:'claim'});}
  const linked=new Set(refs(details));
  // These are explicit Evidence references, not invented Synthesis claims or
  // an assertion that the omitted evidence disproves the thesis.
  for(const d of decisions)if(d.epistemicStatus==='conflicted'&&!linked.has(String(d.evidenceId))&&d.evidenceId){
    details.push({...bindClaimEpistemics({id:String(d.evidenceId),claim:d.claim||'',kind:'evidence-backed',evidenceIds:[String(d.evidenceId)]},decisions),refType:'evidence'});
    linked.add(String(d.evidenceId));
  }
  const counter=details.filter(c=>c.evidenceIds.some(id=>byEvidence.get(id)?.epistemicStatus==='conflicted'));
  const counterIds=new Set(counter.map(c=>c.id));
  const supporting=details.filter(c=>!counterIds.has(c.id)&&c.kind==='evidence-backed'&&c.evidenceIds.length);
  const unresolved=details.filter(c=>!counterIds.has(c.id)&&(!supporting.includes(c)||c.evidenceIds.some(id=>!supported(byEvidence.get(id)))));
  const assumptions=unique(details.filter(c=>c.kind==='assumption').map(c=>c.claim));
  const limitations=[...new Map([...limitationStatements(synthesis),...canonicalLimitations({}, {id:synthesis.validationReportArtifactId,data:validationReport})].map(l=>[l.text,l])).values()];
  const gaps=limitations.map(l=>l.text);
  const strength=deriveNarrativeStrength({supportingClaims:supporting,counterClaims:counter,unresolvedClaims:unresolved,validation:decisions,
    conflicts:validationReport.conflicts||[],unknowns:validationReport.unknowns||[],assumptions,gaps});
  return {thesis:objectiveText(synthesis),thesisKind:'task-framing',resultClosure:resultClosure(synthesis,dataArtifact),roleLens:synthesis.audience||null,limitations,observations:metricStatements(dataArtifact),
    supportingClaims:unique(supporting.map(c=>c.id)),counterClaims:unique(counter.map(c=>c.id)),unresolvedClaims:unique(unresolved.map(c=>c.id)),
    claimDetails:details,assumptions,gaps,strength:strength.level,strengthBasis:strength.basis};
}

// Markdown is a pure view of the persisted argument, not another author.
const text=value=>String(value??'').replace(/[\\`*_{}\[\]<>#]/g,'\\$&').replace(/\r?\n/g,' ');
export function materializeNarrativeMarkdown(argument){
  const details=new Map(argument.claimDetails.map(c=>[c.id,c]));
  const section=(title,ids)=>`## ${title}\n\n${ids.length?ids.map(id=>{const c=details.get(id),statement=c?presentStatement(c):null;return `- ${statement?.text?`${text(statement.attributionLabel)}: `:''}${text(statement?.text||'Содержательная опора не сохранена.')} (${text(c?.refType)}: ${text(id)}; Evidence: ${text((c?.evidenceIds||[]).join(', '))})${statement?.limitations?.length?`\n  Ограничение: ${statement.limitations.map(text).join(' ')}`:''}`;}).join('\n'):'Не указано.'}`;
  return ['# Интерпретация',text(argument.thesis),`Сила аргумента: ${argument.strength}. Независимость источников и достоверность не установлены.`,
    ...((argument.observations||[]).length?['## Наблюдения в предоставленных данных',...argument.observations.map(s=>`- ${text(s.text)}`)]:[]),
    section('Выбранные опоры — требуют проверки',argument.supportingClaims),section('Ограничивающие сведения — отмечены расхождения',argument.counterClaims),section('Неопределённости и предложения',argument.unresolvedClaims),
    '## Предположения',...argument.assumptions.map(v=>`- ${text(v)}`),'## Ограничения и неизвестности',...unique([...argument.gaps,...argument.strengthBasis.conflicts]).map(v=>`- ${text(v)}`),...(argument.resultClosure?['## Текущий итог',text(argument.resultClosure.currentConclusion),'## Следующий шаг',text(argument.resultClosure.nextAction)]:[])].join('\n\n');
}
