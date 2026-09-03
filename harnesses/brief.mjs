export const briefHarness = Object.freeze({
  id: 'brief',
  version: 1,
  consumes: ['RunRequested'],
  produces: ['BriefCreated', 'ArtifactCreated'],
  inputs: ['Intent'],
  outputs: ['Brief'],
  async execute({ run, artifacts }) {
    const intent = artifacts?.find(item => item.type === 'Intent');
    const question = intent?.data?.question || run.intent;
    return {
      artifacts: [{ type: 'Brief', sourceArtifactIds: intent ? [intent.id] : [], data: {
        question,
        intentArtifactId: intent?.id || null,
        role: run.role,
        workflow: run.workflow,
        goal: 'Собрать проверяемую основу для workflow',
        constraints: ['Headless local runtime', 'Без выдуманных фактов'],
        expectedDecision: intent?.data?.expectedDecision || 'Определить следующий обоснованный шаг',
        ...(intent?.data?.showcase?{showcase:{...intent.data.showcase},context:intent.data.showcase.description,audience:'Product Owner и продуктовая команда',successCriteria:['Решение опирается на несколько независимых источников','Неизвестности и противоречия сохранены'],timeHorizon:'Горизонт указан в демонстрационных источниках'}:{})
      } }],
      events: [{ type: 'BriefCreated', payload: { question: run.intent } }]
    };
  }
});
