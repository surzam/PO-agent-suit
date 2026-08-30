import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pptxgen from 'pptxgenjs';
import YAML from 'yaml';
import { createArtifactStore } from './research/storage.mjs';
import { createLocalSource, createWebSource, createSearxngSource } from './research/sources.mjs';
import { createResearchService, dataFromEvidence } from './research/service.mjs';

const root = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(root, 'public');
const workspaceDir = path.resolve(process.env.PO_WORKSPACE_DIR || path.join(root, 'workspace'));
const exportDir = path.resolve(process.env.PO_EXPORT_DIR || path.join(workspaceDir, 'exports'));
const variationHistoryFile = path.join(workspaceDir, 'variation-history.json');
const templateDir = path.join(root, 'template-library');
const port = Number(process.env.PORT || 3000);
const generationVersion = '3.0.0-deep-research-phase1';
const buildTimestamp = new Date().toISOString();
await fs.mkdir(exportDir, { recursive: true });
const appConfig = await fs.readFile(path.join(root, 'po-agent.config.yaml'), 'utf8').then(YAML.parse).catch(() => ({}));
const variationHistory = await fs.readFile(variationHistoryFile, 'utf8').then(JSON.parse).catch(() => ({ styles: [], angles: [], stories: [] }));
const usedStyles = new Set(Array.isArray(variationHistory.styles) ? variationHistory.styles : []);
const usedAngles = new Set(Array.isArray(variationHistory.angles) ? variationHistory.angles : []);
const recentStories = Array.isArray(variationHistory.stories) ? variationHistory.stories.slice(-120) : [];
const recentMottos = Array.isArray(variationHistory.mottos) ? variationHistory.mottos.slice(-120) : [];
const templateIndex = await fs.readFile(path.join(templateDir, 'index.json'), 'utf8').then(JSON.parse).catch(() => ({ templates: [] }));
const templates = await Promise.all((templateIndex.templates || []).map(async template => ({ ...template, ...await fs.readFile(path.join(templateDir, 'templates', template.slug, 'template.json'), 'utf8').then(JSON.parse).catch(() => ({})) })));
const codeCourseTemplate = { slug: 'codebase-to-course', name: 'Codebase to Course', description: 'Кодовый ракурс: файл, действие, объяснение.' };
if (!templates.some(template => template.slug === codeCourseTemplate.slug)) templates.push(codeCourseTemplate);

const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
const clamp = (n, min, max) => Math.max(min, Math.min(max, Number(n)));
const idOf = () => `gen-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const productFixture = {
  title: 'PO Agent Suite', sourceKind: 'product-fixture', sources: ['fixture://po-agent-suite-product', 'fixture://po-agent-suite-product-lore'],
  columns: ['Слой продукта', 'Проверяемый факт', 'Зачем это PO'],
  rows: [
    ['Chat-first UI', 'public/index.html принимает вопрос, файлы и Temperature', 'Начать с ситуации, а не с меню'],
    ['Context Analyzer', 'server.mjs строит DataArtifact из fixture или upload', 'Отделить факт от интерпретации'],
    ['Product Owner', 'PO worldview ведёт к тезису, риску и следующему шагу', 'Принять решение быстрее'],
    ['Story Planner', 'StoryPlan содержит 10–15 сцен и один тезис на сцену', 'Сохранить линию рассказа'],
    ['Llama.cpp', 'POST отправляется на /v1/chat/completions с системным prompt', 'Получить смысловую вариативность'],
    ['Demo fallback', 'fallbackSets разделены на architecture, value, team и horizon', 'Работать без модели честно'],
    ['Data', 'таблица хранит rows, insights, sources и sourceKind', 'Проверить происхождение вывода'],
    ['Narrative', 'страницы повторяют сцены StoryPlan и содержат «Что сказать»', 'Не читать стенограмму со слайда'],
    ['Slides', 'каждый section рендерится из текущей scene', 'Держать один тезис визуально'],
    ['Visual system', 'editorial, professional, kinetic и diagrammatic меняют композицию', 'Подобрать форму под аудиторию'],
    ['Generation API', 'каждый запуск получает новый generationId и три URL', 'Не открыть устаревший Blob'],
    ['Quality fixture', 'CSV содержит time_to_insight, artifacts_per_request, manual_steps_removed', 'Проверять эффект числами, когда они есть']
    ,['Локальное приложение', 'Electron поднимает собственный сервер и открывает артефакты отдельно', 'Запускать Suite как отдельный рабочий инструмент'],
    ['Живая ситуация PO', 'На демо команда спорит не о кнопке, а о том, какой риск принять сегодня', 'Перевести разговор из мнений в действие'],
    ['Универсальный AI-инструмент', 'Чат с LLM-агентом превращает естественный запрос в таблицу, текст и презентацию', 'Дать PO и руководителю единый поток от хаоса к решению'],
    ['Источники данных', 'Jira, Trello, GitHub/GitLab, Analytics, CRM, базы, CSV и Excel входят в продуктовый замысел', 'Собирать доказательства рядом с выводом'],
    ['Кодовый курс', 'codebase-to-course объясняет реальные модули через путь пользователя, код и plain-English', 'Ускорить онбординг и понимание legacy'],
    ['Frontend slides', 'frontend-slides рендерит визуальные презентации в браузере и поддерживает корпоративные стили', 'Передавать смысл, а не стенограмму'],
    ['Модули результата', 'DataFetcher → TableGenerator → TextGenerator → SlideGenerator → CourseGenerator', 'Соединить инструменты в один рабочий конвейер']
  ],
  insights: [
    'Чат принимает вопрос и контекст, а не требует знать меню инструментов.',
    'Context Analyzer отделяет разрешённый продуктовый контекст от AGENTS.md, skills, tests и exports.',
    'StoryPlan связывает topic, audience, centralThesis, evidence, unknowns и nextStep.',
    'Data, Narrative и Slides создаются из одного StoryPlan и одного generationId.',
    'В Data сохраняются rows, insights, sources и sourceKind — происхождение видно читателю.',
    'Narrative показывает ситуацию, доказательства, интерпретацию, риск и действие.',
    'Каждая narrative-страница содержит тезис, опору, переход и человеческий speaker script.',
    'Каждый slide section получает title, thesis, evidence и visualType из текущей scene.',
    'Temperature влияет на вызов модели и участвует в выборе styleId вместе с generationId.',
    'editorial, professional, kinetic и diagrammatic отличаются типографикой, сеткой и декоративным языком.',
    'При недоступной модели Suite не маскирует ограничение: результат помечается demo-local.',
    'CSV-fixture задаёт проверяемые сигналы: 12 минут до инсайта, 3 артефакта и 7 снятых ручных шагов.',
    'Generation API отдаёт отдельные URL Data, Narrative и Slides, поэтому результаты не смешиваются.',
    'Indexator не входит в Suite: приоритизация бэклога остаётся отдельным продуктом.',
    'Главная ценность — не объём текста, а более быстрый переход от ситуации к решению.',
    'Продуктовый лор Suite: Open Source, работает из коробки, чат с LLM-агентом ведёт к таблицам, текстам и презентациям.',
    'Suite рассчитан на PO, Tech Lead, Agile Coach, Scrum Master, руководителя команды и небольшие стартап-команды.',
    'Боли, которые продукт должен превращать в действие: ручной отчёт по Jira, повторная презентация квартала, непонятный legacy-код и хаотичные требования.',
    'Поддерживаемая идея архитектуры: пользователь → чат → LLM-агент → планировщик → инструменты → рендер артефактов.',
    'Продуктовый лор не разрешает выдавать выдуманные демо-цифры за production-измерения и не включает Indexator в Suite.'
    ,'Локальное приложение запускает Suite отдельно от браузерного проекта и держит свой generation context.'
  ],
  codeSignals: [
    'server.mjs: buildData → llama → normalizePlan → renderers',
    'server.mjs: selectStyle(temperature, generationId, requested)',
    'public/index.html: fetch(/api/run) и три текущих artifact URL',
    'tests/fixtures/po-agent-suite-demo.csv: 12 minutes, 3 artifacts, 7 manual steps removed',
    'template-library/codebase-to-course: code ↔ plain-English translation, data flow and quizzes'
  ]
};
const dataVariants = [
  { name:'сигнал → смысл', rows:[['Вход','естественный вопрос','не нужно знать API'],['Фильтр','разрешённый контекст','меньше шума'],['Синтез','один centralThesis','яснее решение'],['Проверка','evidence + unknowns','виден риск']], insights:['Сначала меняется не файл, а качество вопроса.','Неизвестность становится частью результата, а не ошибкой оформления.'] },
  { name:'локальная лаборатория', rows:[['Модель','llama.cpp на localhost','контекст остаётся рядом'],['Fallback','demo-local fixture','демо не зависит от сети'],['Health','generationVersion + pid','виден актуальный сервер'],['Context','DataArtifact + sources','каждый вывод можно проследить']], insights:['Локальность здесь — продуктовая граница и источник доверия.','Рабочая демонстрация должна оставаться честной при недоступной модели.'] },
  { name:'ритм артефактов', rows:[['Data','rows и insights','что известно'],['Narrative','ситуация и последствие','почему важно'],['Slides','scene и visualType','как рассказать'],['Link','один generationId','ничего не распадается']], insights:['Три артефакта отличаются ролью, но происходят из одной истории.','Переход между форматами — часть ценности, а не экспорт в конце.'] },
  { name:'напряжение ролей', rows:[['PO','решение и trade-off','действие'],['Команда','общая точка фактов','согласование'],['Руководитель','последствие и риск','выбор'],['Tech Lead','механика и ограничение','доверие к системе']], insights:['Один и тот же контекст меняет язык в зависимости от аудитории.','Хороший слайд оставляет голос выступающему, а не заменяет его.'] },
  { name:'измеримый workflow', rows:[['time_to_insight','12 minutes','скорость первого вывода'],['artifacts_per_request','3','связанный комплект'],['manual_steps_removed','7','снятая рутина'],['source_kinds','4','ширина входного контекста']], insights:['Fixture уже содержит числа, которыми можно начать разговор об эффекте.','Цифра полезна только рядом с вопросом: что именно она меняет?'] },
  { name:'саморефлексия', rows:[['Seed','новый ракурс запуска','вариативность'],['Angle','анатомия / театр / карта','новая оптика'],['Style','4 visual systems','форма поддерживает смысл'],['Loop','повторная генерация','следующая гипотеза']], insights:['Suite становится материалом собственного исследования.','Самодемонстрация сильнее, когда следующий запуск не повторяет предыдущий.'] }
];
const generatedPools = {
  roles:['Product Owner','команда','руководитель','Tech Lead','Agile Coach','локальный оператор'],
  mechanisms:['вопрос → Context Analyzer','Data → Narrative → Slides','generationId → три URL','Temperature → styleId','fixture → StoryPlan','код → проверяемый тезис'],
  proofs:['строка CSV','кодовый маршрут','неизвестность','speaker script','sourceKind','health-ответ'],
  outcomes:['быстрее увидеть решение','снизить повторные объяснения','сохранить происхождение факта','показать trade-off','сделать риск обсуждаемым','проверить гипотезу'],
  constraints:['модель может быть недоступна','числа нельзя выдумывать','Indexator остаётся отдельно','контекст нужно проверить владельцем','слайд не заменяет выступающего','локальный сервер должен быть актуальным'],
  humanMoments:['«Мы опять обсуждаем симптом, а не решение»','«Покажите, что изменится для пользователя завтра»','к вечеру у PO появляется одна версия разговора','Tech Lead находит ограничение до того, как оно становится сюрпризом','команда видит неизвестность и сама предлагает следующий эксперимент','руководитель получает не обещание, а выбор между двумя компромиссами']
};
function generatedFixture(seed) {
  const pick=(pool,offset)=>pool[(Math.abs(seed)+offset*17)%pool.length];
  const rows=Array.from({length:8},(_,i)=>[pick(generatedPools.roles,i),pick(generatedPools.mechanisms,i+2),pick(generatedPools.outcomes,i+4)]);
  rows.push(['Живой момент', generatedPools.humanMoments[Math.abs(seed)%generatedPools.humanMoments.length], 'Смысл появляется в разговоре, а не только в интерфейсе']);
  const metrics=[11+Math.abs(seed)%89,2+Math.abs(Math.floor(seed/7))%6,4+Math.abs(Math.floor(seed/13))%9];
  rows[0][1] += ` · demo-сигнал ${metrics[0]} минут`;
  rows[1][2] += ` · пример −${metrics[1]} шагов`;
  rows[2][1] += ` · вариант ${metrics[2]}`;
  const numericMetrics = [
    ['time_to_insight', metrics[0], 'минут до первого вывода', 'demo-сигнал, не production-измерение'],
    ['manual_steps_removed', metrics[1], 'ручных шагов снято', 'demo-сигнал, не production-измерение'],
    ['artifacts_per_request', 3 + Math.abs(seed)%4, 'связанных артефакта', 'Data → Narrative → Slides'],
    ['context_sources', 4 + Math.abs(seed)%12, 'источников в контексте', 'локальный индекс и product lore'],
    ['story_scenes', 3 + Math.abs(seed)%8, 'сцен в варианте истории', 'зависит от модели и запроса'],
    ['audience_roles', 2 + Math.abs(seed)%5, 'ролей получают свой язык', 'PO, команда и руководство'],
    ['code_signals', 5 + Math.abs(seed)%15, 'кодовых сигналов найдено', 'пример лёгкого анализа'],
    ['decision_options', 2 + Math.abs(seed)%4, 'варианта следующего действия', 'гипотеза для обсуждения']
  ];
  for (const [name,value,meaning,note] of numericMetrics) rows.push([name, `${value} · ${note}`, meaning]);
  const insights=Array.from({length:8},(_,i)=>`${pick(generatedPools.proofs,i)} связывает ${pick(generatedPools.mechanisms,i+1)} и помогает ${pick(generatedPools.outcomes,i+3)}.`);
  insights.push(`Сгенерированный demo-срез использует ${metrics[0]} минут, ${metrics[1]} ручных шагов и вариант ${metrics[2]}; это пример для разговора, не измерение production.`);
  insights.push(`Человеческая сцена этого запуска: ${generatedPools.humanMoments[(Math.abs(seed)+3)%generatedPools.humanMoments.length]}. Она превращает технический сигнал в повод для решения.`);
  return { title:`PO Agent Suite · generated example ${Math.abs(seed)%1000000}`, rows, insights, numericMetrics, sourceKind:'product-fixture', sources:[`fixture://po-agent-suite-product/example-${Math.abs(seed)}`], codeSignals:[`generated fixture seed: ${Math.abs(seed)}`,...productFixture.codeSignals] };
}

const ignoredDirs = new Set(['node_modules','.git','.cache','dist','build','skills','.opencode']);
const ignoredFiles = new Set(['AGENTS.md','README.md','.env','package-lock.json']);
async function discoverSources(dir, out = []) {
  for (const entry of await fs.readdir(dir, { withFileTypes: true }).catch(() => [])) {
    if (entry.name.startsWith('.') || ignoredDirs.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) await discoverSources(full, out);
    else if (!ignoredFiles.has(entry.name) && /\.(csv|json|txt|yaml|yml|js|mjs|css|html)$/i.test(entry.name)) {
      const stat = await fs.stat(full); out.push({ file: path.relative(root, full), bytes: stat.size });
    }
  }
  return out;
}

function promptTitle(prompt) {
  const clean = String(prompt || '').replace(/^\s*(покажи|создай|подготовь|сделай|проанализируй|расскажи|сравни|спроси)\s*/i, '').replace(/^\s*,\s*/, '').trim();
  return `${(clean || 'PO Agent Suite').slice(0, 78)}`;
}

async function buildData(input) {
  if (!String(input.prompt || '').trim()) { input.prompt = selfPrompts[Date.now() % selfPrompts.length]; input.autoPrompt = true; }
  if (input.analysis?.columns && input.analysis?.rows) return {
    ...productFixture, ...input.analysis, title: input.analysis.title || promptTitle(input.prompt), sourceKind: 'uploaded-context',
    sources: input.analysis.sources?.length ? input.analysis.sources : (input.contextFiles || []).map(x => `upload://${x}`)
  };
  const indexed = await discoverSources(root);
  const selected = indexed.slice(0, 24);
  const generated = generatedFixture(Date.now());
  const codebaseFiles = indexed.filter(item => item.file.startsWith('template-library/codebase-to-course/'));
  const codeRow = codebaseFiles.length ? [['codebase-to-course', `${codebaseFiles.length} файлов референсного курса доступны в локальном индексе`, 'Показать код через действие, объяснение и визуальный поток']] : [];
  return { ...productFixture, ...generated, rows: [...productFixture.rows, ...generated.rows, ...codeRow], title: `${promptTitle(input.prompt)} · ${generated.title}`, sourceKind: indexed.length ? 'local-index' : 'product-fixture',
    sources: indexed.length ? selected.map(x => `local://${x.file}`) : generated.sources,
    insights: [...generated.insights, ...productFixture.insights, `Лёгкий индекс нашёл ${indexed.length} файлов и передал ${selected.length} источников в контекст.`] };
}

const visualTypes = ['statement','comparison','table','flow','quote','roadmap'];
const selfAngles = [
  ['архитектура','разложим систему на слои и связи'], ['доказательства','проследим, откуда взялся каждый вывод'],
  ['рабочий поток','покажем путь от запроса до следующего действия'], ['роли','сравним, что получает PO, команда и руководитель'],
  ['ограничения','проверим, где продукт честно говорит «неизвестно»'], ['метрики','свяжем demo-цифры с изменением рабочего процесса'],
  ['вариативность','исследуем, как один pipeline создаёт разные истории'], ['интерфейс','покажем, как одна кнопка становится входом в систему'],
  ['контекст','соберём историю из кода, fixture и прошлых артефактов'], ['следующий эксперимент','выберем, что Suite проверит в следующем запуске'],
  ['codebase-to-course','пройдём по коду как по интерактивному курсу: файл, действие, объяснение']
];
const selfPrompts = [
  'Покажи Suite как живой организм, который учится объяснять самого себя',
  'Сравни один вопрос с путешествием от сигнала до решения',
  'Расскажи, что происходит между нажатием кнопки и ясным выводом',
  'Покажи невидимую работу Product Owner через три связанных артефакта',
  'Сделай из кода Suite короткую сцену о доверии к данным',
  'Объясни Suite через конфликт скорости, качества и доказательности',
  'Покажи, как один generationId удерживает историю от распада',
  'Собери портрет продукта из его ограничений, а не обещаний',
  'Преврати CSV fixture в доказательство ценности локального workflow',
  'Спроси, чему следующий запуск может научить сам Suite',
  'Преврати код Suite в интерактивный курс: покажи путь пользователя от кнопки до артефакта'
];
const fallbackSets = [
  { key:'code', match:/код|codebase|course|файл|модул/i, thesis:'Код становится понятным, когда путь пользователя связывает файл, действие и наблюдаемый результат.', scenes:['Кнопка — начало маршрута','Запрос попадает в серверный вход','Context Analyzer выбирает разрешённый контекст','Data превращает файлы в проверяемые строки','StoryPlan объясняет порядок событий','Narrative переводит код на язык решения','Slides показывают связи между модулями','GenerationId удерживает маршрут целиком','Fallback сохраняет курс без модели','Локальное приложение держит среду рядом','Квиз проверяет понимание действия','Следующий маршрут начинается с вопроса'] },
  { key:'architecture', match:/архитект|как устро|связк/i, thesis:'Архитектура Suite превращает один вопрос в проверяемую цепочку артефактов.', scenes:['Вопрос запускает pipeline','Analyzer отделяет сигнал от шума','StoryPlan фиксирует одну линию рассказа','Data показывает опору для решения','Narrative объясняет последствия','Slides делают тезис видимым','GenerationId связывает три результата','Локальный fallback сохраняет честность','Health показывает актуальный сервер','Pipeline готов к следующему вопросу','Кодовая граница защищает контекст','Следующий шаг проверяет гипотезу'] },
  { key:'value', match:/польз|ценност|преимущ|product owner|po\b/i, thesis:'PO получает время на решение, потому что Suite собирает контекст и коммуникацию в один поток.', scenes:['Ценность начинается с ситуации PO','Контекст не должен становиться ручной сборкой','Analyzer находит главный сигнал','Факты остаются проверяемыми','Narrative переводит факт в последствие','Слайды держат разговор','Один generationId убирает ручную сверку','Данные показывают место для экономии времени','Ограничения делают обещание честным','Риск получает владельца','Результат можно открыть сразу','Следующий шаг возвращает контроль PO'] },
  { key:'team', match:/команд|людей|сотрудник|совмест/i, thesis:'Команда быстрее согласует действие, когда факты, смысл и визуальный рассказ связаны.', scenes:['У команды один вопрос, но разные роли','Общий контекст снижает повторные объяснения','Факты становятся точкой встречи','Неизвестность видна до решения','Narrative выравнивает язык','Slides помогают провести разговор','Data остаётся общей точкой проверки','Артефакты не расходятся по версиям','Ограничения не прячутся за дизайном','Следующее действие получает контекст','Каждая роль видит свой результат','Команда проверяет эффект'] },
  { key:'horizon', match:/перспектив|roadmap|будущ|развит/i, thesis:'Перспектива Suite — расширять способы работы, сохраняя PO-ядро: смысл, доказательство, действие.', scenes:['Будущее начинается с ясного ядра','Новые режимы не отменяют PO-взгляд','Analyzer готовит основу для расширения','Артефакты остаются переносимыми','Роли получают свой язык','Команда видит следующий горизонт','Интеграции расширяют доказательства','Локальность задаёт важное ограничение','Модель добавляет смысловую вариативность','Fallback сохраняет рабочую демонстрацию','Гипотеза требует проверки','Следующий эксперимент выбирает направление'] }
];
function fallbackPlan(input, data) {
  const generationId = arguments[2] || `seed-${Date.now()}`;
  const prompt = String(input.prompt || selfPrompts[Date.now() % selfPrompts.length]);
  const seed = [...generationId].reduce((n, c) => (n * 33 + c.charCodeAt(0)) % 2147483647, 17);
  const set = fallbackSets.find(x => x.match.test(prompt)) || (input.autoPrompt ? fallbackSets[seed % fallbackSets.length] : fallbackSets[0]);
  const angle = selfAngles[seed % selfAngles.length];
  const thesisVariants = {
    code: ['Путь по коду становится ясным, когда каждое действие приводит к наблюдаемому результату.', 'Рабочий код легче понять через историю пользователя: кто нажал, что изменилось и где это видно.', 'Архитектура раскрывается не списком файлов, а маршрутом решения от входа до артефакта.'],
    architecture: ['Suite держит смысл в движении: вопрос проходит через фильтр, историю и проверяемый результат.', 'Архитектура ценна тем, что превращает разрозненные сигналы в маршрут, который можно пересказать.', 'Один вход становится системой только тогда, когда каждый слой отвечает за следующий шаг.'],
    value: ['Ценность Suite появляется в момент, когда команда принимает решение быстрее и увереннее.', 'PO получает не ещё один экран, а короткий путь от напряжения к совместному действию.', 'Результат полезен тогда, когда после него меняется разговор и появляется конкретный выбор.'],
    team: ['Команда договаривается быстрее, когда видит одну опору и разные последствия.', 'Общий рассказ не стирает разногласия — он делает их пригодными для решения.', 'Согласование начинается не с одинаковых мнений, а с общей проверяемой точки.'],
    horizon: ['Будущее Suite измеряется не количеством функций, а числом новых способов увидеть решение.', 'Следующий горизонт продукта — расширять глубину объяснения, сохраняя честность источников.', 'Развитие начинается там, где следующий эксперимент делает неизвестность полезной.']
  };
  const thesis = (thesisVariants[set.key] || [set.thesis])[seed % (thesisVariants[set.key]?.length || 1)];
  const openingTitles = {
    code: `Откроем Suite через код: ${promptTitle(prompt)}`,
    architecture: `Разберём, как ${promptTitle(prompt)} становится системой`,
    value: `Для PO важен не чат, а решение после него`,
    team: `Команда начинает с общего вопроса`,
    horizon: `Будущее продукта видно через следующий эксперимент`
  };
  const sceneTitles = [...set.scenes];
  sceneTitles[0] = openingTitles[set.key] || `Начнём с вопроса: ${promptTitle(prompt)}`;
  sceneTitles[0] += ` · ${angle[1]}`;
  const rotatedVisualTypes = [...visualTypes.slice(seed % visualTypes.length), ...visualTypes.slice(0, seed % visualTypes.length)];
  const transitions = ['Начнём с вопроса.', 'Здесь появляется первый фильтр.', 'Теперь соберём линию рассказа.', 'Это место для проверки факта.', 'Из факта следует интерпретация.', 'Смысл нужно сделать видимым.', 'Связь важнее третьего файла.', 'Честное ограничение повышает доверие.', 'Следующий экран уточняет условие.', 'Отсюда можно перейти к действию.', 'Это проверяемая граница решения.', 'Закроем историю конкретным экспериментом.'];
  const codeExamples = ['const generationId = idOf();', 'const data = await buildData(input);', 'const plan = normalizePlan(modelPlan, fallback);', 'const files = { data, narrative, slides };', 'fetch("/api/run", { method: "POST" })', 'const styleId = selectStyle(temperature, generationId);', 'template-library/codebase-to-course → code ↔ plain English'];
  const scenes = sceneTitles.map((title, i) => ({ index:i + 1, title: i === 0 ? title : `${title} · ${angle[0]}`, thesis: i === 0 ? `${thesis} В этот раз смотрим на Suite как на ${angle[0]}.` : `${title}: ${angle[1]}.`, evidence: [data.insights[i % data.insights.length] || 'Факт требует проверки.', data.insights[(i + 3) % data.insights.length] || 'Источник требует проверки.', `Кодовая опора: ${codeExamples[(i + seed) % codeExamples.length]}`], unknowns: i === 8 || i === 10 ? ['Эффект ещё не измерен в рабочем контуре.'] : [], speakerScript: i === 0 ? `Сегодня я предлагаю новый поворот: ${angle[1]}. Запрос «${prompt}» — только вход; главный тезис: ${thesis} Дальше проверим эту мысль реальными модулями и ограничениями кода.` : `${transitions[(i + seed) % transitions.length]} ${title} — новая грань ракурса «${angle[0]}», а не повтор предыдущего экрана. Опора: ${data.insights[i % data.insights.length] || 'нужен подтверждённый источник'}. Следующий ход меняет масштаб — от идеи к артефакту.`, codeExample: codeExamples[(i + seed) % codeExamples.length], visualType: rotatedVisualTypes[i % rotatedVisualTypes.length] }));
  const purposes = ['задаёт вопрос и обещание истории','показывает путь входного сигнала через фильтр','объясняет, где фиксируется линия рассказа','даёт конкретную опору для вывода','связывает факт с последствием для PO','превращает тезис в визуальное доказательство','проверяет происхождение результата','называет честное ограничение','разделяет известное и ещё не измеренное','переводит наблюдение в действие','показывает границу между кодом и гипотезой','закрывает историю следующим экспериментом'];
  scenes.forEach((scene, i) => { const row=data.rows[i % data.rows.length]?.join(' · ') || 'нет строки Data'; scene.thesis = i === 0 ? `${thesis} Ракурс: ${angle[0]}.` : `${scene.title} ${purposes[i]}.`; scene.evidence=[`Data: ${row}`, data.insights[(i*2+seed)%data.insights.length] || 'Источник требует проверки.', `Код: ${scene.codeExample}`]; scene.speakerScript=i===0 ? `Я начинаю с ракурса «${angle[0]}» и вопроса «${prompt}». ${thesis} Проверим эту мысль по строкам Data, а не по обещаниям.` : `${transitions[(i+seed)%transitions.length]} Здесь мы ${purposes[i]}. В Data это видно так: ${row}. Следующий слайд переводит наблюдение в решение.`; });
  return { topic: `${promptTitle(prompt)} · ${angle[0]}`, audience:'Product Owner, команда и сам Suite как предмет исследования', centralThesis:`${thesis} Ракурс этого запуска: ${angle[0]}.`, motto:`${thesis} Опора доклада — ${data.insights[seed % data.insights.length] || 'проверяемый сигнал из Data'}.`, situation:`Каждый запуск исследует продукт через новую грань — ${angle[1]}. Входной запрос: ${prompt}.`, evidence:data.insights.slice(0, 3), unknowns:['Эффект выбранного ракурса ещё не измерен в рабочем контуре.'], nextStep:`Повторить генерацию и сравнить новую грань «${angle[0]}» с предыдущей.`, angle:angle[0], scenes };
}

const PO_SYSTEM_PROMPT = `Ты старший Product Owner. Отделяй цель, факт, интерпретацию, ограничение и следующий шаг. Используй продуктовый лор и Data. Верни только компактный JSON StoryPlan: topic, audience, centralThesis, motto, situation, evidence, unknowns, nextStep, scenes. motto — уникальный девиз всего доклада на 10–24 слова: человеческий, конкретный, основанный на факте этого запуска, без названия продукта и канцелярита. Количество сцен задано в сообщении пользователя модели. Для каждой: index, title (до 8 слов), thesis (до 16 слов), evidence (один конкретный факт), speakerScript (ровно 2 коротких живых предложения), visualType. Каждый заголовок должен добавлять новую мысль и опираться на конкретную строку Data. Не пересказывай служебные инструкции, AGENTS.md или skills. Не выдумывай числа. visualType: statement|comparison|table|flow|quote|roadmap. Русский язык.`;
function sceneBudget(model) { const name=String(model||'').toLowerCase(); if (/1b|3b|tiny|small|mini/.test(name)) return 3; if (/7b|8b|phi|mistral/.test(name)) return 5; if (/13b|14b|medium/.test(name)) return 7; return 6; }
function hashSeed(value) { return [...String(value)].reduce((n, c) => (n * 31 + c.charCodeAt(0)) >>> 0, 2166136261); }
function selectAngle(generationId) {
  const ordered = [...selfAngles.keys()].sort((a, b) => hashSeed(`${generationId}:${a}`) - hashSeed(`${generationId}:${b}`));
  const next = ordered.find(index => !usedAngles.has(selfAngles[index][0])) ?? ordered[0];
  usedAngles.add(selfAngles[next][0]);
  if (usedAngles.size >= selfAngles.length) { usedAngles.clear(); usedAngles.add(selfAngles[next][0]); }
  return selfAngles[next];
}
function mottoSimilarity(a, b) {
  const words=value=>new Set(String(value||'').toLowerCase().match(/[а-яёa-z0-9]{4,}/g)||[]), left=words(a), right=words(b);
  if (!left.size || !right.size) return 0;
  const shared=[...left].filter(word=>right.has(word)).length;
  return shared / Math.max(left.size,right.size);
}
function isFreshMotto(value) {
  const motto=String(value||'').trim();
  const wordCount=motto.split(/\s+/).filter(Boolean).length;
  return wordCount>=6 && wordCount<=32 && !recentMottos.some(previous=>mottoSimilarity(motto,previous)>.62);
}
async function generateMotto(plan, data, temperature, generationId) {
  const candidates=[plan.motto];
  const base=process.env.LLAMA_BASE_URL || 'http://127.0.0.1:8080/v1';
  for(let attempt=0;attempt<2;attempt+=1){
    const controller=new AbortController(), timer=setTimeout(()=>controller.abort(),90000);
    try {
      const response=await fetch(`${base}/chat/completions`,{method:'POST',signal:controller.signal,headers:{'content-type':'application/json'},body:JSON.stringify({model:process.env.LLAMA_MODEL||'Qwen_Qwen3.6-35B-A3B-Q4_K_M.gguf',temperature:clamp(temperature+.12+attempt*.08,0,2),max_tokens:180,response_format:{type:'json_object'},messages:[{role:'system',content:'Ты придумываешь один сильный девиз доклада. Верни только JSON {"motto":"..."}. 10–24 слова, одна мысль, естественный русский язык. Опирайся на конкретный факт текущих Data и StoryPlan. Не используй название продукта. Не пиши «данные показывают», «новый ракурс», «следующий шаг», двоеточие или служебные термины.'},{role:'user',content:`generationId: ${generationId}\nУже использованные девизы, которые нельзя перефразировать: ${JSON.stringify(recentMottos.slice(-16))}\nStoryPlan: ${JSON.stringify({topic:plan.topic,centralThesis:plan.centralThesis,situation:plan.situation,evidence:plan.evidence,nextStep:plan.nextStep,sceneTitles:plan.scenes.map(scene=>scene.title)})}\nData: ${JSON.stringify({rows:data.rows.slice(0,18),insights:data.insights.slice(0,10),numericMetrics:data.numericMetrics})}`}]})});
      if(response.ok){const raw=(await response.json()).choices?.[0]?.message?.content||'', match=raw.match(/\{[\s\S]*\}/);if(match)candidates.unshift(JSON.parse(match[0]).motto)}
    } catch {} finally { clearTimeout(timer); }
    const fresh=candidates.find(isFreshMotto); if(fresh)return String(fresh).trim();
  }
  const planCandidates=[`${plan.scenes[0]?.title || plan.topic}. ${plan.centralThesis}`,`${plan.centralThesis} ${plan.nextStep}`,plan.topic];
  return planCandidates.find(isFreshMotto) || planCandidates[0];
}
async function persistVariationHistory(storyFingerprint, motto) {
  recentStories.push(storyFingerprint); recentMottos.push(motto);
  recentStories.splice(0,Math.max(0,recentStories.length-120)); recentMottos.splice(0,Math.max(0,recentMottos.length-120));
  const payload = {
    styles: [...usedStyles].slice(-templates.length),
    angles: [...usedAngles].slice(-selfAngles.length),
    stories: recentStories,
    mottos: recentMottos
  };
  await fs.writeFile(variationHistoryFile, JSON.stringify(payload, null, 2));
}
async function modelJson(system, user, { signal, temperature = 0.7, maxTokens = 1200 } = {}) {
  const base = process.env.LLAMA_BASE_URL || appConfig.llm?.base_url || 'http://127.0.0.1:8080/v1';
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Number(appConfig.llm?.timeout_ms || 300000));
  const abort = () => controller.abort();
  signal?.addEventListener('abort', abort, { once: true });
  try {
    const response = await fetch(`${base.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST', signal: controller.signal, headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model: process.env.LLAMA_MODEL || appConfig.llm?.model || 'local',
        temperature: clamp(temperature, 0, 2), max_tokens: maxTokens,
        chat_template_kwargs: { enable_thinking:false },
        response_format: { type: 'json_object' },
        messages: [{ role: 'system', content: system }, { role: 'user', content: user }]
      })
    });
    if (!response.ok) throw new Error(`LLM endpoint returned HTTP ${response.status}`);
    const raw = (await response.json()).choices?.[0]?.message?.content || '';
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('LLM returned no JSON object');
    return JSON.parse(match[0]);
  } catch (error) {
    if (controller.signal.aborted) throw new Error(signal?.aborted ? 'Исследование остановлено' : 'LLM request timed out');
    throw error;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', abort);
  }
}
async function llama(input, data, temperature) {
  input = { ...input, prompt: input.prompt || selfPrompts[Date.now() % selfPrompts.length] };
  const base = process.env.LLAMA_BASE_URL || 'http://127.0.0.1:8080/v1'; const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 300000);
  const variation = selectAngle(input.generationId || Date.now()); const model=process.env.LLAMA_MODEL || 'Qwen_Qwen3.6-35B-A3B-Q4_K_M.gguf'; const sceneCount=sceneBudget(model);
  const modelData = { title:data.title, columns:data.columns, rows:data.rows.slice(0,24), insights:data.insights.slice(0,14), sources:data.sources.slice(0,16), codeSignals:data.codeSignals };
  const diversityHint = recentStories.slice(-6).join(' || ');
  try { const response = await fetch(`${base}/chat/completions`, { method:'POST', signal:controller.signal, headers:{'content-type':'application/json'}, body:JSON.stringify({ model, temperature, max_tokens:Math.max(900,sceneCount*220), response_format:{type:'json_object'}, messages:[{role:'system',content:PO_SYSTEM_PROMPT},{role:'user',content:`Последние отпечатки драматургии: ${diversityHint || 'это первый запуск'}. Не повторяй их заголовки и порядок сцен.`},{role:'user',content:`Сделай ровно ${sceneCount} сцен. Ракурс этого запуска: ${variation[0]} — ${variation[1]}. Не повторяй прошлую драматургию. Уникальный generationId: ${input.generationId || 'new'}. Запрос: ${input.prompt || 'синтез продукта'}\nData: ${JSON.stringify(modelData)}`}] }) });
    if (!response.ok) return null; const raw = (await response.json()).choices?.[0]?.message?.content || ''; const match = raw.match(/\{[\s\S]*\}/); const parsed=match ? JSON.parse(match[0]) : null; return parsed;
  } catch { return null; } finally { clearTimeout(timer); }
}
async function refineScenes(plan, data, temperature) {
  const base=process.env.LLAMA_BASE_URL || 'http://127.0.0.1:8080/v1';
  const requests=plan.scenes.slice(0,15).map(async (scene,i)=>{ const controller=new AbortController(); const timer=setTimeout(()=>controller.abort(),90000); try { const r=await fetch(`${base}/chat/completions`,{method:'POST',signal:controller.signal,headers:{'content-type':'application/json'},body:JSON.stringify({model:process.env.LLAMA_MODEL||'Qwen_Qwen3.6-35B-A3B-Q4_K_M.gguf',temperature,messages:[{role:'system',content:'Ты редактор одного слайда Product Owner. Верни только JSON: title, thesis, evidence (1-2 конкретных факта из Data), speakerScript (2-4 живых предложения), visualType. Не повторяй соседние сцены, не придумывай числа.'},{role:'user',content:`Data: ${JSON.stringify(data)}\nВся история: ${plan.centralThesis}\nПредыдущая сцена: ${JSON.stringify(plan.scenes[i-1]||null)}\nТекущая сцена: ${JSON.stringify(scene)}\nСледующая сцена: ${JSON.stringify(plan.scenes[i+1]||null)}`}]})}); if(!r.ok)return scene; const raw=(await r.json()).choices?.[0]?.message?.content||''; const m=raw.match(/\{[\s\S]*\}/); return m?{...scene,...JSON.parse(m[0]),index:i+1}:scene; }catch{return scene}finally{clearTimeout(timer)} });
  return {...plan,scenes:await Promise.all(requests)};
}
function normalizePlan(plan, minimumScenes = 3) {
  if (!plan || !Array.isArray(plan.scenes) || plan.scenes.length < Math.max(3, minimumScenes)) return null;
  return { ...plan, evidence:Array.isArray(plan.evidence) ? plan.evidence : [], unknowns:Array.isArray(plan.unknowns) ? plan.unknowns : [], scenes: plan.scenes.slice(0, 15).map((s, i) => ({ ...s, index:i + 1, title:String(s.title || `Сцена ${i + 1}`), thesis:String(s.thesis || ''), evidence:Array.isArray(s.evidence) ? s.evidence : [], evidenceIds:Array.isArray(s.evidenceIds) ? s.evidenceIds.map(String) : [], speakerScript:String(s.speakerScript || ''), visualType:visualTypes.includes(s.visualType) ? s.visualType : 'statement' })) };
}
function selectStyle(temperature, generationId, requested) {
  const styles = templates.length ? templates.map(t => t.slug) : ['editorial','professional','kinetic','diagrammatic']; if (styles.includes(requested)) return requested;
  const ordered = [...styles.keys()].sort((a, b) => hashSeed(`${generationId}:${styles[a]}:${Math.round(clamp(temperature,0,2) * 100)}`) - hashSeed(`${generationId}:${styles[b]}:${Math.round(clamp(temperature,0,2) * 100)}`));
  const next = ordered.find(index => !usedStyles.has(styles[index])) ?? ordered[0];
  usedStyles.add(styles[next]);
  if (usedStyles.size >= styles.length) { usedStyles.clear(); usedStyles.add(styles[next]); }
  return styles[next];
}
function templateVisualTheme(slug, generationId = slug) {
  if (slug === 'codebase-to-course') return { styleId:slug, name:'Codebase to Course', family:'arcade', variant:hashSeed(`${slug}:${generationId}`)%6, scheme:'dark', colors:{bg:'#241b16',ink:'#fff6e8',accent:'#ffb86b',soft:'#684936',hot:'#f06f52'}, typography:{display:'ui-monospace',body:'ui-monospace',mono:'ui-monospace'}, fontUrl:'' };
  const template=templates.find(item=>item.slug===slug); const palette=template?.palette || {}; const dark=template?.scheme === 'dark';
  const bg=palette.bg_primary || palette.bg || palette.background || palette.void || palette.deep_navy || palette.cream || palette.parchment || (dark?'#101827':'#f4efe4');
  const ink=palette.text_primary || palette.fg || palette.ink || palette.dark || (dark ? palette.lavender || palette.cream || '#f7fbff' : '#18212b');
  const accent=palette.accent || palette.primary || palette.forest_green || palette.neon_cyan || palette.cobalt || palette.blue || palette.yellow || palette.pink || '#2f6fed';
  const hot=palette.hot || palette.red || palette.secondary || palette.neon_pink || palette.pink || palette.orange || '#ff805d';
  const soft=palette.line || palette.bg_secondary || palette.bg_alt || palette.cream || palette.lavender || palette.neon_yellow || '#8096aa';
  const display=template?.typography?.display || template?.typography?.serif || template?.typography?.sans || 'Georgia'; const body=template?.typography?.body || template?.typography?.sans || template?.typography?.serif || 'Arial'; const mono=template?.typography?.mono || 'monospace';
  const families=[display,body,mono].filter((name,index,list)=>name&&list.indexOf(name)===index).slice(0,3);
  const fontUrl=families.length ? `https://fonts.googleapis.com/css2?${families.map(name=>`family=${encodeURIComponent(name).replace(/%20/g,'+')}:wght@400;600;800`).join('&')}&display=swap` : '';
  return { styleId:slug, name:template?.name || slug, family:designFamily(slug), variant:hashSeed(`${slug}:${generationId}`)%6, scheme:template?.scheme || (dark?'dark':'light'), colors:{bg,ink,accent,soft,hot}, typography:{display,body,mono}, fontUrl };
}
function templateTheme(slug) {
  const theme=templateVisualTheme(slug);
  return `--bg:${theme.colors.bg};--ink:${theme.colors.ink};--accent:${theme.colors.accent};--soft:${theme.colors.soft};--hot:${theme.colors.hot};--font-display:'${theme.typography.display}',serif;--font-body:'${theme.typography.body}',sans-serif;--font-mono:'${theme.typography.mono}',monospace`;
}
function designFamily(slug) {
  if (/orbit|retro-windows|neo-grid|cobalt-grid|codebase|signal/i.test(slug)) return 'arcade';
  if (/editorial|vellum|monochrome|broadside|pin-and-paper|pink-script|biennale/i.test(slug)) return 'editorial';
  if (/playful|daisy|scatterbrain|coral|sakura|capsule|grove/i.test(slug)) return 'playful';
  if (/bold|block|raw-grid|stencil|studio|creative-mode|peoples-platform/i.test(slug)) return 'brutal';
  if (/cartesian|long-table|blue-professional|mat|diagram/i.test(slug)) return 'diagrammatic';
  return 'cinematic';
}
function templateFontLink(slug) {
  const fontUrl=templateVisualTheme(slug).fontUrl;
  return fontUrl ? `<link rel="stylesheet" href="${fontUrl}">` : '';
}
function metricRows(data) {
  if (Array.isArray(data.numericMetrics) && data.numericMetrics.length) return data.numericMetrics;
  return (data.rows || []).map(row => {
    const match = String(row[1] || '').match(/(-?\d+(?:[.,]\d+)?)/);
    return match ? [String(row[0] || 'metric'), Number(match[1].replace(',', '.')), String(row[2] || 'значение'), 'извлечено из Data'] : null;
  }).filter(Boolean).slice(0, 10);
}

function dataHtml(data, meta) {
  const metrics = metricRows(data);
  const cards = metrics.map(([name, value, meaning, note]) => `<article class="metric"><b>${esc(name)}</b><strong>${esc(value)}</strong><span>${esc(meaning)}</span><small>${esc(note)}</small></article>`).join('');
  return `<!doctype html><meta charset="utf-8"><title>Data · ${esc(data.title)}</title><style>body{font:16px/1.5 system-ui;max-width:1160px;margin:40px auto;padding:0 24px;color:#172437;background:#f7f9fc}h1{font-size:40px}.meta{color:#637286;font:12px monospace}.metrics{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:14px;margin:26px 0}.metric{background:white;border:1px solid #d5dee8;border-radius:14px;padding:16px;display:grid;gap:4px;box-shadow:0 8px 20px #203b5810}.metric b{font:12px monospace;color:#315fd2}.metric strong{font-size:34px;line-height:1.1}.metric span{font-weight:700}.metric small{color:#637286}table{border-collapse:collapse;width:100%;background:white}th,td{text-align:left;padding:13px;border-bottom:1px solid #d5dee8}th{color:#315fd2}h2{margin-top:34px}</style><h1>${esc(data.title)} · Data</h1><p class="meta">Generation ${esc(meta.generationId)} · ${esc(data.sourceKind)} · ${data.sources.length} source(s) · ${metrics.length} numeric metrics</p><section class="metrics">${cards}</section><table><thead><tr>${data.columns.map(x=>`<th>${esc(x)}</th>`).join('')}</tr></thead><tbody>${data.rows.map(r=>`<tr>${r.map(x=>`<td>${esc(x)}</td>`).join('')}</tr>`).join('')}</tbody></table><h2>Insights</h2><ul>${data.insights.map(x=>`<li>${esc(x)}</li>`).join('')}</ul><h2>Sources</h2><ul>${data.sources.map(x=>`<li>${esc(x)}</li>`).join('')}</ul>`;
}
function narrativeHtml(plan, meta) { return `<!doctype html><meta charset="utf-8"><title>Narrative · ${esc(plan.topic)}</title><style>body{font:18px/1.6 Georgia,serif;max-width:850px;margin:42px auto;padding:0 24px;color:#172437}h1,h2{font-family:system-ui;line-height:1.1}h1{font-size:46px}h2{margin-top:38px;color:#315fd2}.page{border-top:1px solid #bdc7d0;padding:24px 0}.script{background:#fffdf8;padding:18px 22px;box-shadow:0 8px 24px #344a6612}.meta{font:12px monospace;color:#315fd2}.chain{padding:15px;background:#eef3ff;font-family:system-ui}</style><p class="meta">NARRATIVE · ${esc(meta.generationId)} · ${esc(meta.mode)} · ${esc(meta.styleId)}</p><h1>${esc(plan.topic)}</h1><h2>Аудитория</h2><p>${esc(plan.audience)}</p><h2>Главный тезис</h2><p>${esc(plan.centralThesis)}</p><h2>Ситуация</h2><p>${esc(plan.situation)}</p><h2>Доказательства</h2><ul>${plan.evidence.map(x=>`<li>${esc(x)}</li>`).join('')}</ul><h2>Интерпретация</h2><p>${esc(plan.centralThesis)}</p><h2>Риски и неизвестности</h2><ul>${plan.unknowns.map(x=>`<li>${esc(x)}</li>`).join('')}</ul><h2>Следующий шаг</h2><p>${esc(plan.nextStep)}</p><div class="chain">Data → Narrative → Slides · один generationId</div>${plan.scenes.map(s=>`<section class="page"><div class="meta">SLIDE ${String(s.index).padStart(2,'0')} · ${esc(s.visualType)}</div><h2>${esc(s.title)}</h2><p><b>Тезис:</b> ${esc(s.thesis)}</p><p><b>Опора:</b> ${esc(s.evidence.join(' · '))}</p><div class="script"><b>Что сказать:</b><br>${esc(s.speakerScript)}</div></section>`).join('')}`; }

const styleCss = { editorial:'--bg:#f3eee4;--ink:#18212b;--accent:#1d5c45;--soft:#d9e7cf;--hot:#d77a5b;font-family:Georgia,serif', professional:'--bg:#071321;--ink:#f7fbff;--accent:#4f7cff;--soft:#b8f3e8;--hot:#ff805d;font-family:Inter,system-ui,sans-serif', kinetic:'--bg:#21133d;--ink:#fff9ef;--accent:#f0dc4d;--soft:#62e7d6;--hot:#ff6d8b;font-family:Impact,system-ui,sans-serif', diagrammatic:'--bg:#eef3f7;--ink:#14263a;--accent:#1e65d6;--soft:#b5cbe2;--hot:#f07b4f;font-family:ui-monospace,monospace' };
for (const template of templates) styleCss[template.slug] = templateTheme(template.slug);
function sceneVisual(scene, index, total, chartHtml = '') {
  const evidence=[...new Map((scene.evidence || []).map(value=>[String(value).trim().toLowerCase(),String(value).trim()])).values()].filter(Boolean).slice(0,4); const cards=evidence.map((value,i)=>`<article class="evidence-card reveal"><b>0${i+1}</b><p>${esc(value)}</p></article>`).join('');
  const header=`<header class="scene-header reveal"><span>${String(index+1).padStart(2,'0')} / ${String(total).padStart(2,'0')}</span><em>${esc(scene.visualType)}</em></header>`;
  const footer=`<footer class="scene-footer reveal"><span>${esc(scene.thesis)}</span><b>${index===total-1?'NEXT →':String(index+1).padStart(2,'0')}</b></footer>`;
  if (index === 0) return `${header}<div class="title-composition"><span class="title-index reveal">01</span><h1 class="reveal">${esc(scene.title)}</h1><p class="lead reveal">${esc(scene.thesis)}</p></div>${chartHtml}${footer}`;
  if (index === total-1) return `${header}<div class="closing-composition"><p class="closing-kicker reveal">Следующий ход</p><h1 class="reveal">${esc(scene.title)}</h1><p class="lead reveal">${esc(scene.thesis)}</p><div class="closing-line reveal"></div></div>${footer}`;
  if (scene.visualType === 'quote') return `${header}<div class="quote-composition"><span class="quote-mark reveal">“</span><blockquote class="reveal">${esc(scene.thesis)}</blockquote><h1 class="reveal">${esc(scene.title)}</h1></div><div class="quote-proof reveal">${esc(evidence[0] || '')}</div>${footer}`;
  if (scene.visualType === 'comparison') return `${header}<h1 class="scene-title reveal">${esc(scene.title)}</h1><div class="comparison-composition"><article class="compare left reveal"><span>Опора A</span><p>${esc(evidence[0] || scene.thesis)}</p></article><div class="versus reveal">↔</div><article class="compare right reveal"><span>Опора B</span><p>${esc(evidence[1] || scene.thesis)}</p></article></div>${chartHtml}${footer}`;
  if (scene.visualType === 'flow') return `${header}<h1 class="scene-title reveal">${esc(scene.title)}</h1><div class="flow-composition">${evidence.slice(0,4).map((value,i)=>`<div class="flow-step reveal"><b>${i+1}</b><span>${esc(value)}</span></div>${i<Math.min(evidence.length,4)-1?'<i class="flow-arrow reveal">→</i>':''}`).join('')}</div>${footer}`;
  if (scene.visualType === 'roadmap') return `${header}<h1 class="scene-title reveal">${esc(scene.title)}</h1><div class="roadmap-composition"><div class="road-line"></div>${evidence.slice(0,4).map((value,i)=>`<article class="road-step reveal"><b>${i+1}</b><p>${esc(value)}</p></article>`).join('')}</div>${chartHtml}${footer}`;
  if (scene.visualType === 'table') return `${header}<h1 class="scene-title reveal">${esc(scene.title)}</h1><div class="table-composition">${cards}</div>${chartHtml}${footer}`;
  return `${header}<div class="statement-composition"><span class="statement-glyph reveal">${String(index+1).padStart(2,'0')}</span><h1 class="reveal">${esc(scene.title)}</h1><p class="lead reveal">${esc(scene.thesis)}</p></div><div class="statement-proof">${evidence.slice(0,2).map((value,i)=>`<article class="evidence-card reveal"><b>0${i+1}</b><p>${esc(value)}</p></article>`).join('')}</div>${footer}`;
}
function chartVisual(metrics, family, seed) {
  const values=metrics.slice(0,5), max=Math.max(...values.map(([,value])=>Number(value)||0),1), rows=values.map(([name,value,meaning])=>({name:String(name),value:Number(value)||0,meaning:String(meaning),pct:Math.max(8,Math.round((Number(value)||0)/max*100))}));
  const alt=seed%2;
  if (family==='editorial') return `<figure class="data-visual data-lollipop ${alt?'is-alt':''} reveal"><figcaption>Наблюдаемые сигналы</figcaption>${rows.map(row=>`<div class="lollipop-row"><span>${esc(row.name)}</span><i><b style="left:${row.pct}%"></b></i><strong>${esc(row.value)}</strong></div>`).join('')}</figure>`;
  if (family==='arcade') return `<figure class="data-visual data-pixels ${alt?'is-alt':''} reveal"><figcaption>Signal / live</figcaption><div class="pixel-bars">${rows.map(row=>`<div class="pixel-column"><strong>${esc(row.value)}</strong><i style="height:${row.pct}%"></i><span>${esc(row.name)}</span></div>`).join('')}</div></figure>`;
  if (family==='brutal') return `<figure class="data-visual data-blocks ${alt?'is-alt':''} reveal"><figcaption>Данные без декора</figcaption>${rows.slice(0,3).map((row,index)=>`<div class="number-block block-${index}"><strong>${esc(row.value)}</strong><span>${esc(row.meaning)}</span></div>`).join('')}</figure>`;
  if (family==='playful') return `<figure class="data-visual data-bubbles ${alt?'is-alt':''} reveal"><figcaption>Поля изменений</figcaption>${rows.slice(0,4).map((row,index)=>`<div class="metric-bubble bubble-${index}" style="--bubble:${110+row.pct*1.6}px"><strong>${esc(row.value)}</strong><span>${esc(row.name)}</span></div>`).join('')}</figure>`;
  if (family==='diagrammatic') { const points=rows.map((row,index)=>`${20+index*115},${240-row.pct*1.8}`).join(' '); return `<figure class="data-visual data-line ${alt?'is-alt':''} reveal"><figcaption>Срез системы</figcaption><svg viewBox="0 0 500 260" role="img" aria-label="График показателей"><polyline points="${points}"></polyline>${rows.map((row,index)=>`<circle cx="${20+index*115}" cy="${240-row.pct*1.8}" r="8"></circle>`).join('')}</svg><div class="line-labels">${rows.map(row=>`<span>${esc(row.value)}<small>${esc(row.name)}</small></span>`).join('')}</div></figure>`; }
  const hero=rows[0] || {value:0,name:'signal',meaning:''}; return `<figure class="data-visual data-orbit ${alt?'is-alt':''} reveal"><div class="orbit-ring"><strong>${esc(hero.value)}</strong><span>${esc(hero.meaning)}</span></div><div class="orbit-notes">${rows.slice(1,4).map(row=>`<span><b>${esc(row.value)}</b>${esc(row.name)}</span>`).join('')}</div></figure>`;
}
function chartSceneIndexes(scenes, enabled) {
  const selected=new Set(); if(!enabled)return selected;
  for(let start=0;start<scenes.length;start+=5){const local=scenes.slice(start,start+5).findIndex((scene,offset)=>start+offset>0&&start+offset<scenes.length-1&&['comparison','table','roadmap'].includes(scene.visualType));if(local>=0)selected.add(start+local)}
  return selected;
}
function slidesHtml(plan, meta, data) {
  const style=styleCss[meta.styleId], family=designFamily(meta.styleId), variant=hashSeed(`${meta.styleId}:${meta.generationId}`)%6, metrics=metricRows(data);
  const chart=chartVisual(metrics,family,hashSeed(`${meta.generationId}:chart`));
  const chartIndexes=chartSceneIndexes(plan.scenes,metrics.length>0);
  const scenes=plan.scenes.map((scene,index)=>`<section class="slide ${index===0?'active visible':''}${chartIndexes.has(index)?' has-chart':''}" data-visual="${esc(scene.visualType)}">${sceneVisual(scene,index,plan.scenes.length,chartIndexes.has(index)?chart:'')}</section>`).join('');
  return deckDocument(plan,meta,style,family,variant,scenes);
}
function deckDocument(plan,meta,style,family,variant,scenes) {
  return `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(plan.topic)}</title>${templateFontLink(meta.styleId)}<style>
:root{${style};--stage-bg:#050505;--slide-bg:var(--bg);--ease:cubic-bezier(.16,1,.3,1)}
*{box-sizing:border-box}html,body{width:100%;height:100%;margin:0;overflow:hidden;background:var(--stage-bg)}
.deck-viewport{position:fixed;inset:0;overflow:hidden;background:var(--stage-bg)}.deck-stage{position:absolute;left:0;top:0;width:1920px;height:1080px;overflow:hidden;transform-origin:0 0;background:var(--slide-bg)}
.slide{position:absolute;inset:0;width:1920px;height:1080px;overflow:hidden;display:block;visibility:hidden;opacity:0;pointer-events:none;background:var(--bg);color:var(--ink);padding:72px 92px;transition:opacity .65s var(--ease),transform .65s var(--ease);transform:translateY(34px) scale(.99)}
.slide.active,.slide.visible{visibility:visible;opacity:1;pointer-events:auto;z-index:1;transform:none}.deck-controls{position:fixed;left:50%;bottom:18px;transform:translateX(-50%);z-index:1000;color:#fff;font:11px var(--font-mono);letter-spacing:.14em;background:#0009;padding:9px 14px;border-radius:99px}
.scene-header{display:flex;justify-content:space-between;border-bottom:2px solid var(--soft);padding-bottom:17px;font:700 16px var(--font-mono);letter-spacing:.17em;text-transform:uppercase;color:var(--accent)}.scene-header em{font-style:normal}.scene-title{font:800 84px/.92 var(--font-display);letter-spacing:-.045em;margin:72px 0 48px;max-width:1400px}.lead{font:600 36px/1.22 var(--font-body);max-width:1050px}
.scene-footer{position:absolute;left:92px;right:92px;bottom:54px;display:flex;justify-content:space-between;align-items:flex-end;border-top:2px solid var(--soft);padding-top:18px;font:600 19px/1.25 var(--font-body)}.scene-footer span{max-width:1220px}.scene-footer b{font:800 34px var(--font-mono);color:var(--hot)}
.title-composition{position:absolute;left:92px;right:92px;top:205px;bottom:155px;display:grid;grid-template-columns:320px 1fr;grid-template-rows:1fr auto;align-items:center}.title-index{grid-row:1/3;font:800 280px/.75 var(--font-display);color:var(--accent);opacity:.26}.title-composition h1{font:800 128px/.86 var(--font-display);letter-spacing:-.065em;margin:0;max-width:1250px}.title-composition .lead{grid-column:2}
.closing-composition{position:absolute;inset:205px 170px 160px;display:flex;flex-direction:column;justify-content:center}.closing-kicker{font:700 20px var(--font-mono);text-transform:uppercase;letter-spacing:.2em;color:var(--accent)}.closing-composition h1{font:800 126px/.88 var(--font-display);letter-spacing:-.06em;margin:24px 0 34px;max-width:1450px}.closing-line{width:260px;height:18px;background:var(--hot);margin-top:50px}
.statement-composition{position:absolute;left:92px;top:180px;width:1150px}.statement-glyph{font:800 150px/.8 var(--font-mono);color:var(--accent);opacity:.28}.statement-composition h1{font:800 106px/.9 var(--font-display);letter-spacing:-.055em;margin:26px 0 38px}.statement-proof{position:absolute;right:92px;top:240px;width:480px;display:grid;gap:20px}
.evidence-card{padding:24px;border:2px solid var(--soft);background:color-mix(in srgb,var(--bg) 90%,var(--ink));font:600 20px/1.3 var(--font-body)}.evidence-card b{font:800 14px var(--font-mono);color:var(--hot)}
.comparison-composition{display:grid;grid-template-columns:1fr 90px 1fr;gap:20px;align-items:stretch;margin-top:65px}.compare{min-height:410px;padding:48px;border:4px solid var(--accent);display:flex;flex-direction:column;justify-content:space-between}.compare.right{background:var(--accent);color:var(--bg)}.compare span{font:800 18px var(--font-mono);text-transform:uppercase;letter-spacing:.18em}.compare p{font:700 34px/1.18 var(--font-body)}.versus{display:grid;place-items:center;font:800 56px var(--font-display);color:var(--hot)}
.quote-composition{position:absolute;inset:170px 160px 230px;display:grid;grid-template-columns:230px 1fr;align-content:center}.quote-mark{font:800 330px/.6 var(--font-display);color:var(--hot)}blockquote{font:700 72px/1.02 var(--font-display);margin:0;max-width:1250px}.quote-composition h1{grid-column:2;font:700 25px var(--font-mono);color:var(--accent);margin-top:42px}.quote-proof{position:absolute;right:110px;bottom:125px;max-width:760px;font:600 18px var(--font-body);text-align:right}
.flow-composition{display:flex;align-items:stretch;justify-content:center;margin-top:105px}.flow-step{width:315px;min-height:300px;border:3px solid var(--accent);padding:32px;display:flex;flex-direction:column;gap:42px}.flow-step b,.road-step b{font:800 60px var(--font-display);color:var(--hot)}.flow-step span{font:650 23px/1.25 var(--font-body)}.flow-arrow{display:grid;place-items:center;width:75px;font:800 50px var(--font-display);color:var(--accent)}
.table-composition{display:grid;grid-template-columns:repeat(2,1fr);gap:22px;margin-top:45px;max-width:1260px}.table-composition .evidence-card{min-height:175px}.roadmap-composition{position:relative;display:grid;grid-template-columns:repeat(4,1fr);gap:28px;margin-top:120px}.road-line{position:absolute;left:0;right:0;top:43px;height:5px;background:var(--accent)}.road-step{position:relative;padding:85px 22px 25px;border-left:3px solid var(--hot);font:600 21px/1.3 var(--font-body)}.road-step b{position:absolute;top:0;left:18px}
.data-visual{position:absolute;right:78px;top:238px;width:520px;height:520px;margin:0;z-index:2;color:var(--ink);font-family:var(--font-body)}.data-visual figcaption{font:800 15px var(--font-mono);letter-spacing:.16em;text-transform:uppercase;color:var(--accent);margin-bottom:28px}
.data-lollipop{border-left:2px solid var(--soft);padding-left:28px}.lollipop-row{display:grid;grid-template-columns:150px 1fr 45px;gap:12px;align-items:center;margin:27px 0;font:600 14px var(--font-mono)}.lollipop-row>span{overflow:hidden;text-overflow:ellipsis}.lollipop-row i{height:1px;background:var(--soft);position:relative}.lollipop-row i b{position:absolute;top:-8px;width:17px;height:17px;border:3px solid var(--bg);border-radius:50%;background:var(--hot);transform:translateX(-50%)}.data-lollipop.is-alt i b{border-radius:0;transform:translateX(-50%) rotate(45deg)}.lollipop-row strong{font-size:21px;color:var(--hot)}
.data-pixels{border:6px solid var(--accent);padding:24px;box-shadow:12px 12px 0 var(--hot)}.pixel-bars{height:390px;display:flex;align-items:flex-end;gap:18px}.pixel-column{height:100%;flex:1;display:flex;flex-direction:column;justify-content:flex-end;align-items:center;gap:10px}.pixel-column i{display:block;width:56px;min-height:22px;background:repeating-linear-gradient(0deg,var(--accent) 0 15px,var(--bg) 15px 20px)}.data-pixels.is-alt .pixel-column i{background:repeating-linear-gradient(90deg,var(--hot) 0 14px,var(--bg) 14px 19px)}.pixel-column strong{font:800 24px var(--font-mono);color:var(--hot)}.pixel-column span{font:600 9px var(--font-mono);writing-mode:vertical-rl;max-height:90px;overflow:hidden}
.data-blocks{display:grid;grid-template-columns:1fr 1fr;grid-template-rows:auto 1fr 1fr;gap:13px}.data-blocks figcaption{grid-column:1/-1}.number-block{border:6px solid var(--ink);padding:20px;background:var(--accent);color:var(--bg);display:flex;flex-direction:column;justify-content:space-between;box-shadow:9px 9px 0 var(--hot)}.number-block strong{font:900 80px/.8 var(--font-display)}.number-block span{font:800 16px/1.1 var(--font-body)}.number-block.block-0{grid-row:2/4}.data-blocks.is-alt .number-block.block-0{grid-column:1/3;grid-row:2}.data-blocks.is-alt .number-block strong{font-size:58px}
.data-bubbles{position:absolute}.data-bubbles figcaption{position:absolute;top:0;left:0}.metric-bubble{position:absolute;width:var(--bubble);height:var(--bubble);border-radius:50%;background:var(--accent);color:var(--bg);display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:18px;box-shadow:inset -18px -20px 0 color-mix(in srgb,var(--hot) 35%,transparent)}.metric-bubble strong{font:800 44px var(--font-display)}.metric-bubble span{font:700 10px var(--font-mono);max-width:90%;overflow:hidden}.bubble-0{left:15px;top:75px}.bubble-1{right:5px;top:40px}.bubble-2{left:170px;bottom:15px}.bubble-3{right:0;bottom:10px}.data-bubbles.is-alt .metric-bubble{border-radius:35% 65% 58% 42% / 45% 38% 62% 55%;transform:rotate(-6deg)}
.data-line{border-bottom:3px solid var(--accent);padding-bottom:18px}.data-line svg{width:500px;height:285px;overflow:visible}.data-line polyline{fill:none;stroke:var(--accent);stroke-width:8;stroke-linecap:round;stroke-linejoin:round}.data-line circle{fill:var(--hot);stroke:var(--bg);stroke-width:5}.data-line.is-alt polyline{stroke-dasharray:14 10}.line-labels{display:grid;grid-template-columns:repeat(5,1fr);gap:8px}.line-labels>span{font:800 22px var(--font-mono);color:var(--hot)}.line-labels small{display:block;font:600 9px/1.15 var(--font-mono);color:var(--ink);overflow:hidden}
.data-orbit{display:grid;place-items:center}.orbit-ring{width:345px;height:345px;border:34px solid var(--accent);border-right-color:var(--hot);border-radius:50%;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;box-shadow:0 0 90px color-mix(in srgb,var(--accent) 32%,transparent)}.data-orbit.is-alt .orbit-ring{border-radius:8px;transform:rotate(8deg)}.orbit-ring strong{font:900 112px/.8 var(--font-display)}.orbit-ring span{font:700 16px/1.1 var(--font-body);max-width:190px;margin-top:24px}.orbit-notes{position:absolute;inset:20px;pointer-events:none}.orbit-notes span{position:absolute;font:600 12px var(--font-mono);color:var(--ink)}.orbit-notes span:nth-child(1){right:0;top:80px}.orbit-notes span:nth-child(2){left:0;bottom:70px}.orbit-notes span:nth-child(3){right:20px;bottom:15px}.orbit-notes b{display:block;font-size:28px;color:var(--hot)}
.has-chart .comparison-composition,.has-chart .table-composition,.has-chart .roadmap-composition{max-width:1050px}.has-chart .comparison-composition{grid-template-columns:1fr 65px 1fr}.has-chart .compare{padding:34px}.has-chart .roadmap-composition{grid-template-columns:repeat(3,1fr)}.has-chart .road-step:nth-of-type(n+4){display:none}
.reveal{opacity:0;transform:translateY(28px);transition:opacity .65s var(--ease),transform .65s var(--ease)}.visible .reveal{opacity:1;transform:none}.visible .reveal:nth-child(2){transition-delay:.1s}.visible .reveal:nth-child(3){transition-delay:.2s}
.family-editorial .slide{background:linear-gradient(90deg,color-mix(in srgb,var(--soft) 18%,transparent) 1px,transparent 1px),var(--bg);background-size:64px 100%;box-shadow:inset 0 0 0 18px var(--bg)}.family-editorial .scene-header,.family-editorial .scene-footer{border-width:1px}.family-editorial .title-index,.family-editorial .statement-glyph{font-style:italic}
.family-arcade .slide{background:repeating-linear-gradient(0deg,transparent 0 5px,#0002 6px),radial-gradient(circle at 80% 20%,color-mix(in srgb,var(--accent) 24%,transparent),transparent 38%),var(--bg);box-shadow:inset 0 0 0 12px var(--accent)}.family-arcade h1,.family-arcade blockquote{text-transform:uppercase;text-shadow:7px 7px 0 color-mix(in srgb,var(--hot) 55%,transparent)}.family-arcade .evidence-card,.family-arcade .compare,.family-arcade .flow-step{box-shadow:10px 10px 0 var(--hot);border-radius:0}
.family-brutal .slide{background:linear-gradient(135deg,var(--bg) 0 82%,var(--accent) 82%)}.family-brutal .scene-header{border-bottom:10px solid var(--ink)}.family-brutal .evidence-card,.family-brutal .compare,.family-brutal .flow-step{border:6px solid var(--ink);box-shadow:12px 12px 0 var(--hot)}.family-brutal .title-composition h1,.family-brutal .statement-composition h1{text-transform:uppercase}
.family-playful .slide{background:radial-gradient(circle at 92% 12%,var(--hot) 0 130px,transparent 132px),radial-gradient(circle at 8% 88%,var(--accent) 0 100px,transparent 102px),var(--bg)}.family-playful .evidence-card:nth-child(odd),.family-playful .compare.left{transform:rotate(-2deg)}.family-playful .evidence-card:nth-child(even),.family-playful .compare.right{transform:rotate(2deg)}.family-playful .evidence-card,.family-playful .compare,.family-playful .flow-step{border-radius:34px}
.family-diagrammatic .slide{background-image:linear-gradient(var(--soft) 1px,transparent 1px),linear-gradient(90deg,var(--soft) 1px,transparent 1px);background-size:48px 48px}.family-diagrammatic .flow-step,.family-diagrammatic .road-step,.family-diagrammatic .evidence-card{background:var(--bg)}
.family-cinematic .slide{background:radial-gradient(circle at 72% 35%,color-mix(in srgb,var(--accent) 34%,transparent),transparent 44%),linear-gradient(145deg,var(--bg),color-mix(in srgb,var(--bg) 78%,#000))}.family-cinematic .title-composition h1,.family-cinematic .statement-composition h1{font-size:142px}
.variant-1 .title-composition{grid-template-columns:1fr 320px}.variant-1 .title-index{grid-column:2;grid-row:1/3}.variant-2 .scene-title{text-align:right;margin-left:auto}.variant-3 .slide{box-shadow:inset 28px 0 0 var(--hot)}.variant-4 .scene-header{border-style:dashed}.variant-5 .title-composition h1{font-style:italic}
@media print{html,body{width:1920px;height:auto;overflow:visible;background:#fff}.deck-viewport{position:static;overflow:visible}.deck-stage{position:static;width:auto;height:auto;transform:none!important}.slide{position:relative;display:block!important;visibility:visible!important;opacity:1!important;pointer-events:auto!important;width:1920px;height:1080px;break-after:page}.deck-controls{display:none!important}}
@media(prefers-reduced-motion:reduce){*,*::before,*::after{animation-duration:.01ms!important;transition-duration:.2s!important}}
</style></head><body class="family-${family} variant-${variant}" data-template="${esc(meta.styleId)}"><div class="deck-viewport"><main class="deck-stage" id="deckStage">${scenes}</main></div><div class="deck-controls">← → · пробел · ${esc(meta.styleId)}</div><script>
const slides=[...document.querySelectorAll('.slide')],stage=document.getElementById('deckStage');let current=0,wheelLock=false,touchX=0;
function scale(){const factor=Math.min(innerWidth/1920,innerHeight/1080),x=(innerWidth-1920*factor)/2,y=(innerHeight-1080*factor)/2;stage.style.transform='translate('+x+'px,'+y+'px) scale('+factor+')'}
function go(next){current=Math.max(0,Math.min(next,slides.length-1));slides.forEach((slide,index)=>{slide.classList.toggle('active',index===current);slide.classList.toggle('visible',index===current)})}
addEventListener('resize',scale);addEventListener('keydown',event=>{if(['ArrowRight','ArrowDown','PageDown',' '].includes(event.key))go(current+1);if(['ArrowLeft','ArrowUp','PageUp'].includes(event.key))go(current-1);if(event.key==='Home')go(0);if(event.key==='End')go(slides.length-1)});addEventListener('wheel',event=>{if(wheelLock)return;wheelLock=true;go(current+(event.deltaY>0?1:-1));setTimeout(()=>wheelLock=false,500)},{passive:true});addEventListener('touchstart',event=>touchX=event.touches[0].clientX,{passive:true});addEventListener('touchend',event=>{const dx=event.changedTouches[0].clientX-touchX;if(Math.abs(dx)>50)go(current+(dx<0?1:-1))},{passive:true});scale();go(0);
</script></body></html>`;
}
async function legacyPptx(plan, meta, data) {
  const pptx = new pptxgen(); pptx.layout = 'LAYOUT_WIDE'; pptx.author = 'PO Agent Suite'; pptx.subject = 'Legacy static export'; pptx.title = plan.topic;
  const themes = { editorial:{bg:'F3EEE4',ink:'18212B',accent:'1D5C45',hot:'D77A5B'}, professional:{bg:'071321',ink:'F7FBFF',accent:'4F7CFF',hot:'FF805D'}, kinetic:{bg:'21133D',ink:'FFF9EF',accent:'F0DC4D',hot:'FF6D8B'}, diagrammatic:{bg:'EEF3F7',ink:'14263A',accent:'1E65D6',hot:'F07B4F'}, 'codebase-to-course':{bg:'241B16',ink:'FFF6E8',accent:'FFB86B',hot:'F06F52'} };
  const t = themes[meta.styleId] || themes.professional;
  const metrics = metricRows(data || {}), max = Math.max(...metrics.map(([, value]) => Number(value) || 0), 1), chartIndexes=chartSceneIndexes(plan.scenes,metrics.length>0);
  for (const [i, scene] of plan.scenes.entries()) { const slide=pptx.addSlide(); slide.background={color:t.bg}; slide.addText(`${String(scene.index).padStart(2,'0')} / ${plan.scenes.length} · ${scene.visualType}`,{x:.7,y:.45,w:11.4,h:.25,fontFace:'Aptos Mono',fontSize:9,color:t.accent,charSpacing:1}); slide.addText(scene.title,{x:.7,y:1.35,w:7.7,h:1.2,fontFace:'Aptos Display',fontSize:30,bold:true,color:t.ink,margin:0,breakLine:false,fit:'shrink'}); slide.addText(scene.thesis,{x:.7,y:2.85,w:7.4,h:1.0,fontFace:'Aptos',fontSize:18,color:t.ink,margin:0,fit:'shrink'}); slide.addText(scene.evidence.map(value=>`→ ${value}`).join('\n'),{x:.7,y:4.55,w:7.6,h:1.45,fontFace:'Aptos',fontSize:13,bold:true,color:t.accent,breakLine:false,fit:'shrink',bullet:{type:'ul'}}); if (chartIndexes.has(i)) { slide.addText('DATA SIGNALS',{x:8.65,y:1.45,w:3.3,h:.22,fontFace:'Aptos Mono',fontSize:9,bold:true,color:t.accent,charSpacing:1}); metrics.slice(0,6).forEach(([name,value,meaning], row) => { const y=1.85+row*.62, ratio=Math.max(.08,Math.min(1,(Number(value)||0)/max)); slide.addText(String(name),{x:8.65,y,w:1.55,h:.18,fontFace:'Aptos Mono',fontSize:7,color:t.ink,fit:'shrink'}); slide.addShape(pptx.ShapeType.rect,{x:10.18,y:y+.01,w:1.45,h:.13,fill:{color:'D5DEE8'},line:{color:'D5DEE8'}}); slide.addShape(pptx.ShapeType.rect,{x:10.18,y:y+.01,w:1.45*ratio,h:.13,fill:{color:t.accent},line:{color:t.accent}}); slide.addText(String(value),{x:11.7,y,w:.55,h:.18,fontFace:'Aptos Mono',fontSize:8,bold:true,color:t.hot,align:'right'}); slide.addText(String(meaning),{x:8.65,y:y+.2,w:3.3,h:.18,fontFace:'Aptos',fontSize:7,color:t.ink,fit:'shrink'}); }); } slide.addText(i===0?'THESIS':i===plan.scenes.length-1?'NEXT':String(i).padStart(2,'0'),{x:10.1,y:5.65,w:2.0,h:.6,fontFace:'Aptos Mono',fontSize:22,bold:true,color:t.hot,align:'right'}); slide.addNotes(`Legacy static export of ${meta.generationId}. For animated transitions open the HTML Slides artifact.`); }
  return pptx.write({ outputType:'nodebuffer' });
}

function animateSlides(html) {
  return html;
}

function narrativeMarkdown(plan, research, meta) {
  const citations = ids => ids.map(id => `[${id}]`).join(' ');
  const evidence = research.evidence.map(item => `- [${item.id}] ${item.claim} — ${item.sourceTitle} (${item.sourceUri})`).join('\n');
  const pages = plan.scenes.map(scene => `## Слайд ${String(scene.index).padStart(2, '0')}. ${scene.title}\n\n**Тезис:** ${scene.thesis}\n\n**Опорные данные:** ${scene.evidence.map((value, index) => `${value} ${scene.evidenceIds[index] ? `[${scene.evidenceIds[index]}]` : ''}`).join(' · ')}\n\n**Переход:** ${scene.transition || (scene.index === plan.scenes.length ? plan.nextStep : 'Следующая сцена развивает последствие этого наблюдения.')}\n\n### Что сказать\n\n${scene.speakerScript}`).join('\n\n---\n\n');
  const dataRows=research.data?.rows?.map(row=>`- ${row.join(' · ')}`).join('\n') || '- Новые данные не зафиксированы.';
  return `# ${plan.topic}\n\nGeneration: ${meta.generationId}  \nАудитория: ${plan.audience}\n\n## Главный тезис\n\n${plan.centralThesis}\n\n## Ситуация\n\n${plan.situation}\n\n## Новые данные\n\n${dataRows}\n\n## Доказательства\n\n${evidence}\n\n## Интерпретация\n\n${plan.interpretation || plan.centralThesis}\n\n## Риски и неизвестности\n\n${(research.unknowns.length ? research.unknowns : plan.unknowns).map(item => `- ${item}`).join('\n') || '- Не зафиксированы.'}\n\n## Следующий шаг\n\n${plan.nextStep}\n\n${pages}\n`;
}

async function renderResearchGeneration({ generationId, brief, research, data, signal, temperature = 0.7, style }) {
  const model = process.env.LLAMA_MODEL || appConfig.llm?.model || 'local';
  const quickRandom = brief.origin === 'random';
  const count = quickRandom ? 3 : sceneBudget(model);
  const evidenceCatalog = research.evidence.map(item => ({ id:item.id, claim:item.claim, confidence:item.confidence, kind:item.kind, sourceTitle:item.sourceTitle }));
  const modelPlan = await modelJson(
    quickRandom
      ? 'Ты Product Owner и редактор короткого доклада. Из локальных Evidence придумай неожиданный, но проверяемый ракурс на PO Agent Suite. Верни ТОЛЬКО компактный JSON: topic, centralThesis, motto и scenes — ровно 3 объекта {title,thesis,evidenceIds,speakerScript,visualType}. title до 6 слов, thesis до 14 слов, speakerScript ровно 2 очень коротких предложения. evidenceIds содержит только существующие ID. visualType: statement|comparison|table|flow|quote|roadmap. Не добавляй другие поля, markdown, вымышленные возможности или числа. Русский язык.'
      : `${PO_SYSTEM_PROMPT} Для каждой сцены обязательно верни evidenceIds — массив существующих ID из Evidence. Не превращай interpretation или unknown в факт. Добавь transition — естественный переход к следующей сцене. История должна отвечать именно на ResearchBrief, а не быть обзором приложения.`,
    quickRandom
      ? `Уникальный запуск: ${generationId}. Evidence: ${JSON.stringify(evidenceCatalog)}. Последние структуры, которые нельзя повторять: ${recentStories.slice(-8).join(' || ') || 'нет'}.`
      : `Сделай ${count}–${Math.min(15, count + 3)} сцен. ResearchBrief: ${JSON.stringify(brief)}\nEvidence: ${JSON.stringify(evidenceCatalog)}\nData: ${JSON.stringify(data)}\nНе повторяй эти прошлые структуры: ${recentStories.slice(-8).join(' || ')}`,
    { signal, temperature, maxTokens:quickRandom ? 850 : Math.max(1600, count * 320) }
  );
  if (quickRandom) Object.assign(modelPlan, {
    audience:brief.audience,
    situation:`Локальный индекс собрал ${research.evidence.length} проверяемых Evidence; ракурс этого запуска выбран моделью только из них.`,
    evidence:research.evidence.slice(0, 4).map(item => item.claim),
    unknowns:research.unknowns,
    nextStep:brief.expectedDecision
  });
  const plan = normalizePlan(modelPlan, count);
  if (!plan) throw new Error(`LLM returned fewer than ${count} valid scenes`);
  const byId = new Map(research.evidence.map(item => [item.id, item]));
  for (const scene of plan.scenes) {
    scene.evidenceIds = scene.evidenceIds.filter(id => byId.has(id)).slice(0, 3);
    if (!scene.evidenceIds.length) scene.evidenceIds = research.evidence.filter(item => item.kind === 'fact').slice(scene.index - 1, scene.index + 1).map(item => item.id);
    if (!scene.evidenceIds.length) throw new Error(`Scene ${scene.index} has no valid Evidence ID`);
    scene.evidence = scene.evidenceIds.map(id => byId.get(id).claim);
  }
  plan.evidence = research.evidence.filter(item => item.kind === 'fact').slice(0, 8).map(item => `${item.claim} [${item.id}]`);
  plan.unknowns = [...new Set([...(plan.unknowns || []), ...research.unknowns])];
  plan.motto = String(plan.motto || plan.centralThesis).trim();
  if (quickRandom) {
    brief.question = plan.topic; brief.goal = plan.centralThesis; brief.expectedDecision = plan.nextStep; data.title = plan.topic;
  }
  const temperatureValue = clamp(temperature, 0, 2);
  const styleId = style || (/код|codebase|репозитор|модул/i.test(brief.question) ? 'codebase-to-course' : selectStyle(temperatureValue, generationId));
  const meta = { generationId, mode:'llama.cpp', styleId, temperature:temperatureValue, generationVersion };
  const visualTheme = templateVisualTheme(styleId, generationId);
  const storyFingerprint = plan.scenes.map(scene => String(scene.title).trim().toLowerCase()).join('|');
  await persistVariationHistory(storyFingerprint, plan.motto);
  const result = {
    generationId, mode:'llama.cpp', styleId, visualTheme, temperature:temperatureValue, data,
    narrative:{ ...plan, generationId }, slides:{ ...plan, generationId }, research:{ evidenceCount:research.evidence.length, sourceStats:research.sourceStats },
    urls:{ data:`/api/artifact/${generationId}/data`, narrative:`/api/artifact/${generationId}/narrative`, slides:`/api/artifact/${generationId}/slides`, pptx:`/api/artifact/${generationId}/pptx`, research:`/api/artifact/${generationId}/research` }
  };
  return {
    result,
    narrativeMarkdown:narrativeMarkdown(plan, research, meta),
    slidesHtml:animateSlides(slidesHtml(plan, meta, data)),
    pptx:await legacyPptx(plan, meta, data),
    manifestMeta:{ mode:'llama.cpp', styleId, temperature:temperatureValue, generationVersion, brief, urls:result.urls, visualTheme }
  };
}

const artifactStore = createArtifactStore(exportDir);
await artifactStore.initialize();
const realRoot = await fs.realpath(root);
const configuredRoots = (await Promise.all((appConfig.research?.local?.allowed_paths || ['.']).map(async value => fs.realpath(path.resolve(root, value)).catch(() => null)))).filter(value => value && (value === realRoot || value.startsWith(`${realRoot}${path.sep}`)));
export const researchSources = [createLocalSource({ roots:configuredRoots, maxFiles:Number(appConfig.research?.local?.max_files || 200) })];
const webConfig=appConfig.research?.web || {};
const searxngEndpoint=process.env.PO_SEARXNG_URL || webConfig.endpoint;
if (process.env.PO_RESEARCH_WEB !== '0' && webConfig.enabled !== false) researchSources.push(
  (String(process.env.PO_SEARCH_PROVIDER || webConfig.provider || 'duckduckgo-html').toLowerCase() === 'searxng')
    ? createSearxngSource({ endpoint:searxngEndpoint, rateLimitMs:Number(webConfig.rate_limit_ms || 1000) })
    : createWebSource({ rateLimitMs:Number(webConfig.rate_limit_ms || 1000) })
);
const researchService = createResearchService({
  modelJson, sources:researchSources, render:renderResearchGeneration, store:artifactStore,
  limits:{ timeoutMs:Number(appConfig.research?.limits?.timeout_ms || 600000), maxSourceCalls:Number(appConfig.research?.limits?.max_source_calls || 24), maxIterationsPerDod:Number(appConfig.research?.limits?.max_iterations_per_dod || 4), stagnationLimit:Number(appConfig.research?.limits?.stagnation_limit || 2), maxWebPages:Number(appConfig.research?.web?.max_pages || 3) }
});

async function run(input = {}) {
  const started = researchService.start({ origin:'random', temperature:input.temperature, style:input.style });
  const finished = await researchService.wait(started.generationId);
  return finished.result;
}
async function body(req){let raw='';for await(const chunk of req)raw+=chunk;return raw?JSON.parse(raw):{}}
function sendJson(res,value,code=200){res.writeHead(code,{'content-type':'application/json; charset=utf-8'});res.end(JSON.stringify(value));}
async function handle(req,res){
  const url=new URL(req.url,'http://localhost');
  if(url.pathname==='/api/health')return sendJson(res,{ok:true,generationVersion,pid:process.pid,port:server.address()?.port || port,buildTimestamp,model:process.env.LLAMA_BASE_URL||appConfig.llm?.base_url||'http://127.0.0.1:8080/v1',sources:researchSources.map(source=>source.id)});
  if(url.pathname==='/api/brief/turn'&&req.method==='POST')return sendJson(res,{ok:true,...await researchService.briefTurn(await body(req))});
  if(url.pathname==='/api/generations'&&req.method==='POST')return sendJson(res,{ok:true,...researchService.start(await body(req))},202);
  const generation=url.pathname.match(/^\/api\/generations\/([^/]+)$/);
  if(generation&&req.method==='GET'){const job=researchService.get(generation[1]);return job?sendJson(res,{ok:true,...job}):sendJson(res,{error:'generation not found'},404)}
  if(generation&&req.method==='DELETE')return researchService.cancel(generation[1])?sendJson(res,{ok:true,state:'cancelling'},202):sendJson(res,{error:'active generation not found'},404);
  const events=url.pathname.match(/^\/api\/generations\/([^/]+)\/events$/);
  if(events&&req.method==='GET'){
    res.writeHead(200,{'content-type':'text/event-stream; charset=utf-8','cache-control':'no-cache','connection':'keep-alive'});
    const write=event=>{res.write(`event: progress\ndata: ${JSON.stringify(event)}\n\n`);if(['complete','failed','cancelled','needs-context'].includes(event.stage))res.end()};
    const unsubscribe=researchService.subscribe(events[1],write);
    if(!unsubscribe)return res.end(`event: error\ndata: ${JSON.stringify({error:'generation not found'})}\n\n`);
    const heartbeat=setInterval(()=>res.write(': heartbeat\n\n'),15000);
    req.on('close',()=>{clearInterval(heartbeat);unsubscribe()});
    return;
  }
  if(url.pathname==='/api/run'&&req.method==='POST')return sendJson(res,{ok:true,...await run(await body(req))});
  const artifact=url.pathname.match(/^\/api\/artifact\/([^/]+)\/(data|narrative|slides|pptx|research)$/);
  if(artifact){
    const item=artifactStore.artifact(artifact[1],artifact[2]);if(!item)return sendJson(res,{error:'generation not found'},404);
    const types={data:'application/json; charset=utf-8',narrative:'text/markdown; charset=utf-8',slides:'text/html; charset=utf-8',pptx:'application/vnd.openxmlformats-officedocument.presentationml.presentation',research:'application/json; charset=utf-8'};
    const headers={'content-type':types[artifact[2]],'cache-control':'no-store'};
    if(artifact[2]==='pptx')headers['content-disposition']=`attachment; filename="${artifact[1]}-legacy.pptx"`;
    res.writeHead(200,headers);return res.end(await fs.readFile(item.file));
  }
  const requested=url.pathname==='/'?'/index.html':url.pathname;const file=path.normalize(path.join(publicDir,requested));if(!file.startsWith(publicDir))return sendJson(res,{error:'forbidden'},403);try{const data=await fs.readFile(file);res.writeHead(200,{'content-type':'text/html; charset=utf-8'});res.end(data)}catch{sendJson(res,{error:'not found'},404)}
}
const server=http.createServer((req,res)=>handle(req,res).catch(e=>{console.error('[api error]',e);sendJson(res,{error:e.message},500)}));
if (process.env.PO_AGENT_NO_LISTEN !== '1') server.listen(port,()=>console.log(`PO Agent Suite ${generationVersion}: http://localhost:${server.address().port}`));
export { slidesHtml, designFamily, templateTheme, templateVisualTheme, metricRows, mottoSimilarity, modelJson, narrativeMarkdown, renderResearchGeneration, researchService, artifactStore, dataFromEvidence };
