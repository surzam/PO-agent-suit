import {createHash} from 'node:crypto';
const id=(prefix,value)=>`${prefix}:${createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0,20)}`;

// RFC-style comma-separated records. Values are never interpreted as formulas.
export function parseCSV(text){
  const input=String(text).replace(/^\uFEFF/,'');
  if(Buffer.byteLength(input,'utf8')>1048576)throw new Error('CSV exceeds 1 MiB');
  const records=[];let row=[],field='',quoted=false,closed=false;
  const push=()=>{row.push(field);field='';closed=false;};
  for(let i=0;i<input.length;i++){
    const c=input[i];
    if(quoted){if(c==='"'){if(input[i+1]==='"'){field+='"';i++;}else{quoted=false;closed=true;}}else field+=c;continue;}
    if(c==='"'){if(field||closed)throw new Error('Unexpected CSV quote');quoted=true;}
    else if(c===',')push();
    else if(c==='\n'||c==='\r'){if(c==='\r'&&input[i+1]==='\n')i++;push();records.push(row);row=[];}
    else{if(closed)throw new Error('Characters after quoted CSV field');field+=c;}
  }
  if(quoted)throw new Error('Unclosed CSV quote');
  if(field||row.length||closed){push();records.push(row);}
  if(!records.length)return [];
  if(records.length>10001||records[0].length>128)throw new Error('CSV dimensions exceed limit');
  const width=records[0].length;
  return records.map((values,index)=>{if(values.length>width)throw new Error(`Extra CSV cells on row ${index+1}`);return [...values,...Array(width-values.length).fill('')];});
}

const countFields=new Set(['sessions','purchase_completed','address_step','payment_started','numerator','denominator']);
function parseCell(rawValue,name){
  const raw=rawValue.trim(),percent=raw.endsWith('%');
  const number=percent?raw.slice(0,-1):raw;
  if(!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(number))return{};
  const parsedValue=Number(number);if(!Number.isFinite(parsedValue))return{};
  const declared=name.match(/\[([^\]]+)\]$/)?.[1]||null;
  if(percent&&declared&&!['percent','%'].includes(declared))return{};
  return{parsedValue,unit:percent?'percent':declared||(countFields.has(name)?'count':null)};
}

export function sourceTableFromDocument(document){
  const name=String(document.sourceTitle||document.name||''),uri=String(document.sourceUri||'');
  if(!/\.csv(?:$|[?#])/i.test(name+' '+uri)&&!name.toLowerCase().endsWith('.csv'))return null;
  if(!document.sourceId&&!uri)return null;
  const records=parseCSV(document.text||'');if(records.length<2)return null;
  const tableId=id('source-table',[document.sourceId||uri,uri,records]);
  const columns=records[0].map((name,index)=>({id:id('column',[tableId,index]),name}));
  const rows=records.slice(1).map((values,index)=>{const rowId=id('source-row',[tableId,index]);return{id:rowId,cells:values.map((rawValue,i)=>({id:id('cell',[rowId,columns[i].id]),columnId:columns[i].id,rawValue,...parseCell(rawValue,columns[i].name)}))};});
  return{id:tableId,sourceId:document.sourceId||uri,sourceUri:uri,sourceTitle:name,sourceKind:document.sourceKind||'unknown',columns,rows};
}

export function deriveCellMetric({name,operator='direct',cells=[],sourceTableRef,rowRefs=[]}){
  const arity=operator==='direct'?1:['ratio','difference','percentage-point-difference'].includes(operator)?2:0;
  if(!arity||cells.length!==arity||cells.some(c=>!c?.id||!Number.isFinite(c.parsedValue)))return null;
  if(arity===2&&(!cells[0].unit||cells[0].unit!==cells[1].unit))return null;
  if(operator==='ratio'&&cells[1].parsedValue===0)return null;
  if(operator==='percentage-point-difference'&&cells[0].unit!=='percent')return null;
  const [a,b]=cells.map(c=>c.parsedValue);
  const value=operator==='ratio'?a/b:arity===2?a-b:a;
  if(!Number.isFinite(value))return null;
  const cellRefs=cells.map(c=>c.id);
  return{id:id('metric',[operator,cellRefs]),name,metricClass:'subject',epistemicClass:'observation',operator,
    formula:{operator,inputs:cellRefs},cellRefs,rowRefs:[...new Set(rowRefs)],sourceTableRefs:[sourceTableRef],
    unit:operator==='ratio'?'ratio':operator==='percentage-point-difference'?'percentage-points':cells[0].unit,value};
}

// Bounded registered field conventions; no model-supplied expressions or numbers.
export function subjectMetricsFromTables(tables=[]){
  const metrics=[];
  for(const table of tables){
    const byName=new Map(table.columns.map(c=>[c.name,c]));
    if(byName.size!==table.columns.length)continue; // ambiguous headers cannot define measurements
    const ratios=[];
    for(const row of table.rows){
      const cell=name=>row.cells.find(c=>c.columnId===byName.get(name)?.id);
      const label=row.cells.filter(c=>c.parsedValue===undefined&&c.rawValue).map(c=>c.rawValue).join(' / ');
      for(const column of table.columns){const m=deriveCellMetric({name:[column.name,label].filter(Boolean).join(' — '),cells:[cell(column.name)],sourceTableRef:table.id,rowRefs:[row.id]});if(m)metrics.push(m);}
      for(const [numerator,denominator] of [['purchase_completed','sessions'],['numerator','denominator']]){
        const m=deriveCellMetric({name:`${numerator} / ${denominator} — ${label}`,operator:'ratio',cells:[cell(numerator),cell(denominator)],sourceTableRef:table.id,rowRefs:[row.id]});
        if(m){m.displayUnit='percent';m.comparisonKey=JSON.stringify([table.id,numerator,denominator,row.cells.filter(c=>c.parsedValue===undefined&&!['variant','group'].includes(table.columns.find(col=>col.id===c.columnId)?.name)).map(c=>c.rawValue)]);metrics.push(m);ratios.push(m);}
      }
    }
    // Compare pairs only within the same measured outcome and segmentation.
    const groups=Map.groupBy?Map.groupBy(ratios,m=>m.comparisonKey):ratios.reduce((map,m)=>map.set(m.comparisonKey,[...(map.get(m.comparisonKey)||[]),m]),new Map());
    for(const group of groups.values())if(group.length===2){const [a,b]=group;metrics.push({id:id('metric',['pp',b.id,a.id]),name:`Разница: ${b.name} − ${a.name}`,metricClass:'subject',epistemicClass:'observation',operator:'percentage-point-difference',formula:{operator:'percentage-point-difference',inputs:[b.id,a.id]},metricRefs:[b.id,a.id],cellRefs:[...new Set([...b.cellRefs,...a.cellRefs])],rowRefs:[...b.rowRefs,...a.rowRefs],sourceTableRefs:[table.id],unit:'percentage-points',value:(b.value-a.value)*100});}
  }
  return metrics;
}
