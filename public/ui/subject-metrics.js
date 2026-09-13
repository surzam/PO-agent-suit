const diagnostics=new Set(['evidence_count','source_count','source_calls','pipeline_stages']);
const sameRefs=(a,b)=>Array.isArray(a)&&Array.isArray(b)&&new Set(a).size===a.length&&a.length===new Set(b).size&&a.every(id=>b.includes(id));
export function resolveSubjectMetric(data,metric,seen=new Set()){
  if(!metric||metric.metricClass!=='subject'||diagnostics.has(metric.name)||seen.has(metric.id))return null;
  seen=new Set([...seen,metric.id]);
  const tables=(data.sourceTables||[]).filter(t=>(metric.sourceTableRefs||[]).includes(t.id));
  if(!sameRefs(metric.sourceTableRefs,tables.map(t=>t.id)))return null;
  const cells=tables.flatMap(t=>t.rows.flatMap(r=>r.cells.map(c=>({...c,rowId:r.id,tableId:t.id}))));
  const refs=metric.cellRefs||[];
  if(!refs.length||refs.some(id=>!cells.some(c=>c.id===id)))return null;
  if(cells.filter(c=>refs.includes(c.id)).some(c=>!Number.isFinite(c.parsedValue)||!(metric.rowRefs||[]).includes(c.rowId)))return null;
  const selected=cells.filter(c=>refs.includes(c.id));
  if(selected.length!==refs.length||!sameRefs(refs,selected.map(c=>c.id))||!sameRefs(metric.rowRefs,[...new Set(selected.map(c=>c.rowId))])||!sameRefs(metric.sourceTableRefs,[...new Set(selected.map(c=>c.tableId))]))return null;
  const op=metric.formula?.operator,inputs=metric.formula?.inputs||[];
  let value;
  if(op==='percentage-point-difference'&&metric.metricRefs?.length===2){
    const pair=inputs.map(id=>(data.subjectMetrics||[]).find(m=>m.id===id));
    if(metric.unit!=='percentage-points'||!sameRefs(metric.metricRefs,inputs)||pair.length!==2||pair.some(m=>m?.unit!=='ratio')||!sameRefs(refs,[...new Set(pair.flatMap(m=>m.cellRefs))]))return null;
    const values=pair.map(m=>resolveSubjectMetric(data,m,seen));if(values.some(v=>v===null))return null;
    value=(values[0]-values[1])*100;
  }else{
    const values=inputs.map(id=>cells.find(c=>c.id===id));
    if(!sameRefs(refs,inputs)||values.some(c=>!c||!refs.includes(c.id)))return null;
    if(op==='direct'&&values.length===1&&metric.unit===values[0].unit)value=values[0].parsedValue;
    else if(['ratio','difference','percentage-point-difference'].includes(op)&&values.length===2&&values[0].unit&&values[0].unit===values[1].unit){
      if(op==='percentage-point-difference'&&(values[0].unit!=='percent'||metric.unit!=='percentage-points'))return null;
      if(op==='ratio'&&metric.unit!=='ratio'||op==='difference'&&metric.unit!==values[0].unit)return null;
      if(op==='ratio'&&values[1].parsedValue===0)return null;
      value=op==='ratio'?values[0].parsedValue/values[1].parsedValue:values[0].parsedValue-values[1].parsedValue;
    }else return null;
  }
  return Number.isFinite(value)?value:null;
}
