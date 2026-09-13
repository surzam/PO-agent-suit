import {resolveSubjectMetric} from './metric-chart.mjs';
export function deriveHypothesisPlan({narrative={},dataArtifact=null,role='product-owner'}={}){
  const data=dataArtifact?.data||{};
  const metrics=(data.subjectMetrics||[]).flatMap(m=>{const value=resolveSubjectMetric(data,m);return value===null?[]:[{...m,definition:m.name,baseline:value,sourceArtifactIds:[dataArtifact.id]}];});
  const primaryMetric=metrics.find(m=>m.operator==='ratio')||metrics[0]||null;
  const ready=Boolean(narrative.thesis&&primaryMetric);
  return{id:`hypothesis:${narrative.id||'narrative'}`,role,problemStatement:narrative.thesis||'',hypothesis:narrative.thesis||'',intervention:null,population:null,expectedEffect:null,mechanism:[],primaryMetric,secondaryMetrics:metrics.filter(m=>m.id!==primaryMetric?.id),guardrailMetrics:[],baseline:primaryMetric?.baseline??null,target:null,timeWindow:null,falsificationCriteria:primaryMetric?{metricId:primaryMetric.id,condition:'изменение не наблюдается'}:null,decisionRule:null,narrativeRef:narrative.id||null,claimRefs:narrative.supportingClaims||[],evidenceRefs:narrative.strengthBasis?.supportingValidated||[],assumptions:narrative.assumptions||[],risks:narrative.gaps||[],testability:ready?'partial':'not-ready'};
}
