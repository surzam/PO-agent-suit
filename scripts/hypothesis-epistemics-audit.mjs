import assert from 'node:assert/strict';
import {deriveHypothesisPlan} from '../core/po-hypothesis.mjs';
const h=deriveHypothesisPlan({narrative:{id:'n',thesis:'Interpretation'},dataArtifact:{id:'d',data:{numericMetrics:[['m',10,'u']]}}});
assert.equal(h.baseline,null,'number without cell lineage is not observed baseline');
assert.equal(h.primaryMetric,null);assert.equal(h.target,null);assert.equal(h.intervention,null);
assert.notEqual(h.testability,'ready');
console.log('HYPOTHESIS_EPISTEMICS_AUDIT PASS (unmeasured input rejected)');
