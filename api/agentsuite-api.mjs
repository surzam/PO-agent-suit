import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createSuiteExecution } from '../app/execution.mjs';
import { ensureDemoFixture } from './demo-fixture.mjs';
import { projectObservation } from '../core/observation.mjs';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const publicDir = path.join(root, 'public');
const json = (res, value, status = 200) => { res.writeHead(status, {'content-type':'application/json; charset=utf-8','cache-control':'no-store'}); res.end(JSON.stringify(value)); };
async function body(req) { let text=''; for await (const chunk of req) text += chunk; return text ? JSON.parse(text) : {}; }

function mime(file) {
  return ({'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml'})[path.extname(file)] || 'application/octet-stream';
}

export async function createAgentSuiteApi({ rootDir = path.join(root, 'workspace') } = {}) {
  await ensureDemoFixture(rootDir);
  const subscribers = new Map();
  const eventSink = event => {
    for (const listener of subscribers.get(event.runId) || []) listener(event);
  };
  const execution = await createSuiteExecution({ rootDir, eventSink });
  const runtimeFor = (workflow, mode) => execution.runtime(workflow, mode).runtime;
  async function allRuns() {
    const entries = await fs.readdir(path.join(rootDir, 'runs'), { withFileTypes:true }).catch(() => []);
    return Promise.all(entries.filter(entry => entry.isDirectory()).map(entry => runtimeFor('brief').inspect(entry.name).catch(() => null))).then(items => items.filter(Boolean).sort((a,b) => b.createdAt.localeCompare(a.createdAt)));
  }
  async function artifactById(id) {
    for (const run of await allRuns()) {
      const metadata = run.artifacts.find(item => item.id === id);
      if (!metadata) continue;
      const owner = metadata.ownerRunId || run.id;
      const file = metadata.file.split('/').at(-1);
      return JSON.parse(await fs.readFile(path.join(rootDir, 'runs', owner, 'artifacts', file), 'utf8'));
    }
    return null;
  }
  async function inspect(id) { return runtimeFor('brief').inspect(id); }
  function subscribe(runId, listener) {
    if (!subscribers.has(runId)) subscribers.set(runId, new Set());
    subscribers.get(runId).add(listener);
    return () => { subscribers.get(runId)?.delete(listener); if (!subscribers.get(runId)?.size) subscribers.delete(runId); };
  }
  async function stream(req, res, runId, url) {
    let run;
    try { run = await inspect(runId); } catch { return json(res,{error:'Run not found'},404); }
    const lastRaw = req.headers['last-event-id'] || url.searchParams.get('after') || '';
    const lastSequence = Number(String(lastRaw).split(':').at(-1)) || 0;
    let sent = lastSequence; let ended = false; let unsubscribe = () => {};
    res.writeHead(200, {'content-type':'text/event-stream; charset=utf-8','cache-control':'no-cache, no-transform','connection':'keep-alive'});
    const write = event => {
      if (event.sequence <= sent) return;
      sent = event.sequence;
      res.write(`id: ${event.eventId}\nevent: runtime\ndata: ${JSON.stringify(event)}\n\n`);
      if (event.type === 'RunCompleted' || event.type === 'RunFailed') { ended=true; res.end(); unsubscribe(); }
    };
    unsubscribe = subscribe(runId, write);
    run = await inspect(runId); // closes the inspect/subscribe race; sequence de-duplicates.
    for (const event of [...run.events].sort((a,b) => a.sequence - b.sequence)) { if (ended) break; write(event); }
    if (ended) return;
    const heartbeat = setInterval(() => res.write(': journal-live\n\n'), 15000);
    req.on('close', () => { clearInterval(heartbeat); unsubscribe(); });
  }
  async function handle(req, res) {
    const url = new URL(req.url, 'http://127.0.0.1');
    if (req.method === 'GET' && url.pathname === '/api/health') return json(res,{ok:true, runtime:'agentsuite', capabilities:execution.capabilities()});
    if (req.method === 'POST' && url.pathname === '/api/brief/turn') return json(res,{ok:true,...await execution.briefTurn(await body(req))});
    if (req.method === 'POST' && url.pathname === '/api/context') { const input=await body(req); if(!input.name||!input.content)return json(res,{error:'Context file requires name and content'},400); if(String(input.content).length>1_000_000)return json(res,{error:'Context file exceeds 1 MB'},413); return json(res,{ok:true,...execution.addContext({name:String(input.name),text:String(input.content)})},201); }
    if (req.method === 'GET' && url.pathname === '/api/runs') return json(res,{runs:await allRuns()});
    if (req.method === 'GET' && url.pathname === '/api/runtime/capabilities') return json(res,{capabilities:execution.capabilities()});
    if (req.method === 'GET' && url.pathname === '/api/roles') return json(res,{roles:execution.roleRegistry.list()});
    const eventRoute = url.pathname.match(/^\/api\/runs\/([^/]+)\/events$/);
    if (req.method === 'GET' && eventRoute) return stream(req,res,eventRoute[1],url);
    const detail = url.pathname.match(/^\/api\/runs\/([^/]+)$/);
    if (req.method === 'GET' && detail) { try { return json(res,await inspect(detail[1])); } catch { return json(res,{error:'Run not found'},404); } }
    const observation = url.pathname.match(/^\/api\/runs\/([^/]+)\/observation$/);
    if (req.method === 'GET' && observation) { try { return json(res,projectObservation(await inspect(observation[1]),{capabilities:execution.capabilities().map(item=>item.id)})); } catch { return json(res,{error:'Run not found'},404); } }
    const artifact = url.pathname.match(/^\/api\/artifacts\/([^/]+)$/);
    if (req.method === 'GET' && artifact) { const value=await artifactById(artifact[1]); return value?json(res,value):json(res,{error:'Artifact not found'},404); }
    if (req.method === 'POST' && url.pathname === '/api/runs') {
      const input=await body(req); const role=input.role || 'product-owner';
      if (!execution.roleRegistry.get(role)) return json(res,{error:`Unknown Role: ${role}`},400);
      const mode=input.mode === 'random' ? 'random' : 'custom'; const workflow=input.workflow || 'research-presentation';
      const {runtime,stages}=execution.runtime(workflow,mode);
      const launched=await runtime.launch({intent:input.intent,role,workflow,stages,allowEmptyIntent:mode==='random'});
      launched.completion.catch(error => console.error(`[AgentSuite run] ${launched.run.id}: ${error.message}`));
      return json(res,{runId:launched.run.id,status:'running'},202);
    }
    const rerun=url.pathname.match(/^\/api\/runs\/([^/]+)\/rerun$/);
    if (req.method === 'POST' && rerun) {
      const input=await body(req); const source=await inspect(rerun[1]); const role=input.role || source.role;
      if (!execution.roleRegistry.get(role)) return json(res,{error:`Unknown Role: ${role}`},400);
      const workflow=input.workflow || source.workflow; const {runtime,stages}=execution.runtime(workflow,'custom');
      const launched=await runtime.launchFork({sourceRunId:source.id,fromStage:input.from || 'synthesis',role,workflow,stages});
      launched.completion.catch(error => console.error(`[AgentSuite rerun] ${launched.run.id}: ${error.message}`));
      return json(res,{runId:launched.run.id,status:'running'},202);
    }
    if (req.method === 'GET') {
      const requested=url.pathname==='/'?'/index.html':url.pathname;
      const file=path.normalize(path.join(publicDir,requested));
      if (!file.startsWith(publicDir)) return json(res,{error:'Forbidden'},403);
      try { const data=await fs.readFile(file); res.writeHead(200,{'content-type':mime(file),'cache-control':'no-cache'}); return res.end(data); } catch {}
    }
    return json(res,{error:'Not found'},404);
  }
  return { handle, runtimeFor, subscribe };
}

export async function serveAgentSuite({ host='127.0.0.1', port=8080, rootDir } = {}) {
  const api=await createAgentSuiteApi({rootDir});
  const server=http.createServer((req,res)=>api.handle(req,res).catch(error=>{console.error(`[AgentSuite failure] ${req.method} ${req.url} ${error.message}`);json(res,{error:error.message},500);}));
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,host,resolve);});
  const address=server.address(); console.log(`AgentSuite\nListening on http://${host}:${address.port}`); return server;
}
