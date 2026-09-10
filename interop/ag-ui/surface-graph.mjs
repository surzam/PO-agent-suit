import {SURFACE_KINDS} from './surfaces.mjs';

export const SURFACE_RELATIONS=Object.freeze(['supports','derived-from','references','explains','conflicts-with','compares-with','belongs-to','result-of','requires-human','context-for']);

const stable=(value)=>String(value||'').replace(/[^A-Za-z0-9._:-]/g,'_');
const nodeRef=(surface)=>({id:surface.id,kind:surface.kind,scope:surface.scope,sourceRefs:[...(surface.sourceRefs||[])],lifecycle:surface.lifecycle});
const edge=(from,relation,to)=>({id:`relation:${stable(from)}:${relation}:${stable(to)}`,from,to,relation});

export function projectSurfaceGraph({sessionId=null,surfaces=[],updatedFromSequence=0}={}){
  const items=[...(surfaces||[])].filter(item=>item?.id&&SURFACE_KINDS.includes(item.kind)).sort((a,b)=>a.id.localeCompare(b.id));
  const nodes=items.map(nodeRef), byId=new Map(items.map(item=>[item.id,item])), edges=[];
  const sources=new Map(), evidence=new Map();
  for(const item of items){
    if(item.kind==='source')for(const ref of item.sourceRefs||[])sources.set(String(ref),item.id);
    if(item.kind==='evidence')for(const ref of item.sourceRefs||[])evidence.set(String(ref),item.id);
  }
  for(const item of items){
    if(item.kind==='evidence')for(const ref of item.sourceRefs||[])if(sources.has(String(ref)))edges.push(edge(sources.get(String(ref)),'supports',item.id));
    if(item.kind==='validation')for(const ref of item.sourceRefs||[])if(evidence.has(String(ref)))edges.push(edge(item.id,'explains',evidence.get(String(ref))));
    if(['story','table','presentation'].includes(item.kind))edges.push(edge(item.id,'result-of',`surface:activity:${sessionId||'run'}`));
    if(item.kind==='choice'||item.kind==='approval'||item.kind==='input')edges.push(edge(item.id,'requires-human',`surface:activity:${sessionId||'run'}`));
    if(item.scope==='artifact'&&item.sourceRefs?.length)for(const ref of item.sourceRefs)if(byId.has(`surface:evidence:${ref}`))edges.push(edge(item.id,'derived-from',`surface:evidence:${ref}`));
  }
  const comparison=items.find(item=>item.kind==='comparison');
  if(comparison)for(const item of items.filter(item=>item.kind==='evidence'))edges.push(edge(comparison.id,'compares-with',item.id));
  const unique=[...new Map(edges.map(item=>[item.id,item])).values()].sort((a,b)=>a.id.localeCompare(b.id));
  return {schemaVersion:1,sessionId, nodes, edges:unique, focus:null, groups:[], updatedFromSequence:Number(updatedFromSequence)||0};
}

export const surfaceGraphEquivalent=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
