import { createSurface, dynamicPath, CATALOG_ID, CATALOG_VERSION } from './protocol.mjs';
import { validateA2UISurface } from './validator.mjs';

const text=value=>String(value??'').slice(0,1000);
const safeRefs=(value,key)=>Array.isArray(value?.[key])?value[key].map(String):[];

export function buildInteractiveDataModel(dataArtifact){
  const data=dataArtifact?.data||{},provenance=data.provenance||{};
  const rows={};for(const ref of provenance.rows||[]){const row=(data.structuredRows||[]).find(item=>String(item.rowId)===String(ref.rowId))||{rowId:ref.rowId,values:(data.rows||[])[ref.rowIndex]||[]};rows[ref.rowId]={rowId:ref.rowId,values:Array.isArray(row.values)?row.values.map(text):[],evidenceIds:safeRefs(ref,'evidenceIds'),claimIds:safeRefs(ref,'claimIds'),sourceTitle:text(ref.sourceTitle||'')};}
  const metrics={};for(const [index,metric] of (data.numericMetrics||[]).entries()){const ref=(provenance.metrics||[])[index];if(!ref)continue;metrics[ref.metricId]={metricId:ref.metricId,label:text(metric[0]),value:metric[1],unit:text(metric[2]),origin:ref.origin,kind:ref.kind,evidenceIds:safeRefs(ref,'evidenceIds'),claimIds:safeRefs(ref,'claimIds')};}
  const insights={};for(const [index,insight] of (data.insights||[]).entries()){const ref=(provenance.insights||[])[index];if(!ref)continue;insights[ref.insightId]={insightId:ref.insightId,text:text(insight),kind:ref.kind||'interpretation',grounding:ref.claimIds?.length?'grounded':'ungrounded',evidenceIds:safeRefs(ref,'evidenceIds'),claimIds:safeRefs(ref,'claimIds')};}
  return {title:text(data.title||'Интерактивный результат'),columns:(data.columns||[]).map(text),rows,metrics,insights};
}

export function deterministicComponents(model){
  const metricIds=Object.keys(model.metrics),rowIds=Object.keys(model.rows),insightIds=Object.keys(model.insights);
  const components=[{id:'root',component:'Column',children:['headline','metrics','facts','insights','table']},{id:'headline',component:'Heading',text:dynamicPath('/title')},{id:'metrics',component:'Section',title:'Ключевые метрики',children:metricIds.length?['metric-list']:['metrics-empty']},{id:'metric-list',component:'Column',children:metricIds.map((_,i)=>`metric-${i}`)},{id:'metrics-empty',component:'Text',text:'Метрики отсутствуют'},{id:'facts',component:'Section',title:'Факты',children:rowIds.length?['fact-list']:['facts-empty']},{id:'fact-list',component:'Column',children:rowIds.map((_,i)=>`fact-${i}`)},{id:'facts-empty',component:'Text',text:'Факты отсутствуют'},{id:'insights',component:'Section',title:'Интерпретации',children:insightIds.length?['insight-list']:['insights-empty']},{id:'insight-list',component:'Column',children:insightIds.map((_,i)=>`insight-${i}`)},{id:'insights-empty',component:'Text',text:'Интерпретации отсутствуют'},{id:'table',component:'DataTable',dataPath:'/rows',columns:dynamicPath('/columns')}];
  metricIds.forEach((id,i)=>components.push({id:`metric-${i}`,component:'Metric',metricId:id,label:dynamicPath(`/metrics/${id}/label`),value:dynamicPath(`/metrics/${id}/value`),unit:dynamicPath(`/metrics/${id}/unit`),origin:dynamicPath(`/metrics/${id}/origin`)}));
  rowIds.forEach((id,i)=>components.push({id:`fact-${i}`,component:'Fact',rowId:id,text:dynamicPath(`/rows/${id}/values/1`),sourceTitle:dynamicPath(`/rows/${id}/sourceTitle`)}));
  insightIds.forEach((id,i)=>components.push({id:`insight-${i}`,component:'Insight',insightId:id,text:dynamicPath(`/insights/${id}/text`),kind:dynamicPath(`/insights/${id}/kind`)}));
  return components;
}

export function buildInteractiveSurface(dataArtifact,{surfaceId=`interactive-${dataArtifact.runId||dataArtifact.id}`,components=null}={}){const dataModel=buildInteractiveDataModel(dataArtifact),messages=[createSurface(surfaceId,components||deterministicComponents(dataModel),dataModel)];validateA2UISurface(messages);return{catalogId:CATALOG_ID,catalogVersion:CATALOG_VERSION,protocolVersion:'1.0',surfaceId,messages,dataModel,provenanceIndex:dataArtifact.data?.provenance||{},sourceArtifactIds:[]};}
