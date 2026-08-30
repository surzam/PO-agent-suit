import { createHash } from 'node:crypto';

const stableId=(prefix,value)=>`${prefix}-${createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0,12)}`;

export function createDataHarness({ dataFromEvidence }) {
  if (typeof dataFromEvidence !== 'function') throw new Error('Data Harness requires the existing Data implementation');
  return {
    id: 'data',
    version: 1,
    consumes: ['DataRequested'],
    produces: ['DataCreated', 'DataCompleted'],
    inputs: ['SynthesisPlan', 'EvidenceSet', 'ValidationReport'],
    outputs: ['DataArtifact'],
    async execute({ run, artifacts }) {
      const synthesis = artifacts.find(item => item.type === 'SynthesisPlan');
      const evidenceSet = artifacts.find(item => item.type === 'EvidenceSet');
      const validation = artifacts.find(item => item.type === 'ValidationReport');
      if (!synthesis) throw new Error('Data Harness requires a SynthesisPlan artifact');
      if (!evidenceSet) throw new Error('Data Harness requires an EvidenceSet artifact');
      if (!validation) throw new Error('Data Harness requires a ValidationReport artifact');
      if (!validation.data.valid) throw new Error('Data Harness requires a valid ValidationReport');
      const evidence = Array.isArray(evidenceSet.data.items) ? evidenceSet.data.items : [];
      const decisions = new Map((validation.data.items || []).map(item => [String(item.evidenceId), item]));
      const selectedIds = new Set(synthesis.data.keyClaims.flatMap(claim => claim.evidenceIds || []).map(String));
      const selectedEvidence = evidence.filter(item => selectedIds.has(String(item.id)) && item.kind === 'fact' && decisions.get(String(item.id))?.valid !== false);
      const source = dataFromEvidence(
        { question: synthesis.data.objective || 'SynthesisPlan' },
        { evidence: selectedEvidence, needs: [], sourceCalls: evidenceSet.data.metadata?.sourceCalls || 0 }
      );
      const claimByEvidence = new Map();
      for(const claim of synthesis.data.keyClaims)for(const id of claim.evidenceIds||[]){const key=String(id),ids=claimByEvidence.get(key)||[];ids.push(claim.id);claimByEvidence.set(key,[...new Set(ids)])}
      const evidenceById = new Map(selectedEvidence.map(item => [String(item.id), item]));
      const duplicateIds = new Map();
      const uniqueId = (base) => { const count=(duplicateIds.get(base)||0)+1;duplicateIds.set(base,count);return count===1?base:`${base}-${count}`; };
      const rowProvenance = source.rows.map((row,rowIndex) => {
        const evidenceId=String(row[0]), evidenceItem=evidenceById.get(evidenceId), decision=decisions.get(evidenceId), claimIds=claimByEvidence.get(evidenceId)||[];
        return { rowId:uniqueId(stableId('row',{row,evidenceIds:[evidenceId],claimIds})), rowIndex, kind:'fact', evidenceIds:[evidenceId], validationDecisionIds:decision?.decisionId?[decision.decisionId]:[], claimIds, sourceId:evidenceItem?.sourceId||null, sourceTitle:evidenceItem?.sourceTitle||null, sourceUri:evidenceItem?.sourceUri||null };
      });
      const selectedEvidenceIds=selectedEvidence.map(item=>String(item.id)), selectedClaimIds=[...new Set(selectedEvidenceIds.flatMap(id=>claimByEvidence.get(id)||[]))];
      const metricProvenance=(source.numericMetrics||[]).map(metric=>{const metricKey=String(metric[0]);const evidenceDerived=['evidence_count','source_count'].includes(metricKey);return{metricId:stableId('metric',{metricKey}),metricKey,kind:evidenceDerived?'derived-metric':'runtime-metadata',origin:evidenceDerived?'evidence':'runtime',evidenceIds:evidenceDerived?selectedEvidenceIds:[],validationDecisionIds:evidenceDerived?selectedEvidenceIds.map(id=>decisions.get(id)?.decisionId).filter(Boolean):[],claimIds:evidenceDerived?selectedClaimIds:[]}});
      const insightProvenance=(source.insights||[]).map((insight,insightIndex)=>({insightId:uniqueId(stableId('insight',{insight})),insightIndex,kind:'interpretation',evidenceIds:[],validationDecisionIds:[],claimIds:[]}));
      const provenance={synthesisPlanArtifactId:synthesis.id,evidenceSetArtifactId:evidenceSet.id,validationReportArtifactId:validation.id,rows:rowProvenance,metrics:metricProvenance,insights:insightProvenance};
      return {
        artifacts: [{ type:'DataArtifact', sourceArtifactIds:[synthesis.id,evidenceSet.id,validation.id], data: {
          ...source,
          runId: run.id,
          intentArtifactId: synthesis.data.intentArtifactId || null,
          synthesisPlanArtifactId: synthesis.id,
          evidenceSetArtifactId:evidenceSet.id,
          validationReportArtifactId:validation.id,
          provenance,
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
