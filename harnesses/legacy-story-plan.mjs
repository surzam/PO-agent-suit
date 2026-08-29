export function storyPlanFromSynthesis(synthesis, evidenceSet) {
  const claims = synthesis.data.keyClaims || [];
  const evidence = evidenceSet?.data?.items || [];
  const byId = new Map(evidence.map(item => [String(item.id), item]));
  const scenes = claims.map((claim, index) => ({
    index: index + 1,
    claimId: claim.id,
    title: claim.claim.slice(0, 72) || `Claim ${index + 1}`,
    thesis: claim.claim,
    evidence: claim.evidenceIds.map(id => byId.get(id)?.claim || id),
    evidenceIds: claim.evidenceIds,
    speakerScript: claim.kind === 'evidence-backed'
      ? `Этот вывод опирается на ${claim.evidenceIds.join(', ') || 'явно не указанное Evidence'}. Дальше мы обсуждаем его последствие для решения.`
      : `Это ${claim.kind}; его нужно обсуждать как часть продуктовой интерпретации, а не как новый факт.`,
    visualType: 'statement'
  }));
  return {
    topic: synthesis.data.objective || 'SynthesisPlan', audience: synthesis.data.audience,
    centralThesis: claims[0]?.claim || synthesis.data.objective, situation: synthesis.data.objective,
    evidence: claims.filter(claim => claim.evidenceIds.length).map(claim => `${claim.claim} [${claim.evidenceIds.join(', ')}]`),
    unknowns: synthesis.data.uncertainties || [],
    nextStep: synthesis.data.requestedOutputs?.length ? `Подготовить: ${synthesis.data.requestedOutputs.join(', ')}` : 'Выбрать следующий шаг на основе SynthesisPlan.',
    scenes
  };
}
