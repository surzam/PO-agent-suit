const ALLOWED_KINDS = new Set(['evidence-backed', 'interpretation', 'assumption', 'recommendation', 'unknown']);

function normalizeClaim(claim, index) {
  const evidenceIds = [...new Set((claim?.evidenceIds || []).map(String))];
  const kind = ALLOWED_KINDS.has(claim?.kind) ? claim.kind : (evidenceIds.length ? 'evidence-backed' : 'interpretation');
  return { id: String(claim?.id || `C${String(index + 1).padStart(3, '0')}`), claim: String(claim?.claim || '').trim(), evidenceIds, kind };
}

export function createSynthesisHarness({ modelJson }) {
  if (typeof modelJson !== 'function') throw new Error('Synthesis Harness requires the existing inference provider');
  return {
    id: 'synthesis',
    version: 1,
    consumes: ['SynthesisRequested'],
    produces: ['SynthesisPlanCreated', 'SynthesisCompleted'],
    inputs: ['Brief', 'EvidenceSet', 'ValidationReport'],
    outputs: ['SynthesisPlan'],
    async execute({ run, artifacts, role, roleDefinition, workflow, config = {}, observe = async () => {} }) {
      const brief = artifacts.find(item => item.type === 'Brief');
      const evidenceSet = artifacts.find(item => item.type === 'EvidenceSet');
      const validation = artifacts.find(item => item.type === 'ValidationReport');
      const intent = artifacts.find(item => item.type === 'Intent');
      if (!brief || !evidenceSet || !validation) throw new Error('Synthesis Harness requires Brief, EvidenceSet and ValidationReport');
      if (!validation.data.valid) throw new Error('Synthesis Harness requires a valid ValidationReport');
      const evidence = Array.isArray(evidenceSet.data.items) ? evidenceSet.data.items : [];
      const allowedIds = new Set(evidence.map(item => String(item.id)));
      await observe('InferenceRequested',{capability:'MODEL',purpose:'synthesis',displayInput:'model.infer("synthesis")'});
      await observe('InferenceStarted',{capability:'MODEL',purpose:'synthesis',displayInput:'model.infer("synthesis")'});
      let response;
      try { response = await modelJson(
        `Ты Synthesis Harness AgentSuite. Собери только JSON SynthesisPlan из Brief, EvidenceSet и ValidationReport. Не добавляй факты без Evidence ID. Роль — профессиональный worldview, а не готовый ответ: используй её priorities/questions/decisionCriteria для выбора framing, но не меняй факты. Верни поля objective, audience, keyClaims [{id,claim,evidenceIds,kind}], uncertainties, structure, requestedOutputs. kind: evidence-backed|interpretation|assumption|recommendation|unknown. Каждый значимый факт обязан ссылаться на существующие Evidence ID; мнение без ссылки пометь interpretation, assumption или recommendation. Не создавай новые числа. Русский язык. Worldview: ${JSON.stringify(roleDefinition || { id:role, priorities:[], questions:[], decisionCriteria:[] })}`,
        JSON.stringify({ role, roleDefinition, workflow, brief:brief.data, evidence:evidence.map(item => ({ id:item.id, claim:item.claim, sourceUri:item.sourceUri, confidence:item.confidence, kind:item.kind })), validation:validation.data, requestedOutputs:config.requestedOutputs || [] }),
        { temperature: Number(config.temperature ?? 0.35), maxTokens: Number(config.maxTokens ?? 1400) }
      ); await observe('InferenceCompleted',{capability:'MODEL',purpose:'synthesis'}); }
      catch(error) { await observe('InferenceFailed',{capability:'MODEL',purpose:'synthesis',code:error.code || 'PROVIDER_FAILURE'}); throw error; }
      const rawClaims = Array.isArray(response?.keyClaims) ? response.keyClaims : [{ id:'C001', claim:response?.centralThesis || brief.data.goal, evidenceIds:evidence.filter(item => item.kind === 'fact').slice(0, 2).map(item => item.id), kind:'evidence-backed' }];
      const keyClaims = rawClaims.map(normalizeClaim).filter(item => item.claim);
      const invalidIds = keyClaims.flatMap(item => item.evidenceIds.filter(id => !allowedIds.has(id)));
      if (invalidIds.length) throw new Error(`SynthesisPlan contains unknown Evidence IDs: ${[...new Set(invalidIds)].join(', ')}`);
      if (!keyClaims.length) throw new Error('SynthesisPlan requires at least one claim');
      const data = {
        runId: run.id,
        roleId: role,
        worldview: roleDefinition ? { id:roleDefinition.id, label:roleDefinition.label, priorities:[...roleDefinition.priorities], decisionCriteria:[...roleDefinition.decisionCriteria] } : { id:role },
        briefArtifactId: brief.id,
        intentArtifactId: intent?.id || brief.data.intentArtifactId || evidenceSet.data.intentArtifactId || null,
        evidenceSetArtifactId: evidenceSet.id,
        validationReportArtifactId: validation.id,
        objective: String(response?.objective || brief.data.goal || '').trim(),
        audience: String(response?.audience || role || brief.data.audience || '').trim(),
        keyClaims,
        uncertainties: Array.isArray(response?.uncertainties) ? response.uncertainties.map(String) : (evidenceSet.data.metadata?.unknowns || []).map(String),
        structure: Array.isArray(response?.structure) ? response.structure : [],
        requestedOutputs: Array.isArray(response?.requestedOutputs) ? response.requestedOutputs.map(String) : (config.requestedOutputs || [])
      };
      return {
        artifacts: [{ type:'SynthesisPlan', sourceArtifactIds:[brief.id, evidenceSet.id, validation.id], data }],
        events: [
          { type:'SynthesisPlanCreated', payload:{ claimCount:keyClaims.length, requestedOutputs:data.requestedOutputs } },
          { type:'SynthesisCompleted', payload:{ synthesisPlanReady:true } }
        ]
      };
    }
  };
}
