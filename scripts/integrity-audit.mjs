import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { acquireWorkspaceLease } from '../core/workspace-lease.mjs';
import { createAgentSuiteApi } from '../api/agentsuite-api.mjs';

const temp=await fs.mkdtemp(path.join(os.tmpdir(),'agentsuite-integrity-'));
let api,server;
try{
  const first=await acquireWorkspaceLease(path.join(temp,'lease'));await assert.rejects(()=>acquireWorkspaceLease(path.join(temp,'lease')),error=>error.code==='WORKSPACE_LEASE_ACTIVE');await first.release();
  const staleRoot=path.join(temp,'stale');await fs.mkdir(path.join(staleRoot,'.agentsuite-runtime-lease'),{recursive:true});await fs.writeFile(path.join(staleRoot,'.agentsuite-runtime-lease','owner.json'),JSON.stringify({pid:999999999,processStartTime:'1',runtimeInstanceId:'dead'}));const stale=await acquireWorkspaceLease(staleRoot);await stale.release();
  const rootDir=path.join(temp,'api');api=await createAgentSuiteApi({rootDir});await assert.rejects(()=>createAgentSuiteApi({rootDir}),error=>error.code==='WORKSPACE_LEASE_ACTIVE');server=http.createServer((req,res)=>api.handle(req,res).catch(error=>{res.writeHead(error.statusCode||500,{'content-type':'application/json'});res.end(JSON.stringify({error:error.code||'ERROR'}))}));await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base=`http://127.0.0.1:${server.address().port}`;
  await assert.rejects(()=>createAgentSuiteApi({rootDir:path.join(temp,'remote'),bindHost:'0.0.0.0'}),error=>error.code==='NON_LOOPBACK_AUTH_REQUIRED');
  const request=(url,options={})=>fetch(base+url,options);
  const foreign={method:'POST',headers:{'content-type':'application/json',origin:'https://evil.example'},body:JSON.stringify({launchRequestId:'foreign-launch',mode:'random',workflow:'brief'})};
  assert.equal((await request('/api/runs',foreign)).status,403,'foreign Origin cannot launch');
  assert.equal((await request('/api/runs',{...foreign,headers:{'content-type':'application/json',origin:'https://evil.example',host:'evil.example'},body:JSON.stringify({launchRequestId:'foreign-host',mode:'random',workflow:'brief'})})).status,403,'foreign Host cannot launch');
  assert.equal((await request('/api/context',{...foreign,body:JSON.stringify({name:'x.md',content:'x'})})).status,403,'foreign Origin cannot mutate context');
  assert.equal((await request('/api/ag-ui',{...foreign,body:'{}'})).status,403,'foreign Origin cannot use AG-UI write path');
  const oversized='x'.repeat(140000),oversizedResponse=await request('/api/runs',{method:'POST',headers:{'content-type':'application/json','content-length':String(oversized.length)},body:oversized});assert.equal(oversizedResponse.status,413,'oversized launch body is rejected before buffering');
  console.log('integrity audit: workspace lease · stale recovery · Origin boundary · streaming body limits · PASS');
}finally{if(server)await new Promise(resolve=>server.close(resolve));await api?.close?.();await fs.rm(temp,{recursive:true,force:true})}
