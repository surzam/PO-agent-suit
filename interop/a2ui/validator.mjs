import { ALLOWED_COMPONENTS, A2UI_VERSION, CATALOG_ID } from './protocol.mjs';

const idPattern=/^[A-Za-z][A-Za-z0-9_-]{0,80}$/;
const forbidden=/\b(?:<script|javascript:|iframe|webview|innerHTML|eval\s*\(|new\s+Function|https?:\/\/)/i;
const componentFields=new Set(['component','children','child','text','label','value','title','description','metricId','rowId','insightId','evidenceId','sourceId','sourceTitle','columns','rows','tabs','items','kind','unit','status','origin','dataPath','refs']);
function fail(message,code='A2UI_INVALID'){throw Object.assign(new Error(message),{code})}
function checkDynamic(value,label){
  if(value&&typeof value==='object'&&!Array.isArray(value)){if(typeof value.path!=='string'||!value.path.startsWith('/'))fail(`${label} has invalid binding path`);return}
  if(typeof value!=='string'&&typeof value!=='number'&&typeof value!=='boolean')fail(`${label} has invalid value`);
  if(typeof value==='string'&&forbidden.test(value))fail(`${label} contains forbidden content`);
}
function refsOf(component){
  const refs=[];
  for(const key of ['child','children']){
    const value=component[key];
    if(typeof value==='string')refs.push(value);
    if(Array.isArray(value))for(const item of value){if(typeof item!=='string'||!idPattern.test(item))fail(`${key} has invalid ComponentId`);refs.push(item)}
    if(value&&typeof value==='object'&&!Array.isArray(value)){if(typeof value.componentId!=='string'||typeof value.path!=='string')fail(`${key} has invalid ChildList`)}
  }
  return refs;
}
function validateComponent(component, ids){
  if(!component||typeof component!=='object'||Array.isArray(component))fail('component must be an object');
  if(!idPattern.test(String(component.id||'')))fail('invalid ComponentId');
  if(ids.has(component.id))fail(`duplicate ComponentId: ${component.id}`);ids.add(component.id);
  if(!ALLOWED_COMPONENTS.has(component.component))fail(`unknown component: ${component.component}`,'A2UI_UNKNOWN_COMPONENT');
  for(const key of Object.keys(component))if(!componentFields.has(key)&&key!=='id')fail(`unsupported property: ${key}`);
  for(const key of ['text','label','value','title','description','metricId','rowId','insightId','evidenceId','sourceId','dataPath'])if(component[key]!==undefined)checkDynamic(component[key],`${component.id}.${key}`);
  refsOf(component);
}
function resolvePath(root,path){let value=root;for(const part of path.slice(1).split('/').filter(Boolean)){const key=part.replace(/~1/g,'/').replace(/~0/g,'~');if(value==null||!Object.prototype.hasOwnProperty.call(value,key))return undefined;value=value[key]}return value}
function validateBindings(value,dataModel){if(!value||typeof value!=='object'||Array.isArray(value))return;if(typeof value.path==='string'&&resolvePath(dataModel,value.path)===undefined)fail(`binding path does not resolve: ${value.path}`);for(const child of Object.values(value))validateBindings(child,dataModel)}
export function validateA2UISurface(messages,{dataModel=null}={}){
  if(!Array.isArray(messages)||!messages.length)fail('A2UI surface requires messages');
  const create=messages.find(message=>message?.createSurface);
  if(!create||create.version!==A2UI_VERSION)fail('A2UI surface requires v1.0 createSurface');
  if(create.createSurface.catalogId!==CATALOG_ID)fail('unsupported A2UI catalog','A2UI_UNKNOWN_CATALOG');
  const surface=create.createSurface,surfaceData=surface.dataModel||dataModel||{};
  const components=surface.components||[];const ids=new Set();
  if(!components.some(item=>item.id==='root'))fail('A2UI surface root is missing');
  for(const component of components)validateComponent(component,ids);
  const refs=components.flatMap(refsOf);for(const ref of refs)if(!ids.has(ref))fail(`missing child ComponentId: ${ref}`);
  const reachable=new Set();const byId=new Map(components.map(item=>[item.id,item]));const visit=id=>{if(reachable.has(id))return;reachable.add(id);for(const ref of refsOf(byId.get(id)||{}))visit(ref)};visit('root');
  // A2UI allows progressive/component updates, so disconnected definitions are
  // not intrinsically invalid; only references reachable from root must resolve.
  for(const component of components)validateBindings(component,surfaceData);
  for(const message of messages){if(!message||message.version!==A2UI_VERSION)fail('unsupported A2UI protocol version','UNSUPPORTED_A2UI_VERSION');const keys=Object.keys(message).filter(key=>key!=='version');if(keys.length!==1)fail('A2UI envelope must contain exactly one message');if(!['createSurface','updateComponents','updateDataModel','deleteSurface'].includes(keys[0]))fail(`unsupported A2UI message: ${keys[0]}`)}
  return {catalogId:CATALOG_ID,protocolVersion:'1.0',surfaceId:surface.surfaceId,componentCount:components.length};
}
