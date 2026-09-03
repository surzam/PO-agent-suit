function providerError(error) {
  const message = String(error?.message || error || '');
  return /fetch|connect|timeout|timed out|недоступ|ECONNREFUSED|ENOTFOUND|HTTP 5/i.test(message);
}
function providerCode(error){if(error?.code==='INFERENCE_TIMEOUT'||/timed out|timeout/i.test(String(error?.message||'')))return'INFERENCE_TIMEOUT';if(error?.code==='ABORTED')return'ABORTED';if(error instanceof SyntaxError||/JSON|no JSON object|Unexpected end/i.test(String(error?.message||'')))return'MALFORMED_RESPONSE';return providerError(error)?'PROVIDER_UNAVAILABLE':(error?.code||'HARNESS_FAILED')}

export function createIntentDiscoveryHarness({ modelJson }) {
  if (typeof modelJson !== 'function') throw new Error('Intent Discovery Harness requires a provider');
  return {
    id: 'intent-discovery', version: 1, consumes: ['IntentDiscoveryRequested'],
    produces: ['IntentDiscovered', 'IntentDiscoveryInsufficientContext', 'IntentDiscoveryFailed'], inputs: [], outputs: ['Intent'],
    async execute({ context = {}, role, roleDefinition, artifacts, run, signal, observe = async () => {}, createOperationId = () => `${run.id}:intent-discovery:inference:1` }) {
      const available = context.availableContext || [];
      const prompt = 'Ты Intent Discovery Harness Product Owner. Сформулируй один новый практически полезный вопрос, который можно исследовать именно по переданному локальному контексту. Не требуй внешних бизнес-метрик, Jira или пользовательских интервью, если можно открыть проверяемое продуктовое или архитектурное напряжение в имеющихся файлах. Не выбирай вопрос из списка и не создавай Research, Narrative или готовую историю. Верни JSON: {status:"discovered"|"insufficient-context",question,reason,relevance,expectedDecision,requiredContext}. Используй insufficient-context только когда availableContext пуст, нечитаем или не содержит ни одного факта, пригодного для вопроса; отсутствие более широких данных само по себе не является недостатком контекста. Русский язык.';
      let operationId,value;
      try {
        const input=JSON.stringify({ role, roleDefinition, availableContext: available, artifacts: artifacts.map(a => ({ type: a.type, id: a.id })), runtime: context.runtime || {}, providerCapability: context.providerCapability || { available: true } });
        for(let attempt=0;attempt<2;attempt+=1){
          operationId=createOperationId(attempt?'inference-repair':'inference');
          const timeoutMs=180000,deadline=new Date(Date.now()+timeoutMs).toISOString();
          await observe('InferenceRequested', { operationId, provider:'model', capability:'MODEL', purpose:'intent-discovery', displayInput:'model.infer("intent-discovery")',deadline });
          await observe('InferenceStarted', { operationId, provider:'model', capability:'MODEL', purpose:'intent-discovery', displayInput:'model.infer("intent-discovery")',deadline });
          try{value=await modelJson(prompt,input,{signal,purpose:'intent-discovery',temperature:attempt?0.15:0.45,maxTokens:attempt?600:450,timeoutMs});if(value?.status!=='insufficient-context'&&!String(value?.question||'').trim())throw Object.assign(new Error('Intent Discovery returned malformed structured output'),{code:'MALFORMED_RESPONSE'});await observe('InferenceCompleted',{operationId,provider:'model',capability:'MODEL',purpose:'intent-discovery',status:value?.status||'discovered'});break}
          catch(error){const code=providerCode(error);await observe('InferenceFailed',{operationId,provider:'model',capability:'MODEL',purpose:'intent-discovery',code});if(code==='MALFORMED_RESPONSE'&&attempt===0)continue;throw Object.assign(error,{code})}
        }
        const status = value?.status === 'insufficient-context' ? 'insufficient-context' : 'discovered';
        const requiredContext = Array.isArray(value?.requiredContext) ? value.requiredContext.map(String).filter(Boolean) : [];
        if (status === 'insufficient-context' && !requiredContext.length) requiredContext.push('конкретные локальные факты о ситуации, которую нужно принять в решение');
        const data = { status, question: String(value?.question || '').trim(), reason: String(value?.reason || '').trim(), relevance: String(value?.relevance || '').trim(), expectedDecision: String(value?.expectedDecision || 'Определить следующий обоснованный шаг').trim(), requiredContext, ...(context.showcase?{showcase:{...context.showcase}}:{}) };
        if (status === 'discovered' && !data.question) throw new Error('Intent Discovery returned an empty question');
        if (status === 'insufficient-context') return { artifacts: [{ type: 'Intent', producedByOperationId:operationId, data }], events: [{ type: 'IntentDiscoveryInsufficientContext', payload: { requiredContext, reason: data.reason } }], halt: { status: 'needs-context' } };
        return { artifacts: [{ type: 'Intent', producedByOperationId:operationId, data }], events: [{ type: 'IntentDiscovered', payload: { question: data.question } }] };
      } catch (error) {
        const code=providerCode(error);
        const messages={PROVIDER_UNAVAILABLE:'Локальная модель недоступна.',INFERENCE_TIMEOUT:'Локальная модель не завершила Intent Discovery в установленный срок.',MALFORMED_RESPONSE:'Локальная модель вернула некорректный структурированный ответ.'};
        if(messages[code])return { events: [{ type: 'IntentDiscoveryFailed', payload: { message:messages[code],code } }], failure: { code,message:messages[code] } };
        throw Object.assign(error,{code});
      }
    }
  };
}
