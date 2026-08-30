import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createRuntime } from '../core/runtime.mjs';
import { createHarnessRegistry } from '../core/registry.mjs';

const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'agentsuite-rerun-'));
const calls = { research:0, validation:0, synthesis:0, narrative:0, data:0, slides:0 };
function harness(id, output, inputs = []) {
  return { id, inputs, async execute({ run, artifacts }) {
    calls[id] += 1;
    const sources = artifacts.filter(item => inputs.includes(item.type));
    return { artifacts:[{ type:output, sourceArtifactIds:sources.map(item => item.id), data:{ generatedBy:id, runId:run.id } }], events:[{ type:`${output}Created` }] };
  } };
}

try {
  const stages = [
    { id:'research', harnessId:'research' },
    { id:'validation', harnessId:'validation' },
    { id:'synthesis', harnessId:'synthesis' },
    { id:'data', harnessId:'data' },
    { id:'narrative', harnessId:'narrative' },
    { id:'slides', harnessId:'slides' }
  ];
  const registry = createHarnessRegistry([
    harness('research', 'EvidenceSet'),
    harness('validation', 'ValidationReport', ['EvidenceSet']),
    harness('synthesis', 'SynthesisPlan', ['ValidationReport']),
    harness('data', 'DataArtifact', ['SynthesisPlan','EvidenceSet','ValidationReport']),
    harness('narrative', 'Narrative', ['SynthesisPlan','DataArtifact']),
    harness('slides', 'Presentation', ['SynthesisPlan', 'DataArtifact'])
  ]);
  const runtime = createRuntime({ rootDir:temp, registry });
  const original = await runtime.run({ intent:'rerun fixture', workflow:'research-presentation', stages });
  assert.equal(original.status, 'completed');
  const originalSnapshot = JSON.stringify(original);
  const before = { ...calls };
  const presentationRerun = await runtime.fork({ sourceRunId:original.id, fromStage:'slides', stages });
  assert.equal(presentationRerun.status, 'completed');
  assert.equal(presentationRerun.parentRunId, original.id);
  assert.deepEqual(presentationRerun.reusedArtifactIds, [original.artifacts.find(item => item.type === 'SynthesisPlan').id, original.artifacts.find(item => item.type === 'DataArtifact').id]);
  assert.equal(calls.research, before.research);
  assert.equal(calls.validation, before.validation);
  assert.equal(calls.synthesis, before.synthesis);
  assert.equal(calls.narrative, before.narrative);
  assert.equal(calls.data, before.data);
  assert.equal(calls.slides, before.slides + 1);
  assert.ok(presentationRerun.events.some(event => event.type === 'ArtifactReused'));
  const presentation = presentationRerun.artifacts.find(item => item.type === 'Presentation');
  assert.deepEqual(presentation.sourceArtifactIds, presentationRerun.reusedArtifactIds);
  const presentationFile = path.join(temp, 'runs', presentationRerun.id, 'artifacts', presentation.file.split('/').at(-1));
  assert.equal(JSON.parse(await fs.readFile(presentationFile, 'utf8')).runId, presentationRerun.id);
  assert.equal(JSON.stringify(await runtime.inspect(original.id)), originalSnapshot, 'original Run remains immutable');

  const narrativeRerun = await runtime.fork({ sourceRunId:original.id, fromStage:'narrative', stages });
  assert.equal(narrativeRerun.status, 'completed');
  assert.equal(calls.narrative, before.narrative + 1);
  assert.equal(narrativeRerun.artifacts.filter(item => item.reused).length, 2);
  const incomplete = await runtime.run({ intent:'incomplete fixture', stages:[stages[0]] });
  await assert.rejects(() => runtime.fork({ sourceRunId:incomplete.id, fromStage:'slides', stages }), /RequiredArtifactUnavailable/);
  console.log('rerun audit: explicit fork · cross-run reuse · slides-only rerun · narrative rerun · failure · PASS');
} finally {
  await fs.rm(temp, { recursive:true, force:true });
}
