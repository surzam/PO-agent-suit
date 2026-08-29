export const intentHarness = Object.freeze({
  id: 'intent', version: 1, consumes: ['RunRequested'], produces: ['IntentDiscovered', 'ArtifactCreated'],
  inputs: ['run-request'], outputs: ['Intent'],
  async execute({ run }) {
    return { artifacts: [{ type: 'Intent', data: { status: 'discovered', question: run.intent, reason: 'Нормализовано из пользовательского ввода', relevance: 'Запрос пользователя', expectedDecision: 'Определить следующий обоснованный шаг', requiredContext: [] } }], events: [{ type: 'IntentDiscovered', payload: { source: 'human' } }] };
  }
});
