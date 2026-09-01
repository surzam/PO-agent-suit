function rows(data = {}) {
  return Array.isArray(data.rows) ? data.rows : [];
}

function provenanceRows(data = {}) {
  return data.provenance?.rows || data.rowProvenance || [];
}

function rowByStableId(data, ref) {
  const stable=(data.structuredRows||[]).find(item=>String(item?.rowId)===String(ref.rowId));
  if(stable&&Array.isArray(stable.values))return stable.values;
  // Backward compatibility for artifacts created before stable row values were
  // persisted. New artifacts never depend on this presentation-order fallback.
  return rows(data)[Number(ref.rowIndex)];
}

export function evidenceFromDataArtifact(dataArtifact) {
  const data = dataArtifact?.data || {};
  return provenanceRows(data).flatMap(ref => {
    const row = rowByStableId(data,ref);
    const evidenceId = ref.evidenceIds?.[0];
    if (!row || !evidenceId || ref.kind && ref.kind !== 'fact') return [];
    return [{
      id:String(evidenceId),
      claim:String(row[1] ?? row[0] ?? ''),
      sourceId:ref.sourceId || null,
      sourceTitle:ref.sourceTitle || String(row[2] ?? 'DataArtifact'),
      sourceUri:ref.sourceUri || `data://${dataArtifact.id}/${ref.rowId}`,
      confidence:String(row[3] ?? 'direct'),
      kind:'fact',
      rowId:ref.rowId
    }];
  });
}

export function dataRefsForEvidence(dataArtifact, evidenceIds = []) {
  const wanted = new Set(evidenceIds.map(String));
  const provenance = dataArtifact?.data?.provenance || {};
  const matching = entries => (entries || []).filter(item => (item.evidenceIds || []).some(id => wanted.has(String(id))));
  return {
    rowIds:matching(provenance.rows).map(item => item.rowId),
    metricIds:matching(provenance.metrics).map(item => item.metricId),
    insightIds:matching(provenance.insights).map(item => item.insightId)
  };
}
