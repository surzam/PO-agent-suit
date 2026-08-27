# PO Agent Suite

Локальный workstation harness для OpenCode и локальной модели через `llama.cpp server`. Главный взгляд агента — Product Owner: обобщить материалы, выделить главное и показать следующий шаг.

## Запуск

Требуется Node.js 18+.

```bash
npm run dev
```

Откройте http://localhost:3000. Если `llama.cpp server` доступен на `http://127.0.0.1:8080/v1`, запросы будут обработаны моделью и должны вернуть `StoryPlan` в JSON. Если модель недоступна, `demo-local` выбирает тематический fixture-сценарий и явно сообщает режим в UI.

Для другого порта используйте `PORT=3317 npm run dev`. Перед запуском проверьте, что старый экземпляр не занимает порт: `ss -ltnp 'sport = :3000'`. Health-проверка доступна на `/api/health` и показывает версию pipeline, PID, порт и время сборки.

## Desktop-приложение

Единственная команда для установки зависимостей и запуска изолированного Linux-приложения:

```bash
bash launch.sh
```

Первая генерация стартует автоматически. Для сборки AppImage и deb-пакета:

```bash
npm run package
```

## Workflow v1

- Интерфейс: chat-first, контекстные файлы и результат «Открыть презентацию» в новом окне.
- Источники v1: CSV, JSON, Markdown, DOCX, XLSX и Git как контекст; полноценный backlog indexing остаётся отдельному продукту Indexator.
- Слайды: HTML 16:9, который строится из сцен текущего `StoryPlan`; Data, Narrative и Slides доступны по URL с одним `generationId`.
- Экспорт выполняется только в выбранный локальный workspace.

PO skills находятся в `skills/`: `po-worldview.md`, `po-synthesis.md`, `po-communication.md`, `quality.md`.

## OpenCode

Передайте агенту OpenCode этот репозиторий и попросите использовать skills из `skills/`. Конфигурация модели и workspace находится в `po-agent.config.yaml`.
