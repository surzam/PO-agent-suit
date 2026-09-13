import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {JSDOM} from 'jsdom';
import {canonicalLimitations} from '../core/epistemic-text.mjs';
import {bindClaimEpistemics} from '../core/claim-epistemics.mjs';
import {planPresentationStory} from '../harnesses/presentation-story-planner.mjs';
import {createLocalSource} from '../research/sources.mjs';
import {presentLimitation} from '../public/ui/statement-presentation.js';
import {createSynthesisHarness} from '../harnesses/synthesis.mjs';
import {HumanView,presentHumanSurface} from '../public/ui/human-view.js';
const root=await fs.mkdtemp(path.join(os.tmpdir(),'materialization-'));
process.env.PO_AGENT_NO_LISTEN='1';process.env.PO_WORKSPACE_DIR=root;
const {slidesHtml}=await import('../server.mjs');
process.on('exit',()=>{});
const content='Из перенесённых задач часть зависела от интеграционной платформы.';
const claim=bindClaimEpistemics({id:'C1',kind:'interpretation',claim:'Платформа вызвала задержку',evidenceIds:['E1']},[{id:'E1',kind:'fact',claim:content,quoteVerified:true,sourceId:'S1',sourceUri:'test:report'}]);
const synthesis={id:'s',data:{keyClaims:[claim],textContext:{task:{statementKind:'task',epistemicClass:'task-framing',text:'Нужна ли platform-команда?'},limitations:[]}}};
const data={id:'d',data:{rows:[],structuredRows:[],provenance:{rows:[],metrics:[]}}};
test('A structured limitations preserve description without object coercion',()=>{
 const items=canonicalLimitations({id:'e',data:{metadata:{unknowns:[{type:'missing',description:'Нет baseline'}]}}});
 assert.ok(items.some(x=>x.text.includes('Нет baseline')));assert.ok(!JSON.stringify(items).includes('[object Object]'));
});
test('B substantive source content is separate from epistemic warning',()=>{
 assert.equal(claim.statement.text,content);assert.ok(claim.statement.statusLabel);
});
test('limitation presentation handles known structures and missing values explicitly',()=>{
 for(const value of ['Нет baseline',{text:'Нет baseline'},{message:'Нет baseline'},{type:'missing',description:'Нет baseline'},[{text:'Нет baseline'}],{gaps:[{description:'Нет baseline'}]}])assert.deepEqual(presentLimitation(value),['Нет baseline']);
 for(const value of [null,undefined])assert.deepEqual(presentLimitation(value),[]);
 assert.deepEqual(presentLimitation({other:1}),['Есть структурированное ограничение; описание недоступно.']);
});
test('C actual slide does not repeat warning in title body footer',()=>{
 const story=planPresentationStory(synthesis,data),dom=new JSDOM(slidesHtml(story,{styleId:'blue-professional'},data.data));
 const slide=dom.window.document.querySelector('.slide');
 assert.ok(!slide.querySelector('h1').textContent.includes('Непроверенная интерпретация'));
 assert.ok(!slide.querySelector('footer').textContent.includes('самостоятельный вывод'));
});
test('D internal repository scope is excluded unless explicitly requested',async()=>{
 const source=createLocalSource({roots:[path.resolve('core')],rootScope:'system-internal',maxFiles:2});
 assert.deepEqual(await source.search({query:'import export function',limit:2}),[]);
});
test('E final result has closure not question echo',()=>{
 const story=planPresentationStory(synthesis,data);
 assert.notEqual(story.scenes.at(-1).thesis,story.topic);assert.ok(story.resultClosure?.nextAction);
});
test('Human renderer retains substantive text, explicit limitations and demo metadata',()=>{
 const surface={id:'statement',kind:'evidence',content:{...claim,demo:true,limitations:[{type:'missing',description:'Нет baseline'}]}};
 const model=presentHumanSurface(surface);
 const dom=new JSDOM('<main></main>'),view=new HumanView(dom.window.document.querySelector('main'));
 dom.window.document.querySelector('main').innerHTML=view.surface(surface,model);
 const rendered=dom.window.document.body.textContent;
 assert.ok(rendered.includes(content));assert.ok(rendered.includes('Нет baseline'));assert.ok(rendered.includes('Учебный пример'));
 assert.doesNotMatch(rendered,/\[object Object\]|undefined|\[object Promise\]/);
 assert.equal(dom.window.document.querySelector('h2').textContent,content);
});
test('Synthesis rejects evidence outside the recorded Run source set before model call',async()=>{
 let calls=0;
 await assert.rejects(createSynthesisHarness({modelJson:async()=>{calls++;}}).execute({run:{id:'r'},artifacts:[{type:'Brief',data:{}},{type:'ValidationReport',data:{valid:true}},{type:'EvidenceSet',data:{admittedSources:[{sourceId:'allowed'}],items:[{id:'foreign',sourceId:'outside'}]}}]}),{code:'EVIDENCE_SOURCE_OUT_OF_SCOPE'});
 assert.equal(calls,0);
});
test('normal local search excludes training sources; explicit demo admits only selected pack',async()=>{
 const source=createLocalSource({roots:[]});
 source.addDocument({name:'platform-team/report.md',text:content,sourceKind:'example'});
 source.addDocument({name:'checkout/report.md',text:content,sourceKind:'example'});
 assert.deepEqual(await source.search({query:'платформы'}),[]);
 const found=await source.search({query:'платформы',demo:'platform-team'});
 assert.equal(found.length,1);assert.equal(found[0].sourceScope,'training-fixture');
 assert.match(found[0].sourceTitle,/platform-team/);
});
test('run-owned attachments are unavailable to unrelated research',async()=>{
 const source=createLocalSource({roots:[]});
 source.addDocument({name:'report.md',text:content,ownerRunId:'parent'});
 assert.deepEqual(await source.search({query:'платформы',allowedRunIds:['other']}),[]);
 assert.equal((await source.search({query:'платформы',allowedRunIds:['child','parent']})).length,1);
});
test('F substantive long Russian text preserved outside title without ellipsis',()=>{
 const text='Полный содержательный текст о задержках интеграционной платформы. '.repeat(40)+'Конечная проверяемая оговорка.';
 const c=bindClaimEpistemics({id:'C2',kind:'evidence-backed',claim:text,evidenceIds:['E2']},[{id:'E2',kind:'fact',claim:text,quoteVerified:true}]);
 const story=planPresentationStory({...synthesis,data:{...synthesis.data,keyClaims:[c]}},data);
 const dom=new JSDOM(slidesHtml(story,{styleId:'blue-professional'},data.data));
 assert.ok([...dom.window.document.querySelectorAll('h1')].every(n=>n.textContent.length<90&&!n.textContent.includes('…')));
 assert.ok(dom.window.document.body.textContent.includes('Конечная проверяемая оговорка.'));
});
test.after(async()=>fs.rm(root,{recursive:true,force:true}));
