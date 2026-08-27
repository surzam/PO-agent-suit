import fs from 'node:fs';
import assert from 'node:assert/strict';

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
const workstation = fs.readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');

for (const slug of slugs) {
  const html = slidesHtml(plan, { styleId:slug, generationId:`audit-${slug}` }, data);
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

assert.equal(slugs.length, 35, 'full template library');
assert.equal(themes.size, slugs.length, 'every template has a unique theme token set');
assert.equal(families.size, 6, 'six structurally distinct design families');
for (const family of families) assert.ok(workstation.includes(`data-family="${family}"`), `workstation mirrors ${family} family`);
assert.ok(workstation.includes('applyStyle(x.visualTheme)'), 'workstation consumes exact generated theme');
assert.ok(!workstation.includes('const palettes='), 'legacy menu-only palette generator removed');
assert.equal(mottoSimilarity('Код становится понятным', 'Код становится понятным'), 1, 'exact motto repetition is detected');
assert.equal(mottoSimilarity('Код становится понятным', 'Решение начинается с проверяемого ограничения'), 0, 'distinct mottos remain distinct');
const inlineScript = workstation.match(/<script>([\s\S]*)<\/script>/)?.[1];
assert.ok(inlineScript, 'workstation inline script exists');
assert.doesNotThrow(() => new Function(inlineScript), 'workstation inline script compiles');
console.log(`slides audit: ${slugs.length} templates · ${themes.size} unique themes · ${families.size} shared UI/deck families · 6 scene renderers · 6 family-specific data visuals · PASS`);
