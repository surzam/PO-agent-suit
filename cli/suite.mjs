#!/usr/bin/env node
import path from 'node:path';
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

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const args = process.argv.slice(2);

function option(name, fallback) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] || fallback : fallback;
}

function usage() {
  console.log('suite run [--role role] [--workflow workflow] "intent"');
  console.log('suite rerun <run-id> --from <stage>');
  console.log('suite inspect <run-id>');
}

const command = args[0];
if (command === 'run') {
  const flags = new Set(['--role', '--workflow', '--temperature', '--style']);
  const intentParts = [];
  for (let index = 1; index < args.length; index += 1) {
    if (flags.has(args[index])) { index += 1; continue; }
    intentParts.push(args[index]);
  }
  const intent = intentParts.join(' ').trim();
  const role = option('--role', 'product-owner');
  if (!roleRegistry.get(role)) throw new Error(`Unknown Role: ${role}`);
  const workflow = option('--workflow', 'brief');
  const registry = createHarnessRegistry([briefHarness, validationHarness]);
  const stages = [{ id:'brief', harnessId:'brief' }];
  if (workflow === 'research' || workflow === 'research-validated' || workflow === 'research-synthesis' || workflow === 'research-narrative' || workflow === 'research-analysis' || workflow === 'research-presentation') {
    process.env.PO_AGENT_NO_LISTEN = '1';
    const [{ researchService, artifactStore, modelJson, narrativeMarkdown, slidesHtml, dataFromEvidence }, { createResearchHarness }] = await Promise.all([
      import('../server.mjs'),
      import('../harnesses/research.mjs')
    ]);
    registry.register(createResearchHarness({ researchService, artifactStore }));
    stages.push({ id:'research', harnessId:'research', requestEvent:'ResearchRequested', config:{ temperature:Number(option('--temperature', '0.7')), style:option('--style') } });
    if (workflow === 'research-validated' || workflow === 'research-synthesis' || workflow === 'research-narrative' || workflow === 'research-analysis' || workflow === 'research-presentation') stages.push({ id:'validation', harnessId:'validation', requestEvent:'ValidationRequested' });
    if (workflow === 'research-synthesis' || workflow === 'research-narrative' || workflow === 'research-analysis' || workflow === 'research-presentation') {
      registry.register(createSynthesisHarness({ modelJson }));
      stages.push({ id:'synthesis', harnessId:'synthesis', requestEvent:'SynthesisRequested', config:{ requestedOutputs:['decision-memo','presentation'], temperature:Number(option('--temperature', '0.7')) } });
    }
    if (workflow === 'research-narrative' || workflow === 'research-analysis' || workflow === 'research-presentation') {
      registry.register(createNarrativeHarness({ narrativeMarkdown }));
      stages.push({ id:'narrative', harnessId:'narrative', requestEvent:'NarrativeRequested' });
    }
    if (workflow === 'research-analysis' || workflow === 'research-presentation') {
      registry.register(createDataHarness({ dataFromEvidence }));
      stages.push({ id:'data', harnessId:'data', requestEvent:'DataRequested' });
    }
    if (workflow === 'research-presentation') {
      registry.register(createSlidesHarness({ slidesHtml }));
      stages.push({ id:'slides', harnessId:'slides', requestEvent:'PresentationRequested' });
    }
  }
  const runtime = createRuntime({ rootDir: path.join(root, 'workspace'), registry, roles: roleRegistry });
  const run = await runtime.run({ intent, role, workflow, stages });
  console.log(JSON.stringify({ id: run.id, status: run.status, role: run.role, workflow: run.workflow, artifacts: run.artifacts }, null, 2));
} else if (command === 'rerun' && args[1]) {
  const sourceRunId = args[1];
  process.env.PO_AGENT_NO_LISTEN = '1';
  const sourceRuntime = createRuntime({ rootDir: path.join(root, 'workspace'), registry: createHarnessRegistry() });
  const sourceRun = await sourceRuntime.inspect(sourceRunId);
  const rerunWorkflow = option('--workflow', sourceRun.workflow);
  const fromStage = option('--from');
  const rerunRole = option('--role', sourceRun.role);
  if (!roleRegistry.get(rerunRole)) throw new Error(`Unknown Role: ${rerunRole}`);
  const [{ researchService, artifactStore, modelJson, narrativeMarkdown, slidesHtml, dataFromEvidence }, { createResearchHarness }] = await Promise.all([
    import('../server.mjs'), import('../harnesses/research.mjs')
  ]);
  const registry = createHarnessRegistry([briefHarness, validationHarness]);
  const stages = [
    { id:'brief', harnessId:'brief' },
    { id:'research', harnessId:'research', requestEvent:'ResearchRequested' },
    { id:'validation', harnessId:'validation', requestEvent:'ValidationRequested' },
    { id:'synthesis', harnessId:'synthesis', requestEvent:'SynthesisRequested', config:{ requestedOutputs:['decision-memo','presentation'], temperature:Number(option('--temperature', '0.7')) } },
    { id:'narrative', harnessId:'narrative', requestEvent:'NarrativeRequested' },
    { id:'data', harnessId:'data', requestEvent:'DataRequested' },
    { id:'slides', harnessId:'slides', requestEvent:'PresentationRequested' }
  ];
  registry.register(createResearchHarness({ researchService, artifactStore }));
  registry.register(createSynthesisHarness({ modelJson }));
  registry.register(createNarrativeHarness({ narrativeMarkdown }));
  registry.register(createDataHarness({ dataFromEvidence }));
  registry.register(createSlidesHarness({ slidesHtml }));
  const runtime = createRuntime({ rootDir: path.join(root, 'workspace'), registry, roles: roleRegistry });
  const run = await runtime.fork({ sourceRunId, fromStage, role:rerunRole, workflow:rerunWorkflow, stages });
  console.log(JSON.stringify({ id: run.id, parentRunId: run.parentRunId, status: run.status, reusedArtifactIds: run.reusedArtifactIds, artifacts: run.artifacts }, null, 2));
} else if (command === 'serve') {
  const { serveAgentSuite } = await import('../api/agentsuite-api.mjs');
  await serveAgentSuite({ host:option('--host', '127.0.0.1'), port:Number(option('--port', '8080')), rootDir:path.resolve(process.env.PO_RUNTIME_ROOT || path.join(root, 'workspace')) });
} else if (command === 'inspect' && args[1]) {
  const runtime = createRuntime({ rootDir: path.join(root, 'workspace'), registry: createHarnessRegistry() });
  const run = await runtime.inspect(args[1]);
  console.log(`Run ${run.id}\nIntent: ${run.intent}\nRole: ${run.role}\nWorkflow: ${run.workflow}\nStatus: ${run.status}${run.parentRunId ? `\nParent: ${run.parentRunId}` : ''}${run.reusedArtifactIds?.length ? `\nReused artifacts: ${run.reusedArtifactIds.join(', ')}` : ''}\n\nTimeline`);
  for (const event of run.events) console.log(`- ${event.type} · ${event.at}${event.payload?.message ? ` · ${event.payload.message}` : ''}`);
  console.log('\nArtifacts');
  const artifactTypes = new Map(run.artifacts.map(artifact => [artifact.id, artifact.type]));
  for (const artifact of run.artifacts) {
    const lineage = (artifact.sourceArtifactIds || []).map(id => `${artifactTypes.get(id) || id}`).join(', ');
    console.log(`- ${artifact.type}${lineage ? ` ← ${lineage}` : ''} · ${artifact.file}`);
  }
} else {
  usage();
  process.exitCode = 1;
}
