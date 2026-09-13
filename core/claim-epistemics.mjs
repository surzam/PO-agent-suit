// Model prose cannot acquire authority by adding a valid Evidence ID.
import {presentStatement} from '../public/ui/statement-presentation.js';
// Source-backed materializations use source wording, not a stronger paraphrase.
export function bindClaimEpistemics(claim,evidence=[]){
  const refs=[...new Set((claim.evidenceIds||[]).map(String))];
  const sources=refs.map(id=>evidence.find(e=>String(e.id||e.evidenceId)===id)).filter(Boolean);
  const epistemicClass=claim.kind==='recommendation'?'proposal':claim.kind==='unknown'?'limitation':
    ['interpretation','assumption'].includes(claim.kind)?'interpretation':sources.length?'source-attributed-claim':'unknown';
  const sourceClaims=sources.map(e=>({evidenceId:String(e.id||e.evidenceId),sourceId:e.sourceId||null,sourceUri:e.sourceUri||null,
    statement:String(e.claim||''),quoteVerified:e.quoteVerified,confidence:e.confidence||null,epistemicStatus:e.epistemicStatus||(e.confidence==='conflicted'?'conflicted':'uncertain'),epistemicClass:e.epistemicClass||(['interpretation','unknown'].includes(e.kind||e.evidenceKind)?'interpretation':'source-attributed-claim')}));
  const epistemic={class:sourceClaims.some(c=>c.epistemicClass==='interpretation')&&epistemicClass==='source-attributed-claim'?'interpretation':epistemicClass,evidenceRefs:refs,sourceClaims,causalAuthority:false,statisticalAuthority:'not-verified'};
  const text=presentEpistemicClaim({epistemic});
  const accepted=String(claim.claim||'')===text;
  return{...claim,claim:text,epistemic,statement:{id:`statement:${claim.id}`,statementKind:claim.kind,claimRefs:claim.id?[String(claim.id)]:[],evidenceRefs:refs,epistemicClass:epistemic.class,
    attributionMode:'canonical-reference-projection',...presentStatement({epistemic}),interpretationStrength:'unsupported',validation:{accepted,reason:accepted?null:'candidate-wording-not-canonical',policyVersion:1}}};
}

export function presentEpistemicClaim(claim){
  const basis=claim.epistemic;
  const sources=(basis?.sourceClaims||[]).map(c=>c.quoteVerified===false||c.epistemicClass==='interpretation'
    ?'Для указанной интерпретации не сохранено проверяемое утверждение источника.'
    :`${c.epistemicStatus==='conflicted'?'Есть расхождения. ':''}Источник сообщает: ${c.statement}`);
  const support=sources.join(' ');
  if(basis?.class==='source-attributed-claim'&&support)return support;
  if(basis?.class==='interpretation')return `Непроверенная интерпретация: самостоятельный вывод не установлен.${support?` Доступные опоры: ${support}`:''}`;
  if(basis?.class==='proposal')return `Предложение требует конкретизации; обоснованное действие пока не определено.${support?` Доступные опоры: ${support}`:''}`;
  return `Недостаточно оснований для утверждения.${support?` ${support}`:''}`;
}
