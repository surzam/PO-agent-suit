import assert from 'node:assert/strict';
import {presentHumanSurface} from '../public/ui/human-view.js';
const session={research:{sources:[{sourceId:'s1',safeDisplayName:'OpenHands documentation',sourceUri:'github.com/example'}],validation:[{evidenceId:'e1',valid:true,status:'validated'}]}};
const source={kind:'source',content:{sourceId:'s1',safeDisplayName:'OpenHands documentation',sourceUri:'github.com/example'}};
const evidence={kind:'evidence',content:{id:'e1',claim:'A canonical fact',sourceId:'s1'}};
assert.equal(presentHumanSurface({kind:'source',content:{}},session),null);assert.equal(presentHumanSurface({kind:'evidence',content:{}},session),null);assert.ok(presentHumanSurface(source,session).title.includes('OpenHands'));assert.equal(presentHumanSurface(evidence,session).title,'A canonical fact');assert.equal(presentHumanSurface(evidence,session).body,'Подтверждено');
assert.equal(presentHumanSurface({kind:'validation',content:{items:[]}},session),null);assert.equal(presentHumanSurface({kind:'activity',content:{},},session),null);
console.log('HUMAN_SURFACE_SEMANTICS_AUDIT PASS');
