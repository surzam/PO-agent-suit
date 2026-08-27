# PO Agent Suite

Локальный workstation harness для OpenCode и локальной модели через `llama.cpp server`. Главный взгляд агента — Product Owner: обобщить материалы, выделить главное и показать следующий шаг.

## Запуск — одна команда

Требуется Node.js 18+. Для desktop-приложения:

```bash
cd /media/surzam/DATA/prez
./launch.sh
```

`launch.sh` сам установит npm-зависимости, остановит старый процесс этого проекта, зарегистрирует ярлык и запустит frameless Electron-окно. Первая генерация запускается кнопкой `Генерировать`. Для остановки закройте окно крестиком.

## Обязательное подключение llama.cpp

Приложение работает только с настоящей моделью через OpenAI-compatible endpoint `http://127.0.0.1:8080/v1`; fallback-сценария для генерации нет. Во втором терминале запустите сервер модели (путь к бинарнику и GGUF замените на свои):

```bash
/path/to/llama-server \
  -m /path/to/model.gguf \
  --host 127.0.0.1 --port 8080 \
  -c 8192
```

Затем в первом терминале:

```bash
cd /media/surzam/DATA/prez && ./launch.sh
```

Если endpoint или модель находятся в другом месте, задайте переменные перед запуском:

```bash
LLAMA_BASE_URL=http://127.0.0.1:8080/v1 \
LLAMA_MODEL=имя-модели.gguf \
./launch.sh
```

Проверка подключения:

```bash
curl http://127.0.0.1:8080/v1/models
curl http://localhost:3000/api/health
```

В `/api/health` должны быть текущие `generationVersion`, `pid`, `port` и адрес модели. Если генерация не стартует, сначала убедитесь, что `curl http://127.0.0.1:8080/v1/models` отвечает, затем перезапустите `./launch.sh`.

## Desktop-приложение

Единственная команда для установки зависимостей и запуска изолированного Linux-приложения:

```bash
./launch.sh
```

Первая генерация стартует автоматически. Для сборки AppImage и deb-пакета:

```bash
npm run package
```

## Workflow v1

- Интерфейс: chat-first, контекстные файлы и результат «Открыть презентацию» в новом окне.
- Источники v1: CSV, JSON, Markdown, DOCX, XLSX и Git как контекст; полноценный backlog indexing остаётся отдельному продукту Indexator.
- Слайды: HTML 16:9, который строится из сцен текущего `StoryPlan`; Data, Narrative, HTML Slides и legacy PPTX доступны по URL с одним `generationId`.
- Визуальный пул: 35 шаблонов, 45 композиций и устойчивый журнал стилей/ракурсов в `workspace/variation-history.json`; график появляется не чаще одного раза на пять слайдов.
- Числовые сигналы из Data используются в карточках Data, HTML-графиках и PPTX-графиках.
- Экспорт выполняется только в выбранный локальный workspace.

PO skills находятся в `skills/`: `po-worldview.md`, `po-synthesis.md`, `po-communication.md`, `quality.md`.

## OpenCode

Передайте агенту OpenCode этот репозиторий и попросите использовать skills из `skills/`. Конфигурация модели и workspace находится в `po-agent.config.yaml`.
