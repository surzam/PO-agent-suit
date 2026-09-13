// Shared presentation only: never infer truth from candidate prose.
export function presentLimitation(value,depth=0){
  if(depth>6||value==null)return[];
  if(typeof value==='string')return value.trim()?[value.trim()]:[];
  if(Array.isArray(value))return value.flatMap(v=>presentLimitation(v,depth+1));
  if(typeof value!=='object')return[];
  for(const key of ['text','message','description','reason','limitation','unknown','gap']){
    if(value[key]!=null){const result=presentLimitation(value[key],depth+1);if(result.length)return result;}
  }
  for(const key of ['limitations','unknowns','gaps','items'])if(Array.isArray(value[key]))return presentLimitation(value[key],depth+1);
  return ['Есть структурированное ограничение; описание недоступно.'];
}
export function presentStatement(claim){
  const basis=claim.epistemic||{},sources=(basis.sourceClaims||[]).filter(s=>s.quoteVerified!==false&&s.epistemicClass!=='interpretation');
  const text=sources.map(s=>s.statement).filter(s=>typeof s==='string'&&s.trim()).join('\n\n');
  return {text,statementKind:'source-attributed-claim',statusLabel:'Утверждение источника',attributionLabel:'Источник сообщает',
    provenanceRefs:sources.map(s=>({evidenceId:s.evidenceId,sourceId:s.sourceId,sourceUri:s.sourceUri})),
    limitations:[...(basis.class==='interpretation'?['Предложенная интерпретация не установлена.']:[]),...(basis.sourceClaims?.some(s=>s.epistemicStatus==='conflicted')?['Источники расходятся.']:[])],numericBindings:[]};
}
