const forbiddenKey=/(?:html|script|handler|style|url|href|src)/i;
const forbiddenValue=/(?:<\/?[a-z][^>]*>|javascript:|https?:\/\/|\bon\w+\s*=)/i;
const intents=new Set(['cover','section','key-claim','metrics','evidence','comparison','table','timeline','process','quote','roadmap','closing']);
const capacities=new Set(['short','medium','long','low','medium','high']);

function fail(message,code='INVALID_TEMPLATE_LAYOUT_SPEC'){throw Object.assign(new Error(message),{code})}
function isRecord(value){return value&&typeof value==='object'&&!Array.isArray(value)}
function inspectSafe(value,path='spec'){
  if(typeof value==='string'&&forbiddenValue.test(value))fail(`Unsafe declarative value at ${path}`,'UNSAFE_TEMPLATE_LAYOUT_SPEC');
  if(Array.isArray(value))value.forEach((item,index)=>inspectSafe(item,`${path}[${index}]`));
  if(isRecord(value))for(const [key,item] of Object.entries(value)){
    if(forbiddenKey.test(key))fail(`Forbidden executable/resource key ${path}.${key}`,'UNSAFE_TEMPLATE_LAYOUT_SPEC');
    inspectSafe(item,`${path}.${key}`);
  }
}
export function validateTemplateLayoutSpec(spec){
  if(!isRecord(spec))fail('TemplateLayoutSpec must be an object');
  inspectSafe(spec);
  for(const key of ['schemaVersion','templateId','origin','identity','tokens','chrome','decorations','layouts','componentGrammar'])if(!(key in spec))fail(`TemplateLayoutSpec missing ${key}`);
  if(spec.schemaVersion!==1)fail(`Unsupported TemplateLayoutSpec version ${spec.schemaVersion}`,'UNSUPPORTED_TEMPLATE_LAYOUT_SPEC');
  if(!/^[a-z0-9-]+$/.test(spec.templateId))fail('TemplateLayoutSpec templateId is invalid');
  if(!['upstream','agentsuite-local'].includes(spec.origin))fail('TemplateLayoutSpec origin is invalid');
  if(!isRecord(spec.identity)||!Array.isArray(spec.identity.mood)||!Array.isArray(spec.identity.tone))fail('TemplateLayoutSpec identity is incomplete');
  if(!isRecord(spec.tokens?.canvas)||!Number.isFinite(spec.tokens.canvas.width)||!Number.isFinite(spec.tokens.canvas.height))fail('TemplateLayoutSpec canvas is invalid');
  if(!Array.isArray(spec.layouts)||!spec.layouts.length)fail('TemplateLayoutSpec requires layouts');
  const ids=new Set();
  for(const layout of spec.layouts){
    if(!isRecord(layout)||!layout.id||!layout.nativeName)fail('Template layout identity is incomplete');
    if(ids.has(layout.id))fail(`Duplicate layout id ${layout.id}`);ids.add(layout.id);
    if(!Array.isArray(layout.intents)||!layout.intents.length||layout.intents.some(intent=>!intents.has(intent)))fail(`Layout ${layout.id} has invalid intents`);
    if(!isRecord(layout.slots)||!isRecord(layout.capacity)||!isRecord(layout.geometry))fail(`Layout ${layout.id} misses slots, capacity, or geometry`);
    if(!['DECLARED','VERIFIED'].includes(layout.geometryStatus||'DECLARED'))fail(`Layout ${layout.id} geometryStatus is invalid`);
    for(const [slot,rule] of Object.entries(layout.slots)){
      if(!isRecord(rule)||(rule.min!=null&&!Number.isInteger(rule.min))||(rule.max!=null&&!Number.isInteger(rule.max))||(rule.min!=null&&rule.max!=null&&rule.min>rule.max))fail(`Layout ${layout.id} slot ${slot} is invalid`);
    }
    for(const [name,value] of Object.entries(layout.capacity)){
      if(name==='cards'||name==='columns'||name==='metrics'){if(!isRecord(value)||!Number.isInteger(value.max)||value.max<0)fail(`Layout ${layout.id} capacity ${name} is invalid`)}
      else if(!capacities.has(value))fail(`Layout ${layout.id} capacity ${name} is invalid`);
    }
  }
  return spec;
}

export function contentShapeOf(content={}){
  return { titleLength:String(content.title||'').trim().length, bodyLength:String(content.body||content.thesis||'').trim().length, metrics:Array.isArray(content.metrics)?content.metrics.length:0, cards:Array.isArray(content.cards)?content.cards.length:0, columns:Number(content.columns||0) };
}
