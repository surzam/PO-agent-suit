import { contentShapeOf, validateTemplateLayoutSpec } from './template-layout-spec.mjs';
const rank={short:0,medium:1,long:2,low:0,high:2};
const band=(length)=>length<=52?'short':length<=110?'medium':'long';
export function resolveTemplateLayout({spec,templateId,intent,contentShape={}}={}){
  validateTemplateLayoutSpec(spec);
  if(templateId!==spec.templateId)throw Object.assign(new Error(`Unknown template ${templateId}`),{code:'UNKNOWN_TEMPLATE_LAYOUT'});
  const shape=contentShapeOf(contentShape),titleBand=band(shape.titleLength);
  const candidates=spec.layouts.filter(layout=>layout.intents.includes(intent));
  const compatible=candidates.filter(layout=>rank[layout.capacity.title] >= rank[titleBand] && shape.metrics <= (layout.capacity.metrics?.max??Infinity) && shape.cards <= (layout.capacity.cards?.max??Infinity) && shape.columns <= (layout.capacity.columns?.max??Infinity));
  const resolved=compatible[0]||candidates[0]||spec.layouts[0];
  return {requestedTemplateId:templateId,resolvedTemplateId:spec.templateId,requestedIntent:intent,resolvedLayoutId:resolved.id,layoutFallback:!candidates.length||!compatible.length,geometryStatus:resolved.geometryStatus||'DECLARED'};
}
