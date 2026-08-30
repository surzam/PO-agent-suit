import path from 'node:path';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createRuntime } from '../core/runtime.mjs';
import { createHarnessRegistry } from '../core/registry.mjs';
import { briefHarness } from '../harnesses/brief.mjs';
import { validationHarness } from '../harnesses/validation.mjs';
import { createSynthesisHarness } from '../harnesses/synthesis.mjs';
import { createNarrativeHarness } from '../harnesses/narrative.mjs';
import { createDataHarness } from '../harnesses/data.mjs';
import { createSlidesHarness } from '../harnesses/slides.mjs';
import { roleRegistry } from '../roles/registry.mjs';
import { intentHarness } from '../harnesses/intent.mjs';
import { createIntentDiscoveryHarness } from '../harnesses/intent-discovery.mjs';

export async function createSuiteExecution({ rootDir, eventSink = null }) {
  process.env.PO_AGENT_NO_LISTEN = '1';
  const [{ researchService, researchSources, artifactStore, modelJson, narrativeMarkdown, slidesHtml, dataFromEvidence }, { createResearchHarness }] = await Promise.all([
    import('../server.mjs'), import('../harnesses/research.mjs')
  ]);
  // Resolve context from the packaged application that owns this module. In
  // development this is the repository root; in an AppImage it can be an
  // asar path under process.resourcesPath. Keep only files that really exist:
  // Intent Discovery must receive honest local context, never synthetic text.
  const moduleRoot=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
  const resourceRoot=process.resourcesPath ? path.resolve(process.resourcesPath) : null;
  const contextRoots=[
    moduleRoot,
    resourceRoot && path.join(resourceRoot,'app.asar'),
    resourceRoot && path.join(resourceRoot,'app'),
    resourceRoot
  ].filter(Boolean).map(value=>path.resolve(value));
  const contextFiles=['product-lore.md','package.json','core/contracts.mjs','roles/product-owner.mjs'];
  const localProductContext=[];
  for (const file of contextFiles) {
    for (const base of contextRoots) {
      const content=await fs.readFile(path.join(base,file),'utf8').then(text=>text.slice(0,5000)).catch(()=>null);
      if (content) {
        localProductContext.push({ file, content });
        break;
      }
    }
  }
  function setup(workflow, mode = 'custom') {
    const registry = createHarnessRegistry([briefHarness, validationHarness]);
    const stages = [];
    if (mode === 'random') {
      registry.register(createIntentDiscoveryHarness({ modelJson }));
      stages.push({ id:'intent-discovery', harnessId:'intent-discovery', requestEvent:'IntentDiscoveryRequested' });
    } else {
      registry.register(intentHarness);
      stages.push({ id:'intent', harnessId:'intent' });
    }
    stages.push({ id:'brief', harnessId:'brief' });
    const researchWorkflows = ['research','research-validated','research-synthesis','research-narrative','research-analysis','research-presentation'];
    if (researchWorkflows.includes(workflow)) {
      registry.register(createResearchHarness({ researchService, artifactStore }));
      stages.push({ id:'research', harnessId:'research', requestEvent:'ResearchRequested' });
      if (workflow !== 'research') stages.push({ id:'validation', harnessId:'validation', requestEvent:'ValidationRequested' });
      if (['research-synthesis','research-narrative','research-analysis','research-presentation'].includes(workflow)) {
        registry.register(createSynthesisHarness({ modelJson }));
        stages.push({ id:'synthesis', harnessId:'synthesis', requestEvent:'SynthesisRequested', config:{ requestedOutputs:['decision-memo','presentation'] } });
      }
      if (['research-narrative','research-analysis','research-presentation'].includes(workflow)) {
        registry.register(createDataHarness({ dataFromEvidence }));
        stages.push({ id:'data', harnessId:'data', requestEvent:'DataRequested' });
      }
      if (['research-narrative','research-analysis','research-presentation'].includes(workflow)) {
        registry.register(createNarrativeHarness({ narrativeMarkdown }));
        stages.push({ id:'narrative', harnessId:'narrative', requestEvent:'NarrativeRequested' });
      }
      if (workflow === 'research-presentation') {
        registry.register(createSlidesHarness({ slidesHtml }));
        stages.push({ id:'slides', harnessId:'slides', requestEvent:'PresentationRequested' });
      }
    }
    return { registry, stages };
  }
  return {
    roleRegistry,
    setup,
    briefTurn: input => researchService.briefTurn(input),
    addContext: input => researchService.addContext(input),
    contextConfiguration: () => ({
      roots: researchSources.flatMap(source => source.describeConfiguration?.()?.roots || []),
      sources: researchSources.flatMap(source => source.describeConfiguration?.()?.sources || [])
    }),
    capabilities: () => [
      ...researchSources.map(source => ({ id:source.id.toUpperCase(), label:source.id === 'local' ? 'Local files' : 'Web research' })),
      { id:'MODEL', label:'Local model' }
    ],
    contracts: (workflow, mode = 'custom') => {
      const { registry, stages } = setup(workflow, mode);
      return stages.map(stage => ({ stageId:stage.id, harnessId:stage.harnessId, ...(registry.list().find(item => item.id === stage.harnessId) || {}) }));
    },
    runtime: (workflow, mode = 'custom') => {
      const { registry, stages } = setup(workflow, mode);
      return { runtime:createRuntime({ rootDir, registry, roles:roleRegistry, observability:true, eventSink, defaultAllowEmptyIntent: mode === 'random', contextProvider:({ role }) => ({ availableContext:localProductContext, harnesses:registry.describe?.() || registry.list?.() || [], runtime:{ workflowStages: stages.map(stage => stage.id), artifactModel:'immutable artifacts with sourceArtifactIds' }, providerCapability:{ available:true,kind:'local-model' }, role }) }), stages };
    }
  };
}
