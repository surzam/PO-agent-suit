import {resolveSubjectMetric} from '../public/ui/subject-metrics.js';
export {resolveSubjectMetric};
export function chartSpecsFromDataArtifact(dataArtifact,{kind='bar'}={}){
  if(!dataArtifact?.data||kind!=='bar')return[];
  const data=dataArtifact.data;
  const valid=(data.subjectMetrics||[]).filter(m=>resolveSubjectMetric(data,m)!==null);
  const ratios=valid.filter(m=>m.operator==='ratio');
  const selected=ratios.length?ratios:valid.filter(m=>m.operator==='direct');
  const groups=new Map();
  for(const metric of selected){const key=metric.comparisonKey||metric.id;groups.set(key,[...(groups.get(key)||[]),metric]);}
  return [...groups.values()].map(metrics=>({id:`chart:${metrics.map(m=>m.id).join(':')}`,kind,title:metrics[0].name,metricRefs:metrics.map(m=>m.id),rowRefs:[...new Set(metrics.flatMap(m=>m.rowRefs))],cellRefs:[...new Set(metrics.flatMap(m=>m.cellRefs))],sourceTableRefs:[...new Set(metrics.flatMap(m=>m.sourceTableRefs))],sourceArtifactId:dataArtifact.id,claimRef:null}));
}
export function resolveChartSpec(dataArtifact,spec){
  if(spec?.sourceArtifactId!==dataArtifact?.id||spec.kind!=='bar')return null;
  const data=dataArtifact.data;
  const metrics=(spec.metricRefs||[]).map(id=>(data.subjectMetrics||[]).find(m=>m.id===id));
  if(!metrics.length||metrics.some(m=>!m||m.cellRefs.some(id=>!(spec.cellRefs||[]).includes(id))||m.rowRefs.some(id=>!(spec.rowRefs||[]).includes(id))))return null;
  const values=metrics.map(m=>resolveSubjectMetric(data,m));if(values.some(v=>v===null))return null;
  return metrics.map((m,i)=>({metricId:m.id,name:m.name,value:values[i],unit:m.unit,displayUnit:m.displayUnit||m.unit,rowRefs:m.rowRefs,cellRefs:m.cellRefs}));
}
