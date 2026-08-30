import { storyPlanFromSynthesis } from './legacy-story-plan.mjs';
import { dataRefsForEvidence, evidenceFromDataArtifact } from './data-substrate.mjs';

export function createSlidesHarness({ slidesHtml }) {
  if (typeof slidesHtml !== 'function') throw new Error('Slides Harness requires the existing slides implementation');
  return { id:'slides', version:1, consumes:['PresentationRequested'], produces:['PresentationCreated','PresentationCompleted'], inputs:['SynthesisPlan','DataArtifact'], outputs:['Presentation'], async execute({ run, artifacts, config, observe=async()=>{}, createOperationId=()=>null }) {
    const synthesis = artifacts.find(item => item.type === 'SynthesisPlan');
    const dataArtifact = artifacts.find(item => item.type === 'DataArtifact');
    if (!synthesis) throw new Error('Slides Harness requires a SynthesisPlan artifact');
    if (!dataArtifact) throw new Error('Slides Harness requires a DataArtifact artifact');
    const plan = storyPlanFromSynthesis(synthesis, { data:{ items:evidenceFromDataArtifact(dataArtifact) } });
    const operationId=createOperationId('presentation-render');
    await observe('CapabilityRequested',{operationId,capability:'PRESENTATION',operation:'render',displayInput:'presentation.render("slides")'});
    await observe('CapabilityStarted',{operationId,capability:'PRESENTATION',operation:'render',displayInput:'presentation.render("slides")'});
    let html;
    try{html=await slidesHtml(plan, { generationId:run.id, styleId:config.styleId || 'synthesis-plan', temperature:config.temperature || 0.7 }, dataArtifact.data);await observe('CapabilityCompleted',{operationId,capability:'PRESENTATION',operation:'render'});}catch(error){await observe('CapabilityFailed',{operationId,capability:'PRESENTATION',operation:'render',code:error.code||'RENDER_FAILED'});throw error}
    const slides = plan.scenes.map(scene => ({ index:scene.index, claimIds:[scene.claimId], evidenceIds:scene.evidenceIds, dataRefs:dataRefsForEvidence(dataArtifact,scene.evidenceIds), title:scene.title, thesis:scene.thesis, visualType:scene.visualType }));
    return { artifacts:[{ type:'Presentation', producedByOperationId:operationId, sourceArtifactIds:[synthesis.id, dataArtifact.id], data:{ runId:run.id, intentArtifactId:synthesis.data.intentArtifactId || null, synthesisPlanArtifactId:synthesis.id, dataArtifactId:dataArtifact.id, slides, html, metadata:{ renderer:'legacy slidesHtml', styleId:config.styleId || 'synthesis-plan' } } }], events:[{ type:'PresentationCreated', payload:{ synthesisPlanArtifactId:synthesis.id, dataArtifactId:dataArtifact.id, slides:slides.length } }, { type:'PresentationCompleted', payload:{ renderer:'legacy slidesHtml' } }] };
  } };
}
