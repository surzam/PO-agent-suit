# AgentSuite — Observation UX Grammar

**Status:** Product UX Grammar
**Scope:** Observation Mode
**Companion to:** R13.3 — eDEX-inspired Observation Mode

---

# 1. Purpose

Observation Mode — это не developer console и не sci-fi skin.

Это **саморепрезентация работающего AgentSuite**.

Пользователь должен иметь возможность посмотреть на систему во время генерации и понять:

```text
Что сейчас происходит?

На какую часть мира смотрит AgentSuite?

Какая способность сейчас работает?

Что было обнаружено?

Что стало Evidence?

Что переиспользовано?

Что создаётся новым?

Где выполняется работа?

Как всё это приводит к результату?
```

Observation Mode существует для того, чтобы сделать работу ансамбля наблюдаемой, не раскрывая скрытый reasoning модели и не симулируя действия, которых Runtime не выполнял.

Главная формула:

```text
Runtime fact
      ↓
Observation Projection
      ↓
Visual / spatial / sonic representation
```

Если факта нет — представления тоже быть не должно.

---

# 2. Fundamental Principle

## NO EVENT → NO MOVEMENT

Это главный закон Observation UX.

Никакая существенная анимация не должна существовать только потому, что интерфейсу «нужно выглядеть живым».

Запрещено:

```text
fake progress
fake terminal messages
fake typing
fake source traversal
fake model activity
fake parallelism
fake Evidence
fake capability usage
```

Разрешено:

```text
Runtime Event
→ projection state change
→ visual response
```

Например:

```text
SourceOpened
      ↓
FILES becomes active
      ↓
Context Explorer focuses source
      ↓
Console records source opening
      ↓
optional short sound
```

Один факт может иметь несколько представлений.

Но все они происходят из одного события.

---

# 3. Observation is not execution

UI никогда не является частью execution authority.

Правильная зависимость:

```text
Runtime
   ↓
immutable Event Journal
   ↓
Observation Projection
   ↓
UI
```

Неправильная:

```text
UI progress state
   ↓
Runtime behavior
```

Закрытие Electron, refresh renderer или переключение `Observation → Result` не должно влиять на выполнение Run.

Observation можно полностью восстановить из persisted journal.

---

# 4. Three product states

В пользовательском опыте AgentSuite имеет три принципиально разных состояния.

## EMPTY

```text
БЕСКОНЕЧНЫЙ РАКУРС

Следующая история ещё не существует
```

Почти ничего нет.

Observation Surface ещё не нужна.

---

## BECOMING

После:

```text
ГЕНЕРИРОВАТЬ
```

система оживает.

Появляются:

```text
Intent Discovery
Flow
Console
Capabilities
Context
Evidence
```

Это состояние рождения истории.

---

## STORY

После завершения:

```text
Рассказ
Таблица
Презентация
```

становятся основным пользовательским результатом.

Observation остаётся доступным как способ увидеть:

> Как эта история появилась?

Таким образом:

```text
EMPTY
  ↓
BECOMING
  ↓
STORY
```

---

# 5. Observation answers questions, not displays widgets

Каждый визуальный модуль должен отвечать ровно на один понятный вопрос.

Если модуль не способен сформулировать свой вопрос — его не следует добавлять.

Базовая грамматика:

```text
FLOW
→ Где мы сейчас?

CONSOLE
→ Что реально происходит?

CONTEXT
→ На что сейчас смотрит AgentSuite?

EVIDENCE
→ Что система установила?

ENSEMBLE
→ Какая способность сейчас работает?

CAPABILITIES
→ Каким способом система может взаимодействовать с миром?

VIEW
→ Через какую профессиональную оптику рассматривается мир?

EXECUTION
→ Где и чем физически выполняется работа?

OUTPUTS
→ Что уже появилось?

INSPECTOR
→ Что это за конкретный объект и откуда он взялся?
```

Не обязательно показывать все эти поверхности одновременно.

---

# 6. Spatial hierarchy

Observation не должен выглядеть как dashboard из независимых карточек.

Это единая вычислительная поверхность.

Предпочтительная иерархия:

```text
┌──────────────────────────────────────────────────────────────┐
│ VIEW / STORY                                                 │
├──────────────────────────────────────────────────────────────┤
│ FLOW                                                         │
├──────────────────────────────────┬───────────────────────────┤
│                                  │                           │
│          AGENT CONSOLE           │      CONTEXT WORLD        │
│                                  │                           │
│                                  │                           │
├──────────────────────────────────┼───────────────────────────┤
│ EVIDENCE / OUTPUT                │ ENSEMBLE / EXECUTION      │
├──────────────────────────────────┴───────────────────────────┤
│ CAPABILITY SURFACE                                           │
├──────────────────────────────────────────────────────────────┤
│ optional EVENT KEYBOARD                                      │
└──────────────────────────────────────────────────────────────┘
```

Это направление композиции, не pixel specification.

Приоритет пространства:

```text
1. Current work
2. Current context
3. Current flow
4. Evidence/result
5. Peripheral state
```

---

# 7. FLOW grammar

FLOW представляет семантическую последовательность истории.

Базовая форма:

```text
DISCOVERY
   ↓
INTENT
   ↓
BRIEF
   ↓
RESEARCH
   ↓
VALIDATION
   ↓
SYNTHESIS
   ↓
 ┌───────────┬────────┐
 ↓           ↓        ↓
NARRATIVE   DATA   PRESENTATION
```

Допустимые состояния stage:

```text
future
active
completed
failed
needs-context
reused
skipped
```

Состояние не определяется frontend timer.

Оно определяется событиями.

Например:

```text
HarnessStarted
→ active

HarnessCompleted
→ completed

HarnessFailed
→ failed

ArtifactReused
→ reused
```

---

# 8. Do not fake concurrency

Если Narrative, Data и Presentation выполняются последовательно, UI не должен показывать одновременную работу.

Fan-out означает:

```text
один semantic parent
→ несколько downstream outputs
```

а не обязательно:

```text
три параллельных процесса
```

FLOW отражает Runtime reality.

---

# 9. Agent Console grammar

Console — центральная текстовая поверхность Observation.

Но это **не shell** и не chain-of-thought viewer.

Она показывает observable facts.

Хорошо:

```text
00:14:02  Intent Discovery started
00:14:05  New perspective discovered
00:14:06  Research started
00:14:07  Source opened · agentsuite-model.md
00:14:09  Evidence E004 collected
00:14:14  Validation completed
00:14:17  Synthesis started
00:14:22  Presentation created
```

Плохо:

```text
Я думаю...
Вероятно...
Сейчас попробую рассуждать...
Мне кажется...
```

Console отображает:

```text
events
capability calls
source accesses
artifacts
evidence
reuse
errors
state transitions
```

Не reasoning tokens.

---

# 10. Console language

Console может быть технически точнее остального интерфейса, но не должна превращаться в JSON dump.

Пользовательский слой:

```text
Источник открыт
Evidence создан
Validation завершена
```

Inspector/Details может показать:

```text
SourceOpened
artifactId
eventId
harnessId
timestamp
```

Два уровня должны быть разделены.

---

# 11. Context World

Context World отвечает на вопрос:

> На какую часть доступного мира сейчас смотрит AgentSuite?

Это более широкое понятие, чем filesystem.

Будущая модель:

```text
WORLD

PROJECT
FILES
USER ADDED
MCP
WEB
MEMORY
GENERATED
```

Но показываются только реально существующие capabilities.

Нельзя показывать:

```text
MCP
WEB
MEMORY
```

просто потому, что они красиво выглядят.

---

# 12. Filesystem grammar

eDEX связывает filesystem display с текущим рабочим контекстом терминала; AgentSuite переносит этот принцип с `cwd` на `active Harness source context`.

AgentSuite:

```text
Harness
   ↓
Capability
   ↓
Context Root
   ↓
Folder
   ↓
Source
```

Пример:

```text
PROJECT

docs/
  architecture/
    agentsuite-model.md      ◉

USER ADDED

interviews/
  customer-01.md             ● E4
  customer-02.md
```

---

# 13. File states

Допустимые состояния source:

```text
available
opened
active/read
used-as-context
used-as-evidence
unavailable
failed
```

Они должны иметь Runtime/provenance evidence.

Например:

```text
SourceOpened
→ opened

SourceRead
→ active/read

EvidenceCollected(source)
→ used-as-evidence
```

Не придумывать semantic status на основе времени нахождения элемента на экране.

---

# 14. Context following

Context Explorer может автоматически следовать за вниманием Harness.

Например:

```text
Research reads docs/
→ PROJECT/docs focused

Research opens interviews/
→ USER ADDED/interviews focused

Research switches to MCP
→ MCP context becomes primary
```

Это аналог идеи eDEX:

```text
terminal cwd
→ filesystem follows
```

только в AgentSuite:

```text
active source context
→ Context Explorer follows
```

---

# 15. Context tracking modes

Необходимо различать достоверность наблюдения.

Допустимо:

```text
LIVE
SNAPSHOT
UNTRACKED
```

### LIVE

Runtime сообщает текущий source operation.

### SNAPSHOT

Точное active действие неизвестно, но provenance восстановлена после выполнения.

### UNTRACKED

Нет достаточных данных для корректного представления.

При `UNTRACKED` нельзя изображать fake traversal.

---

# 16. Source Preview

Пользователь должен иметь возможность рассмотреть source, не покидая AgentSuite.

Минимально:

```text
text / markdown
PDF
image
structured JSON
```

если соответствующий безопасный preview уже доступен.

Source Preview является read-only.

Не добавлять в Observation:

```text
rename
delete
move
save
edit
shell operation
```

пока продукт отдельно не получил authority изменять этот world.

---

# 17. Provenance is spatial

Главное отличие AgentSuite Context Explorer от file manager:

файл связан с тем, что из него появилось.

Пользователь должен иметь возможность пройти:

```text
Source
  ↓
Evidence
  ↓
Claim
  ↓
Synthesis
  ↓
Output
```

Например:

```text
customer-07.md

Produced:
E4
E11

Used by:
Claim C3

Appears in:
Narrative
Slide 4
```

Observation таким образом показывает не дерево диска, а **причинную географию истории**.

---

# 18. Capability Surface

Capability Surface отвечает:

> Какие органы взаимодействия с миром доступны системе и какой из них сейчас используется?

Например:

```text
FILES     MODEL     MCP     WEB     MEMORY
 ●         ◉         ○       —        —
```

Обозначения:

```text
available
active
failed
disabled
not configured
```

Не показывать capability, которой в configuration нет.

---

# 19. Capability animation

Когда происходит реальный вызов:

```text
CapabilityStarted(filesystem)
```

допустимо:

```text
FILES pulse
```

Когда:

```text
CapabilityCompleted
```

активное состояние завершается.

Если capability call длится долго, active state может сохраняться.

Animation означает:

> способность реально используется.

---

# 20. Ensemble

Ensemble отвечает:

> Какая профессиональная способность сейчас выполняет работу?

Не CPU%.

Не fictitious agent utilization.

Например:

```text
ENSEMBLE

Intent Discovery     completed
Research             active
Validation           waiting
Synthesis            waiting
Narrative            waiting
Data                 waiting
Slides               waiting
```

Состояния должны происходить из Harness lifecycle.

---

# 21. View / Worldview

Role — это профессиональная оптика.

Observation должен отображать её спокойно.

Например:

```text
PRODUCT OWNER
```

или:

```text
VIEW
Product Owner
```

Не нужно постоянно объяснять worldview целиком.

По клику Inspector может показать:

```text
priorities
questions
decision criteria
```

Role не должен захватывать стартовую заставку.

Он становится особенно важен при fork.

---

# 22. Role fork grammar

PO → CTO должен визуально объяснять фундаментальную механику AgentSuite.

Не:

```text
New Run
parentRunId = ...
```

А:

```text
SHARED WORLD

Evidence
Validation

        ↓

NEW VIEW

CTO

        ↓

NEW INTERPRETATION

Synthesis
Narrative
Data
Presentation
```

Observation должен визуально отличать:

```text
REUSED
```

от:

```text
EXECUTED
```

Research не должен «проигрываться» повторно, если он не выполнялся.

---

# 23. Evidence grammar

Evidence Surface отвечает:

> Что система установила как фактическое основание текущей истории?

Минимально:

```text
Evidence        7
Validated       6
Unknown         1
Conflict        0
```

Но числовые показатели должны приходить из реального Artifact/Event state.

При выборе Evidence открывается Inspector:

```text
E004

Claim
Source
Confidence
Kind
Validation
Used by
```

---

# 24. Evidence is not conclusion

Observation должен визуально сохранять разделение:

```text
SOURCE
→ EVIDENCE
→ SYNTHESIS
```

Нельзя визуально смешивать:

```text
что установлено
```

и:

```text
что считает Product Owner
```

Это один из главных продуктовых принципов AgentSuite.

---

# 25. Execution Identity

Execution Identity отвечает:

> Где и чем физически выполняется текущая работа?

Минимальное collapsed representation:

```text
LOCAL
Qwen · CUDA
```

Expanded:

```text
Mode          Local
Provider      ...
Model         ...
Acceleration  CUDA
Device        ...
```

Если inference remote:

```text
REMOTE
Provider ...
Model ...
```

Не превращать это в hardware benchmark.

---

# 26. Model ≠ Agent

UI не должен создавать впечатление:

```text
Model = AgentSuite
```

Model является capability.

AgentSuite состоит из:

```text
Runtime
Harnesses
Worldview
Sources
Evidence
Artifacts
Model/provider
```

Поэтому MODEL живёт рядом с FILES/MCP, а не занимает всю identity продукта.

---

# 27. Event Keyboard

Event Keyboard — необязательная визуальная поверхность self-representation.

Она отвечает:

> Какое observable действие система сейчас совершила?

Она НЕ является:

```text
shell keyboard
touch keyboard
input mechanism Runtime
```

Она read-only.

Например:

```text
files.read("architecture.md")
```

или:

```text
model.infer("intent-discovery")
```

может визуально проигрываться как deterministic representation события.

---

# 28. Event Keyboard safety

Event Keyboard никогда не показывает:

```text
prompt
model response
chain-of-thought
secret
token
raw user credential
source contents
```

Только sanitized observable descriptor.

Если безопасного descriptor нет:

```text
no animation
```

Это лучше, чем fake representation.

---

# 29. Keyboard is subordinate

Порядок важности:

```text
FLOW
CONSOLE
CONTEXT
EVIDENCE
CAPABILITIES
EVENT KEYBOARD
```

Если Event Keyboard визуально мешает первым пяти — уменьшить или убрать.

Observation не обязан выглядеть как eDEX.

---

# 30. Inspector Surface

Вместо десятков отдельных страниц используется единый interaction pattern:

```text
select object
     ↓
Inspector
```

Inspector может открывать:

```text
Source
Evidence
Claim
Harness
Capability
Artifact
Role
Event
Folder
Execution environment
```

Пользователь остаётся внутри текущего spatial context.

---

# 31. Inspector depth

Первый уровень — человеческий.

Например:

```text
Evidence E4

Что установлено
Почему доверяем
Источник
Где использовано
```

Технический уровень:

```text
Details ▸

eventId
artifactId
sourceArtifactIds
runId
timestamp
```

Не наоборот.

---

# 32. Search grammar

Будущий `Ctrl/Cmd+Shift+F` — не просто поиск файлов.

Это поиск по текущему доступному миру:

```text
files
folders
Evidence
claims
artifacts
stories
capabilities
events
```

Но пока не нужно строить большой search index.

Архитектура shortcuts не должна мешать появлению такого поиска позже.

---

# 33. Interaction commands

Keyboard shortcuts должны вызывать semantic UI commands.

Например:

```text
show-result
show-observation
toggle-observation
open-search
open-shortcuts
close-inspector
```

Не:

```text
document.querySelector(...).click()
```

Это позволит менять layout без переписывания keyboard model.

---

# 34. Theme grammar

Visual identity состоит из трёх уровней:

```text
PRODUCT THEME
      ↓
ROLE ACCENT
      ↓
STORY THEME
```

---

# 35. Product Theme

Стабильная identity AgentSuite:

```text
geometry
spacing
typography
background logic
motion character
```

Она доминирует всегда.

---

# 36. Role Accent

Role может немного влиять на accent.

Но Role не превращает приложение в другой skin.

Не делать жёсткую систему:

```text
PO = orange
CTO = blue
Analyst = green
```

если этого не требует дизайн.

---

# 37. Story Theme

Когда у истории появляется Presentation visual language, его validated tokens могут слегка влиять на Observation.

Например:

```text
accent
active trace
selected state
grid tint
transition
```

Не переносить arbitrary CSS из Presentation.

Только structured theme tokens.

Правило:

```text
AgentSuite identity dominates.
Story identity accents.
```

---

# 38. Theme emerges with the story

До Synthesis:

```text
neutral AgentSuite
```

После появления story visual identity:

```text
subtle story accent
```

После перехода в Presentation:

```text
full story visual language
```

Это позволяет визуально прожить:

```text
ничего
↓
поиск
↓
смысл
↓
характер
↓
история
```

---

# 39. Motion grammar

Animation должна отвечать одному из четырёх смыслов:

```text
APPEAR
объект появился

FOCUS
внимание системы переместилось

ACTIVATE
способность начала работать

TRANSFORM
состояние изменилось
```

Если animation не имеет одного из этих смыслов — скорее всего она декоративна.

---

# 40. Motion restraint

Предпочтительно:

```text
opacity
transform
line growth
small pulse
focus transition
```

Избегать без необходимости:

```text
constant blinking
large spinning loaders
moving noise
random particles
3D animation
WebGL decoration
```

Система должна ощущаться живой, но не беспокойной.

---

# 41. Sound grammar

Sound является вторым observability channel.

Не music.

Не ambience.

Semantic sound vocabulary:

```text
wake
intent-discovered
capability-start
source-open
evidence-collected
validation-complete
context-required
artifact-created
run-complete
failure
```

Каждый звук связан с реальным событием.

---

# 42. Sound restraint

Не проигрывать звук на:

```text
каждый console line
каждый typed character
каждое небольшое UI update
```

Default sound mode должен быть умеренным.

Например:

```text
Off
Essential
Full
```

`Essential` — default.

---

# 43. Failure grammar

Failure не должен разрушать пространственную модель.

Если provider unavailable:

```text
MODEL
FAILED
```

FLOW показывает место остановки.

Console показывает факт ошибки.

Result объясняет человеку:

```text
Не удалось открыть новый ракурс.
Локальная модель недоступна.
```

Не предлагать source как замену model provider.

---

# 44. Needs Context grammar

Если информации недостаточно:

```text
RESEARCH
NEEDS CONTEXT
```

Context World становится смысловым центром.

Пользователь видит:

```text
Для продолжения мне не хватает ...
```

и:

```text
Добавить источник
```

После добавления новый source появляется в Context World.

---

# 45. Adding a source should change the visible world

Это важный UX-момент.

До:

```text
PROJECT
```

После:

```text
PROJECT

USER ADDED
  customer-interviews/
```

На следующем Research пользователь должен видеть реальные обращения к новому source.

Именно здесь AgentSuite обучает человека работе с capabilities без setup wizard.

---

# 46. Result transition

Observation и Result — два взгляда на одну историю.

```text
OBSERVATION
→ как история появилась

RESULT
→ что получилось
```

Не два приложения.

Переключение должно сохранять:

```text
run
selection
scroll position where reasonable
current artifact
```

---

# 47. Artifact presentation

Пользовательские названия:

```text
Рассказ
Таблица
Презентация
```

не:

```text
NarrativeArtifact
DataArtifact
PresentationArtifact
```

Внутри Details технический тип доступен.

---

# 48. Presentation transition

Presentation открывается fullscreen.

Не как маленькая карточка внутри технической сетки.

Observation → Presentation может использовать story accent для визуальной непрерывности.

Escape / Back возвращает пользователя туда, откуда он пришёл.

---

# 49. Temporal grammar

Run — это история событий.

Observation должен уметь одинаково строиться:

```text
LIVE
```

из replay + новых SSE events

и потенциально:

```text
REPLAY
```

из только persisted journal.

В R13.3 отдельный Replay UX не реализуется.

Но архитектура Projection не должна делать его невозможным.

---

# 50. Canonical ordering

Порядок Observation определяется:

```text
event sequence / eventId
```

а не arrival timing renderer и не wall-clock timestamp.

Таким образом reload/reconnect воспроизводит ту же историю.

---

# 51. Responsive grammar

Observation должен сохранять смысловую иерархию даже на меньшем viewport.

При недостатке места исчезают/сворачиваются сначала peripheral modules:

```text
Event Keyboard
Execution details
secondary Evidence metrics
```

Но должны оставаться:

```text
Flow
Console/current action
Context
Result switch
```

---

# 52. Touch grammar

Критические действия не должны зависеть от hover.

Допустимые touch targets:

```text
stage
source
Evidence
artifact
capability inspector
Result/Observation switch
```

Capability tap в Observation не запускает capability.

Он только объясняет её состояние.

---

# 53. Accessibility

Theme и Story accent не могут быть единственным носителем состояния.

Например:

```text
RESEARCH
ACTIVE
```

не просто цвет.

Использовать:

```text
text
icon/state marker
position
```

вместе с цветом.

Sound также никогда не является единственным каналом важной информации.

---

# 54. Density

Observation Mode может быть плотнее обычного Product UI.

Но плотность должна происходить из реальной информации.

Запрещено добавлять показатели только ради заполнения пространства.

Пустой участок интерфейса допустим.

В AgentSuite пустота является частью visual language.

---

# 55. Self-representation vocabulary

Концептуально AgentSuite можно представить так:

```text
WORLD
куда система может смотреть

VIEW
как она смотрит

SKILLS
что она умеет делать

MIND
какая inference capability доступна

BODY
где выполняется работа

MEMORY
какой принятый прошлый опыт доступен

FLOW
что происходит сейчас

EVIDENCE
что установлено

STORY
что получилось
```

Это conceptual grammar.

Не обязательный список панелей.

---

# 56. Do not anthropomorphize unnecessarily

Не нужен персонаж-агент.

Не нужны:

```text
лицо
аватар
руки
анимация человечка
```

Сам интерфейс является телом AgentSuite.

Когда FILES активируется — система «смотрит».

Когда MODEL активируется — система использует inference.

Когда Flow движется — работа продолжается.

Когда Evidence появляется — система что-то установила.

---

# 57. Product metaphor

Правильная метафора:

```text
UI = visible nervous system
```

а не:

```text
UI = cartoon agent acting on dashboard
```

---

# 58. Anti-patterns

Observation Mode не должен превращаться в:

### Developer dashboard

```text
raw IDs
JSON
metrics everywhere
```

### Hollywood hacker screen

```text
random text
constant animation
fake commands
fake scans
```

### System monitor

```text
CPU
RAM
network
temperatures
```

без связи с пользовательской историей.

### IDE

```text
editor
git
shell
file manager
```

без отдельной продуктовой необходимости.

### Chain-of-thought viewer

скрытый reasoning не является частью Observation.

### Wizard

Observation не должен заставлять пользователя заранее настраивать всё.

---

# 59. eDEX inspiration boundary

Из eDEX используем не внешний вид буквально, а несколько системных идей:

```text
единая fullscreen surface
модульность наблюдаемых аспектов
центральная рабочая область
контекстные периферийные поверхности
filesystem follows working context
keyboard as contextual interaction surface
event-driven sound
in-place object inspection
theme as coherent system
```

Не копируем:

```text
terminal backend
Node-heavy renderer
system telemetry
network globe
touch keyboard implementation
audio assets
theme assets
CSS
source code
```

---

# 60. Implementation test

Для каждого нового визуального элемента Codex должен уметь ответить на четыре вопроса:

```text
1. Какой пользовательский вопрос он отвечает?

2. Какой Runtime fact является его источником?

3. Что происходит, если этого факта нет?

4. Может ли UI полностью восстановить его после reload из journal?
```

Если ответ на любой пункт неясен — элемент не должен появляться.

---

# 61. Human acceptance test

При ручной проверке пользователь должен пройти один Random Run и суметь без технической документации ответить:

```text
Какой вопрос обнаружил AgentSuite?

Какой stage сейчас работает?

К каким источникам он обращался?

Какой источник использовался прямо сейчас?

Какие Evidence появились?

Какая capability была активна?

Когда использовалась модель?

Что закончилось успешно?

Что стало результатом?
```

---

# 62. Role-fork acceptance

После:

```text
Посмотреть глазами CTO
```

человек должен визуально понять:

```text
Эти факты уже существовали.

Эта Validation уже существовала.

Research не выполнялся повторно.

Изменился профессиональный ракурс.

Новый Synthesis появился после смены ракурса.

Новые outputs относятся к новому взгляду.
```

Без необходимости видеть `parentRunId`.

---

# 63. Truthfulness acceptance

Самый важный human-review вопрос:

> Верю ли я, что то, что движется на экране, действительно сейчас происходит?

Если пользователь начинает подозревать:

> это просто красивая заставка

Observation Mode не выполнил свою задачу.

---

# 64. Product acceptance

Второй вопрос:

> Помогает ли Observation понять AgentSuite или заставляет меня разбираться в его внутренностях?

Нужно первое.

Observation раскрывает устройство продукта постепенно.

Он не требует знать архитектуру заранее.

---

# 65. Final UX law

AgentSuite начинается с:

```text
БЕСКОНЕЧНЫЙ РАКУРС

Следующая история ещё не существует
```

Потом система оживает.

Она сама открывает новый Intent или принимает Intent человека.

Пользователь видит:

```text
куда она посмотрела,
что сделала,
что обнаружила,
чему доверилась,
как изменила ракурс,
и что создала.
```

А затем машина снова отступает на второй план.

Остаётся история.

---

# Observation UX Grammar — one-line definition

> **Каждое состояние AgentSuite должно быть видно ровно настолько, насколько оно помогает человеку понять рождение текущей истории, и ни одно движение интерфейса не должно существовать без реального события системы.**
# R13.5 — Agent Terminal Workstation

Observation Mode is the working surface of AgentSuite. It is a rebuildable read-only projection of canonical state, never execution state:

```text
configuration + registries + journal + artifacts
                     ↓
             Observation Projection
                     ↓
              Agent Workstation
```

The workstation metaphor is explicit: Context World is where the agent looks; Agent Terminal is what it observably does; Capabilities are its available tools; Evidence is what it established; Flow is semantic dependency; View is professional framing; Outputs are materializations. Event Keyboard is subordinate presentation of a new safe action descriptor and never acts as stdin.

Three truth graphs remain independent:

1. Artifact lineage records actual direct Harness reads through `sourceArtifactIds`.
2. Operation correlation groups Runtime facts only through canonical `operationId` and optional `producedByOperationId`.
3. Journal sequence records canonical chronology through monotonic `eventId` / `sequence`.

The projection may visually connect these graphs but must not infer operation correlation from stage, time, or `displayInput`. Typed dependency labels come from versioned contract knowledge in the projection layer; unknown relations remain `upstream`.

Semantic Flow is not chronological execution order:

```text
DISCOVERY → INTENT → BRIEF → RESEARCH → VALIDATION → SYNTHESIS
                                                        ↓
                                                       DATA
                                                     ↙      ↘
                                                  STORY  PRESENTATION
```

`SynthesisPlan` remains a direct framing input to Story and Presentation. `DataArtifact` is their direct factual grounding input. Data carries stable row, metric, and insight identities and keeps fact, derived metric, runtime metadata, and interpretation authority distinct.

