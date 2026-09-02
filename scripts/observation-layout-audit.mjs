import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { app, BrowserWindow } from 'electron';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const publicRoot=path.join(root,'public');
const mime={'.css':'text/css','.html':'text/html','.js':'text/javascript','.json':'application/json','.png':'image/png','.svg':'image/svg+xml'};
const stages=['intent-discovery','intent','brief','research','validation','synthesis','data','interactive-result','narrative','slides'];
const researchStages=stages.slice(0,7);
const state={runId:'layout-fixture',status:'running',intent:'Как убедиться, что длинный вопрос о целостности наблюдения остаётся читаемым, не пересекается с системной телеметрией и полностью доступен человеку через Inspector?',startedAt:new Date().toISOString(),elapsedMs:0,activeStage:'research',contextWorld:{roots:[],sources:[]},stages:stages.map((id,index)=>({id,label:id,state:index<3?'completed':id==='research'?'active':'future',result:{artifacts:[],reusedArtifacts:[]}})),evidence:{items:[]},outputs:[],capabilities:[],agentActions:[],terminalRecords:[],safeInputEvents:[],artifactRefs:[],dependencies:[],role:{id:'product-owner',label:'Продуктовый ракурс'},system:{process:{rssMiB:321},gpu:[{name:'Test GPU',utilization:42}]}};
const overlap=(a,b)=>a.left<b.right&&a.right>b.left&&a.top<b.bottom&&a.bottom>b.top;

const staticServer=http.createServer(async(req,res)=>{
  const pathname=decodeURIComponent(new URL(req.url,'http://127.0.0.1').pathname);
  const relative=pathname==='/'?'index.html':pathname.replace(/^\/+/, '');
  const target=path.resolve(publicRoot,relative);
  if(!target.startsWith(`${publicRoot}${path.sep}`)){res.writeHead(403).end();return}
  try{const body=await fs.readFile(target);res.writeHead(200,{'content-type':mime[path.extname(target)]||'application/octet-stream'}).end(body)}catch{res.writeHead(404).end()}
});

await app.whenReady();
await new Promise(resolve=>staticServer.listen(0,'127.0.0.1',resolve));
const port=staticServer.address().port;
const window=new BrowserWindow({width:1366,height:768,useContentSize:true,show:false,webPreferences:{contextIsolation:true,nodeIntegration:false}});

async function waitForTestSeam(){
  for(let attempt=0;attempt<40;attempt+=1){if(await window.webContents.executeJavaScript('Boolean(window.__AGENTSUITE_OBSERVATION_TEST__)'))return;await new Promise(resolve=>setTimeout(resolve,25))}
  throw new Error('Observation test seam was not exposed by the production UI');
}
async function measure(width,height){
  window.setContentSize(width,height);
  await window.loadURL(`http://127.0.0.1:${port}/?observation-test=1`);
  await waitForTestSeam();
  await window.webContents.executeJavaScript(`window.__AGENTSUITE_OBSERVATION_TEST__.render(${JSON.stringify(state)})`);
  return window.webContents.executeJavaScript(`(()=>{
    const rect=node=>{const value=node.getBoundingClientRect();return {left:value.left,right:value.right,top:value.top,bottom:value.bottom,width:value.width,height:value.height}};
    const intersects=(a,b)=>a.left<b.right&&a.right>b.left&&a.top<b.bottom&&a.bottom>b.top;
    const flow=rect(document.querySelector('.flow-surface'));
    const nodes=[...document.querySelectorAll('[data-flow-stage]')].map(node=>({id:node.dataset.flowStage,label:node.textContent.trim(),rect:rect(node),labelFits:node.querySelector('span').scrollWidth<=node.querySelector('span').clientWidth+1}));
    const main=[...document.querySelectorAll('[data-flow-region="main"] [data-flow-stage]')].map(node=>node.dataset.flowStage);
    const results=[...document.querySelectorAll('[data-flow-region="results"] [data-flow-stage]')].map(node=>({id:node.dataset.flowStage,canonicalStage:node.dataset.canonicalStage}));
    const intent=rect(document.querySelector('.intent-question h2')),telemetry=rect(document.querySelector('.system-readout'));
    return {flow,nodes,main,results,intent,telemetry,intersects:intent.width>0&&telemetry.width>0&&intersects(intent,telemetry)};
  })()`);
}

try{
  for(const [width,height] of [[1366,768],[1440,900],[1920,1080]]){
    const measured=await measure(width,height);
    assert.deepEqual(measured.main,researchStages,`${width}×${height}: main research topology remains explicit`);
    assert.deepEqual(measured.results,[{id:'narrative',canonicalStage:'narrative'},{id:'data-table',canonicalStage:'data'},{id:'slides',canonicalStage:'slides'}],`${width}×${height}: primary result topology remains explicit`);
    assert.equal(measured.nodes.length,10,`${width}×${height}: every declared research and primary result node is rendered`);
    assert.equal(measured.intersects,false,`${width}×${height}: Intent and telemetry do not intersect`);
    for(const node of measured.nodes){assert.ok(node.rect.left>=measured.flow.left&&node.rect.right<=measured.flow.right&&node.rect.top>=measured.flow.top&&node.rect.bottom<=measured.flow.bottom,`${width}×${height}: ${node.id} stays inside Flow`);assert.equal(node.labelFits,true,`${width}×${height}: ${node.id} label remains readable`)}
    for(let index=0;index<measured.nodes.length;index+=1)for(let next=index+1;next<measured.nodes.length;next+=1)assert.equal(overlap(measured.nodes[index].rect,measured.nodes[next].rect),false,`${width}×${height}: Flow nodes do not overlap`);
  }
  const broken=await window.webContents.executeJavaScript(`(()=>{const telemetry=document.querySelector('.system-readout'),intent=document.querySelector('.intent-question h2');telemetry.style.cssText='position:absolute;left:0;top:0';const a=intent.getBoundingClientRect(),b=telemetry.getBoundingClientRect();return a.left<b.right&&a.right>b.left&&a.top<b.bottom&&a.bottom>b.top})()`);
  assert.equal(broken,true,'overlap detector rejects a controlled broken production DOM variant');
  console.log('observation layout audit: production DOM · explicit topology · responsive geometry · PASS');
} finally {
  await window.close();
  await new Promise(resolve=>staticServer.close(resolve));
  app.quit();
}
