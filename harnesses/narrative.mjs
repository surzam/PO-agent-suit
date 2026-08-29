import { storyPlanFromSynthesis } from './legacy-story-plan.mjs';

export function createNarrativeHarness({ narrativeMarkdown }) {
  if (typeof narrativeMarkdown !== 'function') throw new Error('Narrative Harness requires the existing narrative implementation');
  return { id:'narrative', version:1, consumes:['NarrativeRequested'], produces:['NarrativeCreated','NarrativeCompleted'], inputs:['SynthesisPlan'], outputs:['Narrative'], async execute({ run, artifacts }) {
    const synthesis = artifacts.find(item => item.type === 'SynthesisPlan');
    const evidenceSet = artifacts.find(item => item.type === 'EvidenceSet');
    const intent = artifacts.find(item => item.type === 'Intent');
    if (!synthesis) throw new Error('Narrative Harness requires a SynthesisPlan artifact');
    const plan = storyPlanFromSynthesis(synthesis, evidenceSet);
    const content = narrativeMarkdown(plan, { unknowns:synthesis.data.uncertainties || [], evidence:evidenceSet?.data?.items || [] }, { generationId:run.id, mode:'agentsuite', styleId:'synthesis-plan' });
    return { artifacts:[{ type:'Narrative', sourceArtifactIds:[synthesis.id], data:{ runId:run.id, intentArtifactId:intent?.id || synthesis.data.intentArtifactId || null, synthesisPlanArtifactId:synthesis.id, audience:synthesis.data.audience, content, sections:plan.scenes.map(scene => ({ title:scene.title, thesis:scene.thesis, evidenceIds:scene.evidenceIds })) } }], events:[{ type:'NarrativeCreated', payload:{ synthesisPlanArtifactId:synthesis.id, sections:plan.scenes.length } }, { type:'NarrativeCompleted', payload:{ synthesisPlanArtifactId:synthesis.id } }] };
  } };
}
