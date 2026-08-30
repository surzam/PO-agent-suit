import { storyPlanFromSynthesis } from './legacy-story-plan.mjs';
import { dataRefsForEvidence, evidenceFromDataArtifact } from './data-substrate.mjs';

export function createNarrativeHarness({ narrativeMarkdown }) {
  if (typeof narrativeMarkdown !== 'function') throw new Error('Narrative Harness requires the existing narrative implementation');
  return { id:'narrative', version:1, consumes:['NarrativeRequested'], produces:['NarrativeCreated','NarrativeCompleted'], inputs:['SynthesisPlan','DataArtifact'], outputs:['Narrative'], async execute({ run, artifacts }) {
    const synthesis = artifacts.find(item => item.type === 'SynthesisPlan');
    const dataArtifact = artifacts.find(item => item.type === 'DataArtifact');
    if (!synthesis) throw new Error('Narrative Harness requires a SynthesisPlan artifact');
    if (!dataArtifact) throw new Error('Narrative Harness requires a DataArtifact artifact');
    const evidence=evidenceFromDataArtifact(dataArtifact);
    const plan = storyPlanFromSynthesis(synthesis, { data:{ items:evidence } });
    const content = narrativeMarkdown(plan, { unknowns:synthesis.data.uncertainties || [], evidence, data:dataArtifact.data }, { generationId:run.id, mode:'agentsuite', styleId:'synthesis-plan' });
    return { artifacts:[{ type:'Narrative', sourceArtifactIds:[synthesis.id, dataArtifact.id], data:{ runId:run.id, intentArtifactId:synthesis.data.intentArtifactId || null, synthesisPlanArtifactId:synthesis.id, dataArtifactId:dataArtifact.id, audience:synthesis.data.audience, content, sections:plan.scenes.map(scene => ({ title:scene.title, thesis:scene.thesis, claimIds:scene.claimId?[scene.claimId]:[], evidenceIds:scene.evidenceIds, dataRefs:dataRefsForEvidence(dataArtifact,scene.evidenceIds) })) } }], events:[{ type:'NarrativeCreated', payload:{ synthesisPlanArtifactId:synthesis.id, dataArtifactId:dataArtifact.id, sections:plan.scenes.length } }, { type:'NarrativeCompleted', payload:{ synthesisPlanArtifactId:synthesis.id } }] };
  } };
}
