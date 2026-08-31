import crypto from 'node:crypto';

const STAGES = ['brief', 'scout', 'planning', 'researching', 'validating', 'synthesizing', 'rendering', 'complete'];
const DEFAULT_LIMITS = { timeoutMs: 10 * 60_000, maxSourceCalls: 24, maxIterationsPerDod: 4, stagnationLimit: 2, maxWebPages: 3 };
const briefId = () => `brief-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
const generationId = () => `gen-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
function safeSourceMetadata(source = {}) {
  const sourceId = String(source.sourceId || '').replace(/[^\p{L}\p{N}:._-]/gu, '').slice(0, 160);
  const sourceKind = String(source.sourceKind || 'unknown').slice(0, 32);
  const safeDisplayName = String(source.sourceTitle || source.title || 'source').split(/[\\/]/).at(-1).replace(/[\r\n]/g, ' ').slice(0, 160);
  return { sourceId: sourceId || `${sourceKind}:unknown`, sourceKind, safeDisplayName };
}

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
    mode: job.mode,
    state: job.state,
    progress: job.progress,
    brief: job.brief,
    error: job.error,
    failureCause: job.failureCause || null,
    requiredContext: job.requiredContext || [],
    result: job.result,
    research: job.research || null,
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
    job.progress = { sequence:job.events.length + 1, stage, message, mode:job.mode, ...details, at: job.updatedAt };
    job.events.push(job.progress);
    if (job.events.length > 100) job.events.shift();
    for (const listener of job.listeners) listener(job.progress);
  }

  async function observe(job, type, payload = {}) {
    if (typeof job.observe === 'function') await job.observe(type, payload);
  }

  function operationId(job, kind) {
    job.operationOrdinal = Number(job.operationOrdinal || 0) + 1;
    return typeof job.createOperationId === 'function'
      ? job.createOperationId(kind)
      : `${job.generationId}:${kind}:${job.operationOrdinal}`;
  }

  function ensureActive(job) {
    if (job.controller.signal.aborted) throw Object.assign(new Error('Исследование остановлено'), { code: 'CANCELLED' });
    if (Date.now() >= job.deadline) throw Object.assign(new Error('Исследование достигло лимита времени'),{code:'RESEARCH_TIMEOUT'});
  }

  async function randomBrief(job) {
    const value = await modelJson(
      'Ты Product Owner-исследователь. Придумай неожиданный, но практически полезный ResearchBrief строго о PO Agent Suite. Разрешённые опоры: chat-first интерфейс; случайный локальный ракурс; ResearchBrief; локальный индекс кода и product lore; Evidence; цепочка Data → Narrative → Slides; 35 визуальных тем; generationId и отдельная папка артефактов; Electron-приложение. Нельзя придумывать config.json, удалённую синхронизацию, скрытые функции и интеграции. Вопрос должен проверяться по локальной директории без интернета. Верни JSON brief {question,goal,audience,constraints,exclusions,expectedDecision}. Выбери конкретное напряжение, парадокс, пользовательскую сцену или продуктовое решение, а не обзор архитектуры.',
      JSON.stringify({ generationId: job.generationId, uniqueness: crypto.randomUUID(), requiredConstraint:'Только существующие файлы и возможности из списка опор' }),
      { signal: job.controller.signal, temperature: 1.05, maxTokens: 600 }
    );
    return cleanBrief(value?.brief || value, 'random', []);
  }

  async function planResearch(job) {
    let value;
    for(let attempt=0;attempt<2;attempt+=1){
      const inferenceId=operationId(job,attempt?'research-plan-repair':'research-plan');
      await observe(job,'InferenceRequested',{operationId:inferenceId,capability:'MODEL',purpose:'research-plan',displayInput:'model.infer("research-plan")'});await observe(job,'InferenceStarted',{operationId:inferenceId,capability:'MODEL',purpose:'research-plan',displayInput:'model.infer("research-plan")'});
      try{value=await modelJson('Ты планировщик deep research для Product Owner. Верни JSON needs: 2–4 объекта {title, query, dods:[{criterion}]}. Для каждого need 1–3 конкретных критерия готовности. Запросы должны быть пригодны для локального и интернет-поиска. Не отвечай на исследовательский вопрос.',JSON.stringify(job.brief),{signal:job.controller.signal,temperature:attempt?0.15:0.35,maxTokens:attempt?650:500,timeoutMs:job.budgets?.researchPlanningMs||180000});if(!Array.isArray(value?.needs))throw Object.assign(new Error('Research plan returned malformed structured output'),{code:'MALFORMED_RESPONSE'});await observe(job,'InferenceCompleted',{operationId:inferenceId,capability:'MODEL',purpose:'research-plan'});break}
      catch(error){const malformed=error.code==='MALFORMED_RESPONSE'||error instanceof SyntaxError;const code=malformed?'MALFORMED_RESPONSE':error.code||'PROVIDER_FAILURE';await observe(job,'InferenceFailed',{operationId:inferenceId,capability:'MODEL',purpose:'research-plan',code});if(malformed&&attempt===0)continue;throw Object.assign(error,{code})}
    }
    const needs = Array.isArray(value?.needs) ? value.needs.slice(0, 2) : [];
    if (needs.length < 2) throw new Error('Модель не сформировала исследовательский план из 2–4 потребностей');
    return needs.map((need, index) => ({
      title: String(need.title || `Потребность ${index + 1}`),
      query: String(need.query || `${job.brief.question} ${need.title || ''}`),
      dods: (Array.isArray(need.dods) ? need.dods : []).slice(0, 3).map(dod => ({ criterion: String(dod.criterion || dod), status: 'pending', findings: [], evidenceIds: [], limitations: [] }))
    })).map(need => ({ ...need, dods: need.dods.length ? need.dods : [{ criterion: `Найти проверяемые факты для «${need.title}»`, status: 'pending', findings: [], evidenceIds: [], limitations: [] }] }));
  }

  async function gather(job, needs, mode) {
    const evidence = []; const conflicts = []; const unknowns = []; const stats = {},documentCache=new Map();
    let sourceCalls = 0; let webPages = 0;
    const activeSources = sources;
    for (const [needIndex,need] of needs.entries()) {
      ensureActive(job);
      emit(job, 'researching', `Ищу: ${need.title}`, { need:need.title, sourceCalls, evidence:evidence.length, sources:activeSources.map(source => source.id) });
      const documents = [];
      for (const source of activeSources) {
        if (sourceCalls >= config.maxSourceCalls) break;
        const searchId=operationId(job,`${source.id}-search`);
        try {
          const displayInput = `${source.id}.search("research-context")`;
          await observe(job, 'CapabilityRequested', { operationId:searchId, capability:source.id.toUpperCase(), provider:source.provider||source.id, operation:'search', displayInput });
          await observe(job, 'CapabilityStarted', { operationId:searchId, capability:source.id.toUpperCase(), provider:source.provider||source.id, operation:'search', displayInput });
          let found = await source.search({ query: `${need.query} ${job.brief.question}`, limit: 4, signal: job.controller.signal });
          // A conversational question often contains no repository terms. Keep the
          // run useful by collecting the real product context; never invent facts.
          if (!found.length && source.id === 'local') found = await source.search({ query: 'PO Agent Suite product context', limit: 4, signal: job.controller.signal });
          sourceCalls += 1; stats[source.id] = (stats[source.id] || 0) + 1;
          await observe(job, 'CapabilityCompleted', { operationId:searchId, capability:source.id.toUpperCase(), provider:source.provider||source.id,operation:'search', found:found.length });
          emit(job, 'researching', `${source.id}: найдено ${found.length}`, { need:need.title, source:source.id, found:found.length, sourceCalls, evidence:evidence.length, sources:activeSources.map(item => item.id), capability:source.id.toUpperCase() });
          if (source.fetch) {
            for (const candidate of found) {
              if (webPages >= config.maxWebPages || sourceCalls >= config.maxSourceCalls) break;
              const readId=operationId(job,`${source.id}-read`);
              try { const target=String(candidate.title || candidate.url || 'source').slice(0,96); const safeTarget=target.split(/[\\/]/).at(-1).replace(/[^\p{L}\p{N} ._-]/gu,'').slice(0,72)||'source'; const meta=safeSourceMetadata({sourceId:candidate.sourceId,sourceKind:source.id,sourceTitle:target}); const cacheKey=meta.sourceId||candidate.url||target;let document=documentCache.get(cacheKey);if(!document){await observe(job,'SourceOpened',{operationId:readId,capability:source.id.toUpperCase(),...meta,target,displayInput:`${source.id}.read("${safeTarget}")`});document=await source.fetch(candidate,{signal:job.controller.signal});documentCache.set(cacheKey,document);await observe(job,'SourceRead',{operationId:readId,capability:source.id.toUpperCase(),...meta,target});webPages+=1;sourceCalls+=1;stats[source.id]+=1}documents.push({...document,sourceId:document.sourceId||meta.sourceId});emit(job,'researching',`Прочитан источник: ${target}`,{need:need.title,source:source.id,sourceCalls,evidence:evidence.length,sources:activeSources.map(item=>item.id)}); } catch (error) { job.sourceFailures=(job.sourceFailures||0)+1; await observe(job,'CapabilityFailed',{operationId:readId,capability:source.id.toUpperCase(),operation:'read',code:error.code || 'SOURCE_UNAVAILABLE'}); need.dods[0].limitations.push(`${candidate.url}: ${error.message}`); }
            }
          } else {
            documents.push(...found);
            for (const document of found) {
              const meta=safeSourceMetadata(document);
              const readId=operationId(job,`${source.id}-read`);
              await observe(job,'SourceOpened',{operationId:readId,capability:source.id.toUpperCase(),...meta,displayInput:`${source.id}.read("research-context")`});
              await observe(job,'SourceRead',{operationId:readId,capability:source.id.toUpperCase(),...meta});
            }
          }
        } catch (error) {
          job.sourceFailures=(job.sourceFailures||0)+1;
          await observe(job,'CapabilityFailed',{operationId:searchId,capability:source.id.toUpperCase(),operation:'search',code:error.code || 'SOURCE_UNAVAILABLE'});
          need.dods[0].limitations.push(`${source.id}: ${error.message}`);
        }
      }
      if (!documents.length) {
        const message = `Для «${need.title}» не найдено доступных источников`;
        unknowns.push(message); need.dods.forEach(dod => { dod.status = 'unknown'; dod.limitations.push(message); });
        continue;
      }
      const uniqueDocuments=[...new Map(documents.map(doc=>[doc.sourceId||doc.sourceUri||doc.sourceTitle,doc])).values()];
      const sourceList = uniqueDocuments.slice(0, 2).map((doc, index) => ({ ref: `S${index + 1}`, sourceId:doc.sourceId || `${doc.sourceKind || 'source'}:${index + 1}`, sourceUri: doc.sourceUri, sourceTitle: doc.sourceTitle, sourceKind: doc.sourceKind, text: doc.text.slice(0, 2000) }));
      await observe(job,'ResearchProgressed',{phase:'evidence-extraction',batch:needIndex+1,batches:needs.length,sourcesRead:documentCache.size,evidenceAccepted:evidence.length});
      emit(job, 'researching', `Извлекаю Evidence из ${sourceList.length} источников`, { sourceCalls, evidence:evidence.length, sources:activeSources.map(source => source.id), capability:'MODEL' });
      let extracted;
      for(let attempt=0;attempt<2;attempt+=1){const extractionId=operationId(job,attempt?'evidence-extraction-repair':'evidence-extraction');await observe(job,'InferenceRequested',{operationId:extractionId,capability:'MODEL',purpose:'evidence-extraction',displayInput:'model.infer("evidence-extraction")'});await observe(job,'InferenceStarted',{operationId:extractionId,capability:'MODEL',purpose:'evidence-extraction',displayInput:'model.infer("evidence-extraction")'});try{extracted=await modelJson('Ты извлекаешь Evidence из предоставленных источников. Верни JSON evidence: [{claim,quote,sourceRef,confidence,kind}], conflicts, unknowns. Используй только sourceRef из списка. claim должен быть проверяемым и не содержать новых чисел. confidence: direct|corroborated|inferred|conflicted; kind: fact|interpretation|unknown. Цитата должна быть дословным коротким фрагментом или пустой.',JSON.stringify({brief:job.brief,need,sources:sourceList}),{signal:job.controller.signal,temperature:0.1,maxTokens:attempt?600:450,timeoutMs:job.budgets?.evidenceExtractionMs||240000});if(!Array.isArray(extracted?.evidence))throw Object.assign(new Error('Evidence extraction returned malformed structured output'),{code:'MALFORMED_RESPONSE'});await observe(job,'InferenceCompleted',{operationId:extractionId,capability:'MODEL',purpose:'evidence-extraction'});break}catch(error){const malformed=error.code==='MALFORMED_RESPONSE'||error instanceof SyntaxError,code=malformed?'MALFORMED_RESPONSE':error.code||'PROVIDER_FAILURE';await observe(job,'InferenceFailed',{operationId:extractionId,capability:'MODEL',purpose:'evidence-extraction',code});if(malformed&&attempt===0)continue;throw Object.assign(error,{code})}}
      const evidenceBeforeExtraction = evidence.length;
      for (const item of Array.isArray(extracted?.evidence) ? extracted.evidence : []) {
        const source = sourceList.find(candidate => candidate.ref === item.sourceRef);
        if (!source || !String(item.claim || '').trim()) continue;
        const id = `E${String(evidence.length + 1).padStart(3, '0')}`;
        evidence.push({ id, claim: String(item.claim).trim(), quote: String(item.quote || '').trim(), sourceId:source.sourceId, sourceUri: source.sourceUri, sourceTitle: source.sourceTitle, sourceKind: source.sourceKind, retrievedAt: new Date().toISOString(), confidence: ['direct', 'corroborated', 'inferred', 'conflicted'].includes(item.confidence) ? item.confidence : 'inferred', kind: ['fact', 'interpretation', 'unknown'].includes(item.kind) ? item.kind : 'fact' });
        need.dods.forEach(dod => { dod.evidenceIds.push(id); dod.findings.push(String(item.claim).trim()); });
      }
      // Some local models answer the extraction request with an empty array
      // when the user's wording has no repository vocabulary. The sources are
      // still real and inspectable, so retain a short source-derived fact
      // instead of failing an otherwise valid run.
      if (evidence.length === evidenceBeforeExtraction) {
        for (const source of sourceList.slice(0, 2)) {
          const claim = describeLocalDocument({ sourceTitle: source.sourceTitle, text: source.text });
          if (!claim) continue;
          const id = `E${String(evidence.length + 1).padStart(3, '0')}`;
          evidence.push({ id, claim, quote: source.text.slice(0, 260), sourceId:source.sourceId, sourceUri: source.sourceUri, sourceTitle: source.sourceTitle, sourceKind: source.sourceKind, retrievedAt: new Date().toISOString(), confidence: 'direct', kind: 'fact' });
          need.dods.forEach(dod => { dod.evidenceIds.push(id); dod.findings.push(claim); });
        }
      }
      conflicts.push(...(Array.isArray(extracted?.conflicts) ? extracted.conflicts.map(String) : []));
      unknowns.push(...(Array.isArray(extracted?.unknowns) ? extracted.unknowns.map(String) : []));
      need.dods.forEach(dod => { dod.status = dod.evidenceIds.length ? 'met' : 'unknown'; });
      await observe(job,'ResearchProgressed',{phase:'evidence-extraction-completed',batch:needIndex+1,batches:needs.length,sourcesRead:documentCache.size,evidenceAccepted:evidence.length});
      emit(job, 'researching', `Проверяемые сигналы: ${need.title}`, { need:need.title, sourceCalls, evidence:evidence.length, sources:activeSources.map(source => source.id) });
    }
    return { evidence, conflicts: [...new Set(conflicts)], unknowns: [...new Set(unknowns)], sourceStats: stats, sourceCalls };
  }

  function localExcerpt(text) {
    const clean = String(text || '').replace(/```[\s\S]*?```/g, ' ').replace(/[#>*`_|{}[\]]/g, ' ').replace(/\s+/g, ' ').trim();
    const sentence = clean.split(/(?<=[.!?])\s+/).find(value => value.length >= 35) || clean;
    return sentence.slice(0, 260).trim();
  }

  function describeLocalDocument(document) {
    const title = String(document.sourceTitle || 'локальный файл');
    const text = String(document.text || '');
    if (/product-lore\.md$/i.test(title)) return localExcerpt(text.replace(/^#.*$/gm, ''));
    if (/package\.json$/i.test(title)) {
      try { const value=JSON.parse(text); return `package.json описывает приложение как «${value.description || value.name}» и закрепляет Electron entrypoint ${value.main || 'electron/main.mjs'}.`; } catch {}
    }
    if (/research\/service\.mjs$/i.test(title)) {
      const stages = [...text.matchAll(/['"](brief|scout|planning|researching|validating|synthesizing|rendering|complete)['"]/g)].map(match => match[1]);
      return `research/service.mjs ведёт job через ${[...new Set(stages)].join(' → ')} и передаёт факты между стадиями через Evidence ID.`;
    }
    if (/research\/storage\.mjs$/i.test(title)) return 'research/storage.mjs атомарно записывает Data, CSV, Narrative, Slides, PPTX, Research и Manifest в отдельную папку generationId.';
    if (/research\/sources\.mjs$/i.test(title)) return 'research/sources.mjs ограничивает локальный индекс разрешёнными форматами и защищает HTTP-поиск проверкой адресов, redirect и размера ответа.';
    if (/server\.mjs$/i.test(title)) return 'server.mjs связывает модель, асинхронный research job, SSE-прогресс и неизменяемые маршруты Data, Narrative, Slides и PPTX.';
    if (/po-agent-suite\.html$/i.test(title)) {
      const pageTitle = text.match(/<title>([^<]+)/i)?.[1]?.trim();
      return `Локальная продуктовая страница формулирует позиционирование: «${pageTitle || 'AI-инструмент для Product Owner'}».`;
    }
    if (/po-agent\.config\.ya?ml$/i.test(title)) return 'po-agent.config.yaml закрепляет локальный llama.cpp endpoint, границы research-источников, лимиты job и отдельный каталог exports.';
    const exports = [...new Set([...text.matchAll(/(?:export\s+)?(?:async\s+)?function\s+([A-Za-z0-9_]+)/g)].map(match => match[1]))];
    if (exports.length) return `${title} содержит исполняемые механизмы ${exports.slice(0, 6).join(', ')}; это проверяемая кодовая опора текущего ракурса.`;
    return localExcerpt(text);
  }

  async function gatherRandom(job, need) {
    const localSources = sources.filter(source => source.id !== 'web');
    const evidence = []; const sourceStats = {}; let sourceCalls = 0;
    emit(job, 'researching', 'Сканирую локальный продуктовый контекст', { need:need.title, sources:localSources.map(source => source.id), evidence:0, sourceCalls:0 });
    for (const source of localSources) {
      ensureActive(job);
      const displayInput = `${source.id}.search("research-context")`;
      const searchId=operationId(job,`${source.id}-search`);
      await observe(job, 'CapabilityRequested', { operationId:searchId, capability:source.id.toUpperCase(), operation:'search', displayInput });
      await observe(job, 'CapabilityStarted', { operationId:searchId, capability:source.id.toUpperCase(), operation:'search', displayInput });
      let documents;
      try {
        documents = await source.search({ query:`${job.brief.question} PO Agent Suite Data Narrative Slides Evidence`, limit:6, signal:job.controller.signal });
        await observe(job, 'CapabilityCompleted', { operationId:searchId, capability:source.id.toUpperCase(), operation:'search', found:documents.length });
      } catch (error) {
        await observe(job, 'CapabilityFailed', { operationId:searchId, capability:source.id.toUpperCase(), operation:'search', code:error.code || 'SOURCE_UNAVAILABLE' });
        documents = [];
      }
      sourceCalls += 1; sourceStats[source.id] = (sourceStats[source.id] || 0) + 1;
      emit(job, 'researching', `${source.id}: найдено ${documents.length}`, { source:source.id, found:documents.length, sources:localSources.map(item => item.id), evidence:evidence.length, sourceCalls, capability:source.id.toUpperCase() });
      for (const document of documents) {
        const meta=safeSourceMetadata(document);
        const readId=operationId(job,`${source.id}-read`);
        await observe(job,'SourceOpened',{operationId:readId,capability:source.id.toUpperCase(),...meta,displayInput:`${source.id}.read("research-context")`});
        await observe(job,'SourceRead',{operationId:readId,capability:source.id.toUpperCase(),...meta});
        const quote = describeLocalDocument(document); if (!quote) continue;
        const id = `E${String(evidence.length + 1).padStart(3, '0')}`;
        const claim = quote;
        evidence.push({ id, claim, quote, sourceId:document.sourceId || `${document.sourceKind || 'source'}:${document.sourceTitle}`, sourceUri:document.sourceUri, sourceTitle:document.sourceTitle, sourceKind:document.sourceKind, retrievedAt:new Date().toISOString(), confidence:'direct', kind:'fact' });
        if (evidence.length >= 6) break;
      }
      if (evidence.length >= 6) break;
    }
    need.dods[0].evidenceIds = evidence.map(item => item.id); need.dods[0].findings = evidence.map(item => item.claim); need.dods[0].status = evidence.length ? 'met' : 'unknown';
    emit(job, 'researching', `Собрано ${evidence.length} локальных Evidence`, { sources:localSources.map(source => source.id), evidence:evidence.length, sourceCalls });
    return { evidence, conflicts:[], unknowns:evidence.length ? [] : ['Локальный индекс не дал проверяемой опоры для случайного ракурса.'], sourceStats, sourceCalls };
  }

  async function execute(job, request) {
    try {
      await store.begin?.(job.generationId, { brief:request.brief || null });
      emit(job, 'brief', request.origin === 'random' ? 'Формирую неожиданный исследовательский заказ' : 'Фиксирую пользовательский заказ', { capability:'MODEL' });
      job.brief = request.origin === 'random' ? await randomBrief(job) : request.brief;
      ensureActive(job);
      emit(job, 'scout', request.mode === 'random' ? 'Выбираю материал для неожиданного ракурса' : 'Исследовательский вопрос сформирован', { question:request.mode === 'random' ? 'Ракурс появится из найденных локальных Evidence' : job.brief.question, origin:job.brief.origin });
      const availableSources = (request.mode === 'random' ? sources.filter(source => source.id !== 'web') : sources).map(source => source.id);
      emit(job, 'planning', request.mode === 'random' ? 'Выбираю локальную линию доказательств' : 'Строю потребности и критерии готовности', { sources: availableSources });
      const needs = request.mode === 'random' ? [{ title:'Локальный продуктовый ракурс', query:job.brief.question, dods:[{ criterion:'Найти прямые опоры в коде и продуктовом лоре', status:'pending', findings:[], evidenceIds:[], limitations:[] }] }] : await planResearch(job);
      emit(job, 'planning', `План: ${needs.length} исследовательских линии`, { sources:availableSources, needs:needs.map(need => need.title), capability:'MODEL' });
      const gathered = request.mode === 'random' ? await gatherRandom(job, needs[0]) : await gather(job, needs, request.mode);
      ensureActive(job);
      emit(job, 'validating', 'Проверяю ссылки Evidence и неизвестности', { evidence: gathered.evidence.length });
      if (!gathered.evidence.length) {
        job.failureCause = job.sourceFailures ? 'source-unavailable' : 'no-supporting-evidence';
        job.requiredContext = job.failureCause === 'no-supporting-evidence' ? ['источник с проверяемыми фактами по теме вопроса'] : [];
        job.error = 'Для этого вопроса мне не хватает проверяемой опоры в доступном контексте. Добавьте источник или уточните вопрос.';
        emit(job, 'needs-context', job.error, { cause:job.failureCause, requiredContext:job.requiredContext });
        await store.mark?.(job.generationId, 'needs-context', job.error).catch(() => {});
        return null;
      }
      const validIds = new Set(gathered.evidence.map(item => item.id));
      for (const need of needs) for (const dod of need.dods) dod.evidenceIds = dod.evidenceIds.filter(id => validIds.has(id));
      const research = { brief: job.brief, needs, evidence: gathered.evidence, conflicts: gathered.conflicts, unknowns: gathered.unknowns, sourceStats: gathered.sourceStats, sourceCalls: gathered.sourceCalls };
      job.research=research;
      if (request.researchOnly) { emit(job,'complete','Research Evidence готов',{evidence:gathered.evidence.length,researchOnly:true}); return research; }
      emit(job, 'synthesizing', 'Собираю Data из Evidence');
      const data = dataFromEvidence(job.brief, research);
      emit(job, 'rendering', 'Создаю Narrative, Slides и файлы');
      const rendered = await render({ generationId: job.generationId, brief: job.brief, research, data, signal: job.controller.signal, temperature: request.temperature, style: request.style });
      await store.save({ generationId: job.generationId, data, narrative: rendered.narrativeMarkdown, slides: rendered.slidesHtml, pptx: rendered.pptx, research, meta: rendered.manifestMeta });
      job.result = rendered.result;
      emit(job, 'complete', 'Исследование готово', { evidence: gathered.evidence.length });
      return job.result;
    } catch (error) {
      job.error = error.message;
      if (job.deadlineExpired) job.failureCause='research-timeout';
      if (!job.failureCause && error.code === 'INFERENCE_TIMEOUT') job.failureCause='inference-timeout';
      if (!job.failureCause && error.code === 'RESEARCH_TIMEOUT') job.failureCause='research-timeout';
      if (!job.failureCause && error.code === 'MALFORMED_RESPONSE') job.failureCause='malformed-response';
      if (!job.failureCause && error.code === 'PROVIDER_FAILURE') job.failureCause='provider-unavailable';
      if (!job.failureCause && /ECONNREFUSED|fetch failed|model.*unavailable|provider unavailable/i.test(error.message)) job.failureCause='provider-unavailable';
      const terminal = !job.deadlineExpired&&(error.code === 'CANCELLED' || error.code==='ABORTED'||job.controller.signal.aborted) ? 'cancelled' : 'failed';
      emit(job, terminal, job.error);
      await store.mark?.(job.generationId, terminal, job.error).catch(() => {});
      throw error;
    }
  }

  function start({ sessionId = 'default', origin, mode, temperature = 0.7, style, observe:observer, createOperationId, brief, researchOnly = false, signal, budgets={} } = {}) {
    const current = session(sessionId);
    if (brief && typeof brief === 'object') { current.brief=cleanBrief(brief,'user',[{role:'user',content:brief.question}]); current.ready=true; }
    const selectedOrigin = origin || (current.ready && current.brief ? 'user' : 'random');
    if (selectedOrigin === 'user' && !current.brief) throw new Error('Сначала сформируйте исследовательский заказ в чате');
    const id = generationId();
    const selectedMode = mode || (selectedOrigin === 'random' ? 'random' : 'deep');
    const job = { generationId: id, mode:selectedMode, state: 'brief', progress: null, brief: selectedOrigin === 'user' ? current.brief : null, result: null, error: null, failureCause:null, requiredContext:[], sourceFailures:0, observe:observer, createOperationId, operationOrdinal:0, events: [], listeners: new Set(), controller: new AbortController(), deadline: Date.now() + config.timeoutMs,deadlineExpired:false,budgets, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    if(signal){if(signal.aborted)job.controller.abort();else signal.addEventListener('abort',()=>job.controller.abort(),{once:true})}
    jobs.set(id, job);
    const deadlineTimer=setTimeout(()=>{job.deadlineExpired=true;job.controller.abort()},config.timeoutMs);
    job.done = execute(job, { origin:selectedOrigin, mode:selectedMode, brief:job.brief, temperature, style, researchOnly }).finally(()=>clearTimeout(deadlineTimer));
    job.done.catch(() => {});
    return snapshot(job);
  }

  function get(id) { const job = jobs.get(id); return job ? snapshot(job) : null; }
  function cancel(id) { const job = jobs.get(id); if (!job || ['complete', 'failed', 'cancelled'].includes(job.state)) return false; job.controller.abort(); return true; }
  function subscribe(id, listener) { const job = jobs.get(id); if (!job) return null; job.listeners.add(listener); for (const event of job.events) listener(event); return () => job.listeners.delete(listener); }
  async function wait(id) { const job = jobs.get(id); if (!job) throw new Error('generation not found'); await job.done; return snapshot(job); }
  function resetSession(id = 'default') { sessions.delete(id); return session(id); }
  function addContext(document) { const local=sources.find(source=>typeof source.addDocument==='function'); if(!local)throw new Error('Local context capability unavailable'); local.addDocument(document); return {name:document.name}; }

  return { briefTurn, start, get, cancel, subscribe, wait, resetSession, addContext, jobs, sessions, stages: STAGES };
}

export { DEFAULT_LIMITS };

export function dataFromEvidence(brief, research) {
  const facts = research.evidence.filter(item => item.kind === 'fact');
  const sourceCount = new Set(research.evidence.map(item => item.sourceUri)).size;
  return {
    title: brief.question,
    columns: ['Evidence ID', 'Наблюдение', 'Источник', 'Уверенность'],
    rows: facts.map(item => [item.id, item.claim, item.sourceTitle, item.confidence]),
    insights: (research.needs || []).flatMap(need => need.dods.flatMap(dod => dod.findings.slice(0, 2))),
    sources: [...new Set(research.evidence.map(item => item.sourceUri))],
    sourceKind: research.evidence.some(item => item.sourceKind === 'web') ? 'uploaded-context' : 'local-index',
    numericMetrics: [
      ['evidence_count', facts.length, 'проверяемых фактов', 'из текущего ResearchArtifact'],
      ['source_count', sourceCount, 'локальных или web-источников', 'из текущего ResearchArtifact'],
      ['source_calls', Number(research.sourceCalls || 0), 'обращений к источникам', 'из trace текущего job'],
      ['pipeline_stages', STAGES.length, 'стадий исследовательского контура', 'из исполняемого research pipeline']
    ]
  };
}
