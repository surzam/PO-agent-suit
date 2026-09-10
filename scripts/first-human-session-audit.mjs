import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createLiveSessionState} from '../interop/ag-ui/session.mjs';
import {materializeUIIntent} from '../interop/ag-ui/ui-intents.mjs';

const temp=await fs.mkdtemp(path.join(os.tmpdir(),'agentsuite-first-human-'));
const model=http.createServer(async(req,res)=>{
  let raw=''; for await(const chunk of req) raw+=chunk;
  const system=JSON.parse(raw||'{}').messages?.[0]?.content||''; let value={};
  if(system.includes('Intent Discovery Harness')) value={status:'discovered',question:'Исследуй локальных AI-агентов',reason:'Есть локальные источники.',relevance:'Нужен ответ.',expectedDecision:'Выбрать направление.',requiredContext:[]};
  else if(system.includes('планировщик deep research')) value={needs:[{title:'Источник 1',query:'AI agents 1',dods:[{criterion:'Проверить факт 1'}]},{title:'Источник 2',query:'AI agents 2',dods:[{criterion:'Проверить факт 2'}]},{title:'Источник 3',query:'AI agents 3',dods:[{criterion:'Проверить факт 3'}]}]};
  else if(system.includes('извлекаешь Evidence')) value={evidence:[{claim:'Проверяемый факт',quote:'Проверяемый факт',sourceRef:'S1',confidence:'direct',kind:'fact'}],conflicts:[],unknowns:[]};
  else if(system.includes('Synthesis Harness AgentSuite')) value={objective:'Исследование',audience:'Product Owner',keyClaims:[{id:'C1',claim:'Факт подтверждён',evidenceIds:['E001'],kind:'evidence-backed'}],uncertainties:[],structure:['evidence'],requestedOutputs:['presentation']};
  res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({choices:[{message:{content:JSON.stringify(value)}}]}));
});
await new Promise(resolve=>model.listen(0,'127.0.0.1',resolve));
process.env.LLAMA_BASE_URL=`http://127.0.0.1:${model.address().port}/v1`;process.env.LLAMA_MODEL='first-human-audit';process.env.PO_RESEARCH_WEB='0';process.env.PO_WORKSPACE_DIR=temp;
const {createAgentSuiteApi}=await import('../api/agentsuite-api.mjs');const api=await createAgentSuiteApi({rootDir:temp});const httpServer=http.createServer((req,res)=>api.handle(req,res));await new Promise(resolve=>httpServer.listen(0,'127.0.0.1',resolve));const base=`http://127.0.0.1:${httpServer.address().port}`;
const request=async(url,options)=>{const response=await fetch(base+url,options);let value=null;try{value=await response.json()}catch{}return{response,value}};
try{
  console.log('PHASE: clean-slate');const html=await(await fetch(base+'/')).text();assert.match(html,/БЕСКОНЕЧНЫЙ РАКУРС|Следующая история ещё не существует/);assert.doesNotMatch(html,/EvidenceSet|DataArtifact|AG-UI/);
  console.log('PHASE: question-submitted');const start=await request('/api/runs',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({intent:'Исследуй локальных AI-агентов',mode:'random',workflow:'research-presentation',role:'product-owner',launchRequestId:'first-human-session-001'})});assert.equal(start.response.status,202);let run;for(let i=0;i<200;i++){await new Promise(resolve=>setTimeout(resolve,25));run=(await request(`/api/runs/${start.value.runId}`)).value;if(['completed','failed','cancelled'].includes(run.status))break;}assert.equal(run.status,'completed');
  console.log('PHASE: active-research');const observation=(await request(`/api/runs/${run.id}/observation`)).value;assert.ok(observation.contextWorld.sources.length>=1);assert.ok(observation.evidence.items.length>=1);const session=createLiveSessionState(run,{observation});const source=materializeUIIntent({intent:{type:'SHOW_SOURCE',source:'agent',refs:{sourceRef:observation.contextWorld.sources[0].sourceId}},session,surfaces:session.surfaceState.items});const fact=materializeUIIntent({intent:{type:'SHOW_EVIDENCE',source:'agent',refs:{evidenceRef:observation.evidence.items[0].id}},session,surfaces:session.surfaceState.items});assert.ok(source.surface&&fact.surface);
  console.log('PHASE: sources-and-facts');assert.ok(observation.outputs.some(item=>item.type==='Narrative'));assert.ok(observation.outputs.some(item=>item.type==='DataArtifact'));assert.ok(observation.outputs.some(item=>item.type==='Presentation'));assert.equal(session.surfaceState.items.some(item=>item.kind==='interactive-result'),false);
  console.log('PHASE: results');console.log('PHASE: historical');assert.deepEqual(createLiveSessionState(run,{observation}).surfaceComposition,session.surfaceComposition);console.log('first human session audit: HTTP launch · real Runtime/harness · human labels · grounded surfaces · results · historical rebuild · PASS');
}finally{httpServer.close();await api.close();model.close();await fs.rm(temp,{recursive:true,force:true,maxRetries:3,retryDelay:50}).catch(()=>{})}
