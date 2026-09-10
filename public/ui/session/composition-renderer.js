const stableId=value=>String(value||'').replace(/[^A-Za-z0-9._:-]/g,'_');
const supported=(surface,capabilities)=>surface&&(!capabilities?.surfaces||surface.requiredRendererCapabilities?.every(kind=>capabilities.surfaces.includes(kind)));

export function adaptComposition({surfaces=[],composition={},rendererCapabilities=null,viewportClass='wide',localUiState={}}={}){
  const byId=new Map((surfaces||[]).map(surface=>[surface.id,surface]));
  const get=id=>byId.get(id);
  const candidates=[composition.primary,composition.secondary,...(composition.supporting||[]),...(composition.background||[])].map(get).filter(Boolean);
  const primary=supported(get(composition.primary),rendererCapabilities)?get(composition.primary):candidates.find(item=>supported(item,rendererCapabilities))||null;
  const primaryId=primary?.id||null;
  const supporting=(composition.supporting||[]).map(get).filter(item=>item&&item.id!==primaryId&&supported(item,rendererCapabilities));
  const secondary=(composition.secondary&&get(composition.secondary)?.id!==primaryId&&supported(get(composition.secondary),rendererCapabilities))?get(composition.secondary):supporting[0]||null;
  const background=(composition.background||[]).map(get).filter(item=>item&&item.id!==primaryId&&item.id!==secondary?.id&&!supporting.some(ref=>ref.id===item.id)&&supported(item,rendererCapabilities));
  const groupMembers=(composition.groups||[]).map(group=>({id:group.id,label:group.label,kind:group.kind,members:group.surfaceIds.map(get).filter(Boolean),activeMember:localUiState.activeResultTab||group.surfaceIds[0]||null}));
  return {schemaVersion:1,viewportClass,primary:primary?[primary]:[],secondary:secondary?[secondary]:[],supporting,background,groups:groupMembers,focus:composition.focus||null,semanticSignature:JSON.stringify({primary:primaryId,secondary:secondary?.id||null,supporting:supporting.map(item=>item.id),background:background.map(item=>item.id),groups:groupMembers.map(group=>[group.id,group.members.map(item=>item.id)]),focusReason:composition.focusReason||null})};
}

export function rendererRegionAttributes(layout){
  return {'data-primary-surface':layout.primary[0]?.id||'', 'data-supporting-surfaces':layout.supporting.map(item=>item.id).join(','), 'data-background-surfaces':layout.background.map(item=>item.id).join(','), 'data-composition-signature':layout.semanticSignature};
}

export const sameStructuralLayout=(a,b)=>a?.semanticSignature===b?.semanticSignature;
export const surfaceKey=surface=>`surface:${stableId(surface?.id)}`;
