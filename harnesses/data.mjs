export function createDataHarness({ dataFromEvidence }) {
  if (typeof dataFromEvidence !== 'function') throw new Error('Data Harness requires the existing Data implementation');
  return {
    id: 'data',
    version: 1,
    consumes: ['DataRequested'],
    produces: ['DataCreated', 'DataCompleted'],
    inputs: ['SynthesisPlan'],
    outputs: ['DataArtifact'],
    async execute({ run, artifacts }) {
      const synthesis = artifacts.find(item => item.type === 'SynthesisPlan');
      const evidenceSet = artifacts.find(item => item.type === 'EvidenceSet');
      const intent = artifacts.find(item => item.type === 'Intent');
      if (!synthesis) throw new Error('Data Harness requires a SynthesisPlan artifact');
      if (!evidenceSet) throw new Error('Data Harness requires an EvidenceSet artifact');
      const evidence = Array.isArray(evidenceSet.data.items) ? evidenceSet.data.items : [];
      const selectedIds = new Set(synthesis.data.keyClaims.flatMap(claim => claim.evidenceIds || []).map(String));
      const selectedEvidence = evidence.filter(item => selectedIds.has(String(item.id)) && item.kind === 'fact');
      const source = dataFromEvidence(
        { question: synthesis.data.objective || 'SynthesisPlan' },
        { evidence: selectedEvidence, needs: [], sourceCalls: evidenceSet.data.metadata?.sourceCalls || 0 }
      );
      const claimByEvidence = new Map(synthesis.data.keyClaims.flatMap(claim => (claim.evidenceIds || []).map(id => [String(id), claim.id])));
      const rowProvenance = source.rows.map(row => ({ evidenceIds: [String(row[0])], claimIds: claimByEvidence.has(String(row[0])) ? [claimByEvidence.get(String(row[0]))] : [] }));
      return {
        artifacts: [{ type:'DataArtifact', sourceArtifactIds:[synthesis.id], data: {
          ...source,
          runId: run.id,
          intentArtifactId: intent?.id || synthesis.data.intentArtifactId || null,
          synthesisPlanArtifactId: synthesis.id,
          rowProvenance
        } }],
        events: [
          { type:'DataCreated', payload:{ synthesisPlanArtifactId:synthesis.id, rows:source.rows.length } },
          { type:'DataCompleted', payload:{ synthesisPlanArtifactId:synthesis.id } }
        ]
      };
    }
  };
}
