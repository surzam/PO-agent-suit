const esc=value=>String(value??'').replace(/[&<>"']/g,character=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]));
const icon=node=>node.kind==='workspace'?'◆':node.kind==='directory'?'▸':node.kind==='source'?'◇':'·';
const state=node=>({active:'ACTIVE',read:'READ',evidence:`${node.evidenceCount||0} FACTS`,reused:'REUSED',ready:'READY'}[node.status]||String(node.status||'READY').toUpperCase());

// Renderer-local navigation only. It never reads a host filesystem or mutates
// Runtime: every row comes from the Observation projection supplied by API.
export class FilesystemProjection {
  constructor({onInspect,onChange}={}) { this.onInspect=onInspect; this.onChange=onChange; this.expanded=new Set(['workspace','runs','context','research','artifacts','outputs']); this.selected=null; }
  render(model={}) {
    const nodes=model.nodes||[], byParent=new Map();
    for(const node of nodes){const list=byParent.get(node.parentId)||[];list.push(node);byParent.set(node.parentId,list)}
    const renderNode=(node,depth=0)=>{const children=byParent.get(node.id)||[], folder=['workspace','directory'].includes(node.kind), open=this.expanded.has(node.id), selected=this.selected===node.id;return `<div class="filesystem-entry"><button class="filesystem-row ${esc(node.status)} ${selected?'selected':''}" style="--fs-depth:${depth}" data-filesystem-node="${esc(node.id)}" aria-expanded="${folder?String(open):'false'}"><span class="filesystem-icon">${icon(node)}</span><span class="filesystem-name">${esc(node.name)}</span><small>${esc(state(node))}</small></button>${folder&&open?children.map(child=>renderNode(child,depth+1)).join(''):''}</div>`};
    const root=nodes.find(node=>node.id===model.rootId);
    const crumbs=String(model.currentPath||'workspace').split('/').map(esc).join(' <i>/</i> ');
    return `<aside class="filesystem-world" aria-label="Файловая система Run workspace"><header><small>FILE SYSTEM</small><strong>Run workspace</strong><p class="filesystem-breadcrumb">${crumbs}</p></header><div class="filesystem-scroll">${root?renderNode(root):'<p class="module-empty">Workspace появится после создания Run.</p>'}</div></aside>`;
  }
  bind(root,model={}) { const byId=new Map((model.nodes||[]).map(node=>[node.id,node])); root.querySelectorAll('[data-filesystem-node]').forEach(button=>button.onclick=()=>{const node=byId.get(button.dataset.filesystemNode);if(!node)return;this.selected=node.id;if(['workspace','directory'].includes(node.kind)){this.expanded.has(node.id)?this.expanded.delete(node.id):this.expanded.add(node.id);this.onChange?.()}else if(node.kind==='source')this.onInspect?.(`source:${node.sourceId}`);else if(node.artifactId)this.onInspect?.(`artifact:${node.artifactId}`);}); }
}
