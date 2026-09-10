import fs from 'node:fs';
import assert from 'node:assert/strict';
const html=fs.readFileSync('public/index.html','utf8');
const view=fs.readFileSync('public/ui/human-view.js','utf8');
assert.match(html,/human-view-root/); assert.match(html,/operator-view-root/);
assert.match(view,/Следующая история ещё не существует/); assert.match(view,/Диагностика/);
for(const word of ['FILE SYSTEM','RUN TIME','APP RAM','GPU','model.infer','virtual keyboard'])assert.doesNotMatch(view,new RegExp(word,'i'));
console.log('HUMAN_VIEW_AUDIT PASS');
