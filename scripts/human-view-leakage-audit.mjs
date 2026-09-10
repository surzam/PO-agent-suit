import fs from 'node:fs'; import assert from 'node:assert/strict';
const source=fs.readFileSync('public/ui/human-view.js','utf8');
for(const token of ['Run Requested','Run Launching','Run Started','Harness Started','intent.json','brief.json','FILE SYSTEM','APP RAM','model.infer','surface:'])assert.doesNotMatch(source,new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
assert.match(source,/data-human-diagnostics/); assert.match(source,/data-surface-action/);
console.log('HUMAN_VIEW_LEAKAGE_AUDIT PASS');
