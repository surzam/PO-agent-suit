import fs from 'node:fs';
import assert from 'node:assert/strict';

process.env.PO_AGENT_NO_LISTEN = '1';
const { slidesHtml, designFamily, templateTheme } = await import('../server.mjs');
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

for (const slug of slugs) {
  const html = slidesHtml(plan, { styleId:slug, generationId:`audit-${slug}` }, data);
  themes.add(templateTheme(slug)); families.add(designFamily(slug));
  assert.equal((html.match(/<section class="slide/g) || []).length, plan.scenes.length, `${slug}: scene count`);
  assert.equal((html.match(/<aside class="chart/g) || []).length, 2, `${slug}: no more than one chart per five slides`);
  assert.ok(html.includes('width:1920px;height:1080px'), `${slug}: fixed 16:9 stage`);
  assert.ok(html.includes('deck-stage'), `${slug}: stage wrapper`);
  for (const type of new Set(visualTypes)) assert.ok(html.includes(`data-visual="${type}"`), `${slug}: ${type} renderer`);
  for (const composition of ['statement-composition','comparison-composition','table-composition','flow-composition','quote-composition','roadmap-composition']) assert.ok(html.includes(composition), `${slug}: ${composition}`);
}

assert.equal(slugs.length, 35, 'full template library');
assert.equal(themes.size, slugs.length, 'every template has a unique theme token set');
assert.equal(families.size, 6, 'six structurally distinct design families');
console.log(`slides audit: ${slugs.length} templates · ${themes.size} unique themes · ${families.size} families · 6 visual renderers · PASS`);
