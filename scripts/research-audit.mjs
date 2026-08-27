import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createResearchService } from '../research/service.mjs';
import { createArtifactStore } from '../research/storage.mjs';
import { isPrivateAddress } from '../research/sources.mjs';

const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'po-research-audit-'));
const store = createArtifactStore(temp);
await store.initialize();

let briefCalls = 0;
async function modelJson(system, user) {
  if (system.includes('редактор исследовательского задания')) {
    briefCalls += 1;
    return { brief:{ question:'Модель попыталась заменить вопрос', goal:'Принять решение', audience:'PO', constraints:[], exclusions:[], expectedDecision:'Выбрать действие' }, ready:false, clarification:`Уточнение ${briefCalls}` };
  }
  if (system.includes('Придумай неожиданный')) return { brief:{ question:'Как Evidence меняет качество продуктового решения?', goal:'Проверить влияние', audience:'PO', constraints:['Только проверяемые источники'], exclusions:[], expectedDecision:'Выбрать эксперимент' } };
  if (system.includes('планировщик deep research')) return { needs:[
    { title:'Механика', query:'Evidence pipeline', dods:[{criterion:'Найти реализацию'}] },
    { title:'Эффект', query:'Product decision evidence', dods:[{criterion:'Найти наблюдение'}] }
  ] };
  if (system.includes('извлекаешь Evidence')) return { evidence:[{ claim:'Каждая генерация сохраняется в отдельной папке.', quote:'separate generation folder', sourceRef:'S1', confidence:'direct', kind:'fact' }], conflicts:[], unknowns:[] };
  throw new Error(`Unexpected model prompt: ${system.slice(0, 40)}`);
}

const source = { id:'mock-local', async search() { return [{ sourceUri:'local://product-lore.md', sourceTitle:'product-lore.md', sourceKind:'local', text:'Each generation is stored in a separate generation folder.' }]; } };
const render = async ({ generationId, research, data }) => ({
  result:{ generationId, styleId:'audit', mode:'llama.cpp', visualTheme:{ colors:{} }, urls:{ data:`/api/artifact/${generationId}/data`, narrative:`/api/artifact/${generationId}/narrative`, slides:`/api/artifact/${generationId}/slides`, pptx:`/api/artifact/${generationId}/pptx` } },
  narrativeMarkdown:`# Audit\n\n[${research.evidence[0].id}]`, slidesHtml:`<section>${data.rows[0][0]}</section>`, pptx:Buffer.from('pptx'), manifestMeta:{ mode:'llama.cpp', styleId:'audit' }
});
const service = createResearchService({ modelJson, sources:[source], render, store, limits:{ timeoutMs:5000, maxSourceCalls:8, maxWebPages:0 } });

const first = await service.briefTurn({ sessionId:'user', message:'Исследуй мой исходный вопрос' });
assert.equal(first.brief.question, 'Исследуй мой исходный вопрос', 'model cannot replace the user question');
assert.equal(first.questionsAsked, 1);
const second = await service.briefTurn({ sessionId:'user', message:'Для решения Product Owner' });
assert.equal(second.questionsAsked, 2);
assert.equal(second.ready, true, 'brief becomes ready after at most two clarifications');
const third = await service.briefTurn({ sessionId:'user', message:'Дополнительное ограничение' });
assert.equal(third.questionsAsked, 2, 'clarification cap remains two');

const started = service.start({ sessionId:'user', origin:'user' });
const completed = await service.wait(started.generationId);
assert.equal(completed.state, 'complete');
assert.equal(completed.brief.question, 'Исследуй мой исходный вопрос');
const researchFile = store.artifact(started.generationId, 'research');
const research = JSON.parse(await fs.readFile(researchFile.file, 'utf8'));
assert.equal(research.evidence.length, 2);
assert.ok(research.needs.every(need => need.dods.every(dod => dod.evidenceIds.every(id => research.evidence.some(item => item.id === id)))));
for (const kind of ['data','csv','narrative','slides','pptx','research','manifest']) assert.ok(store.artifact(started.generationId, kind), `${kind} persisted`);

const reloaded = createArtifactStore(temp);
await reloaded.initialize();
assert.ok(reloaded.artifact(started.generationId, 'slides'), 'manifest index restores routes after restart');
await reloaded.begin('interrupted-generation');
const afterCrash = createArtifactStore(temp);
await afterCrash.initialize();
assert.equal(afterCrash.manifests.get('interrupted-generation').state, 'failed', 'active job is marked failed after restart');
assert.equal(isPrivateAddress('127.0.0.1'), true);
assert.equal(isPrivateAddress('192.168.1.10'), true);
assert.equal(isPrivateAddress('::ffff:127.0.0.1'), true);
assert.equal(isPrivateAddress('8.8.8.8'), false);

const random = service.start({ origin:'random' });
const randomDone = await service.wait(random.generationId);
assert.equal(randomDone.brief.origin, 'random');
assert.notEqual(randomDone.generationId, completed.generationId);

await fs.rm(temp, { recursive:true, force:true });
console.log('research audit: brief invariance · 2-question cap · Evidence integrity · atomic artifacts · restart recovery · interrupted-job failure · SSRF addresses · random brief · PASS');
