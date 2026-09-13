import {createHash} from 'node:crypto';
import {resolveSubjectMetric} from './metric-chart.mjs';
import {presentLimitation} from '../public/ui/statement-presentation.js';

const identity=(kind,value)=>`${kind}:${createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0,20)}`;
export const TEXT_POLICY_VERSION=1;
export const AUTHORITY_LIMIT='Причинность не установлена; статистическая значимость не проверена.';

// An objective is a quoted task, not an assertion about its answer. Candidate
// model wording never determines the task's provenance or authority.
export function taskStatement(brief){
  const task=String(brief?.data?.question||brief?.data?.goal||'').trim();
  return {id:identity('task',[brief?.id,task]),statementKind:'task',epistemicClass:'task-framing',
    sourceArtifactIds:brief?.id?[brief.id]:[],text:task?`Задача исследования (не вывод): «${task}»`:'Исследовательская задача не сохранена.'};
}

export function canonicalLimitations(evidenceSet={},validation={}){
  const result=[];
  for(const [artifact,record] of [[evidenceSet,evidenceSet.data?.metadata||{}],[validation,validation.data||{}]]){
    for(const field of ['unknowns','conflicts'])for(const text of presentLimitation(record[field])){
      const id=identity('limitation',[artifact.id,field,text]);
      result.push({id,statementKind:'limitation',epistemicClass:'uncertain',sourceArtifactIds:artifact.id?[artifact.id]:[],field,
        text:`${field==='conflicts'?'Зафиксировано расхождение':'Зафиксировано ограничение'}: «${text}»`});
    }
  }
  result.push({id:'limitation:no-causal-or-statistical-verification',statementKind:'limitation',epistemicClass:'uncertain',sourceArtifactIds:[],field:'authority',text:AUTHORITY_LIMIT});
  return [...new Map(result.map(l=>[l.text,l])).values()];
}

export function objectiveText(synthesis={}){
  const task=synthesis.textContext?.task;
  return task?.statementKind==='task'&&task.epistemicClass==='task-framing'?task.text:'Исследовательская задача не сохранена.';
}

export function limitationStatements(synthesis={}){
  return synthesis.textContext?.limitations||[{id:'limitation:legacy-text-unverified',statementKind:'limitation',epistemicClass:'uncertain',text:'Доказательность старого текстового результата не установлена.'},
    {id:'limitation:no-causal-or-statistical-verification',statementKind:'limitation',epistemicClass:'uncertain',text:AUTHORITY_LIMIT}];
}

// Closed, reviewable numeric wording: values are calculated by the existing
// cell resolver. Candidate prose and candidate numbers are never operands.
export function metricStatement(dataArtifact,metric,{digits=3}={}){
  if(![1,3].includes(digits))throw new Error('Unsupported numeric display precision');
  const data=dataArtifact?.data||{},value=resolveSubjectMetric(data,metric);
  if(value===null)return null;
  const ratio=metric.unit==='ratio',displayValue=ratio?value*100:value;
  const unit=ratio||metric.unit==='percent'?'%':metric.unit==='percentage-points'?'п.п.':metric.unit||'';
  const display=Number(displayValue.toFixed(digits));
  let text=`В предоставленных данных «${metric.name}»: ${display} ${unit}.`;
  if(metric.operator==='percentage-point-difference'&&metric.metricRefs?.length===2){
    const [a,b]=metric.formula.inputs.map(id=>data.subjectMetrics.find(m=>m.id===id));
    text=`В предоставленных данных значение для «${a.name}» ${value<0?'ниже':value>0?'выше':'совпадает со значением для'}${value===0?'':' значения для'} «${b.name}»${value===0?'':` на ${Number(Math.abs(value).toFixed(digits))} п.п.`}.`;
  }
  return {id:`statement:${metric.id}`,statementKind:'measurement',epistemicClass:'observation',attributionMode:'provided-data',
    metricRefs:[metric.id,...(metric.metricRefs||[])],claimRefs:[],sourceArtifactIds:[dataArtifact.id],cellRefs:[...metric.cellRefs],rowRefs:[...metric.rowRefs],
    semanticValue:value,semanticUnit:metric.unit,display:{digits,value:display,unit},causalAuthority:false,statisticalAuthority:'not-verified',text:`${text} ${AUTHORITY_LIMIT}`};
}

export function metricStatements(dataArtifact){
  const metrics=dataArtifact?.data?.subjectMetrics||[];
  const derived=metrics.filter(m=>['ratio','percentage-point-difference'].includes(m.operator));
  return (derived.length?derived:metrics.filter(m=>m.operator==='direct'))
    .map(m=>metricStatement(dataArtifact,m)).filter(Boolean);
}

export function validateMetricWording(candidate,dataArtifact){
  if(!Array.isArray(candidate?.metricRefs)||candidate.metricRefs.length!==1)return{accepted:false,reason:'one-metric-reference-required'};
  const metric=dataArtifact?.data?.subjectMetrics?.find(m=>m.id===candidate.metricRefs[0]);
  const statement=metricStatement(dataArtifact,metric);
  if(!statement)return{accepted:false,reason:'unresolved-metric'};
  return {accepted:candidate.text===statement.text,reason:candidate.text===statement.text?null:'noncanonical-wording',statement};
}
