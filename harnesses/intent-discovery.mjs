function providerError(error) {
  const message = String(error?.message || error || '');
  return /fetch|connect|timeout|timed out|недоступ|ECONNREFUSED|ENOTFOUND|HTTP 5/i.test(message);
}

export function createIntentDiscoveryHarness({ modelJson }) {
  if (typeof modelJson !== 'function') throw new Error('Intent Discovery Harness requires a provider');
  return {
    id: 'intent-discovery', version: 1, consumes: ['IntentDiscoveryRequested'],
    produces: ['IntentDiscovered', 'IntentDiscoveryInsufficientContext', 'IntentDiscoveryFailed'], inputs: [], outputs: ['Intent'],
    async execute({ context = {}, role, roleDefinition, artifacts, run, observe = async () => {}, createOperationId = () => `${run.id}:intent-discovery:inference:1` }) {
      const available = context.availableContext || [];
      const prompt = 'Ты Intent Discovery Harness Product Owner. Сформулируй один новый практически полезный вопрос, который можно исследовать именно по переданному локальному контексту. Не требуй внешних бизнес-метрик, Jira или пользовательских интервью, если можно открыть проверяемое продуктовое или архитектурное напряжение в имеющихся файлах. Не выбирай вопрос из списка и не создавай Research, Narrative или готовую историю. Верни JSON: {status:"discovered"|"insufficient-context",question,reason,relevance,expectedDecision,requiredContext}. Используй insufficient-context только когда availableContext пуст, нечитаем или не содержит ни одного факта, пригодного для вопроса; отсутствие более широких данных само по себе не является недостатком контекста. Русский язык.';
      const operationId=createOperationId('inference');
      try {
        await observe('InferenceRequested', { operationId, provider:'model', capability:'MODEL', purpose:'intent-discovery', displayInput:'model.infer("intent-discovery")' });
        await observe('InferenceStarted', { operationId, provider:'model', capability:'MODEL', purpose:'intent-discovery', displayInput:'model.infer("intent-discovery")' });
        const value = await modelJson(prompt, JSON.stringify({ role, roleDefinition, availableContext: available, artifacts: artifacts.map(a => ({ type: a.type, id: a.id })), runtime: context.runtime || {}, providerCapability: context.providerCapability || { available: true } }));
        await observe('InferenceCompleted', { operationId, provider: 'model', capability:'MODEL', purpose: 'intent-discovery', status: value?.status || 'discovered' });
        const status = value?.status === 'insufficient-context' ? 'insufficient-context' : 'discovered';
        const requiredContext = Array.isArray(value?.requiredContext) ? value.requiredContext.map(String).filter(Boolean) : [];
        if (status === 'insufficient-context' && !requiredContext.length) requiredContext.push('конкретные локальные факты о ситуации, которую нужно принять в решение');
        const data = { status, question: String(value?.question || '').trim(), reason: String(value?.reason || '').trim(), relevance: String(value?.relevance || '').trim(), expectedDecision: String(value?.expectedDecision || 'Определить следующий обоснованный шаг').trim(), requiredContext };
        if (status === 'discovered' && !data.question) throw new Error('Intent Discovery returned an empty question');
        if (status === 'insufficient-context') return { artifacts: [{ type: 'Intent', producedByOperationId:operationId, data }], events: [{ type: 'IntentDiscoveryInsufficientContext', payload: { requiredContext, reason: data.reason } }], halt: { status: 'needs-context' } };
        return { artifacts: [{ type: 'Intent', producedByOperationId:operationId, data }], events: [{ type: 'IntentDiscovered', payload: { question: data.question } }] };
      } catch (error) {
        await observe('InferenceFailed', { operationId, provider: 'model', capability:'MODEL', purpose:'intent-discovery', code: error.code || 'PROVIDER_ERROR' });
        if (providerError(error)) return { events: [{ type: 'IntentDiscoveryFailed', payload: { message: 'Не удалось открыть новый ракурс: локальная модель недоступна. Запустите модель и попробуйте снова.', code: 'PROVIDER_UNAVAILABLE' } }], failure: { code: 'PROVIDER_UNAVAILABLE', message: 'Не удалось открыть новый ракурс: локальная модель недоступна. Запустите модель и попробуйте снова.' } };
        throw error;
      }
    }
  };
}
