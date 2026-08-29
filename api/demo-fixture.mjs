import fs from 'node:fs/promises';
import path from 'node:path';

export async function ensureDemoFixture(rootDir) {
  const runsDir = path.join(rootDir, 'runs');
  const poId = 'demo-po-run';
  try { await fs.access(path.join(runsDir, poId, 'run.json')); return; } catch {}
  const evidenceId = 'demo-evidence-set';
  const briefId = 'demo-brief';
  const validationId = 'demo-validation';
  const poPlanId = 'demo-po-synthesis';
  const poNarrativeId = 'demo-po-narrative';
  const poDataId = 'demo-po-data';
  const poPresentationId = 'demo-po-presentation';
  const ctoPlanId = 'demo-cto-synthesis';
  const ctoNarrativeId = 'demo-cto-narrative';
  const ctoDataId = 'demo-cto-data';
  const ctoPresentationId = 'demo-cto-presentation';
  const evidence = { id:evidenceId, runId:poId, type:'EvidenceSet', sourceArtifactIds:[], createdAt:new Date().toISOString(), data:{ items:[
    { id:'E1', claim:'Срок поставки вырос на 30%', quote:'Средний lead time увеличился на 30%.', sourceTitle:'Delivery report', sourceUri:'demo://delivery-report', confidence:'direct', kind:'fact' },
    { id:'E2', claim:'Число инцидентов поддержки выросло', quote:'Команда поддержки фиксирует больше обращений после релизов.', sourceTitle:'Support summary', sourceUri:'demo://support-summary', confidence:'direct', kind:'fact' },
    { id:'E3', claim:'Клиенты используют только часть новой функциональности', quote:'Основной сценарий сосредоточен в двух модулях из пяти.', sourceTitle:'Usage review', sourceUri:'demo://usage-review', confidence:'direct', kind:'fact' }
  ], metadata:{ demo:true, label:'Demo fixture — explicitly synthetic' } } };
  const brief = { id:briefId, runId:poId, type:'Brief', sourceArtifactIds:[], data:{ question:'Стоит ли менять архитектуру продукта?', goal:'Принять обоснованное решение', role:'product-owner', demo:true } };
  const validation = { id:validationId, runId:poId, type:'ValidationReport', sourceArtifactIds:[evidenceId], data:{ valid:true, conflicts:[], unknowns:['Причина роста lead time требует дополнительной проверки'], demo:true } };
  const plan = (id, role, claims) => ({ id, runId:role==='cto'?'demo-cto-run':poId, type:'SynthesisPlan', sourceArtifactIds:[briefId,evidenceId,validationId], data:{ runId:role==='cto'?'demo-cto-run':poId, roleId:role, worldview:{ id:role, label:role==='cto'?'CTO':'Product Owner', priorities:role==='cto'?['reliability','architecture','migration risk']:['customer value','business impact','prioritization'] }, briefArtifactId:briefId, evidenceSetArtifactId:evidenceId, validationReportArtifactId:validationId, objective:role==='cto'?'Оценить архитектурную устойчивость решения':'Понять, какой продуктовый шаг вернёт предсказуемую поставку', audience:'Руководство и команда', keyClaims:claims, uncertainties:['Причина роста lead time требует дополнительной проверки'], structure:role==='cto'?['reliability','migration risk']:['customer value','prioritization'], requestedOutputs:['narrative','data','presentation'], demo:true } });
  const poPlan = plan(poPlanId,'product-owner',[{id:'C001',claim:'Рост срока поставки требует пересмотреть ценность и приоритет новой функциональности.',evidenceIds:['E1','E3'],kind:'evidence-backed'}]);
  const ctoPlan = plan(ctoPlanId,'cto',[{id:'C001',claim:'Рост инцидентов и срока поставки требует оценки надёжности и операционной сложности.',evidenceIds:['E1','E2'],kind:'evidence-backed'}]);
  const output = (id,type,runId,parent,data) => ({id,runId,type,sourceArtifactIds:[parent],createdAt:new Date().toISOString(),data:{runId,...data,demo:true}});
  const artifacts = [brief,evidence,validation,poPlan,output(poNarrativeId,'Narrative',poId,poPlanId,{synthesisPlanArtifactId:poPlanId,audience:'Руководство',content:'# Product Owner\n\nСрок поставки вырос, а клиенты используют лишь часть функциональности. Следующий разговор — о ценности и приоритете, а не о добавлении ещё одного слоя.',sections:[]}),output(poDataId,'DataArtifact',poId,poPlanId,{synthesisPlanArtifactId:poPlanId,columns:['Evidence ID','Наблюдение','Источник'],rows:[['E1','Срок поставки вырос на 30%','Delivery report'],['E3','Используется часть функциональности','Usage review']],rowProvenance:[{evidenceIds:['E1'],claimIds:['C001']},{evidenceIds:['E3'],claimIds:['C001']}]}),output(poPresentationId,'Presentation',poId,poPlanId,{synthesisPlanArtifactId:poPlanId,dataArtifactId:poDataId,slides:[{index:1,claimIds:['C001'],evidenceIds:['E1','E3'],title:'Ценность раньше сложности'}],html:'<section><h1>Ценность раньше сложности</h1></section>'}),ctoPlan,output(ctoNarrativeId,'Narrative','demo-cto-run',ctoPlanId,{synthesisPlanArtifactId:ctoPlanId,audience:'Руководство',content:'# CTO\n\nСигналы указывают на риск надёжности и операционной сложности. Следующий шаг — проверить архитектурную причину до миграции.',sections:[]}),output(ctoDataId,'DataArtifact','demo-cto-run',ctoPlanId,{synthesisPlanArtifactId:ctoPlanId,columns:['Evidence ID','Наблюдение','Источник'],rows:[['E1','Срок поставки вырос на 30%','Delivery report'],['E2','Выросло число инцидентов','Support summary']],rowProvenance:[{evidenceIds:['E1'],claimIds:['C001']},{evidenceIds:['E2'],claimIds:['C001']}]}),output(ctoPresentationId,'Presentation','demo-cto-run',ctoPlanId,{synthesisPlanArtifactId:ctoPlanId,dataArtifactId:ctoDataId,slides:[{index:1,claimIds:['C001'],evidenceIds:['E1','E2'],title:'Надёжность до миграции'}],html:'<section><h1>Надёжность до миграции</h1></section>'})];
  for (const artifact of artifacts) { const dir=path.join(runsDir, artifact.runId, 'artifacts'); await fs.mkdir(dir,{recursive:true}); await fs.writeFile(path.join(dir,`${artifact.id}.json`),`${JSON.stringify(artifact,null,2)}\n`); }
  const meta = (artifact, ownerRunId=artifact.runId, reused=false) => ({id:artifact.id,type:artifact.type,sourceArtifactIds:artifact.sourceArtifactIds,file:`artifacts/${artifact.id}.json`,...(reused?{ownerRunId,reused}: {})});
  const poArtifacts=artifacts.slice(0,7).map(a=>meta(a));
  const ctoArtifacts=[brief,evidence,validation].map(a=>meta(a,poId,true)).concat(artifacts.slice(7).map(a=>meta(a)));
  const events = (runId, artifactList, role, parent=null) => [{id:`${runId}-requested`,type:'RunRequested',runId,at:new Date().toISOString(),payload:{intent:'Стоит ли менять архитектуру продукта?',role,workflow:'research-presentation'}},...artifactList.map(a=>({id:`${runId}-${a.id}`,type:a.reused?'ArtifactReused':'ArtifactCreated',runId,at:new Date().toISOString(),payload:{artifactId:a.id,type:a.type,...(a.reused?{sourceRunId:parent}:{})}})),{id:`${runId}-completed`,type:'RunCompleted',runId,at:new Date().toISOString(),payload:{}}];
  const base = { intent:'Стоит ли менять архитектуру продукта?', workflow:'research-presentation', status:'completed', createdAt:new Date().toISOString(), updatedAt:new Date().toISOString() };
  await fs.writeFile(path.join(runsDir,poId,'run.json'),`${JSON.stringify({id:poId,...base,role:'product-owner',demo:true,events:events(poId,poArtifacts,'product-owner'),artifacts:poArtifacts},null,2)}\n`);
  await fs.writeFile(path.join(runsDir,'demo-cto-run','run.json'),`${JSON.stringify({id:'demo-cto-run',...base,role:'cto',parentRunId:poId,reusedArtifactIds:[briefId,evidenceId,validationId],demo:true,events:events('demo-cto-run',ctoArtifacts,'cto',poId),artifacts:ctoArtifacts},null,2)}\n`);
}
