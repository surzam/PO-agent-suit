import crypto from 'node:crypto';

const STAGES = ['brief', 'scout', 'planning', 'researching', 'validating', 'synthesizing', 'rendering', 'complete'];
const DEFAULT_LIMITS = { timeoutMs: 10 * 60_000, maxSourceCalls: 24, maxIterationsPerDod: 4, stagnationLimit: 2, maxWebPages: 3 };
const briefId = () => `brief-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
const generationId = () => `gen-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;

function cleanBrief(value, origin, transcript) {
  return {
    origin,
    question: String(value?.question || transcript.at(-1)?.content || '').trim(),
    goal: String(value?.goal || 'Получить проверяемый ответ для продуктового решения').trim(),
    audience: String(value?.audience || 'Product Owner и продуктовая команда').trim(),
    constraints: Array.isArray(value?.constraints) ? value.constraints.map(String).slice(0, 8) : [],
    exclusions: Array.isArray(value?.exclusions) ? value.exclusions.map(String).slice(0, 8) : [],
    expectedDecision: String(value?.expectedDecision || 'Определить следующий обоснованный шаг').trim(),
    language: 'ru'
  };
}

function snapshot(job) {
  return {
    generationId: job.generationId,
    state: job.state,
    progress: job.progress,
    brief: job.brief,
    error: job.error,
    result: job.result,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt
  };
}

export function createResearchService({ modelJson, sources = [], render, store, limits = {} }) {
  const config = { ...DEFAULT_LIMITS, ...limits };
  const sessions = new Map();
  const jobs = new Map();

  function session(id = 'default') {
    if (!sessions.has(id)) sessions.set(id, { id, transcript: [], questionsAsked: 0, brief: null, ready: false });
    return sessions.get(id);
  }

  async function briefTurn({ sessionId = 'default', message }) {
    const current = session(sessionId);
    const content = String(message || '').trim();
    if (!content) throw new Error('Опишите исследовательский вопрос');
    current.transcript.push({ role: 'user', content });
    const response = await modelJson(
      'Ты редактор исследовательского задания Product Owner. Не меняй вопрос, цель или ограничения пользователя. Верни JSON: brief {question,goal,audience,constraints,exclusions,expectedDecision}, ready boolean, clarification string. Задавай вопрос только если без ответа исследование существенно поменяет смысл. Не спрашивай уже известное.',
      JSON.stringify({ transcript: current.transcript, previousBrief: current.brief, questionsRemaining: Math.max(0, 2 - current.questionsAsked) }),
      { temperature: 0.25, maxTokens: 650 }
    );
    const originalQuestion = current.brief?.question || current.transcript[0].content;
    current.brief = cleanBrief({ ...response?.brief, question: originalQuestion }, 'user', current.transcript);
    let clarification = String(response?.clarification || '').trim();
    if (clarification && current.questionsAsked < 2 && !response?.ready) {
      current.questionsAsked += 1;
      current.transcript.push({ role: 'assistant', content: clarification });
    } else clarification = '';
    current.ready = Boolean(response?.ready || current.questionsAsked >= 2 || !clarification);
    return { sessionId, brief: current.brief, ready: current.ready, clarification, questionsAsked: current.questionsAsked, transcript: current.transcript };
  }

  function emit(job, stage, message, details = {}) {
    job.state = stage;
    job.updatedAt = new Date().toISOString();
    job.progress = { stage, message, ...details, at: job.updatedAt };
    job.events.push(job.progress);
    if (job.events.length > 100) job.events.shift();
    for (const listener of job.listeners) listener(job.progress);
  }

  function ensureActive(job) {
    if (job.controller.signal.aborted) throw Object.assign(new Error('Исследование остановлено'), { code: 'CANCELLED' });
    if (Date.now() >= job.deadline) throw new Error('Исследование достигло лимита времени');
  }

  async function randomBrief(job) {
    const value = await modelJson(
      'Ты Product Owner-исследователь. Придумай неожиданный, но практически полезный ResearchBrief о PO Agent Suite · Workstation Computer или о работе продуктовой команды. Верни JSON brief {question,goal,audience,constraints,exclusions,expectedDecision}. Не повторяй универсальную архитектурную экскурсию; задай вопрос, который ведёт к решению.',
      JSON.stringify({ generationId: job.generationId, uniqueness: crypto.randomUUID() }),
      { signal: job.controller.signal, temperature: 1.15, maxTokens: 600 }
    );
    return cleanBrief(value?.brief || value, 'random', []);
  }

  async function planResearch(job) {
    const value = await modelJson(
      'Ты планировщик deep research для Product Owner. Верни JSON needs: 2–4 объекта {title, query, dods:[{criterion}]}. Для каждого need 1–3 конкретных критерия готовности. Запросы должны быть пригодны для локального и интернет-поиска. Не отвечай на исследовательский вопрос.',
      JSON.stringify(job.brief),
      { signal: job.controller.signal, temperature: 0.35, maxTokens: 900 }
    );
    const needs = Array.isArray(value?.needs) ? value.needs.slice(0, 4) : [];
    if (needs.length < 2) throw new Error('Модель не сформировала исследовательский план из 2–4 потребностей');
    return needs.map((need, index) => ({
      title: String(need.title || `Потребность ${index + 1}`),
      query: String(need.query || `${job.brief.question} ${need.title || ''}`),
      dods: (Array.isArray(need.dods) ? need.dods : []).slice(0, 3).map(dod => ({ criterion: String(dod.criterion || dod), status: 'pending', findings: [], evidenceIds: [], limitations: [] }))
    })).map(need => ({ ...need, dods: need.dods.length ? need.dods : [{ criterion: `Найти проверяемые факты для «${need.title}»`, status: 'pending', findings: [], evidenceIds: [], limitations: [] }] }));
  }

  async function gather(job, needs) {
    const evidence = []; const conflicts = []; const unknowns = []; const stats = {};
    let sourceCalls = 0; let webPages = 0;
    for (const need of needs) {
      ensureActive(job);
      emit(job, 'researching', `Ищу: ${need.title}`, { sourceCalls, evidence: evidence.length, sources:sources.map(source => source.id) });
      const documents = [];
      for (const source of sources) {
        if (sourceCalls >= config.maxSourceCalls) break;
        try {
          const found = await source.search({ query: `${need.query} ${job.brief.question}`, limit: source.id === 'web' ? 5 : 8, signal: job.controller.signal });
          sourceCalls += 1; stats[source.id] = (stats[source.id] || 0) + 1;
          if (source.fetch) {
            for (const candidate of found) {
              if (webPages >= config.maxWebPages || sourceCalls >= config.maxSourceCalls) break;
              try { documents.push(await source.fetch(candidate, { signal: job.controller.signal })); webPages += 1; sourceCalls += 1; stats[source.id] += 1; } catch (error) { need.dods[0].limitations.push(`${candidate.url}: ${error.message}`); }
            }
          } else documents.push(...found);
        } catch (error) {
          need.dods[0].limitations.push(`${source.id}: ${error.message}`);
        }
      }
      if (!documents.length) {
        const message = `Для «${need.title}» не найдено доступных источников`;
        unknowns.push(message); need.dods.forEach(dod => { dod.status = 'unknown'; dod.limitations.push(message); });
        continue;
      }
      const sourceList = documents.map((doc, index) => ({ ref: `S${index + 1}`, sourceUri: doc.sourceUri, sourceTitle: doc.sourceTitle, sourceKind: doc.sourceKind, text: doc.text.slice(0, 9000) }));
      const extracted = await modelJson(
        'Ты извлекаешь Evidence из предоставленных источников. Верни JSON evidence: [{claim,quote,sourceRef,confidence,kind}], conflicts, unknowns. Используй только sourceRef из списка. claim должен быть проверяемым и не содержать новых чисел. confidence: direct|corroborated|inferred|conflicted; kind: fact|interpretation|unknown. Цитата должна быть дословным коротким фрагментом или пустой.',
        JSON.stringify({ brief: job.brief, need, sources: sourceList }),
        { signal: job.controller.signal, temperature: 0.1, maxTokens: 1500 }
      );
      for (const item of Array.isArray(extracted?.evidence) ? extracted.evidence : []) {
        const source = sourceList.find(candidate => candidate.ref === item.sourceRef);
        if (!source || !String(item.claim || '').trim()) continue;
        const id = `E${String(evidence.length + 1).padStart(3, '0')}`;
        evidence.push({ id, claim: String(item.claim).trim(), quote: String(item.quote || '').trim(), sourceUri: source.sourceUri, sourceTitle: source.sourceTitle, sourceKind: source.sourceKind, retrievedAt: new Date().toISOString(), confidence: ['direct', 'corroborated', 'inferred', 'conflicted'].includes(item.confidence) ? item.confidence : 'inferred', kind: ['fact', 'interpretation', 'unknown'].includes(item.kind) ? item.kind : 'fact' });
        need.dods.forEach(dod => { dod.evidenceIds.push(id); dod.findings.push(String(item.claim).trim()); });
      }
      conflicts.push(...(Array.isArray(extracted?.conflicts) ? extracted.conflicts.map(String) : []));
      unknowns.push(...(Array.isArray(extracted?.unknowns) ? extracted.unknowns.map(String) : []));
      need.dods.forEach(dod => { dod.status = dod.evidenceIds.length ? 'met' : 'unknown'; });
      emit(job, 'researching', `Проверяемые сигналы: ${need.title}`, { sourceCalls, evidence:evidence.length, sources:sources.map(source => source.id) });
    }
    return { evidence, conflicts: [...new Set(conflicts)], unknowns: [...new Set(unknowns)], sourceStats: stats, sourceCalls };
  }

  function evidenceData(brief, research) {
    const facts = research.evidence.filter(item => item.kind === 'fact');
    return {
      title: brief.question,
      columns: ['Evidence ID', 'Наблюдение', 'Источник', 'Уверенность'],
      rows: facts.map(item => [item.id, item.claim, item.sourceTitle, item.confidence]),
      insights: research.needs.flatMap(need => need.dods.flatMap(dod => dod.findings.slice(0, 2))),
      sources: [...new Set(research.evidence.map(item => item.sourceUri))],
      sourceKind: research.evidence.some(item => item.sourceKind === 'web') ? 'uploaded-context' : 'local-index',
      numericMetrics: []
    };
  }

  async function execute(job, request) {
    try {
      await store.begin?.(job.generationId, { brief:request.brief || null });
      emit(job, 'brief', request.origin === 'random' ? 'Формирую неожиданный исследовательский заказ' : 'Фиксирую пользовательский заказ');
      job.brief = request.origin === 'random' ? await randomBrief(job) : request.brief;
      ensureActive(job);
      emit(job, 'scout', 'Проверяю доступные источники');
      const availableSources = sources.map(source => source.id);
      emit(job, 'planning', 'Строю потребности и критерии готовности', { sources: availableSources });
      const needs = await planResearch(job);
      const gathered = await gather(job, needs);
      ensureActive(job);
      emit(job, 'validating', 'Проверяю ссылки Evidence и неизвестности', { evidence: gathered.evidence.length });
      if (!gathered.evidence.length) throw new Error('Исследование не нашло ни одного проверяемого Evidence');
      const validIds = new Set(gathered.evidence.map(item => item.id));
      for (const need of needs) for (const dod of need.dods) dod.evidenceIds = dod.evidenceIds.filter(id => validIds.has(id));
      const research = { brief: job.brief, needs, evidence: gathered.evidence, conflicts: gathered.conflicts, unknowns: gathered.unknowns, sourceStats: gathered.sourceStats, sourceCalls: gathered.sourceCalls };
      emit(job, 'synthesizing', 'Собираю Data из Evidence');
      const data = evidenceData(job.brief, research);
      emit(job, 'rendering', 'Создаю Narrative, Slides и файлы');
      const rendered = await render({ generationId: job.generationId, brief: job.brief, research, data, signal: job.controller.signal, temperature: request.temperature, style: request.style });
      await store.save({ generationId: job.generationId, data, narrative: rendered.narrativeMarkdown, slides: rendered.slidesHtml, pptx: rendered.pptx, research, meta: rendered.manifestMeta });
      job.result = rendered.result;
      emit(job, 'complete', 'Исследование готово', { evidence: gathered.evidence.length });
      return job.result;
    } catch (error) {
      job.error = error.message;
      const terminal = error.code === 'CANCELLED' || job.controller.signal.aborted ? 'cancelled' : 'failed';
      emit(job, terminal, job.error);
      await store.mark?.(job.generationId, terminal, job.error).catch(() => {});
      throw error;
    }
  }

  function start({ sessionId = 'default', origin, temperature = 0.7, style } = {}) {
    const current = session(sessionId);
    const selectedOrigin = origin || (current.ready && current.brief ? 'user' : 'random');
    if (selectedOrigin === 'user' && !current.brief) throw new Error('Сначала сформируйте исследовательский заказ в чате');
    const id = generationId();
    const job = { generationId: id, state: 'brief', progress: null, brief: selectedOrigin === 'user' ? current.brief : null, result: null, error: null, events: [], listeners: new Set(), controller: new AbortController(), deadline: Date.now() + config.timeoutMs, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    jobs.set(id, job);
    job.done = execute(job, { origin: selectedOrigin, brief: job.brief, temperature, style });
    job.done.catch(() => {});
    return snapshot(job);
  }

  function get(id) { const job = jobs.get(id); return job ? snapshot(job) : null; }
  function cancel(id) { const job = jobs.get(id); if (!job || ['complete', 'failed', 'cancelled'].includes(job.state)) return false; job.controller.abort(); return true; }
  function subscribe(id, listener) { const job = jobs.get(id); if (!job) return null; job.listeners.add(listener); for (const event of job.events) listener(event); return () => job.listeners.delete(listener); }
  async function wait(id) { const job = jobs.get(id); if (!job) throw new Error('generation not found'); await job.done; return snapshot(job); }
  function resetSession(id = 'default') { sessions.delete(id); return session(id); }

  return { briefTurn, start, get, cancel, subscribe, wait, resetSession, jobs, sessions, stages: STAGES };
}

export { DEFAULT_LIMITS };
