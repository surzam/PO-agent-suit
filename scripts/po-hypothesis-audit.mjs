import assert from 'node:assert/strict';
import {deriveHypothesisPlan} from '../core/po-hypothesis.mjs';
import {sourceTableFromDocument,subjectMetricsFromTables} from '../core/subject-data.mjs';
const table=sourceTableFromDocument({sourceId:'fixture',sourceTitle:'cycle.csv',sourceUri:'fixture:cycle.csv',text:'cycle time[days]\n12\n'});
const metrics=subjectMetricsFromTables([table]);
const h=deriveHypothesisPlan({narrative:{id:'n1',thesis:'Improve onboarding',supportingClaims:['c1']},dataArtifact:{id:'d1',data:{sourceTables:[table],subjectMetrics:metrics}}});
assert.equal(h.narrativeRef,'n1');assert.equal(h.primaryMetric.id,metrics[0].id);assert.equal(h.baseline,12);
assert.equal(h.target,null);assert.equal(h.testability,'partial');assert.equal(h.intervention,null);
console.log('PO_HYPOTHESIS_AUDIT PASS');
