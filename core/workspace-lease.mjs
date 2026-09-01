import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

const leaseName='.agentsuite-runtime-lease';
async function processStartTime(pid=process.pid){
  return fs.readFile(`/proc/${pid}/stat`,'utf8').then(text=>text.slice(text.lastIndexOf(')')+2).trim().split(/\s+/)[19]||null).catch(()=>null);
}
async function ownerIsLive(owner){
  if(!owner?.pid)return false;
  try{process.kill(Number(owner.pid),0)}catch{return false}
  const current=await processStartTime(Number(owner.pid));
  return !owner.processStartTime||!current||String(owner.processStartTime)===String(current);
}
export async function acquireWorkspaceLease(rootDir,{runtimeInstanceId=`runtime-${process.pid}-${Date.now()}`}={}){
  const workspace=path.resolve(rootDir),directory=path.join(workspace,leaseName),token=crypto.randomUUID();
  await fs.mkdir(workspace,{recursive:true});
  try{await fs.mkdir(directory)}catch(error){
    if(error.code!=='EEXIST')throw error;
    const owner=await fs.readFile(path.join(directory,'owner.json'),'utf8').then(JSON.parse).catch(()=>null);
    if(!owner)throw Object.assign(new Error('Workspace lease exists but owner is unknown'),{code:'WORKSPACE_LEASE_AMBIGUOUS'});
    if(await ownerIsLive(owner))throw Object.assign(new Error(`Workspace is already owned by Runtime ${owner.runtimeInstanceId||owner.pid}`),{code:'WORKSPACE_LEASE_ACTIVE'});
    await fs.rm(directory,{recursive:true,force:false});await fs.mkdir(directory);
  }
  const owner={runtimeInstanceId,leaseToken:token,pid:process.pid,processStartTime:await processStartTime(),createdAt:new Date().toISOString()};
  try{await fs.writeFile(path.join(directory,'owner.json'),JSON.stringify(owner,null,2));}
  catch(error){await fs.rm(directory,{recursive:true,force:true});throw error}
  let released=false;
  return {directory,owner,async release(){if(released)return;released=true;const current=await fs.readFile(path.join(directory,'owner.json'),'utf8').then(JSON.parse).catch(()=>null);if(current?.leaseToken===token)await fs.rm(directory,{recursive:true,force:true})}};
}
