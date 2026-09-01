import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { createResearchService } from '../research/service.mjs';
import { createArtifactStore } from '../research/storage.mjs';
import { createSearxngSource, isPrivateAddress } from '../research/sources.mjs';

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

const source = { id:'mock-local', operationTimeoutMs:55, async search() { return [{ sourceUri:'local://product-lore.md', sourceTitle:'product-lore.md', sourceKind:'local', text:'Each generation is stored in a separate generation folder.' }]; } };
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

const hanging=http.createServer(()=>{});await new Promise(resolve=>hanging.listen(0,'127.0.0.1',resolve));
try{
  const searx=createSearxngSource({endpoint:`http://127.0.0.1:${hanging.address().port}`,rateLimitMs:0,timeoutMs:35});
  assert.equal(searx.provider,'searxng');assert.equal(searx.operationTimeoutMs,35);
  await assert.rejects(()=>searx.search({query:'bounded timeout'}),error=>error.code==='SOURCE_TIMEOUT','hanging SearXNG is aborted with typed SOURCE_TIMEOUT');
}finally{hanging.close()}

const nativeFetch=globalThis.fetch;let pageFetchCalls=0;
globalThis.fetch=async(url,{signal}={})=>{pageFetchCalls+=1;return new Promise((resolve,reject)=>{const abort=()=>reject(Object.assign(new Error('controlled fetch abort'),{name:'AbortError'}));if(signal?.aborted)abort();else signal?.addEventListener('abort',abort,{once:true})})};
try{
  const readTimeoutMs=40,readSource=createSearxngSource({endpoint:'http://127.0.0.1:1',rateLimitMs:0,timeoutMs:readTimeoutMs});
  const startedAt=Date.now();
  await assert.rejects(()=>readSource.fetch({url:'https://1.1.1.1/hanging-page',title:'hanging page'}),error=>error.code==='SOURCE_TIMEOUT','SearXNG page read uses configured timeout and preserves SOURCE_TIMEOUT');
  assert.equal(readSource.operationTimeoutMs,readTimeoutMs,'reported source-read deadline uses the same configured bound');
  assert.ok(Date.now()-startedAt<1000,'custom source-read timeout is bounded and does not fall back to 15 seconds');
  assert.equal(readSource.provider,'searxng');assert.equal(pageFetchCalls,1,'failed SearXNG read does not invoke a fallback provider');

  const abortController=new AbortController(),abortSource=createSearxngSource({endpoint:'http://127.0.0.1:1',rateLimitMs:0,timeoutMs:500});
  const aborted=abortSource.fetch({url:'https://1.1.1.1/cancelled-page',title:'cancelled page'},{signal:abortController.signal});setTimeout(()=>abortController.abort(),10);
  await assert.rejects(()=>aborted,error=>error.code==='ABORTED','caller AbortSignal remains composed with source-read timeout');
  assert.equal(pageFetchCalls,2,'AbortSignal cancellation does not invoke a fallback provider');
}finally{globalThis.fetch=nativeFetch}

const random = service.start({ origin:'random' });
const randomDone = await service.wait(random.generationId);
assert.equal(randomDone.brief.origin, 'random');
assert.notEqual(randomDone.generationId, completed.generationId);

let planAttempts=0,extractionAttempts=0;const retryEvents=[];
const retryModel=async system=>{if(system.includes('планировщик deep research')){planAttempts+=1;if(planAttempts===1)throw Object.assign(new SyntaxError('truncated plan JSON'),{code:'MALFORMED_RESPONSE'});return{needs:[{title:'A',query:'a',dods:[{criterion:'a'}]},{title:'B',query:'b',dods:[{criterion:'b'}]}]}}if(system.includes('извлекаешь Evidence')){extractionAttempts+=1;if(extractionAttempts===1)throw Object.assign(new SyntaxError('truncated evidence JSON'),{code:'MALFORMED_RESPONSE'});return{evidence:[{claim:'retry fact',quote:'retry',sourceRef:'S1',confidence:'direct',kind:'fact'}],conflicts:[],unknowns:[]}}throw new Error('unexpected retry prompt')};
const retryService=createResearchService({modelJson:retryModel,sources:[source],render,store,limits:{timeoutMs:5000,maxSourceCalls:8,maxWebPages:0}});
const retryRun=retryService.start({origin:'user',brief:{question:'Retry structured research',goal:'verify',audience:'PO'},researchOnly:true,observe:async(type,payload)=>retryEvents.push({type,payload}),createOperationId:kind=>`retry:${kind}:${retryEvents.length}`});const retryDone=await retryService.wait(retryRun.generationId);assert.equal(retryDone.state,'complete');assert.equal(planAttempts,2);assert.ok(extractionAttempts>=2);assert.ok(retryEvents.filter(event=>event.type==='InferenceFailed'&&event.payload.code==='MALFORMED_RESPONSE').length>=2,'each malformed provider response remains observable');assert.equal(new Set(retryEvents.filter(event=>event.type==='InferenceStarted').map(event=>event.payload.operationId)).size,retryEvents.filter(event=>event.type==='InferenceStarted').length,'repair retries keep distinct operation IDs');
assert.ok(retryEvents.filter(event=>event.type==='InferenceStarted').every(event=>/Z$/.test(event.payload.deadline)),'bounded research inference persists its effective deadline');
assert.ok(retryEvents.filter(event=>event.type==='CapabilityStarted').every(event=>/Z$/.test(event.payload.deadline)),'bounded source operations persist their effective deadline');

await fs.rm(temp, { recursive:true, force:true });
console.log('research audit: brief invariance · 2-question cap · Evidence integrity · atomic artifacts · restart recovery · interrupted-job failure · SSRF addresses · random brief · PASS');
