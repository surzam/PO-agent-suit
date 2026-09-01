import fs from 'node:fs';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { validatePresentationMaterialization } from '../harnesses/presentation-validation.mjs';

process.env.PO_AGENT_NO_LISTEN = '1';
const { slidesHtml, designFamily, templateTheme, templateVisualTheme, mottoSimilarity } = await import('../server.mjs');
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
const inlineScript = appHtml.match(/<script>([\s\S]*)<\/script>/)?.[1];
assert.ok(inlineScript, 'app inline script exists');
assert.doesNotThrow(() => new Function(inlineScript), 'app inline script compiles');
console.log(`slides audit: ${slugs.length} templates · ${themes.size} unique themes · ${families.size} shared UI/deck families · 6 scene renderers · 6 family-specific data visuals · PASS`);
