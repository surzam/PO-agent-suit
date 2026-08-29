import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createRuntime } from '../core/runtime.mjs';
import { createHarnessRegistry } from '../core/registry.mjs';
import { createSynthesisHarness } from '../harnesses/synthesis.mjs';
import { createRoleRegistry } from '../roles/registry.mjs';

const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'agentsuite-role-'));
const roles = createRoleRegistry();
const calls = { research:0, validation:0, synthesis:0, narrative:0, data:0 };
const source = { id:'evidence', type:'EvidenceSet', data:{ items:[
  { id:'E1', claim:'Срок поставки вырос', kind:'fact', confidence:'direct', sourceUri:'fixture://e1' },
  { id:'E2', claim:'Выросло число инцидентов поддержки', kind:'fact', confidence:'direct', sourceUri:'fixture://e2' },
  { id:'E3', claim:'Клиенты используют только часть новой функциональности', kind:'fact', confidence:'direct', sourceUri:'fixture://e3' }
] } };

function stage(id, output, inputs, execute) {
  return { id, inputs, outputs:[output], async execute(context) { calls[id] += 1; return execute(context); } };
}
const brief = stage('brief', 'Brief', [], ({ run }) => ({ artifacts:[{ type:'Brief', data:{ question:run.intent, goal:'Принять решение', audience:'board' } }] }));
const research = stage('research', 'EvidenceSet', [], () => ({ artifacts:[source] }));
const validation = stage('validation', 'ValidationReport', ['EvidenceSet'], ({ artifacts }) => ({ artifacts:[{ type:'ValidationReport', sourceArtifactIds:[artifacts.find(a => a.type === 'EvidenceSet').id], data:{ valid:true } }] }));
const modelJson = async (_system, user) => {
  calls.synthesis += 1;
  const input = JSON.parse(user);
  const cto = input.role === 'cto';
  return { objective:cto ? 'Оценить архитектурную устойчивость решения' : 'Определить ценность и следующий продуктовый шаг', audience:'board', keyClaims:[
    { id:'C001', claim:cto ? 'Рост инцидентов требует оценки надёжности и операционной сложности.' : 'Рост срока поставки требует проверить ценность и приоритет новой функциональности.', evidenceIds:[cto ? 'E2' : 'E1'], kind:'evidence-backed' },
    { id:'C002', claim:cto ? 'Нужна оценка миграционного риска и технической устойчивости.' : 'Следует сфокусироваться на используемом клиентами объёме функциональности.', evidenceIds:['E3'], kind:'interpretation' }
  ], uncertainties:['Причина роста срока поставки не установлена'], structure:cto ? ['reliability','migration-risk'] : ['customer-value','prioritization'], requestedOutputs:['narrative'] };
};
const narrative = stage('narrative', 'Narrative', ['SynthesisPlan'], ({ artifacts, run }) => ({ artifacts:[{ type:'Narrative', sourceArtifactIds:[artifacts.find(a => a.type === 'SynthesisPlan').id], data:{ runId:run.id } }] }));
const data = stage('data', 'DataArtifact', ['SynthesisPlan'], ({ artifacts, run }) => ({ artifacts:[{ type:'DataArtifact', sourceArtifactIds:[artifacts.find(a => a.type === 'SynthesisPlan').id], data:{ runId:run.id } }] }));

try {
  const registry = createHarnessRegistry([brief, research, validation, createSynthesisHarness({ modelJson }), narrative, data]);
  const runtime = createRuntime({ rootDir:temp, registry, roles });
  const stages = [
    { id:'brief', harnessId:'brief' }, { id:'research', harnessId:'research' }, { id:'validation', harnessId:'validation' },
    { id:'synthesis', harnessId:'synthesis' }, { id:'narrative', harnessId:'narrative' }, { id:'data', harnessId:'data' }
  ];
  const po = await runtime.run({ intent:'Стоит ли менять архитектуру продукта?', role:'product-owner', stages });
  const poEvidence = po.artifacts.find(a => a.type === 'EvidenceSet');
  const poValidation = po.artifacts.find(a => a.type === 'ValidationReport');
  const poPlan = po.artifacts.find(a => a.type === 'SynthesisPlan');
  const original = JSON.stringify(po);
  const before = { ...calls };
  const cto = await runtime.fork({ sourceRunId:po.id, fromStage:'synthesis', role:'cto', stages });
  assert.equal(cto.status, 'completed');
  assert.equal(cto.parentRunId, po.id);
  assert.deepEqual(cto.reusedArtifactIds, [po.artifacts.find(a => a.type === 'Brief').id, poEvidence.id, poValidation.id]);
  assert.equal(calls.research, before.research);
  assert.equal(calls.validation, before.validation);
  assert.equal(calls.synthesis, before.synthesis + 1);
  const ctoPlan = cto.artifacts.find(a => a.type === 'SynthesisPlan');
  assert.notEqual(ctoPlan.id, poPlan.id);
  const ctoFile = path.join(temp, 'runs', cto.id, 'artifacts', ctoPlan.file.split('/').at(-1));
  const ctoData = JSON.parse(await fs.readFile(ctoFile, 'utf8')).data;
  assert.equal(ctoData.roleId, 'cto');
  assert.deepEqual(ctoData.keyClaims[0].evidenceIds, ['E2']);
  assert.deepEqual(JSON.parse(await fs.readFile(path.join(temp, 'runs', po.id, 'run.json'), 'utf8')), JSON.parse(original), 'original Run unchanged');
  assert.ok(cto.events.some(e => e.type === 'ArtifactReused' && e.payload.type === 'EvidenceSet'));
  assert.deepEqual(cto.artifacts.filter(a => a.type === 'Narrative' || a.type === 'DataArtifact').map(a => a.sourceArtifactIds), [[ctoPlan.id], [ctoPlan.id]]);
  assert.throws(() => roles.get('unknown') || (() => { throw new Error('Unknown Role'); })(), /Unknown Role/);
  console.log('role audit: PO/CTO worldview · shared evidence · synthesis fork · no research rerun · provenance · PASS');
} finally {
  await fs.rm(temp, { recursive:true, force:true });
}
