import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createRuntime } from '../core/runtime.mjs';
import { createResearchHarness } from '../harnesses/research.mjs';
import { createResearchService } from '../research/service.mjs';
import { createArtifactStore } from '../research/storage.mjs';
import { createHarnessRegistry } from '../core/registry.mjs';
import { briefHarness } from '../harnesses/brief.mjs';
import { validationHarness } from '../harnesses/validation.mjs';
import { createSynthesisHarness } from '../harnesses/synthesis.mjs';
import { createNarrativeHarness } from '../harnesses/narrative.mjs';
import { createDataHarness } from '../harnesses/data.mjs';
import { createSlidesHarness } from '../harnesses/slides.mjs';
import { createPresentationStoryPlannerHarness } from '../harnesses/presentation-story-planner.mjs';
import { dataFromEvidence } from '../research/service.mjs';

process.env.PO_AGENT_NO_LISTEN = '1';
const { narrativeMarkdown, slidesHtml, resolvePresentationStyle } = await import('../server.mjs');

const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'agentsuite-runtime-'));
try {
  const registry = createHarnessRegistry([briefHarness]);
  const runtime = createRuntime({ rootDir: temp, registry });
  const run = await runtime.run({ intent: 'Проверить минимальный runtime', role: 'product-owner', workflow: 'executive-review', stages:[{ harnessId:'brief' }] });
  assert.match(run.id, /^run-/);
  assert.equal(run.status, 'completed');
  assert.equal(run.role, 'product-owner');
  assert.equal(run.workflow, 'executive-review');
  assert.deepEqual(run.events.map(event => event.type), ['RunRequested','RunLaunching','RunStarted','ArtifactCreated', 'BriefCreated', 'RunCompleted']);
  assert.equal(run.artifacts.length, 1);
  const inspected = await runtime.inspect(run.id);
  assert.equal(inspected.id, run.id);
  assert.equal(inspected.events.at(-1).type, 'RunCompleted');
  await fs.access(path.join(temp, 'runs', run.id, 'events.jsonl'));
  await fs.access(path.join(temp, 'runs', run.id, 'artifacts', run.artifacts[0].file.split('/').at(-1)));
  await assert.rejects(() => runtime.run({ intent: '', stages:[{ harnessId:'brief' }] }), /requires an intent/);
  const legacyStore = createArtifactStore(path.join(temp, 'legacy-exports'));
  await legacyStore.initialize();
  async function legacyModel(system) {
    if (system.includes('редактор исследовательского задания')) return { brief:{ goal:'Проверить boundary', audience:'Product Owner', constraints:[], exclusions:[], expectedDecision:'Выбрать шаг' }, ready:true };
    if (system.includes('планировщик deep research')) return { needs:[{ title:'Механика', query:'research', dods:[{ criterion:'Найти реализацию' }] }, { title:'Эффект', query:'evidence', dods:[{ criterion:'Найти факт' }] }] };
    if (system.includes('извлекаешь Evidence')) return { evidence:[{ claim:'Legacy Research сохранил provenance.', quote:'provenance', sourceRef:'S1', confidence:'direct', kind:'fact' }], conflicts:[], unknowns:[] };
    if (system.includes('Synthesis Harness AgentSuite')) return { objective:'Проверить provenance', audience:'Product Owner', keyClaims:[{ id:'C001', claim:'Provenance сохраняется от Research до synthesis.', evidenceIds:['E001'], kind:'evidence-backed' }], uncertainties:['Эффект не измерен'], structure:['Показать источник','Проверить вывод'], requestedOutputs:['decision-memo'] };
    return {};
  }
  const legacySource = { id:'mock-local', async search() { return [{ sourceUri:'local://fixture', sourceTitle:'fixture.md', sourceKind:'local', text:'Legacy Research сохранил provenance.' }]; } };
  const legacyResearch = createResearchService({
    modelJson: legacyModel,
    sources:[legacySource],
    render:async ({ generationId }) => ({ result:{ generationId }, narrativeMarkdown:'# audit', slidesHtml:'<section>audit</section>', pptx:Buffer.from('pptx'), manifestMeta:{ mode:'audit', styleId:'audit' } }),
    store:legacyStore,
    limits:{ timeoutMs:5000, maxSourceCalls:8, maxWebPages:0 }
  });
  registry.register(createResearchHarness({ researchService:legacyResearch, artifactStore:legacyStore }));
  registry.register(validationHarness);
  registry.register(createSynthesisHarness({ modelJson:legacyModel }));
  registry.register(createNarrativeHarness({ narrativeMarkdown }));
  registry.register(createDataHarness({ dataFromEvidence }));
  registry.register(createSlidesHarness({ slidesHtml, resolvePresentationStyle }));
  registry.register(createPresentationStoryPlannerHarness());
  const researchRun = await runtime.run({ intent:'Проверить research boundary', role:'product-owner', workflow:'research-presentation', stages:[{ harnessId:'brief' },{ harnessId:'research', requestEvent:'ResearchRequested' },{ harnessId:'validation', requestEvent:'ValidationRequested' },{ harnessId:'synthesis', requestEvent:'SynthesisRequested' },{ harnessId:'data', requestEvent:'DataRequested' },{ harnessId:'presentation-story',requestEvent:'PresentationStoryRequested'},{ harnessId:'narrative', requestEvent:'NarrativeRequested' },{ harnessId:'slides', requestEvent:'PresentationRequested' }] });
  assert.equal(researchRun.status, 'completed',JSON.stringify(researchRun.events.slice(-3)));
  assert.deepEqual(researchRun.events.map(event => event.type), ['RunRequested','RunLaunching','RunStarted','ArtifactCreated', 'BriefCreated', 'ResearchRequested', 'ArtifactCreated', 'EvidenceCollected', 'ResearchCompleted', 'ValidationRequested', 'ArtifactCreated', 'EvidenceValidated', 'ValidationCompleted', 'SynthesisRequested', 'ArtifactCreated', 'SynthesisPlanCreated', 'SynthesisCompleted', 'DataRequested', 'ArtifactCreated', 'DataCreated', 'DataCompleted','PresentationStoryRequested','ArtifactCreated','PresentationStoryPlanned', 'NarrativeRequested', 'ArtifactCreated', 'NarrativeCreated', 'NarrativeCompleted', 'PresentationRequested', 'ArtifactCreated', 'PresentationCreated', 'PresentationCompleted', 'RunCompleted']);
  const briefArtifact = researchRun.artifacts.find(item => item.type === 'Brief');
  const evidenceArtifact = researchRun.artifacts.find(item => item.type === 'EvidenceSet');
  const validationArtifact = researchRun.artifacts.find(item => item.type === 'ValidationReport');
  const synthesisArtifact = researchRun.artifacts.find(item => item.type === 'SynthesisPlan');
  const narrativeArtifact = researchRun.artifacts.find(item => item.type === 'Narrative');
  const dataArtifactMeta = researchRun.artifacts.find(item => item.type === 'DataArtifact');
  const presentationArtifact = researchRun.artifacts.find(item => item.type === 'Presentation');
  const storyArtifact = researchRun.artifacts.find(item => item.type === 'PresentationStoryPlan');
  assert.ok(briefArtifact && evidenceArtifact && validationArtifact && synthesisArtifact && narrativeArtifact && dataArtifactMeta && storyArtifact && presentationArtifact);
  assert.deepEqual(synthesisArtifact.sourceArtifactIds, [briefArtifact.id, evidenceArtifact.id, validationArtifact.id]);
  assert.deepEqual(narrativeArtifact.sourceArtifactIds, [synthesisArtifact.id, dataArtifactMeta.id]);
  assert.deepEqual(dataArtifactMeta.sourceArtifactIds, [synthesisArtifact.id, evidenceArtifact.id, validationArtifact.id]);
  assert.deepEqual(storyArtifact.sourceArtifactIds,[synthesisArtifact.id,dataArtifactMeta.id]);
  assert.deepEqual(presentationArtifact.sourceArtifactIds, [storyArtifact.id, dataArtifactMeta.id]);
  assert.ok(!presentationArtifact.sourceArtifactIds.includes(narrativeArtifact.id), 'Slides are independent from Narrative');
  const synthesisFile = path.join(temp, 'runs', researchRun.id, 'artifacts', synthesisArtifact.file.split('/').at(-1));
  const synthesis = JSON.parse(await fs.readFile(synthesisFile, 'utf8'));
  assert.equal(synthesis.data.keyClaims[0].evidenceIds[0], 'E001');
  assert.equal(synthesis.data.validationReportArtifactId, validationArtifact.id);
  const narrativeFile = path.join(temp, 'runs', researchRun.id, 'artifacts', narrativeArtifact.file.split('/').at(-1));
  const narrative = JSON.parse(await fs.readFile(narrativeFile, 'utf8'));
  assert.equal(narrative.data.synthesisPlanArtifactId, synthesisArtifact.id);
  assert.match(narrative.data.content, /Provenance сохраняется/);
  assert.doesNotMatch(narrative.data.content, /Непроверенный факт/);
  const dataFile = path.join(temp, 'runs', researchRun.id, 'artifacts', dataArtifactMeta.file.split('/').at(-1));
  const dataArtifact = JSON.parse(await fs.readFile(dataFile, 'utf8'));
  assert.equal(dataArtifact.data.synthesisPlanArtifactId, synthesisArtifact.id);
  assert.equal(dataArtifact.data.rowProvenance[0].evidenceIds[0], 'E001');
  assert.equal(dataArtifact.data.rowProvenance[0].claimIds[0], 'C001');
  assert.ok(dataArtifact.data.rowProvenance[0].rowId, 'Data rows have stable semantic identity');
  assert.equal(dataArtifact.data.provenance.insights.every(item => ['interpretation','evidence-summary'].includes(item.kind)), true, 'Insight remains explicitly typed and never promoted to Evidence');
  const stableDataHarness=createDataHarness({dataFromEvidence});
  const stablePlan={id:'stable-plan',type:'SynthesisPlan',data:{objective:'Stable identity',keyClaims:[{id:'C1',evidenceIds:['E1','E2']}]}},stableValidation={id:'stable-validation',type:'ValidationReport',data:{valid:true,items:[{decisionId:'validation:E1',evidenceId:'E1',valid:true,status:'validated'},{decisionId:'validation:E2',evidenceId:'E2',valid:true,status:'unknown'}]}};
  const facts=[{id:'E1',claim:'one',quote:'one',kind:'fact',confidence:'direct',sourceId:'s1',sourceTitle:'one.md'},{id:'E2',claim:'two',quote:'two',kind:'fact',confidence:'direct',sourceId:'s2',sourceTitle:'two.md'}];
  const materialize=async items=>(await stableDataHarness.execute({run:{id:'stable-run'},artifacts:[stablePlan,{id:'stable-evidence',type:'EvidenceSet',data:{items,metadata:{sourceCalls:2}}},stableValidation]})).artifacts[0].data;
  const orderedData=await materialize(facts),reorderedData=await materialize([...facts].reverse());
  assert.deepEqual(new Map(orderedData.provenance.rows.map(row=>[row.evidenceIds[0],row.rowId])),new Map(reorderedData.provenance.rows.map(row=>[row.evidenceIds[0],row.rowId])),'Data row identity survives reorder');
  assert.deepEqual(new Map(orderedData.provenance.metrics.map(metric=>[metric.metricKey,metric.metricId])),new Map(reorderedData.provenance.metrics.map(metric=>[metric.metricKey,metric.metricId])),'metric identity survives materialization reorder');
  assert.equal(reorderedData.provenance.rows.find(row=>row.evidenceIds[0]==='E2').validationDecisionIds[0],'validation:E2','validation decisions survive unchanged into Data selection');
  const presentationFile = path.join(temp, 'runs', researchRun.id, 'artifacts', presentationArtifact.file.split('/').at(-1));
  const presentation = JSON.parse(await fs.readFile(presentationFile, 'utf8'));
  assert.equal(presentation.data.synthesisPlanArtifactId, synthesisArtifact.id);
  assert.equal(presentation.data.dataArtifactId, dataArtifactMeta.id);
  const groundedSlide=presentation.data.slides.find(slide=>slide.claimIds.includes('C001')&&slide.evidenceIds.includes('E001'));
  assert.ok(groundedSlide,'Presentation contains a scene grounded in the canonical claim and Evidence');
  assert.ok(groundedSlide.dataRefs.rowIds.includes(dataArtifact.data.rowProvenance[0].rowId),'slide lineage references stable Data row IDs');
  assert.match(presentation.data.html, /<section|slide/);
  const narrativeInput = {
    id:'narrative-input',
    type:'SynthesisPlan',
    data:{ objective:'Проверить', audience:'PO', keyClaims:[{ id:'C001', claim:'Только исходный claim', evidenceIds:['E001'], kind:'evidence-backed' }], uncertainties:[], requestedOutputs:[] }
  };
  const narrativeBefore = JSON.stringify(narrativeInput);
  const substrateInput={ id:'data-input', type:'DataArtifact', data:{ columns:['Evidence ID','Claim'], rows:[['E001','Только исходный claim']], provenance:{ rows:[{ rowId:'row-stable',rowIndex:0,kind:'fact',evidenceIds:['E001'],claimIds:['C001'],sourceTitle:'fixture.md' }],metrics:[],insights:[] } } };
  const hiddenEvidence={ id:'evidence-input', type:'EvidenceSet', data:{ items:[{ id:'E999', claim:'Скрытый факт не должен попасть в Narrative', sourceUri:'local://hidden' }] } };
  const narrativeResult=await createNarrativeHarness({ narrativeMarkdown }).execute({ run:{ id:'run-narrative-test' }, artifacts:[narrativeInput,hiddenEvidence,substrateInput] });
  assert.equal(JSON.stringify(narrativeInput), narrativeBefore, 'Narrative does not mutate SynthesisPlan');
  assert.doesNotMatch(narrativeResult.artifacts[0].data.content,/Скрытый факт/,'Narrative cannot recover raw EvidenceSet through an adapter');
  const slideInput = { id:'synthesis-slide-input', type:'SynthesisPlan', data:{ objective:'Проверить слайды', audience:'PO', keyClaims:[{ id:'C001', claim:'Поддержанный тезис', evidenceIds:['E001'], kind:'evidence-backed' }], uncertainties:[], requestedOutputs:[] } };
  const dataInput = { id:'data-slide-input', type:'DataArtifact', data:{ columns:['Evidence ID','Claim'],rows:[['E001','Поддержанный тезис']],provenance:{rows:[{rowId:'row-slide',rowIndex:0,kind:'fact',evidenceIds:['E001'],claimIds:['C001']}],metrics:[],insights:[]} } };
  const planned=(await createPresentationStoryPlannerHarness().execute({run:{id:'run-slide-test'},artifacts:[slideInput,dataInput]})).artifacts[0];planned.id='story-slide-input';
  const slideResult = await createSlidesHarness({ slidesHtml, resolvePresentationStyle }).execute({ run:{ id:'run-slide-test' }, artifacts:[planned, dataInput], config:{} });
  assert.deepEqual(slideResult.artifacts[0].sourceArtifactIds, [planned.id, dataInput.id]);
  await assert.rejects(() => createSlidesHarness({ slidesHtml, resolvePresentationStyle }).execute({ run:{ id:'run-slide-missing' }, artifacts:[planned], config:{} }), /requires a DataArtifact/);
  await assert.rejects(() => createSlidesHarness({ slidesHtml: () => { throw new Error('renderer unavailable'); }, resolvePresentationStyle }).execute({ run:{ id:'run-slide-failure' }, artifacts:[planned, dataInput], config:{} }), /renderer unavailable/);
  const failedRegistry = createHarnessRegistry([briefHarness, { id:'failing', consumes:['FailureRequested'], async execute() { throw new Error('legacy research unavailable'); } }]);
  const failedRuntime = createRuntime({ rootDir: temp, registry: failedRegistry });
  const failed = await failedRuntime.run({ intent:'Проверить failure path', stages:[{ harnessId:'brief' },{ harnessId:'failing', requestEvent:'FailureRequested' }] });
  assert.equal(failed.status, 'failed');
  assert.equal(failed.events.at(-1).type, 'RunFailed');
  assert.equal(failed.events.at(-2).type, 'HarnessFailed');
  assert.throws(() => registry.register({ id:'validation', execute(){} }), /already registered/);
  assert.throws(() => { if (!registry.get('missing')) throw new Error('unknown harness'); }, /unknown harness/);
  const invalidSynthesis = createSynthesisHarness({ modelJson:async system => system.includes('Synthesis Harness AgentSuite') ? { keyClaims:[{ claim:'Непроверенный факт', evidenceIds:['E999'], kind:'evidence-backed' }] } : legacyModel(system) });
  const invalidRegistry = createHarnessRegistry([briefHarness, invalidSynthesis]);
  const invalidRuntime = createRuntime({ rootDir: temp, registry:invalidRegistry });
  const invalidRun = await invalidRuntime.run({ intent:'Проверить provenance validation', workflow:'bad-synthesis', stages:[{ harnessId:'brief' },{ harnessId:'synthesis', requestEvent:'SynthesisRequested' }] });
  assert.equal(invalidRun.status, 'failed');
  assert.match(invalidRun.events.at(-2).payload.message, /requires Brief, EvidenceSet and ValidationReport/);
  await assert.rejects(() => invalidSynthesis.execute({ run:{ id:'run-invalid' }, role:'product-owner', workflow:'bad-synthesis', artifacts:[
    { id:'brief-1', type:'Brief', data:{ question:'q', goal:'g' } },
    { id:'evidence-1', type:'EvidenceSet', data:{ items:[{ id:'E001', claim:'fact', sourceUri:'local://fixture', confidence:'direct', kind:'fact' }], metadata:{} } },
    { id:'validation-1', type:'ValidationReport', data:{ valid:true } }
  ], config:{} }), /unknown Evidence IDs: E999/);
  let retryCalls=0;const retryEvents=[];
  const retrySynthesis=createSynthesisHarness({modelJson:async()=>{retryCalls+=1;if(retryCalls===1)throw new SyntaxError("Expected ',' after property");return{objective:'retry',audience:'PO',keyClaims:[{id:'C1',claim:'fact',evidenceIds:['E1'],kind:'evidence-backed'}],uncertainties:[],structure:[],requestedOutputs:[]}}});
  const retryResult=await retrySynthesis.execute({run:{id:'run-retry'},role:'product-owner',workflow:'research-presentation',artifacts:[{id:'b',type:'Brief',data:{goal:'g'}},{id:'e',type:'EvidenceSet',data:{items:[{id:'E1',claim:'fact',sourceUri:'local://fixture',confidence:'direct',kind:'fact'}]}},{id:'v',type:'ValidationReport',data:{valid:true,items:[{evidenceId:'E1',valid:true}]}}],observe:async(type,payload)=>retryEvents.push({type,payload}),createOperationId:kind=>`retry:${kind}`});
  assert.equal(retryCalls,2,'malformed structured provider response is retried without fallback content');
  assert.deepEqual(retryEvents.filter(event=>event.type==='InferenceStarted').map(event=>event.payload.operationId),['retry:inference','retry:inference-retry'],'each provider call has distinct operation correlation');
  assert.equal(retryResult.artifacts[0].producedByOperationId,'retry:inference-retry');
  const extensible = createHarnessRegistry([briefHarness, { id:'echo', consumes:['EchoRequested'], async execute({ run }) { return { artifacts:[{ type:'Echo', data:{ intent:run.intent } }], events:[{ type:'EchoCompleted' }] }; } }]);
  const extensibleRuntime = createRuntime({ rootDir: temp, registry:extensible });
  const echoRun = await extensibleRuntime.run({ intent:'Проверить extensibility', stages:[{ harnessId:'brief' },{ harnessId:'echo', requestEvent:'EchoRequested' }] });
  assert.equal(echoRun.status, 'completed');
  assert.equal(echoRun.artifacts.at(-1).type, 'Echo');
  const narrativeFailureRegistry = createHarnessRegistry([briefHarness, createNarrativeHarness({ narrativeMarkdown })]);
  const narrativeFailure = await createRuntime({ rootDir: temp, registry:narrativeFailureRegistry }).run({ intent:'Проверить narrative failure', stages:[{ harnessId:'brief' },{ harnessId:'narrative', requestEvent:'NarrativeRequested' }] });
  assert.equal(narrativeFailure.status, 'failed');
  assert.equal(narrativeFailure.events.at(-2).payload.harnessId, 'narrative');
  console.log('runtime audit: Run · Event journal · Brief Harness · Artifact persistence · CLI-compatible inspection · PASS');
} finally {
  await fs.rm(temp, { recursive: true, force: true });
}
