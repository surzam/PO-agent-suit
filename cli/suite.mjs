#!/usr/bin/env node
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createSuiteExecution } from '../app/execution.mjs';
import { acquireWorkspaceLease } from '../core/workspace-lease.mjs';

const root=path.dirname(path.dirname(fileURLToPath(import.meta.url))),args=process.argv.slice(2),runtimeRoot=path.resolve(process.env.PO_RUNTIME_ROOT||path.join(root,'workspace'));
const option=(name,fallback)=>{const index=args.indexOf(name);return index>=0?(args[index+1]||fallback):fallback};
const requestId=()=>`cli-${Date.now()}-${Math.random().toString(36).slice(2,10)}`;
function usage(){console.log('suite run [--role role] [--workflow workflow] "intent"');console.log('suite rerun <run-id> --from <stage>');console.log('suite inspect <run-id>');console.log('suite serve [--host host] [--port port]')}

const command=args[0];
if(command==='serve'){
  const{serveAgentSuite}=await import('../api/agentsuite-api.mjs');await serveAgentSuite({host:option('--host','127.0.0.1'),port:Number(option('--port','8080')),rootDir:runtimeRoot,authToken:process.env.PO_AGENT_AUTH_TOKEN||null});
}else{
  const lease=['run','rerun'].includes(command)?await acquireWorkspaceLease(runtimeRoot):null;
  try{
  const execution=await createSuiteExecution({rootDir:runtimeRoot});
  if(command==='run'){
    const flags=new Set(['--role','--workflow','--temperature','--style']),intentParts=[];for(let index=1;index<args.length;index+=1){if(flags.has(args[index])){index+=1;continue}intentParts.push(args[index])}
    const intent=intentParts.join(' ').trim(),role=option('--role','product-owner'),workflow=option('--workflow','brief');if(!execution.roleRegistry.get(role))throw new Error(`Unknown Role: ${role}`);
    const{runtime,stages,definition}=execution.runtime(workflow,'custom');await runtime.recoverOrphanedRuns();const run=await runtime.run({intent,role,workflow,stages,workflowDefinition:definition,launchRequestId:requestId()});console.log(JSON.stringify({id:run.id,status:run.status,reasonCode:run.reasonCode,role:run.role,workflow:run.workflow,artifacts:run.artifacts},null,2));
  }else if(command==='rerun'&&args[1]){
    const inspector=execution.runtime('brief','custom').runtime,source=await inspector.inspect(args[1]),workflow=option('--workflow',source.workflow),role=option('--role',source.role),fromStage=option('--from');if(!execution.roleRegistry.get(role))throw new Error(`Unknown Role: ${role}`);
    const{runtime,stages,definition}=execution.runtime(workflow,'custom');await runtime.recoverOrphanedRuns();const run=await runtime.fork({sourceRunId:source.id,fromStage,role,workflow,stages,workflowDefinition:definition,launchRequestId:requestId()});console.log(JSON.stringify({id:run.id,parentRunId:run.parentRunId,status:run.status,reasonCode:run.reasonCode,reusedArtifactIds:run.reusedArtifactIds,artifacts:run.artifacts},null,2));
  }else if(command==='inspect'&&args[1]){
    const run=await execution.runtime('brief','custom').runtime.inspect(args[1]);console.log(`Run ${run.id}\nIntent: ${run.intent}\nRole: ${run.role}\nWorkflow: ${run.workflow}\nStatus: ${run.status}${run.reasonCode?`\nReason: ${run.reasonCode}`:''}${run.parentRunId?`\nParent: ${run.parentRunId}`:''}\n\nTimeline`);for(const event of run.events)console.log(`- ${event.type} · ${event.at}${event.payload?.message?` · ${event.payload.message}`:''}`);console.log('\nArtifacts');const types=new Map(run.artifacts.map(item=>[item.id,item.type]));for(const artifact of run.artifacts)console.log(`- ${artifact.type}${artifact.sourceArtifactIds?.length?` ← ${artifact.sourceArtifactIds.map(id=>types.get(id)||id).join(', ')}`:''} · ${artifact.file}`);
  }else{usage();process.exitCode=1}
  }finally{await lease?.release()}
}
