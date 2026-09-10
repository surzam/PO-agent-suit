import assert from 'node:assert/strict';
import { projectActivity } from '../interop/ag-ui/session.mjs';
const run={status:'running',events:[{sequence:1,eventId:'e1',type:'ResearchRequested',payload:{}},{sequence:2,eventId:'e2',type:'EvidenceCollected',payload:{}}]};
const activity=projectActivity(run); assert.equal(activity.items.length,2); assert.equal(activity.current.label,'Ищу источники');
assert.deepEqual(activity.items.map(x=>x.label),['Ищу источники','Собираю проверяемые факты']);
console.log('HUMAN_ACTIVITY_AUDIT PASS');
