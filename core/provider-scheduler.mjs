import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';

const queues=new Map();
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));

function alive(pid){try{process.kill(Number(pid),0);return true}catch{return false}}

export function createProviderScheduler({providerId='local-model',crossProcess=true}={}){
  const key=createHash('sha256').update(providerId).digest('hex').slice(0,16);
  const lockDir=path.join(os.tmpdir(),`agentsuite-provider-${key}.lock`);
  let tail=queues.get(key)||Promise.resolve();
  async function acquire(signal){
    if(!crossProcess)return async()=>{};
    while(true){
      if(signal?.aborted)throw Object.assign(new Error('Operation cancelled'),{code:'ABORTED'});
      try{await fs.mkdir(lockDir);await fs.writeFile(path.join(lockDir,'owner.json'),JSON.stringify({pid:process.pid,at:new Date().toISOString()}));return async()=>fs.rm(lockDir,{recursive:true,force:true});}
      catch(error){
        if(error.code!=='EEXIST')throw error;
        const owner=await fs.readFile(path.join(lockDir,'owner.json'),'utf8').then(JSON.parse).catch(()=>null);
        if(!owner||!alive(owner.pid)){await fs.rm(lockDir,{recursive:true,force:true});continue}
        await wait(100);
      }
    }
  }
  async function schedule(task,{signal}={}){
    let releaseTurn;const turn=new Promise(resolve=>{releaseTurn=resolve});const previous=tail;tail=previous.then(()=>turn);queues.set(key,tail);
    await previous;
    let releaseLease=async()=>{};
    try{releaseLease=await acquire(signal);return await task()}
    finally{await releaseLease();releaseTurn();if(queues.get(key)===tail)queues.delete(key)}
  }
  return{schedule,providerId};
}
