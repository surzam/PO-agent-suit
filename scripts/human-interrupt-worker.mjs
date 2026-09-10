import {createRuntime} from '../core/runtime.mjs';
import {createHarnessRegistry} from '../core/registry.mjs';
import {projectHumanInterrupts} from '../core/human-interrupt.mjs';
const [phase,root,runId,option='technical']=process.argv.slice(2);
const boundary={id:'process-boundary',inputs:[],outputs:[],async execute(){return{artifacts:[],events:[],halt:{interrupt:{kind:'choice',prompt:'Какой ракурс использовать?',options:[{id:'technical',label:'Технический'},{id:'product',label:'Продуктовый'}],continuation:{stageId:'process-synthesis'}}}}}};
const synthesis={id:'process-synthesis-harness',inputs:[],outputs:['ProcessRestartArtifact'],async execute({humanResponse}){return{artifacts:[{type:'ProcessRestartArtifact',data:{marker:`process-${humanResponse.optionId}`}}],events:[]}}};
const stages=[{id:'process-boundary-stage',harnessId:boundary.id},{id:'process-synthesis',harnessId:synthesis.id}],definition={requiredArtifacts:['ProcessRestartArtifact']},runtime=createRuntime({rootDir:root,registry:createHarnessRegistry([boundary,synthesis]),observability:true,runtimeInstanceId:`worker-${process.pid}`});
if(phase==='start'){const launched=await runtime.launch({intent:'process restart acceptance',workflow:'process-demo',stages,workflowDefinition:definition});await launched.completion;process.stdout.write(launched.run.id);}
else if(phase==='respond'){const run=await runtime.inspect(runId),interrupt=projectHumanInterrupts(run.events).find(item=>item.state==='pending'),result=await runtime.respondToInterrupt(interrupt.id,{optionId:option},{stages,workflowDefinition:definition});if(!result.accepted)throw new Error(result.reasonCode);await result.completion;process.stdout.write('completed');}
else throw new Error('Unknown worker phase');
