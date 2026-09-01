import { storyPlanFromSynthesis } from './legacy-story-plan.mjs';
import { dataRefsForEvidence, evidenceFromDataArtifact } from './data-substrate.mjs';
import { validatePresentationMaterialization } from './presentation-validation.mjs';

export function createSlidesHarness({ slidesHtml, resolvePresentationStyle }) {
  if (typeof slidesHtml !== 'function') throw new Error('Slides Harness requires the existing slides implementation');
  if (typeof resolvePresentationStyle !== 'function') throw new Error('Slides Harness requires a presentation style resolver');
  return { id:'slides', version:1, consumes:['PresentationRequested'], produces:['PresentationCreated','PresentationCompleted'], inputs:['SynthesisPlan','DataArtifact'], outputs:['Presentation'], async execute({ run, artifacts, config, observe=async()=>{}, createOperationId=()=>null }) {
    const synthesis = artifacts.find(item => item.type === 'SynthesisPlan');
    const dataArtifact = artifacts.find(item => item.type === 'DataArtifact');
    if (!synthesis) throw new Error('Slides Harness requires a SynthesisPlan artifact');
    if (!dataArtifact) throw new Error('Slides Harness requires a DataArtifact artifact');
    const plan = storyPlanFromSynthesis(synthesis, { data:{ items:evidenceFromDataArtifact(dataArtifact) } });
    const slides = plan.scenes.map(scene => ({ index:scene.index, claimIds:[scene.claimId], evidenceIds:scene.evidenceIds, dataRefs:dataRefsForEvidence(dataArtifact,scene.evidenceIds), title:scene.title, thesis:scene.thesis, visualType:scene.visualType }));
    const operationId=createOperationId('presentation-render');
    await observe('ArtifactRequested',{operationId,operation:'render',displayInput:'presentation.render("slides")'});
    const style=resolvePresentationStyle(config.styleId);
    let html;
    try{html=await slidesHtml(plan, { generationId:run.id, styleId:style.styleId, temperature:config.temperature || 0.7 }, dataArtifact.data);validatePresentationMaterialization({data:{html,slides}});await observe('ArtifactCompleted',{operationId,operation:'render'});}catch(error){await observe('ArtifactFailed',{operationId,operation:'render',code:error.code||'RENDER_FAILED'});throw error}
    return { artifacts:[{ type:'Presentation', producedByOperationId:operationId, sourceArtifactIds:[synthesis.id, dataArtifact.id], data:{ runId:run.id, intentArtifactId:synthesis.data.intentArtifactId || null, synthesisPlanArtifactId:synthesis.id, dataArtifactId:dataArtifact.id, slides, html, metadata:{ renderer:'legacy slidesHtml', styleId:style.styleId, layoutFamily:style.layoutFamily, ...(style.requestedStyleId?{requestedStyleId:style.requestedStyleId}:{}), ...(style.fallback?{styleFallback:true}:{}) } } }], events:[{ type:'PresentationCreated', payload:{ synthesisPlanArtifactId:synthesis.id, dataArtifactId:dataArtifact.id, slides:slides.length, styleId:style.styleId, layoutFamily:style.layoutFamily } }, { type:'PresentationCompleted', payload:{ renderer:'legacy slidesHtml', styleId:style.styleId } }] };
  } };
}
