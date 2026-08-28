# PO Agent Suite · Workstation Computer

Открытое Electron-приложение для Product Owner: чат формирует исследовательский заказ, локальный и интернет-поиск собирают Evidence, после чего один pipeline создаёт связанные **Data**, **Narrative**, **Slides** и legacy **PPTX**.

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

Настройки находятся в `po-agent.config.yaml`. PO-инструкции — в `skills/po-worldview.md`, `skills/po-synthesis.md`, `skills/po-communication.md`; quality gate — в `skills/quality.md`. Backlog indexing остаётся отдельному продукту Indexator.
