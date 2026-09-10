import assert from 'node:assert/strict';
import {projectSurfaceGraph,surfaceGraphEquivalent} from '../interop/ag-ui/surface-graph.mjs';
const surfaces=[
 {id:'surface:activity:r1',kind:'activity',scope:'run',sourceRefs:[],lifecycle:'active'},
 {id:'surface:source:a',kind:'source',scope:'source',sourceRefs:['a'],lifecycle:'settled'},
 {id:'surface:source:b',kind:'source',scope:'source',sourceRefs:['b'],lifecycle:'settled'},
 {id:'surface:evidence:a',kind:'evidence',scope:'evidence',sourceRefs:['a'],lifecycle:'settled'},
 {id:'surface:evidence:b',kind:'evidence',scope:'evidence',sourceRefs:['b'],lifecycle:'settled'},
 {id:'surface:validation:r1',kind:'validation',scope:'validation',sourceRefs:['a','b'],lifecycle:'settled'},
 {id:'surface:comparison:1',kind:'comparison',scope:'comparison',sourceRefs:['a','b'],lifecycle:'settled'}
];
const first=projectSurfaceGraph({sessionId:'r1',surfaces,updatedFromSequence:8}),rebuilt=projectSurfaceGraph({sessionId:'r1',surfaces:structuredClone(surfaces),updatedFromSequence:8});
assert.ok(first.edges.some(e=>e.relation==='supports'&&e.from==='surface:source:a'&&e.to==='surface:evidence:a'));
assert.ok(first.edges.some(e=>e.relation==='explains'&&e.from==='surface:validation:r1'));
assert.ok(first.edges.some(e=>e.relation==='compares-with'&&e.from==='surface:comparison:1'));
assert.equal(new Set(first.edges.map(e=>e.id)).size,first.edges.length);assert.ok(surfaceGraphEquivalent(first,rebuilt));
assert.equal(first.updatedFromSequence,8);assert.ok(first.nodes.every(n=>!('x' in n)&&!('y' in n)&&!('width' in n)));
console.log('surface graph audit: stable nodes · semantic relations · deterministic rebuild · no geometry · PASS');
