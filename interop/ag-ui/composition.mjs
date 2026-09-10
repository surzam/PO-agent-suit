import {projectSurfaceGraph} from './surface-graph.mjs';

const resultKinds=new Set(['story','table','presentation']);
const actionKinds=new Set(['choice','approval','input']);
const rank=(item)=>({choice:100,approval:100,input:100,comparison:90,validation:80,evidence:70,source:65,story:60,table:60,presentation:60,activity:40,workspace:10}[item.kind]??1);
const attention=(item,session)=>actionKinds.has(item.kind)&&session?.session?.status==='waiting-for-human'?'requires-action':item.lifecycle==='active'?'important':'normal';

export function composeSurfaces({session={},surfaces=[],graph=null,role=null,rendererCapabilities=null,userFocus=null}={}){
  const raw=[...(surfaces||[])].sort((a,b)=>a.id.localeCompare(b.id));
  const graphValue=graph||projectSurfaceGraph({sessionId:session.session?.runId,surfaces:raw,updatedFromSequence:session.session?.lastSequence});
  const graphIds=new Set((graphValue.nodes||[]).map(node=>node.id));
  const items=raw.filter(item=>graphIds.has(item.id));
  const activeInterrupt=items.filter(item=>actionKinds.has(item.kind)&&item.lifecycle==='active').sort((a,b)=>a.id.localeCompare(b.id))[0];
  const comparison=items.find(item=>item.kind==='comparison');
  const active=items.filter(item=>item.lifecycle==='active'&&!actionKinds.has(item.kind)).sort((a,b)=>rank(b)-rank(a)||a.id.localeCompare(b.id))[0];
  // Once real research material exists it is the subject of work; activity
  // remains supporting context instead of an empty-looking primary card.
  const researchPrimary=items.filter(item=>['validation','evidence','source'].includes(item.kind))
    .sort((a,b)=>(Number(b.lifecycle==='active')-Number(a.lifecycle==='active'))||({evidence:3,source:2,validation:1}[b.kind]-({evidence:3,source:2,validation:1}[a.kind])||rank(b)-rank(a)||a.id.localeCompare(b.id)))[0];
  const resultItems=items.filter(item=>resultKinds.has(item.kind));
  const canPromoteResearch=!resultItems.length&&['running','launching','created','waiting-for-human'].includes(session.session?.status);
  let primary=activeInterrupt||comparison||(canPromoteResearch&&researchPrimary)||active||resultItems[0]||items.find(item=>item.kind==='activity')||items.find(item=>item.kind==='workspace')||null;
  if(userFocus){const selected=items.find(item=>item.id===userFocus);if(selected&&!activeInterrupt)primary=selected;}
  const primaryId=primary?.id||null;
  const supporting=items.filter(item=>item.id!==primaryId&&((comparison&&['evidence','source','validation'].includes(item.kind))||item.kind==='activity'||item.kind==='evidence'||item.kind==='source')).sort((a,b)=>rank(b)-rank(a)||a.id.localeCompare(b.id));
  const background=items.filter(item=>item.id!==primaryId&&!supporting.some(ref=>ref.id===item.id)).sort((a,b)=>a.id.localeCompare(b.id));
  const groups=[];
  if(resultItems.length)groups.push({id:`group:results:${session.session?.runId||'run'}`,kind:'results',label:'Результаты',surfaceIds:resultItems.map(item=>item.id)});
  const research=items.filter(item=>['source','evidence','validation'].includes(item.kind));
  if(research.length)groups.push({id:`group:research:${session.session?.runId||'run'}`,kind:'research',label:'Исследование',surfaceIds:research.map(item=>item.id)});
  if(activeInterrupt)groups.push({id:`group:human-input:${activeInterrupt.sourceRefs?.[0]||'pending'}`,kind:'human-input',label:'Требуется решение',surfaceIds:[activeInterrupt.id]});
  const focus=primary?{surfaceId:primary.id,reason:activeInterrupt?'human-interrupt':userFocus&&primary.id===userFocus?'user-selection':comparison&&primary.id===comparison.id?'conflict':primary.lifecycle==='active'?'active-operation':resultItems.includes(primary)?'result':'active-operation'}:null;
  return {schemaVersion:1,primary:primaryId,secondary:supporting[0]?.id||null,supporting:supporting.map(item=>item.id),background:background.map(item=>item.id),focus,focusReason:focus?.reason||'empty',groups,role:role?.id||session.role?.id||'product-owner',rendererCapabilities:rendererCapabilities||null,attention:Object.fromEntries(items.map(item=>[item.id,attention(item,session)]))};
}

export const compositionEquivalent=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
