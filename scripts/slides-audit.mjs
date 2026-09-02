import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { validatePresentationMaterialization } from '../harnesses/presentation-validation.mjs';
import { createRuntime } from '../core/runtime.mjs';
import { createHarnessRegistry } from '../core/registry.mjs';
import { createSlidesHarness } from '../harnesses/slides.mjs';
import { deriveSlideTitle, storyPlanFromSynthesis } from '../harnesses/legacy-story-plan.mjs';

process.env.PO_AGENT_NO_LISTEN = '1';
const { slidesHtml, designFamily, templateTheme, templateVisualTheme, resolvePresentationStyle, DEFAULT_PRESENTATION_STYLE_ID, mottoSimilarity } = await import('../server.mjs');
const slugs = JSON.parse(fs.readFileSync(new URL('../template-library/index.json', import.meta.url), 'utf8')).templates.map(item => item.slug).concat('codebase-to-course');
const visualTypes = ['statement','comparison','table','flow','quote','roadmap','statement','comparison','table','flow','quote','roadmap'];
const plan = {
  topic: 'Slide renderer audit',
  scenes: visualTypes.map((visualType, index) => ({
    index:index + 1,
    title:`Unique ${visualType} ${index + 1}`,
    thesis:`Thesis ${index + 1}`,
    evidence:[`Evidence ${index + 1}.1`,`Evidence ${index + 1}.2`,`Evidence ${index + 1}.3`],
    speakerScript:'Audit speaker script.',
    visualType
  }))
};
const data = { rows:[], numericMetrics:[['time_to_insight',12,'minutes','demo'],['steps_removed',7,'steps','demo']] };
const themes = new Set(), families = new Set();
const chartClass = { editorial:'data-lollipop', arcade:'data-pixels', brutal:'data-blocks', playful:'data-bubbles', diagrammatic:'data-line', cinematic:'data-orbit' };
const appHtml = fs.readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
const longClaim='Отсутствие явного типа события или состояния для внешних индексов в доступном контракте нарушает понятность исследования';
const derivedTitle=deriveSlideTitle(longClaim);
assert.match(derivedTitle,/…$/,'long display title is explicitly abbreviated');
assert.ok(/[\s,;:.]/.test(longClaim[derivedTitle.slice(0,-1).length]||' '),'display title ends at an original word boundary');
const preservedPlan=storyPlanFromSynthesis({data:{keyClaims:[{id:'C-title',claim:longClaim,evidenceIds:[]}],objective:'audit',uncertainties:[]}}, {data:{items:[]}});
assert.equal(preservedPlan.scenes[0].claim,longClaim,'full Claim remains persisted in StoryPlan');
assert.equal(preservedPlan.scenes[0].thesis,longClaim,'full Claim remains available to the renderer');

for (const slug of slugs) {
  const html = slidesHtml(plan, { styleId:slug, generationId:`audit-${slug}` }, data);
  assert.equal(validatePresentationMaterialization({data:{html,slides:plan.scenes}}).slideCount,plan.scenes.length,`${slug}: structural contract`);
  const uiTheme = templateVisualTheme(slug, `audit-${slug}`);
  themes.add(templateTheme(slug)); families.add(designFamily(slug));
  assert.equal(uiTheme.styleId, slug, `${slug}: UI receives current template`);
  assert.equal(uiTheme.family, designFamily(slug), `${slug}: UI and slides share design family`);
  assert.ok(Object.values(uiTheme.colors).every(Boolean), `${slug}: UI receives complete palette`);
  assert.ok(uiTheme.typography.display && uiTheme.typography.body && uiTheme.typography.mono, `${slug}: UI receives complete typography`);
  assert.equal((html.match(/<section class="slide/g) || []).length, plan.scenes.length, `${slug}: scene count`);
  assert.equal((html.match(/<figure class="data-visual/g) || []).length, 2, `${slug}: no more than one data visual per five slides`);
  assert.ok(html.includes(chartClass[designFamily(slug)]), `${slug}: family-specific data visual`);
  assert.ok(!html.includes('<aside class="chart'), `${slug}: no generic floating chart`);
  assert.ok(html.includes('width:1920px;height:1080px'), `${slug}: fixed 16:9 stage`);
  assert.ok(html.includes('deck-stage'), `${slug}: stage wrapper`);
  for (const type of new Set(visualTypes)) assert.ok(html.includes(`data-visual="${type}"`), `${slug}: ${type} renderer`);
  for (const composition of ['statement-composition','comparison-composition','table-composition','flow-composition','quote-composition','roadmap-composition']) assert.ok(html.includes(composition), `${slug}: ${composition}`);
}

const fallbackDeck=slidesHtml(plan,{styleId:'synthesis-plan',generationId:'audit-fallback'},data);
assert.ok(!fallbackDeck.includes(':root{undefined'),'unknown style IDs receive a complete fallback theme');
assert.ok(fallbackDeck.includes('id="deckPrev"')&&fallbackDeck.includes('id="deckNext"'),'deck exposes clickable navigation');
const deckDom=new JSDOM(fallbackDeck,{runScripts:'dangerously',pretendToBeVisual:true});
deckDom.window.document.getElementById('deckNext').click();
assert.equal([...deckDom.window.document.querySelectorAll('.slide')].findIndex(item=>item.classList.contains('active')),1,'clicking Next reveals the second slide');
assert.equal(deckDom.window.document.getElementById('deckPosition').textContent,`2 / ${plan.scenes.length}`,'click navigation updates the visible slide counter');
deckDom.window.close();

const invalidCases=[
  ['missing root',fallbackDeck.replace('class="deck-viewport"','class="missing-viewport"')],
  ['zero slides',fallbackDeck.replace(/<section class="slide[\s\S]*?<\/section>/g,'')],
  ['missing navigation',fallbackDeck.replace('id="deckNext"','id="missingNext"')],
  ['missing bootstrap',fallbackDeck.replace("function go(next)","function missingGo(next)")],
  ['corrupt theme',fallbackDeck.replace(/--bg:[^;]+;/,'--bg:undefined;')]
];
for(const [label,html] of invalidCases)assert.throws(()=>validatePresentationMaterialization({data:{html,slides:plan.scenes}}),/Presentation materialization is invalid/,label);

assert.equal(slugs.length, 35, 'full template library');
assert.equal(themes.size, slugs.length, 'every template has a unique theme token set');
assert.equal(families.size, 6, 'six structurally distinct design families');
for (const family of families) assert.ok(appHtml.includes(`data-family="${family}"`), `app mirrors ${family} family`);
assert.ok(appHtml.includes('applyStyle(x.visualTheme)'), 'app consumes exact generated theme');
assert.ok(appHtml.includes('Research sequence') && appHtml.includes('LIVE JOB'), 'app includes research observation console');
assert.ok(!appHtml.includes('xterm'), 'observation console does not expose an embedded terminal');
assert.ok(!appHtml.includes('const palettes='), 'legacy menu-only palette generator removed');
assert.equal(mottoSimilarity('Код становится понятным', 'Код становится понятным'), 1, 'exact motto repetition is detected');
assert.equal(mottoSimilarity('Код становится понятным', 'Решение начинается с проверяемого ограничения'), 0, 'distinct mottos remain distinct');

// Production integration: the actual Runtime → Slides Harness → persisted
// Artifact boundary must never store an unresolved style identity.
assert.ok(slugs.includes(DEFAULT_PRESENTATION_STYLE_ID),'default presentation style is an indexed slug');
assert.equal(resolvePresentationStyle().styleId,DEFAULT_PRESENTATION_STYLE_ID,'default resolves deterministically');
assert.deepEqual(resolvePresentationStyle('unknown-style').styleId,DEFAULT_PRESENTATION_STYLE_ID,'unknown style never persists as applied');
const productionRoot=await fsp.mkdtemp(path.join(os.tmpdir(),'agentsuite-slides-'));
try{
  const registry=createHarnessRegistry([createSlidesHarness({slidesHtml,resolvePresentationStyle})]);
  const runtime=createRuntime({rootDir:productionRoot,registry,observability:true});
  const byFamily=new Map();for(const slug of slugs)if(!byFamily.has(designFamily(slug)))byFamily.set(designFamily(slug),slug);
  assert.equal(byFamily.size,6,'six actual layout families are addressable');
  for(const [family,styleId] of byFamily){
    const run=await runtime.start({intent:`Style ${family}`,workflow:'research-presentation'});
    const synthesis={id:`synthesis-${family}`,type:'SynthesisPlan',data:{objective:'Длинный, но реалистичный заголовок для проверки безопасной компоновки презентации',audience:'Product Owner',keyClaims:[{id:'claim-1',claim:'Проверяемый факт остаётся в безопасной области слайда.',evidenceIds:['E1'],kind:'evidence-backed'}],uncertainties:[]}};
    const dataArtifact={id:`data-${family}`,type:'DataArtifact',data:{structuredRows:[{rowId:'row-1',values:['E1','Проверяемый факт','fixture.md','direct']}],rows:[['E1','Проверяемый факт','fixture.md','direct']],numericMetrics:[['Сигнал',12,'ед.','fixture']],provenance:{rows:[{rowId:'row-1',rowIndex:0,evidenceIds:['E1'],sourceTitle:'fixture.md'}]}}};
    run.artifacts.push({id:synthesis.id,type:synthesis.type,sourceArtifactIds:[],file:'artifacts/synthesis.json'},{id:dataArtifact.id,type:dataArtifact.type,sourceArtifactIds:[],file:'artifacts/data.json'});
    const outcome=await runtime.dispatch(run,{id:'slides',harnessId:'slides',config:{styleId}},{artifacts:[synthesis,dataArtifact]});
    const presentation=outcome.persisted[0],saved=await runtime.inspect(run.id);
    assert.equal(presentation.data.metadata.styleId,styleId,`${family}: applied style persists`);
    assert.equal(presentation.data.metadata.layoutFamily,family,`${family}: layout family persists`);
    assert.ok(slugs.includes(presentation.data.metadata.styleId),`${family}: persisted style is indexed`);
    assert.ok(presentation.data.html.includes(`data-template="${styleId}"`),`${family}: renderer used persisted style`);
    assert.ok(presentation.data.html.includes(`family-${family}`),`${family}: renderer used expected layout family`);
    assert.equal(saved.artifacts.find(item=>item.id===presentation.id)?.type,'Presentation',`${family}: artifact persisted through Runtime`);

    const longPlan={...plan,scenes:[
      {...plan.scenes[0],title:'Короткий заголовок'},
      {...plan.scenes[1],title:'Длинный реалистичный заголовок о том, почему команда теряет фокус при исполнении продуктового плана'},
      {...plan.scenes[2],title:'Очень длинный, но всё ещё реалистичный заголовок о согласовании решений, ответственности и проверяемых ограничениях в ходе исполнения плана'}
    ]};
    const overflowHtml=slidesHtml(longPlan,{styleId,generationId:`overflow-${family}`},data);
    const overflowDom=new JSDOM(overflowHtml);
    const titles=[...overflowDom.window.document.querySelectorAll('.slide h1')].map(node=>node.textContent);
    assert.deepEqual(titles,longPlan.scenes.map(scene=>scene.title),`${family}: long titles are rendered without silent truncation`);
    assert.match(overflowHtml,/overflow-wrap:anywhere/,`${family}: title wrapping is explicitly enabled`);
    assert.match(overflowHtml,/font:800 clamp\(/,`${family}: title scale has a bounded responsive range`);
    overflowDom.window.close();
  }
  const defaultRun=await runtime.start({intent:'Default style',workflow:'research-presentation'});
  const defaultSynthesis={id:'synthesis-default',type:'SynthesisPlan',data:{objective:'Стандартная презентация',audience:'Product Owner',keyClaims:[{id:'claim-default',claim:'Стиль по умолчанию является валидным шаблоном.',evidenceIds:['E1'],kind:'evidence-backed'}],uncertainties:[]}};
  const defaultData={id:'data-default',type:'DataArtifact',data:{structuredRows:[{rowId:'row-default',values:['E1','Факт по умолчанию','fixture.md']}],rows:[['E1','Факт по умолчанию','fixture.md']],provenance:{rows:[{rowId:'row-default',rowIndex:0,evidenceIds:['E1'],sourceTitle:'fixture.md'}]}}};
  defaultRun.artifacts.push({id:defaultSynthesis.id,type:defaultSynthesis.type,sourceArtifactIds:[],file:'artifacts/synthesis.json'},{id:defaultData.id,type:defaultData.type,sourceArtifactIds:[],file:'artifacts/data.json'});
  const defaultOutcome=await runtime.dispatch(defaultRun,{id:'slides',harnessId:'slides',config:{}},{artifacts:[defaultSynthesis,defaultData]});
  assert.equal(defaultOutcome.persisted[0].data.metadata.styleId,DEFAULT_PRESENTATION_STYLE_ID,'canonical default persists a valid template slug');
}finally{await fsp.rm(productionRoot,{recursive:true,force:true})}
const inlineScript = appHtml.match(/<script>([\s\S]*)<\/script>/)?.[1];
assert.ok(inlineScript, 'app inline script exists');
assert.doesNotThrow(() => new Function(inlineScript), 'app inline script compiles');
console.log(`slides audit: ${slugs.length} templates · ${themes.size} unique themes · ${families.size} shared UI/deck families · 6 scene renderers · 6 family-specific data visuals · PASS`);
