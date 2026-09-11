// No legacy structural boolean/status grants factual authority.
export function presentValidationDecision(decision) {
  if (!decision) return null;
  if (decision.epistemicStatus === 'conflicted') return 'В исходных данных отмечено расхождение';
  if (decision.epistemicStatus === 'supported' && decision.evidenceKind === 'fact' && decision.structurallyValid === true)
    return 'Указана опора на источник; достоверность не проверена';
  return 'Достоверность не установлена';
}
