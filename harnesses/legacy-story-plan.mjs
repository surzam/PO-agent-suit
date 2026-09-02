export function deriveSlideTitle(value, maxLength = 72) {
  const claim=String(value||'').replace(/\s+/g,' ').trim();
  if(!claim)return '';
  if(claim.length<=maxLength)return claim;
  const budget=Math.max(1,maxLength-1),prefix=claim.slice(0,budget+1);
  const punctuation=Math.max(prefix.lastIndexOf('. '),prefix.lastIndexOf('; '),prefix.lastIndexOf(': '),prefix.lastIndexOf(', '));
  const boundary=punctuation>=Math.floor(budget*.45)?punctuation+1:prefix.lastIndexOf(' ');
  const title=claim.slice(0,Math.max(1,boundary)).replace(/[\s,;:.]+$/,'').trim();
  return `${title}…`;
}

export function storyPlanFromSynthesis(synthesis, evidenceSet) {
  const claims = synthesis.data.keyClaims || [];
  const evidence = evidenceSet?.data?.items || [];
  const byId = new Map(evidence.map(item => [String(item.id), item]));
  const scenes = claims.map((claim, index) => ({
    index: index + 1,
    claimId: claim.id,
    // A slide title is a display label, never a destructive replacement for
    // the semantic Claim. The full Claim remains in thesis/claim for every
    // materialization and title shortening is explicit and word-safe.
    title: deriveSlideTitle(claim.claim) || `Claim ${index + 1}`,
    claim: claim.claim,
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
