import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pptxgen from 'pptxgenjs';

const root = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(root, 'public');
const exportDir = path.join(root, 'workspace', 'exports');
const templateDir = path.join(root, 'template-library');
const port = Number(process.env.PORT || 3000);
const generationVersion = '2.0.0-pipeline';
const buildTimestamp = new Date().toISOString();
await fs.mkdir(exportDir, { recursive: true });
const templateIndex = await fs.readFile(path.join(templateDir, 'index.json'), 'utf8').then(JSON.parse).catch(() => ({ templates: [] }));
const templates = templateIndex.templates || [];
const codeCourseTemplate = { slug: 'codebase-to-course', name: 'Codebase to Course', description: 'Кодовый ракурс: файл, действие, объяснение.' };
if (!templates.some(template => template.slug === codeCourseTemplate.slug)) templates.push(codeCourseTemplate);

const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
const clamp = (n, min, max) => Math.max(min, Math.min(max, Number(n)));
const idOf = () => `gen-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const productFixture = {
  title: 'PO Agent Suite · Workstation Computer', sourceKind: 'product-fixture', sources: ['fixture://po-agent-suite-product', 'fixture://po-agent-suite-product-lore'],
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
    ,['Workstation computer', 'Electron поднимает собственный сервер и открывает артефакты отдельно', 'Запускать Suite как отдельный рабочий инструмент'],
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
    ,'Workstation computer запускает Suite отдельно от браузерного проекта и держит свой generation context.'
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
  const insights=Array.from({length:8},(_,i)=>`${pick(generatedPools.proofs,i)} связывает ${pick(generatedPools.mechanisms,i+1)} и помогает ${pick(generatedPools.outcomes,i+3)}.`);
  insights.push(`Сгенерированный demo-срез использует ${metrics[0]} минут, ${metrics[1]} ручных шагов и вариант ${metrics[2]}; это пример для разговора, не измерение production.`);
  insights.push(`Человеческая сцена этого запуска: ${generatedPools.humanMoments[(Math.abs(seed)+3)%generatedPools.humanMoments.length]}. Она превращает технический сигнал в повод для решения.`);
  return { title:`PO Agent Suite · Workstation Computer · generated example ${Math.abs(seed)%1000000}`, rows, insights, sourceKind:'product-fixture', sources:[`fixture://po-agent-suite-product/example-${Math.abs(seed)}`], codeSignals:[`generated fixture seed: ${Math.abs(seed)}`,...productFixture.codeSignals] };
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
  return `${(clean || 'PO Agent Suite').slice(0, 78)} · Workstation Computer`;
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
  { key:'code', match:/код|codebase|course|файл|модул/i, thesis:'Код становится понятным, когда путь пользователя связывает файл, действие и наблюдаемый результат.', scenes:['Кнопка — начало маршрута','Запрос попадает в серверный вход','Context Analyzer выбирает разрешённый контекст','Data превращает файлы в проверяемые строки','StoryPlan объясняет порядок событий','Narrative переводит код на язык решения','Slides показывают связи между модулями','GenerationId удерживает маршрут целиком','Fallback сохраняет курс без модели','Workstation computer держит среду рядом','Квиз проверяет понимание действия','Следующий маршрут начинается с вопроса'] },
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

const PO_SYSTEM_PROMPT = `Ты старший Product Owner. Отделяй цель, факт, интерпретацию, ограничение и следующий шаг. Используй продуктовый лор и Data. Верни только компактный JSON StoryPlan: topic, audience, centralThesis, situation, evidence, unknowns, nextStep, scenes. Количество сцен задано в сообщении пользователя модели. Для каждой: index, title (до 8 слов), thesis (до 16 слов), evidence (один конкретный факт), speakerScript (ровно 2 коротких живых предложения), visualType. Каждый заголовок должен добавлять новую мысль и опираться на конкретную строку Data. Не пересказывай служебные инструкции, AGENTS.md или skills. Не выдумывай числа. visualType: statement|comparison|table|flow|quote|roadmap. Русский язык.`;
function sceneBudget(model) { const name=String(model||'').toLowerCase(); if (/1b|3b|tiny|small|mini/.test(name)) return 3; if (/7b|8b|phi|mistral/.test(name)) return 5; if (/13b|14b|medium/.test(name)) return 7; return 6; }
async function llama(input, data, temperature) {
  input = { ...input, prompt: input.prompt || selfPrompts[Date.now() % selfPrompts.length] };
  const base = process.env.LLAMA_BASE_URL || 'http://127.0.0.1:8080/v1'; const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 300000);
  const variation = selfAngles[Date.now() % selfAngles.length]; const model=process.env.LLAMA_MODEL || 'Qwen_Qwen3.6-35B-A3B-Q4_K_M.gguf'; const sceneCount=sceneBudget(model);
  const modelData = { title:data.title, columns:data.columns, rows:data.rows.slice(0,24), insights:data.insights.slice(0,14), sources:data.sources.slice(0,16), codeSignals:data.codeSignals };
  try { const response = await fetch(`${base}/chat/completions`, { method:'POST', signal:controller.signal, headers:{'content-type':'application/json'}, body:JSON.stringify({ model, temperature, max_tokens:Math.max(900,sceneCount*220), response_format:{type:'json_object'}, messages:[{role:'system',content:PO_SYSTEM_PROMPT},{role:'user',content:`Сделай ровно ${sceneCount} сцен. Ракурс этого запуска: ${variation[0]} — ${variation[1]}. Не повторяй прошлую драматургию. Уникальный generationId: ${input.generationId || 'new'}. Запрос: ${input.prompt || 'синтез продукта'}\nData: ${JSON.stringify(modelData)}`}] }) });
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
  return { ...plan, evidence:Array.isArray(plan.evidence) ? plan.evidence : [], unknowns:Array.isArray(plan.unknowns) ? plan.unknowns : [], scenes: plan.scenes.slice(0, 15).map((s, i) => ({ ...s, index:i + 1, title:String(s.title || `Сцена ${i + 1}`), thesis:String(s.thesis || ''), evidence:Array.isArray(s.evidence) ? s.evidence : [], speakerScript:String(s.speakerScript || ''), visualType:visualTypes.includes(s.visualType) ? s.visualType : 'statement' })) };
}
function selectStyle(temperature, generationId, requested) {
  const styles = templates.length ? templates.map(t => t.slug) : ['editorial','professional','kinetic','diagrammatic']; if (styles.includes(requested)) return requested;
  const seed = [...generationId].reduce((n,c) => n + c.charCodeAt(0), 0); return styles[(seed + Math.round(clamp(temperature,0,2) * 10)) % styles.length];
}
function templateTheme(slug) {
  if (slug === 'codebase-to-course') return '--bg:#241b16;--ink:#fff6e8;--accent:#ffb86b;--soft:#684936;--hot:#f06f52;font-family:ui-monospace,monospace';
  const light=/yellow|paper|editorial|monochrome|cobalt|coral|capsule|cartesian|daisy|sakura|stencil|playful|raw-grid|peoples|scatterbrain|block-frame|blue-professional/i.test(slug);
  const neon=/8-bit|retro|studio|signal|cobalt|neo-grid|creative|raw-grid/i.test(slug);
  const bg=light?'#f4efe4':'#101827', ink=light?'#18212b':'#f7fbff', accent=neon?'#f0dc4d':(light?'#1e65d6':'#8ff1df'), hot=light?'#d65f45':'#ff805d';
  const font=/editorial|vellum|monochrome|biennale|forest|emerald|soft-editorial|broadside/i.test(slug)?'Georgia,serif':/retro-windows|8-bit/i.test(slug)?'monospace':'system-ui,sans-serif';
  return `--bg:${bg};--ink:${ink};--accent:${accent};--soft:${light?'#d8e1d0':'#31506b'};--hot:${hot};font-family:${font}`;
}

function dataHtml(data, meta) { return `<!doctype html><meta charset="utf-8"><title>Data · ${esc(data.title)}</title><style>body{font:16px/1.5 system-ui;max-width:1100px;margin:40px auto;padding:0 24px;color:#172437}h1{font-size:40px}table{border-collapse:collapse;width:100%}th,td{text-align:left;padding:13px;border-bottom:1px solid #d5dee8}th{color:#315fd2}.meta{color:#637286;font:12px monospace}</style><h1>${esc(data.title)} · Data</h1><p class="meta">Generation ${esc(meta.generationId)} · ${esc(data.sourceKind)} · ${data.sources.length} source(s)</p><table><thead><tr>${data.columns.map(x=>`<th>${esc(x)}</th>`).join('')}</tr></thead><tbody>${data.rows.map(r=>`<tr>${r.map(x=>`<td>${esc(x)}</td>`).join('')}</tr>`).join('')}</tbody></table><h2>Insights</h2><ul>${data.insights.map(x=>`<li>${esc(x)}</li>`).join('')}</ul><h2>Sources</h2><ul>${data.sources.map(x=>`<li>${esc(x)}</li>`).join('')}</ul>`; }
function narrativeHtml(plan, meta) { return `<!doctype html><meta charset="utf-8"><title>Narrative · ${esc(plan.topic)}</title><style>body{font:18px/1.6 Georgia,serif;max-width:850px;margin:42px auto;padding:0 24px;color:#172437}h1,h2{font-family:system-ui;line-height:1.1}h1{font-size:46px}h2{margin-top:38px;color:#315fd2}.page{border-top:1px solid #bdc7d0;padding:24px 0}.script{background:#fffdf8;padding:18px 22px;box-shadow:0 8px 24px #344a6612}.meta{font:12px monospace;color:#315fd2}.chain{padding:15px;background:#eef3ff;font-family:system-ui}</style><p class="meta">NARRATIVE · ${esc(meta.generationId)} · ${esc(meta.mode)} · ${esc(meta.styleId)}</p><h1>${esc(plan.topic)}</h1><h2>Аудитория</h2><p>${esc(plan.audience)}</p><h2>Главный тезис</h2><p>${esc(plan.centralThesis)}</p><h2>Ситуация</h2><p>${esc(plan.situation)}</p><h2>Доказательства</h2><ul>${plan.evidence.map(x=>`<li>${esc(x)}</li>`).join('')}</ul><h2>Интерпретация</h2><p>${esc(plan.centralThesis)}</p><h2>Риски и неизвестности</h2><ul>${plan.unknowns.map(x=>`<li>${esc(x)}</li>`).join('')}</ul><h2>Следующий шаг</h2><p>${esc(plan.nextStep)}</p><div class="chain">Data → Narrative → Slides · один generationId</div>${plan.scenes.map(s=>`<section class="page"><div class="meta">SLIDE ${String(s.index).padStart(2,'0')} · ${esc(s.visualType)}</div><h2>${esc(s.title)}</h2><p><b>Тезис:</b> ${esc(s.thesis)}</p><p><b>Опора:</b> ${esc(s.evidence.join(' · '))}</p><div class="script"><b>Что сказать:</b><br>${esc(s.speakerScript)}</div></section>`).join('')}`; }

const styleCss = { editorial:'--bg:#f3eee4;--ink:#18212b;--accent:#1d5c45;--soft:#d9e7cf;--hot:#d77a5b;font-family:Georgia,serif', professional:'--bg:#071321;--ink:#f7fbff;--accent:#4f7cff;--soft:#b8f3e8;--hot:#ff805d;font-family:Inter,system-ui,sans-serif', kinetic:'--bg:#21133d;--ink:#fff9ef;--accent:#f0dc4d;--soft:#62e7d6;--hot:#ff6d8b;font-family:Impact,system-ui,sans-serif', diagrammatic:'--bg:#eef3f7;--ink:#14263a;--accent:#1e65d6;--soft:#b5cbe2;--hot:#f07b4f;font-family:ui-monospace,monospace' };
for (const template of templates) styleCss[template.slug] = templateTheme(template.slug);
function slidesHtml(plan, meta) { const style = styleCss[meta.styleId]; const scenes = plan.scenes.map((s,i)=>`<section class="slide ${i?'':'active'}"><div class="line"></div><div class="meta">${esc(s.visualType)} · ${String(s.index).padStart(2,'0')} / ${plan.scenes.length}</div><h1>${esc(s.title)}</h1><p class="thesis">${esc(s.thesis)}</p><div class="evidence">${s.evidence.map(x=>`<span>${esc(x)}</span>`).join('')}</div><div class="mark">${i===0?'THESIS':i===plan.scenes.length-1?'NEXT':String(i).padStart(2,'0')}</div></section>`).join(''); return `<!doctype html><html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${esc(plan.topic)}</title><style>:root{${style}}*{box-sizing:border-box}html,body{margin:0;background:#000;overflow:hidden}.deck{position:fixed;inset:0;display:grid;place-items:center}.slide{display:none;width:min(100vw,177.78vh);height:min(56.25vw,100vh);padding:7%;background:var(--bg);color:var(--ink);position:relative;overflow:hidden}.slide.active{display:block}.meta{font:12px monospace;letter-spacing:.13em;color:var(--accent);text-transform:uppercase}.line{position:absolute;left:7%;right:7%;top:16%;border-top:2px solid var(--soft)}h1{font-size:clamp(38px,6.4vw,110px);line-height:.94;letter-spacing:-.055em;max-width:1150px;margin:18vh 0 3vh}.thesis{font:clamp(19px,2.2vw,32px)/1.25 system-ui;max-width:850px}.evidence{position:absolute;bottom:11%;left:7%;display:flex;flex-direction:column;gap:8px;max-width:65%;font:700 clamp(15px,1.4vw,23px)/1.25 system-ui;color:var(--accent)}.evidence span:before{content:'→ ';color:var(--hot)}.mark{position:absolute;right:7%;bottom:10%;font:700 clamp(32px,5vw,82px)/.85 monospace;color:var(--hot)}.slide:nth-child(3n){background:linear-gradient(135deg,var(--bg) 0 72%,var(--soft) 72%)}body.diagrammatic .slide{border:18px solid var(--soft)}body.editorial .slide{box-shadow:inset 0 0 0 3px var(--soft)}body.kinetic h1{text-transform:uppercase}body.kinetic .mark{transform:rotate(-8deg)}.controls{position:fixed;bottom:16px;left:50%;transform:translateX(-50%);z-index:3;color:var(--soft);font:12px monospace}@media(prefers-reduced-motion:reduce){*{transition:none!important}}</style><body class="${esc(meta.styleId)}"><div class="deck">${scenes}</div><div class="controls">← → · пробел · ${esc(meta.styleId)} · ${esc(meta.generationId)}</div><script>const s=[...document.querySelectorAll('.slide')];let i=0;function go(n){i=Math.max(0,Math.min(n,s.length-1));s.forEach((x,j)=>x.classList.toggle('active',i===j))}addEventListener('keydown',e=>{if(['ArrowRight','ArrowDown','PageDown',' '].includes(e.key))go(i+1);if(['ArrowLeft','ArrowUp','PageUp'].includes(e.key))go(i-1)})</script></body></html>`; }
async function legacyPptx(plan, meta) {
  const pptx = new pptxgen(); pptx.layout = 'LAYOUT_WIDE'; pptx.author = 'PO Agent Suite · Workstation Computer'; pptx.subject = 'Legacy static export'; pptx.title = plan.topic;
  const themes = { editorial:{bg:'F3EEE4',ink:'18212B',accent:'1D5C45',hot:'D77A5B'}, professional:{bg:'071321',ink:'F7FBFF',accent:'4F7CFF',hot:'FF805D'}, kinetic:{bg:'21133D',ink:'FFF9EF',accent:'F0DC4D',hot:'FF6D8B'}, diagrammatic:{bg:'EEF3F7',ink:'14263A',accent:'1E65D6',hot:'F07B4F'}, 'codebase-to-course':{bg:'241B16',ink:'FFF6E8',accent:'FFB86B',hot:'F06F52'} };
  const t = themes[meta.styleId] || themes.professional;
  for (const [i, scene] of plan.scenes.entries()) { const slide=pptx.addSlide(); slide.background={color:t.bg}; slide.addText(`${String(scene.index).padStart(2,'0')} / ${plan.scenes.length} · ${scene.visualType}`,{x:.7,y:.45,w:11.4,h:.25,fontFace:'Aptos Mono',fontSize:9,color:t.accent,charSpacing:1}); slide.addText(scene.title,{x:.7,y:1.35,w:11.3,h:1.2,fontFace:'Aptos Display',fontSize:30,bold:true,color:t.ink,margin:0,breakLine:false,fit:'shrink'}); slide.addText(scene.thesis,{x:.7,y:2.85,w:9.6,h:1.0,fontFace:'Aptos',fontSize:18,color:t.ink,margin:0,fit:'shrink'}); slide.addText(scene.evidence.map(value=>`→ ${value}`).join('\n'),{x:.7,y:4.55,w:9.7,h:1.45,fontFace:'Aptos',fontSize:13,bold:true,color:t.accent,breakLine:false,fit:'shrink',bullet:{type:'ul'}}); slide.addText(i===0?'THESIS':i===plan.scenes.length-1?'NEXT':String(i).padStart(2,'0'),{x:10.1,y:5.65,w:2.0,h:.6,fontFace:'Aptos Mono',fontSize:22,bold:true,color:t.hot,align:'right'}); slide.addNotes(`Legacy static export of ${meta.generationId}. For animated transitions open the HTML Slides artifact.`); }
  return pptx.write({ outputType:'nodebuffer' });
}

function animateSlides(html) {
  return html
    .replace('.slide{display:none;', '.slide{display:block;position:absolute!important;inset:0!important;opacity:0;visibility:hidden;transform:translateY(24px) scale(.985);transition:opacity .7s ease,transform .7s cubic-bezier(.2,.8,.2,1),visibility .7s;')
    .replace('.slide{display:block;position:absolute!important;inset:0!important;opacity:0;visibility:hidden;', '.deck{position:fixed;inset:0;display:grid;place-items:center}.slide{display:block!important;position:absolute!important;inset:0!important;opacity:0;visibility:hidden;')
    .replace('.slide.active{display:block}', '.slide.active{opacity:1;visibility:visible;transform:translateY(0) scale(1)}')
    .replace("const s=[...document.querySelectorAll('.slide')];let i=0;function go(n){i=Math.max(0,Math.min(n,s.length-1));s.forEach((x,j)=>x.classList.toggle('active',i===j))}", "const s=[...document.querySelectorAll('.slide')];let i=0;function go(n){const next=Math.max(0,Math.min(n,s.length-1));if(next===i)return;s[i]?.classList.remove('active');s[next]?.classList.add('active');i=next}")
    .replace('</style><body', '.slide.active h1{animation:rise .8s both}.slide.active .thesis{animation:rise .8s .12s both}.slide.active .evidence{animation:rise .8s .22s both}@keyframes rise{from{opacity:0;transform:translateY(18px)}to{opacity:1;transform:none}}</style><body');
}

const generations = new Map();
async function run(input) { const generationId=idOf(), temperature=clamp(input.temperature ?? .7,0,2), request={...input,generationId}, data=await buildData(request), modelPlan=await llama(request,data,temperature), model=process.env.LLAMA_MODEL || 'Qwen_Qwen3.6-35B-A3B-Q4_K_M.gguf', plan=normalizePlan(modelPlan,sceneBudget(model)); if(!plan) throw new Error(`LLM generation unavailable or returned fewer than ${sceneBudget(model)} scenes; demo fallback is disabled.`); const motto=plan.motto || `${plan.centralThesis} Опора доклада — ${data.insights[0] || 'проверяемый сигнал из Data'}.`, styleId=input.style || (/код|codebase|course/i.test(input.prompt || '') ? 'codebase-to-course' : selectStyle(temperature,generationId,input.style)); const mode='llama.cpp'; const meta={generationId,mode,styleId,temperature,generationVersion}; plan.motto=motto; const files={data:dataHtml(data,meta),narrative:narrativeHtml(plan,meta),slides:animateSlides(slidesHtml(plan,meta)),pptx:await legacyPptx(plan,meta)}; for(const [kind,html] of Object.entries(files)) await fs.writeFile(path.join(exportDir,`${generationId}-${kind}.${kind==='pptx'?'pptx':'html'}`),html); const result={generationId,mode,styleId,temperature,data,narrative:{...plan,generationId},slides:{...plan,generationId},urls:{data:`/api/artifact/${generationId}/data`,narrative:`/api/artifact/${generationId}/narrative`,slides:`/api/artifact/${generationId}/slides`,pptx:`/api/artifact/${generationId}/pptx`}}; generations.set(generationId,{...result,files}); return result; }
async function body(req){let raw='';for await(const chunk of req)raw+=chunk;return raw?JSON.parse(raw):{}}
function sendJson(res,value,code=200){res.writeHead(code,{'content-type':'application/json; charset=utf-8'});res.end(JSON.stringify(value));}
async function handle(req,res){const url=new URL(req.url,'http://localhost'); if(url.pathname==='/api/health')return sendJson(res,{ok:true,generationVersion,pid:process.pid,port:server.address()?.port || port,buildTimestamp,model:process.env.LLAMA_BASE_URL||'http://127.0.0.1:8080/v1'}); if(url.pathname==='/api/run'&&req.method==='POST')return sendJson(res,{ok:true,...await run(await body(req))}); const artifact=url.pathname.match(/^\/api\/artifact\/([^/]+)\/(data|narrative|slides|pptx)$/); if(artifact){const item=generations.get(artifact[1]);if(!item)return sendJson(res,{error:'generation not found'},404);if(artifact[2]==='pptx'){res.writeHead(200,{'content-type':'application/vnd.openxmlformats-officedocument.presentationml.presentation','content-disposition':`attachment; filename="${artifact[1]}-legacy.pptx"`,'cache-control':'no-store'});return res.end(item.files.pptx)}res.writeHead(200,{'content-type':'text/html; charset=utf-8','cache-control':'no-store'});return res.end(item.files[artifact[2]])} const requested=url.pathname==='/'?'/index.html':url.pathname;const file=path.normalize(path.join(publicDir,requested));if(!file.startsWith(publicDir))return sendJson(res,{error:'forbidden'},403);try{const data=await fs.readFile(file);res.writeHead(200,{'content-type':'text/html; charset=utf-8'});res.end(data)}catch{sendJson(res,{error:'not found'},404)}}
const server=http.createServer((req,res)=>handle(req,res).catch(e=>sendJson(res,{error:e.message},500)));
server.listen(port,()=>console.log(`PO Agent Suite ${generationVersion}: http://localhost:${server.address().port}`));
