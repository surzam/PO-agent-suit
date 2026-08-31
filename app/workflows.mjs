const DEFINITIONS = Object.freeze({
  brief: { stages:['brief'], requiredArtifacts:['Brief'] },
  research: { stages:['brief','research'], requiredArtifacts:['EvidenceSet'] },
  'research-validated': { stages:['brief','research','validation'], requiredArtifacts:['EvidenceSet','ValidationReport'] },
  'research-synthesis': { stages:['brief','research','validation','synthesis'], requiredArtifacts:['SynthesisPlan'] },
  'research-narrative': { stages:['brief','research','validation','synthesis','data','narrative'], requiredArtifacts:['DataArtifact','Narrative'] },
  'research-analysis': { stages:['brief','research','validation','synthesis','data','narrative'], requiredArtifacts:['DataArtifact','Narrative'] },
  'research-presentation': {
    stages:['brief','research','validation','synthesis','data','narrative','slides'],
    requiredArtifacts:['DataArtifact','Narrative','Presentation'],
    requiredMaterializations:[
      { type:'DataArtifact', field:'rows' },
      { type:'Narrative', field:'content' },
      { type:'Presentation', field:'html' }
    ]
  }
});

export function workflowDefinition(workflow = 'brief', mode = 'custom') {
  const base=DEFINITIONS[workflow];
  if(!base) throw Object.assign(new Error(`Unknown workflow: ${workflow}`),{code:'UNKNOWN_WORKFLOW'});
  const origin=mode==='random'?{id:'intent-discovery',harnessId:'intent-discovery',requestEvent:'IntentDiscoveryRequested'}:{id:'intent',harnessId:'intent'};
  const stageMap={
    brief:{id:'brief',harnessId:'brief'},
    research:{id:'research',harnessId:'research',requestEvent:'ResearchRequested'},
    validation:{id:'validation',harnessId:'validation',requestEvent:'ValidationRequested'},
    synthesis:{id:'synthesis',harnessId:'synthesis',requestEvent:'SynthesisRequested',config:{requestedOutputs:['decision-memo','presentation']}},
    data:{id:'data',harnessId:'data',requestEvent:'DataRequested'},
    narrative:{id:'narrative',harnessId:'narrative',requestEvent:'NarrativeRequested'},
    slides:{id:'slides',harnessId:'slides',requestEvent:'PresentationRequested'}
  };
  return Object.freeze({id:workflow,mode,stages:[origin,...base.stages.map(id=>stageMap[id])],requiredArtifacts:[...(base.requiredArtifacts||[])],requiredMaterializations:[...(base.requiredMaterializations||[])]});
}

export function workflowNames(){return Object.keys(DEFINITIONS)};
