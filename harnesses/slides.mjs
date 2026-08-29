import { storyPlanFromSynthesis } from './legacy-story-plan.mjs';

export function createSlidesHarness({ slidesHtml }) {
  if (typeof slidesHtml !== 'function') throw new Error('Slides Harness requires the existing slides implementation');
  return { id:'slides', version:1, consumes:['PresentationRequested'], produces:['PresentationCreated','PresentationCompleted'], inputs:['SynthesisPlan','DataArtifact'], outputs:['Presentation'], async execute({ run, artifacts, config }) {
    const synthesis = artifacts.find(item => item.type === 'SynthesisPlan');
    const dataArtifact = artifacts.find(item => item.type === 'DataArtifact');
    const intent = artifacts.find(item => item.type === 'Intent');
    if (!synthesis) throw new Error('Slides Harness requires a SynthesisPlan artifact');
    if (!dataArtifact) throw new Error('Slides Harness requires a DataArtifact artifact');
    const plan = storyPlanFromSynthesis(synthesis, artifacts.find(item => item.type === 'EvidenceSet'));
    const html = slidesHtml(plan, { generationId:run.id, styleId:config.styleId || 'synthesis-plan', temperature:config.temperature || 0.7 }, dataArtifact.data);
    const slides = plan.scenes.map(scene => ({ index:scene.index, claimIds:[scene.claimId], evidenceIds:scene.evidenceIds, title:scene.title, thesis:scene.thesis, visualType:scene.visualType }));
    return { artifacts:[{ type:'Presentation', sourceArtifactIds:[synthesis.id, dataArtifact.id], data:{ runId:run.id, intentArtifactId:intent?.id || synthesis.data.intentArtifactId || null, synthesisPlanArtifactId:synthesis.id, dataArtifactId:dataArtifact.id, slides, html, metadata:{ renderer:'legacy slidesHtml', styleId:config.styleId || 'synthesis-plan' } } }], events:[{ type:'PresentationCreated', payload:{ synthesisPlanArtifactId:synthesis.id, dataArtifactId:dataArtifact.id, slides:slides.length } }, { type:'PresentationCompleted', payload:{ renderer:'legacy slidesHtml' } }] };
  } };
}
