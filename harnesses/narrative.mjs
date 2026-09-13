import {dataRefsForEvidence} from './data-substrate.mjs';
import {buildNarrativeArgument,materializeNarrativeMarkdown} from '../core/narrative-argument.mjs';
import {presentStatement} from '../public/ui/statement-presentation.js';

// Accept the legacy callback option for callers; it no longer authors text.
export function createNarrativeHarness(_options={}) {
  return {id:'narrative',version:2,consumes:['NarrativeRequested'],produces:['NarrativeCreated','NarrativeCompleted'],
    inputs:['SynthesisPlan','DataArtifact','ValidationReport'],outputs:['Narrative'],async execute({run,artifacts}) {
      const synthesis=artifacts.find(a=>a.type==='SynthesisPlan'),data=artifacts.find(a=>a.type==='DataArtifact'),validation=artifacts.find(a=>a.type==='ValidationReport');
      if(!synthesis||!data)throw new Error('Narrative Harness requires SynthesisPlan and DataArtifact');
      const argument=buildNarrativeArgument({synthesis:synthesis.data,validationReport:validation?.data||{},dataArtifact:data});
      const demo=Boolean(data.data.showcase||data.data.sourceKind==='example');
      const content=(demo?'Учебный пример\n\n':'')+materializeNarrativeMarkdown(argument);
      return {artifacts:[{type:'Narrative',sourceArtifactIds:[synthesis.id,data.id,...(validation?[validation.id]:[])],data:{
        schemaVersion:2,runId:run.id,intentArtifactId:synthesis.data.intentArtifactId||null,synthesisPlanArtifactId:synthesis.id,dataArtifactId:data.id,
        validationReportArtifactId:validation?.id||null,audience:synthesis.data.audience,...argument,demo,showcase:data.data.showcase||null,content,narrativeMarkdown:content,
        sections:argument.claimDetails.map(c=>({title:'Сведения из источника',thesis:presentStatement(c).text,humanStatement:presentStatement(c),claimIds:c.refType==='claim'?[c.id]:[],evidenceIds:c.evidenceIds,dataRefs:dataRefsForEvidence(data,c.evidenceIds)}))}}],
        events:[{type:'NarrativeCreated',payload:{synthesisPlanArtifactId:synthesis.id,dataArtifactId:data.id,sections:argument.claimDetails.length}},{type:'NarrativeCompleted',payload:{synthesisPlanArtifactId:synthesis.id}}]};
    }};
}
