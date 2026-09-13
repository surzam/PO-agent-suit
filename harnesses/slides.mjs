import { validatePresentationMaterialization } from './presentation-validation.mjs';
import { chartSpecsFromDataArtifact,resolveChartSpec } from '../core/metric-chart.mjs';

export function createSlidesHarness({ slidesHtml, resolvePresentationStyle }) {
  if (typeof slidesHtml !== 'function') throw new Error('Slides Harness requires the existing slides implementation');
  if (typeof resolvePresentationStyle !== 'function') throw new Error('Slides Harness requires a presentation style resolver');
  return { id:'slides', version:1, consumes:['PresentationRequested'], produces:['PresentationCreated','PresentationCompleted'], inputs:['PresentationStoryPlan','DataArtifact','HypothesisPlan'], outputs:['Presentation'], async execute({ run, artifacts, config = {}, observe=async()=>{}, createOperationId=()=>null }) {
    const story = artifacts.find(item => item.type === 'PresentationStoryPlan');
    const hypothesis = artifacts.find(item => item.type === 'HypothesisPlan');
    const dataArtifact = artifacts.find(item => item.type === 'DataArtifact');
    if (!story) throw new Error('Slides Harness requires a PresentationStoryPlan artifact');
    if (!dataArtifact) throw new Error('Slides Harness requires a DataArtifact artifact');
    const plan = story.data;
    const semanticRoles=['decision','facts','data','narrative','hypothesis','validation-plan','proposal'];
    const roleByIntent={cover:'decision',situation:'decision','key-claim':'facts',evidence:'facts',comparison:'facts',metrics:'data',unknowns:'validation-plan',recommendation:'proposal',roadmap:'validation-plan',closing:'proposal'};
    const slides = plan.scenes.map(scene => ({ id:scene.id,index:scene.index,intent:scene.intent,semanticRole:roleByIntent[scene.intent]||'facts',claimIds:scene.claimIds||[],evidenceIds:scene.evidenceIds||[],dataRefs:{rowIds:scene.rowIds||[],metricIds:scene.metricIds||[],insightIds:scene.insightIds||[]},title:scene.title,thesis:scene.thesis,visualType:scene.visualType }));
    const chartSpecs=chartSpecsFromDataArtifact(dataArtifact);
    for(const slide of slides){
      slide.epistemicClaims=plan.scenes.find(s=>s.id===slide.id)?.epistemicClaims||[];
      if(slide.epistemicClaims.some(c=>c.class==='proposal'))slide.semanticRole='proposal';
      else if(slide.epistemicClaims.some(c=>c.class==='interpretation'))slide.semanticRole='interpretation';
      else if(slide.epistemicClaims.some(c=>c.class==='source-attributed-claim'))slide.semanticRole='source-claims';
    }
    const resolvedCharts=chartSpecs.map(spec=>({spec,values:resolveChartSpec(dataArtifact,spec)})).filter(c=>c.values);
    const demo=Boolean(dataArtifact.data.showcase||dataArtifact.data.sourceKind==='example');
    const renderPlan={...plan,subjectCharts:resolvedCharts,scenes:slides.map(scene=>({...plan.scenes.find(item=>item.id===scene.id),demo,semanticRole:scene.epistemicClaims.some(c=>c.class==='proposal')?'proposal':scene.epistemicClaims.some(c=>c.class==='interpretation')?'interpretation':scene.epistemicClaims.some(c=>c.class==='source-attributed-claim')?'source-claims':scene.semanticRole}))};
    const decisionDeck=hypothesis?{roles:semanticRoles,narrativeRef:hypothesis.data.narrativeRef||null,hypothesisRef:hypothesis.id,claimRefs:hypothesis.data.claimRefs||[],evidenceRefs:hypothesis.data.evidenceRefs||[],metricRefs:chartSpecs.flatMap(spec=>spec.metricRefs||[]),chartRefs:chartSpecs.map(spec=>spec.id)}:null;
    const operationId=createOperationId('presentation-render');
    await observe('ArtifactRequested',{operationId,operation:'render',displayInput:'presentation.render("slides")'});
    const style=resolvePresentationStyle(config.styleId||plan.recommendedStyleId);
    let html;
    try{html=await slidesHtml(renderPlan, { generationId:run.id, styleId:style.styleId, temperature:config.temperature || 0.7 }, dataArtifact.data);validatePresentationMaterialization({data:{html,slides}});await observe('ArtifactCompleted',{operationId,operation:'render'});}catch(error){await observe('ArtifactFailed',{operationId,operation:'render',code:error.code||'RENDER_FAILED'});throw error}
    return { artifacts:[{ type:'Presentation', producedByOperationId:operationId, sourceArtifactIds:[story.id,dataArtifact.id,...(hypothesis?[hypothesis.id]:[])], data:{ runId:run.id, intentArtifactId:null, presentationStoryPlanArtifactId:story.id,synthesisPlanArtifactId:plan.synthesisPlanArtifactId,dataArtifactId:dataArtifact.id,hypothesisPlanArtifactId:hypothesis?.id||null,slides,chartSpecs,decisionDeck,html,metadata:{renderer:'compatibility slidesHtml',presentationKind:hypothesis?'po-decision-deck':'research-results',semanticRoles,styleId:style.styleId,layoutFamily:style.layoutFamily,...(style.requestedStyleId?{requestedStyleId:style.requestedStyleId}:{}),...(style.fallback?{styleFallback:true}:{})} } }],events:[{type:'PresentationCreated',payload:{presentationStoryPlanArtifactId:story.id,dataArtifactId:dataArtifact.id,slides:slides.length,styleId:style.styleId,layoutFamily:style.layoutFamily}},{type:'PresentationCompleted',payload:{renderer:'compatibility slidesHtml',styleId:style.styleId}}]};
  } };
}
