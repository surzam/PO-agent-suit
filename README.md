# PO Agent Suite

PO Agent Suite — первая distribution AgentSuite: локального, модульного runtime для композиции ролевых AI-harness'ов. Сейчас в ней уже есть Product Owner workflow: чат формирует исследовательский заказ, локальный и интернет-поиск собирают Evidence, после чего один pipeline создаёт связанные **Data**, **Narrative**, **Slides** и legacy **PPTX**.

## AgentSuite runtime slice

Runtime не зависит от браузера и Electron. Минимальный headless-срез доступен через CLI:

```bash
node cli/suite.mjs run \
  --role product-owner \
  --workflow executive-review \
  "Почему команда не выполняет план?"
```

Он создаёт persistent `Run`, записывает фактические `Event` в `events.jsonl` и сохраняет `Brief` как `Artifact`:

```bash
node cli/suite.mjs inspect <run-id>
```

Это первый вертикальный срез новой модели `Run → Event → Harness → Artifact`. Research и Validation теперь проходят через общий Harness Registry и generic dispatch; `Indexator` остаётся отдельным продуктом.

Для исследовательского запуска:

```bash
node cli/suite.mjs run \
  --role product-owner \
  --workflow research-validated \
  "Почему команда не выполняет план?"
```

Для построения общего семантического плана после Research и Validation:

```bash
node cli/suite.mjs run \
  --role product-owner \
  --workflow research-synthesis \
  "Почему команда не выполняет план?"
```

Результат включает `Brief`, `EvidenceSet`, `ValidationReport` и `SynthesisPlan`. Последний содержит key claims, ссылки на Evidence ID, неизвестности и будущие requested outputs; Data/Narrative/Slides пока не запускаются.

Narrative consumer:

```bash
node cli/suite.mjs run \
  --role product-owner \
  --workflow research-narrative \
  "Почему команда не выполняет план?"
```

Этот workflow добавляет immutable `Narrative`, созданный существующей narrative implementation из `SynthesisPlan`. Новый synthesis для Narrative не выполняется.

Для первого semantic fan-out:

```bash
node cli/suite.mjs run \
  --role product-owner \
  --workflow research-analysis \
  "Почему команда не выполняет план?"
```

`Narrative` и `DataArtifact` создаются как независимые sibling outputs одного `SynthesisPlan`. Data сохраняет `rowProvenance` с Claim ID и Evidence ID; Data не извлекается из Narrative.

Для полного R9-пути с презентацией:

```bash
node cli/suite.mjs run \
  --role product-owner \
  --workflow research-presentation \
  "Почему команда не выполняет план?"
```

`Presentation` — sibling renderer от `SynthesisPlan` и `DataArtifact`: legacy `slidesHtml` переиспользуется через Slides Harness, а `Narrative` не объявляется ложной зависимостью. `suite inspect` показывает фактическую lineage через `sourceArtifactIds`.

Повторный downstream-запуск выполняется как новый Run с явным reuse:

```bash
suite rerun <run-id> --from slides
```

Он переиспользует необходимые `SynthesisPlan` и `DataArtifact` по исходным ID, создаёт новую `Presentation`, записывает `parentRunId` и `ArtifactReused`, а исходный Run не изменяет.

## Запуск — одна команда

Требуются Node.js 18+, npm и работающий OpenAI-compatible `llama.cpp server`.

```bash
cd /media/surzam/DATA/prez && ./launch.sh
```

Если зависимости ещё не установлены, launcher установит их сам. Он также останавливает только старый процесс этого проекта, регистрирует desktop-ярлык и открывает frameless Electron-окно.

Модель запускается в соседнем терминале, например:

```bash
/path/to/llama-server \
  -m /path/to/model.gguf \
  --host 127.0.0.1 --port 8080 \
  -c 8192
```

Для другого endpoint или имени модели:

```bash
LLAMA_BASE_URL=http://127.0.0.1:8080/v1 \
LLAMA_MODEL=имя-модели.gguf \
./launch.sh
```

Проверка:

```bash
curl http://127.0.0.1:8080/v1/models
curl http://localhost:3000/api/health
```

Production-fallback отсутствует: если модель недоступна или не возвращает валидный JSON, job честно завершается ошибкой.

## Как пользоваться

- `Случайно` — локальные Evidence подаются модели как материал для нового ракурса, девиза и трёх сцен; пользовательский вопрос не нужен.
- Введите собственный вопрос — агент сохранит исходный ракурс, при необходимости задаст не больше двух уточнений, затем кнопка станет `Исследовать`.
- Во время job одна кнопка становится `Остановить`, а интерфейс показывает стадии pipeline.
- Активный job автоматически переключает центр приложения в sci-fi Research Observation Console: последовательность стадий, live trace, Evidence/source telemetry и сигнал активности. Это собственный безопасный SSE-интерфейс, визуально вдохновлённый eDEX-UI; терминал, мониторинг процессов и код eDEX-UI не встраиваются.
- После завершения откройте Data, Narrative, Slides или скачайте legacy PPTX. HTML Slides сохраняют анимации и навигацию стрелками/пробелом.
- `Новое исследование` очищает текущий Brief, не удаляя уже сохранённые файлы.

Автоматической генерации при старте больше нет.

## Phase 1 research pipeline

```text
Chat / random order
        ↓
ResearchBrief
        ↓
Scout → Needs + Definition of Done
        ↓
Local files + DuckDuckGo HTTP research
        ↓
Evidence + conflicts + unknowns
        ↓
Data → StoryPlan → Narrative + Slides + PPTX
```

Исследование выполняется асинхронно. Ограничения по умолчанию: 10 минут, 24 обращения к источникам, до 4 итераций на критерий готовности, остановка после двух итераций без новых фактов и максимум три загруженные интернет-страницы. LLM-вызовы последовательны.

### Источники и безопасность

- Локальный поиск работает только в путях `research.local.allowed_paths` из `po-agent.config.yaml`; пути за пределами корня приложения отклоняются.
- Не индексируются `AGENTS.md`, `README.md`, `skills/`, `tests/`, `scripts/`, `public/`, `workspace/`, `graphify-out/`, `node_modules/`, `.git`, `.opencode`, секреты, бинарные файлы и изображения.
- Поддерживаются Markdown/text, JSON, CSV/TSV, YAML, распространённый исходный код, HTML/CSS и текстовый слой PDF. Лимиты: 200 файлов и 1 MB на файл.
- HTTP-путь использует DuckDuckGo HTML, `Readability`, timeout, лимит 2 MB, максимум три redirect и повторную DNS-проверку. Приватные, loopback и link-local адреса блокируются.
- MCP, Graphify и BrowserWindow fallback не входят в Phase 1; это следующий модульный этап.

## Сохранённые артефакты

Каждая генерация получает неизменяемую папку:

```text
workspace/exports/<generationId>/
├── data.json
├── data.csv
├── narrative.md
├── slides.html
├── legacy.pptx
├── research.json
└── manifest.json
```

Headless runtime runs хранятся отдельно в `workspace/runs/<run-id>/` и не смешиваются с legacy export-папками.

Запись атомарная. `workspace/exports/index.json` позволяет восстановить artifact routes после перезапуска. Старые плоские exports не удаляются и не перезаписываются.

## API

- `POST /api/brief/turn` — добавить сообщение и обновить Brief.
- `POST /api/generations` — запустить пользовательское или случайное исследование; ответ `202`.
- `GET /api/generations/:id/events` — SSE-прогресс.
- `GET /api/generations/:id` — состояние и результат.
- `DELETE /api/generations/:id` — отменить активный job.
- `GET /api/artifact/:id/:kind` — `data`, `narrative`, `slides`, `pptx` или `research`.
- `POST /api/run` — совместимый синхронный alias случайного исследования.
- `GET /api/health` — версия, PID, порт, модель и активные типы источников.

Состояния: `brief → scout → planning → researching → validating → synthesizing → rendering → complete | failed | cancelled`.

## Проверки и сборка

```bash
npm run check
npm run test:research
npm run test:slides
npm run test:api
npm run package      # AppImage
npm run package:deb  # Debian package, опционально
```

`test:research` работает на mock-модели и mock-источнике: production-код не содержит fixture-fallback. `test:slides` проверяет все 35 тем, 16:9, scene renderers и лимит графиков не чаще одного на пять слайдов.

Role fork использует тот же EvidenceSet и ValidationReport, но строит новый worldview-dependent SynthesisPlan:

```bash
suite rerun <run-id> --role cto --from synthesis
```

`product-owner` и `cto` зарегистрированы в `roles/registry.mjs`. Research и Validation повторно не запускаются; downstream artifacts создаются от нового SynthesisPlan.

`suite serve` предпочитает порт `8080`. Если его уже занимает локальный `llama-server`, сервис автоматически переходит на `8081` и печатает фактический URL.

Настройки находятся в `po-agent.config.yaml`. PO-инструкции — в `skills/po-worldview.md`, `skills/po-synthesis.md`, `skills/po-communication.md`; quality gate — в `skills/quality.md`. Backlog indexing остаётся отдельному продукту Indexator.
