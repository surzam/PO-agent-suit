import { validatePresentationMaterialization } from './presentation-validation.mjs';

export function createSlidesHarness({ slidesHtml, resolvePresentationStyle }) {
  if (typeof slidesHtml !== 'function') throw new Error('Slides Harness requires the existing slides implementation');
  if (typeof resolvePresentationStyle !== 'function') throw new Error('Slides Harness requires a presentation style resolver');
  return { id:'slides', version:1, consumes:['PresentationRequested'], produces:['PresentationCreated','PresentationCompleted'], inputs:['PresentationStoryPlan','DataArtifact'], outputs:['Presentation'], async execute({ run, artifacts, config = {}, observe=async()=>{}, createOperationId=()=>null }) {
    const story = artifacts.find(item => item.type === 'PresentationStoryPlan');
    const dataArtifact = artifacts.find(item => item.type === 'DataArtifact');
    if (!story) throw new Error('Slides Harness requires a PresentationStoryPlan artifact');
    if (!dataArtifact) throw new Error('Slides Harness requires a DataArtifact artifact');
    const plan = story.data;
    const slides = plan.scenes.map(scene => ({ id:scene.id,index:scene.index,intent:scene.intent,claimIds:scene.claimIds||[],evidenceIds:scene.evidenceIds||[],dataRefs:{rowIds:scene.rowIds||[],metricIds:scene.metricIds||[],insightIds:scene.insightIds||[]},title:scene.title,thesis:scene.thesis,visualType:scene.visualType }));
    const operationId=createOperationId('presentation-render');
    await observe('ArtifactRequested',{operationId,operation:'render',displayInput:'presentation.render("slides")'});
    const style=resolvePresentationStyle(config.styleId||plan.recommendedStyleId);
    let html;
    try{html=await slidesHtml(plan, { generationId:run.id, styleId:style.styleId, temperature:config.temperature || 0.7 }, dataArtifact.data);validatePresentationMaterialization({data:{html,slides}});await observe('ArtifactCompleted',{operationId,operation:'render'});}catch(error){await observe('ArtifactFailed',{operationId,operation:'render',code:error.code||'RENDER_FAILED'});throw error}
    return { artifacts:[{ type:'Presentation', producedByOperationId:operationId, sourceArtifactIds:[story.id,dataArtifact.id], data:{ runId:run.id, intentArtifactId:null, presentationStoryPlanArtifactId:story.id,synthesisPlanArtifactId:plan.synthesisPlanArtifactId,dataArtifactId:dataArtifact.id,slides,html,metadata:{renderer:'compatibility slidesHtml',styleId:style.styleId,layoutFamily:style.layoutFamily,...(style.requestedStyleId?{requestedStyleId:style.requestedStyleId}:{}),...(style.fallback?{styleFallback:true}:{})} } }],events:[{type:'PresentationCreated',payload:{presentationStoryPlanArtifactId:story.id,dataArtifactId:dataArtifact.id,slides:slides.length,styleId:style.styleId,layoutFamily:style.layoutFamily}},{type:'PresentationCompleted',payload:{renderer:'compatibility slidesHtml',styleId:style.styleId}}]};
  } };
}
