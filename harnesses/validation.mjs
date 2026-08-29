const CONFIDENCE = new Set(['direct', 'corroborated', 'inferred', 'conflicted']);
const KINDS = new Set(['fact', 'interpretation', 'unknown']);

export const validationHarness = Object.freeze({
  id: 'validation',
  version: 1,
  consumes: ['ValidationRequested'],
  produces: ['EvidenceValidated', 'ValidationCompleted'],
  inputs: ['EvidenceSet'],
  outputs: ['ValidationReport'],
  async execute({ run, artifacts }) {
    const evidenceSet = artifacts.find(item => item.type === 'EvidenceSet');
    const intent = artifacts.find(item => item.type === 'Intent');
    if (!evidenceSet) throw new Error('Validation Harness requires an EvidenceSet artifact');
    const items = Array.isArray(evidenceSet.data.items) ? evidenceSet.data.items : [];
    const checks = items.map(item => {
      const issues = [];
      if (!String(item.id || '').trim()) issues.push('missing evidence id');
      if (!String(item.claim || '').trim()) issues.push('missing claim');
      if (!String(item.sourceUri || '').trim()) issues.push('missing sourceUri');
      if (!CONFIDENCE.has(item.confidence)) issues.push('invalid confidence');
      if (!KINDS.has(item.kind)) issues.push('invalid kind');
      return { evidenceId: item.id || null, valid: issues.length === 0, issues };
    });
    const inherited = evidenceSet.data.metadata || {};
    const conflicts = Array.isArray(inherited.conflicts) ? inherited.conflicts : [];
    const unknowns = Array.isArray(inherited.unknowns) ? inherited.unknowns : [];
    const valid = items.length > 0 && checks.every(item => item.valid);
    return {
      artifacts: [{ type: 'ValidationReport', data: {
        runId: run.id,
        evidenceSetArtifactId: evidenceSet.id,
        intentArtifactId: intent?.id || evidenceSet.data.intentArtifactId || null,
        valid,
        conflicts,
        unknowns,
        items: checks
      } }],
      events: [
        { type: 'EvidenceValidated', payload: { evidenceSetArtifactId: evidenceSet.id, valid, checked: checks.length, validCount:checks.filter(item=>item.valid).length, invalidCount:checks.filter(item=>!item.valid).length } },
        { type: 'ValidationCompleted', payload: { valid } }
      ]
    };
  }
});
