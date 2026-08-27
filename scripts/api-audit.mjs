import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'po-api-audit-'));
const model = http.createServer(async (req, res) => {
  let raw=''; for await (const chunk of req) raw += chunk;
  const request = JSON.parse(raw || '{}');
  const system = request.messages?.[0]?.content || '';
  let value;
  if (system.includes('редактор исследовательского задания')) value = { brief:{ question:'Подмена запрещена', goal:'Понять Evidence pipeline', audience:'Product Owner', constraints:['Локальные источники'], exclusions:[], expectedDecision:'Выбрать улучшение' }, ready:true, clarification:'' };
  else if (system.includes('планировщик deep research')) value = { needs:[{ title:'Продуктовый лор', query:'PO Agent Suite Data Narrative Slides', dods:[{criterion:'Найти описание артефактов'}] },{ title:'Исследовательский pipeline', query:'Evidence ResearchBrief source', dods:[{criterion:'Найти проверяемую механику'}] }] };
  else if (system.includes('извлекаешь Evidence')) value = { evidence:[{ claim:'Приложение создаёт связанные Data, Narrative и Slides.', quote:'Data, Narrative и Slides', sourceRef:'S1', confidence:'direct', kind:'fact' }], conflicts:[], unknowns:['Эффект ещё не измерен на production-данных.'] };
  else if (system.includes('старший Product Owner')) value = { topic:'Evidence меняет качество решения', audience:'Product Owner', centralThesis:'Связь вывода с источником делает решение проверяемым.', motto:'Проверяемая опора сокращает путь от вопроса к совместному решению', situation:'Команде нужен ответ, происхождение которого можно открыть.', evidence:['E001'], unknowns:['Нет production-замера'], nextStep:'Проверить pipeline на реальном исследовательском заказе.', scenes:Array.from({length:6},(_,i)=>({ index:i+1,title:`Проверяемая мысль ${i+1}`,thesis:`Сцена ${i+1} переводит Evidence в решение.`,evidenceIds:[i%2?'E002':'E001'],speakerScript:`Сначала откроем источник для сцены ${i+1}. Затем свяжем наблюдение с конкретным решением Product Owner.`,transition:'Теперь проверим следующее последствие.',visualType:['statement','comparison','table','flow','quote','roadmap'][i] })) };
  else value = { error:'unexpected prompt' };
  res.writeHead(200, { 'content-type':'application/json' });
  res.end(JSON.stringify({ choices:[{ message:{ content:JSON.stringify(value) } }] }));
});
await new Promise(resolve => model.listen(0, '127.0.0.1', resolve));
const modelPort = model.address().port;
const child = spawn(process.execPath, ['server.mjs'], { cwd:new URL('..', import.meta.url), env:{ ...process.env, PORT:'0', LLAMA_BASE_URL:`http://127.0.0.1:${modelPort}/v1`, LLAMA_MODEL:'audit-8b', PO_RESEARCH_WEB:'0', PO_WORKSPACE_DIR:temp }, stdio:['ignore','pipe','pipe'] });
let output='';
const appPort = await new Promise((resolve, reject) => {
  const timer=setTimeout(()=>reject(new Error(`server startup timeout: ${output}`)),10000);
  child.stdout.on('data',chunk=>{output+=chunk;const match=output.match(/localhost:(\d+)/);if(match){clearTimeout(timer);resolve(Number(match[1]))}});
  child.stderr.on('data',chunk=>{output+=chunk});child.once('exit',code=>reject(new Error(`server exited ${code}: ${output}`)));
});
const base=`http://127.0.0.1:${appPort}`;
const request=async (url,options)=>{const response=await fetch(base+url,options);const value=await response.json();return {response,value}};

try {
  const health=await request('/api/health');assert.equal(health.response.status,200);assert.equal(health.value.generationVersion,'3.0.0-deep-research-phase1');assert.deepEqual(health.value.sources,['local']);
  const turn=await request('/api/brief/turn',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({message:'Исследуй, как Evidence улучшает решения Product Owner'})});
  assert.equal(turn.value.brief.question,'Исследуй, как Evidence улучшает решения Product Owner');assert.equal(turn.value.ready,true);
  const start=await request('/api/generations',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({origin:'user'})});assert.equal(start.response.status,202);
  let job;
  for(let attempt=0;attempt<100;attempt+=1){await new Promise(resolve=>setTimeout(resolve,50));job=(await request(`/api/generations/${start.value.generationId}`)).value;if(['complete','failed'].includes(job.state))break}
  assert.equal(job.state,'complete',job.error);assert.equal(job.result.generationId,start.value.generationId);assert.equal(job.result.slides.scenes.length,6);
  for(const kind of ['data','narrative','slides','pptx','research']){const response=await fetch(base+job.result.urls[kind]);assert.equal(response.status,200,kind);assert.ok((await response.arrayBuffer()).byteLength>0,kind)}
  const folder=path.join(temp,'exports',job.generationId);for(const file of ['data.json','data.csv','narrative.md','slides.html','legacy.pptx','research.json','manifest.json'])await fs.access(path.join(folder,file));
  console.log('api audit: health · brief · 202 job · polling · model-only StoryPlan · five artifact routes · seven persisted files · PASS');
} finally {
  child.kill();model.close();await fs.rm(temp,{recursive:true,force:true});
}
