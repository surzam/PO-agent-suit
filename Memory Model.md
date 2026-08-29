# AgentSuite Memory Model / Memory Contract

**Status:** Architecture Contract
**Scope:** Persistent identity, memory, experience and context retrieval
**Applies to:** Principal, Roles, Runs, Perspective Memory, future Context Builder, Human Review, Skills
**Does not prescribe:** конкретную БД, vector store, graph engine или UI

---

# 1. Purpose

AgentSuite должен сохранять опыт между Runs, не превращая каждый следующий Run в продолжение одного бесконечного LLM conversation.

Главный принцип:

> **Контекст одноразовый. История долговечна. Память отобрана. Мир проверяется заново.**

LLM context является временной рабочей областью.

Persistent state живёт вне модели.

Перед каждым новым выполнением AgentSuite собирает только релевантную проекцию persistent state.

```text
Persistent World
      ↓
Retrieval
      ↓
Relevant Context
      ↓
Harness execution
      ↓
Run / Artifacts / Events
      ↓
Candidate Experience
      ↓
Review
      ↓
Persistent Memory
```

---

# 2. Memory is not a prompt

Запрещённая модель:

```text
MASTER_MEMORY.md
+
system prompt
+
вся история пользователя
+
все прошлые Runs
```

→ каждый раз отправить модели всё.

Правильная модель:

```text
Persistent State
      ↓
Context Builder
      ↓
Relevant Context
      ↓
Prompt / Harness Context
```

Prompt является **скомпилированной проекцией состояния**, а не местом хранения состояния.

---

# 3. Memory is not one thing

AgentSuite не должен иметь один универсальный объект `Memory`.

Необходимо различать минимум:

```text
Principal
Role Definition
Perspective Memory
Episodic Memory
World Knowledge / Evidence
Procedural Memory
Candidate Memory
```

Эти слои имеют разные semantics, authority и lifecycle.

---

# 4. Principal

`Principal` отвечает на вопрос:

> Для кого действует AgentSuite?

Это не Role и не память профессионального поведения.

Пример:

```text
Principal

id: local-owner
displayName: Alexander
relationship: owner

organization:
  AgentSuite

preferredLanguage:
  ru
```

Principal должен содержать только относительно стабильную identity/context информацию.

Не превращать Principal в бесконечный профиль предпочтений.

---

# 5. AgentSuite Identity

Отдельно от Principal существует identity самой системы.

Например:

```text
AgentSuite Identity

local-first
evidence-first
provenance-aware
role-oriented
human-authority
```

Это отвечает:

> Кто я как система?

Principal отвечает:

> Для кого я работаю?

Role отвечает:

> Как я сейчас смотрю?

Intent отвечает:

> Что я сейчас пытаюсь сделать?

---

# 6. Role / Worldview

Role Definition — это профессиональный костюм.

Например:

```text
Product Owner

priorities:
- customer value
- business impact
- prioritization
- delivery risk
```

или:

```text
CTO

priorities:
- architecture
- reliability
- scalability
- security
- migration risk
```

Role Definition НЕ является пользовательской памятью.

Один и тот же Role может применяться к разным Principals.

---

# 7. Acting Context

Минимальная identity текущего действия:

```text
AgentSuite Identity
+
Principal
+
Role
+
Intent
```

Позже добавляются:

```text
Relevant Perspective Memory
Relevant Evidence
Relevant Episodes
Relevant Procedures
Available Capabilities
```

Именно это образует текущий `Acting Context`.

---

# 8. Perspective Memory

Perspective Memory отвечает:

> Какой проверенный совместный опыт накоплен у этого профессионального ракурса при работе для этого Principal?

Scope:

```text
Principal + Role
```

Например:

```text
Principal:
  Alexander

Role:
  Product Owner

Perspective Memory:
  human review before UI automation
  preserve minimal empty beginning
  introduce sources only when needed
```

Это не универсальная истина.

Это накопленный профессиональный опыт конкретного ракурса для конкретного владельца.

---

# 9. Perspective Memory is not World Truth

Критический invariant:

```text
Perspective Memory
≠
Evidence
```

Например:

```text
"пользователь предпочитает human review"
```

может быть Perspective Memory.

А:

```text
"conversion упала на 17%"
```

не должна храниться как preference-memory.

Это Evidence / World Knowledge с provenance.

Perspective Memory не имеет права отменять свежие Evidence.

---

# 10. Shared Principal Memory

Некоторая информация относится к Principal независимо от Role.

Например:

```text
preferred language
timezone
explicitly stated stable identity
```

Она может быть общей для PO и CTO.

Таким образом:

```text
                Principal Memory
                     /   \
                    /     \
              PO Memory   CTO Memory
```

Role-specific опыт не должен автоматически протекать между ветками.

---

# 11. Episodic Memory

AgentSuite уже имеет естественную форму episodic memory:

```text
Run
+
Event Journal
+
Artifacts
```

Один Run — один эпизод выполнения.

Не создавать отдельную копию этой информации только под названием `EpisodicMemory`.

Run является durable history:

```text
Intent
Role
Events
Artifacts
Evidence
Validation
Synthesis
Outputs
```

---

# 12. Story / Generation as human episode

На пользовательском уровне несколько technical Runs могут составлять одну историю.

Например:

```text
Question
  ├── PO Run
  └── CTO fork
```

Техническая memory опирается на Runs.

Human-facing history может группировать их в Story.

Не смешивать эти уровни хранения.

---

# 13. World Knowledge

Факты о мире должны оставаться provenance-aware.

Цепочка:

```text
Source
↓
Evidence
↓
Validation
↓
Claim
↓
Synthesis
```

Не превращать provenanced fact автоматически в:

```text
memory.statement = "X is true"
```

если можно сохранить ссылку на Evidence.

---

# 14. Evidence should be reusable

Если новый Run использует существующий EvidenceSet:

```text
ArtifactReused
```

должен ссылаться на исходный Artifact.

Не копировать факт как новую memory запись только ради retrieval.

Persistent knowledge лучше хранить через ссылки и индексы.

---

# 15. Procedural Memory

Procedural Memory отвечает:

> Как AgentSuite научился лучше выполнять определённый вид работы?

Например:

```text
При анализе репозитория:
1. прочитать manifest;
2. определить architecture docs;
3. изучить entrypoints;
4. затем делать conclusions.
```

Это не preference пользователя.

Это процедура / skill.

---

# 16. Procedural Memory and Harnesses

Процедурная память потенциально может эволюционировать в:

```text
Skill
Harness configuration
Workflow pattern
Tool-use procedure
```

Но процедурная память не должна автоматически менять production Harness.

Она проходит отдельный lifecycle и validation.

---

# 17. Candidate Memory

Не каждый вывод о пользователе или процессе должен сразу становиться persistent memory.

Необходим слой:

```text
Candidate Memory
```

Пример:

```text
Agent inferred:

"Owner prefers minimal interfaces."
```

Это пока гипотеза.

```text
status: candidate
```

До acceptance она не должна влиять на следующие Runs как established memory.

---

# 18. Explicit vs inferred memory

Memory authority должна зависеть от происхождения.

Минимальные уровни:

```text
user-explicit
human-reviewed
evidence-supported
agent-inferred
```

Например пользователь сказал:

> Всегда отвечай мне на русском.

Это:

```text
authority = user-explicit
```

А агент заметил:

> Пользователь, кажется, предпочитает минималистичный UX.

Это:

```text
authority = agent-inferred
status = candidate
```

---

# 19. Authority is not confidence

Не заменять provenance одним числом:

```text
confidence = 0.87
```

Важнее знать:

```text
Кто это утверждает?
На основании чего?
Когда?
Было ли это проверено человеком?
```

Memory authority является semantic property.

---

# 20. Human Review

Human Review является boundary между inferred experience и trusted Perspective Memory.

```text
Run
↓
Candidate Memory
↓
Human Review
     / \
 accept reject
   ↓
Memory
```

Rejected candidate:

* не становится active;
* не участвует в retrieval;
* может сохраняться как audit fact решения, если это необходимо.

---

# 21. Explicit user statements

Не все memory writes требуют отдельного review.

Если пользователь прямо и однозначно сообщает стабильный факт:

```text
"Меня зовут ..."
"Отвечай мне на русском."
```

система может сохранить его как:

```text
authority = user-explicit
```

при соблюдении privacy/security policy.

---

# 22. Memory writes must be typed

Не использовать API:

```text
remember(text)
```

без semantics.

Минимально запись должна иметь:

```text
subject
predicate / kind
value
scope
authority
source
temporal state
status
```

---

# 23. Memory Record

Концептуальный контракт:

```text
MemoryRecord

id

scope:
  principalId
  roleId?          // optional

kind:
  identity
  preference
  anti-preference
  decision-pattern
  constraint
  relationship
  accepted-experience

statement / value

authority:
  user-explicit
  human-reviewed
  evidence-supported
  agent-inferred

status:
  candidate
  active
  superseded
  forgotten
  rejected

validFrom
validUntil?

createdAt
updatedAt

sourceRefs[]
runRefs[]

supersedes?
```

Физический storage может отличаться.

---

# 24. Memory must be temporal

Memory без времени быстро становится ложной.

Например:

```text
preferredRegion = eu-west-1
```

может быть истинным сегодня и ложным через месяц.

Поэтому Memory Record должен поддерживать:

```text
validFrom
validUntil
supersedes
```

---

# 25. Supersede

Если пользователь меняет значение:

```text
"Теперь используй eu-central-1."
```

старое знание не обязательно уничтожается.

Правильно:

```text
new record
supersedes old record
```

Старое становится:

```text
status = superseded
```

История сохраняет temporal truth.

---

# 26. Forget

`forget` — другая операция.

Если пользователь говорит:

> Забудь мой Telegram.

это означает, что active/retrievable memory больше не должна содержать значение.

Не:

```text
telegram = null
```

с сохранением старого значения в обычном retrieval path.

Нужно отдельное действие:

```text
forget(memoryId / predicate)
```

---

# 27. Forget vs audit

Implementation может иметь служебный audit trail удаления, если это необходимо для целостности системы.

Но forgotten content:

* не должен попадать в retrieval;
* не должен появляться в UI как доступная память;
* не должен влиять на future context;
* не должен случайно восстанавливаться из индекса.

Privacy semantics важнее удобства storage.

---

# 28. Secret Boundary

Secrets не являются памятью AgentSuite.

Например:

```text
password
API key
access token
private credential
```

не должны сохраняться в Perspective Memory / Principal Profile / Candidate Memory.

Даже если пользователь говорит:

> Запомни мой API key.

Memory Policy должна отклонить persistence секрета.

---

# 29. Secrets may have references

Если AgentSuite позже имеет Secret Store, memory может знать:

```text
"GitHub credential configured"
```

но не:

```text
"GitHub token = ghp_..."
```

Memory хранит факт доступности capability, а secret хранится специализированной системой.

---

# 30. Unknown remains unknown

Если значение неизвестно:

```text
null / unknown
```

лучше, чем inferred fiction.

Запрещено заполнять Principal или Memory Profile догадками только ради полноты схемы.

Например:

```text
email: unknown
phone: unknown
```

а не model-generated guesses.

---

# 31. Positive and negative preferences

Memory должна различать:

```text
preference
anti-preference
```

Например:

```text
prefers:
  minimal interfaces

avoids:
  dashboard-first UX
```

Антипредпочтения не должны теряться при summarization.

---

# 32. Memory is scoped

Каждая запись должна иметь scope.

Минимально:

```text
global Principal
Principal + Role
Project
Story
Workflow
Harness
```

Не все scope обязаны реализоваться сразу.

Но нельзя строить память, предполагая, что всё глобально.

---

# 33. Role isolation

Perspective Memory Product Owner не должна автоматически влиять на CTO.

Например:

```text
PO:
"prioritize human acceptance before automation"
```

не становится автоматически CTO preference.

Если preference относится к Principal глобально, он хранится выше Role level.

---

# 34. Project scope

В будущем один Principal может работать с несколькими продуктами.

Поэтому memory должна быть готова различать:

```text
Principal
Project A
Project B
```

Например мнение о UX AgentSuite не должно автоматически применяться к другому продукту.

---

# 35. Retrieval

Нельзя загружать всю память в каждый Run.

Pipeline:

```text
All Persistent Memory
        ↓
Retriever
        ↓
Relevant Memory Set
        ↓
Context Builder
```

---

# 36. Retrieval inputs

Retriever может учитывать:

```text
Principal
Role
Intent
Project
Workflow
Current Evidence
Current Stage
```

Не должен учитывать только semantic similarity текста.

---

# 37. Retrieval output must be explicit

Run должен знать, какую память он реально использовал.

Например:

```text
retrievedMemoryIds:
  M12
  M44
  M91
```

Это необходимо для provenance и debugging.

---

# 38. Memory provenance in Observation

Observation Mode позже должен уметь показать:

```text
MEMORY queried
3 relevant experiences retrieved
```

И дать пользователю открыть их.

Таким образом персонализация не становится невидимой магией.

---

# 39. Retrieval must support abstention

Если relevant memory нет:

```text
RelevantMemorySet = []
```

Нельзя подмешивать случайные похожие записи ради заполнения context.

---

# 40. Retrieval relevance is contextual

Пример:

Intent:

```text
Какой endpoint использует API?
```

UX preferences скорее всего не нужны.

Intent:

```text
Как показать новый режим пользователю?
```

PO Perspective Memory может быть очень релевантна.

Memory retrieval должен учитывать цель работы.

---

# 41. Context Builder

Context Builder — единственная граница, которая компилирует persistent state в LLM context.

Пример:

```text
AgentSuite Identity
+
Principal Projection
+
Role Definition
+
Intent
+
Relevant Memory
+
Relevant Evidence
+
Relevant Procedures
+
Available Capabilities
+
Execution Constraints
```

→

```text
Harness Context
```

---

# 42. Harness-specific context

Разные Harnesses могут получать разные memory projections.

Например:

### Research

нужны:

```text
Intent
Sources
Evidence rules
possibly Principal constraints
```

но многие UX preferences могут быть не нужны.

### Synthesis

может получать:

```text
Role
Perspective Memory
Evidence
Validation
Intent
```

Именно Synthesis чаще всего использует role-dependent experience.

---

# 43. Discovery and Memory

Intent Discovery в будущем может использовать Perspective Memory.

Но memory не должна превращаться в каталог следующих тем.

Правильно:

```text
past experience
→ relevance signal
→ new Intent discovery
```

Неправильно:

```text
past stories
→ next story template
```

Главный invariant сохраняется:

> Предыдущие истории существуют. Следующая история ещё не существует.

---

# 44. Memory must not predetermine truth

Даже trusted memory:

```text
"Owner обычно считает X важным"
```

не означает:

```text
"X является правильным решением сейчас"
```

Evidence и current context имеют отдельную authority.

---

# 45. Memory Candidate generation

После Run отдельный Curator/analysis boundary может искать:

```text
stable user preference
stable decision pattern
new identity fact
reusable procedure
repeated constraint
```

Но Curator создаёт только Candidate.

Он не должен самостоятельно изменять trusted Perspective Memory, кроме явно разрешённых user-explicit случаев.

---

# 46. Memory Curator

Будущая роль Memory Curator:

```text
Runs
Artifacts
Human feedback
Existing Memory
        ↓
Candidate detection
Deduplication
Conflict detection
Temporal resolution
        ↓
Candidates
```

Curator не является источником истины.

---

# 47. Skill Curator is separate

Procedural learning не должно обслуживаться тем же механизмом, что пользовательские предпочтения.

```text
Memory Curator
→ identity / preference / accepted experience

Skill Curator
→ procedures / skills / harness improvements
```

Они могут использовать общую storage infrastructure, но semantic contract разный.

---

# 48. Contradictions

При появлении нового факта Memory Layer должен уметь обнаружить:

```text
new record conflicts with active record
```

Не просить модель каждый раз интерпретировать два противоречивых поля без metadata.

---

# 49. Temporal conflict resolution

Если:

```text
2026-01 region = us-east
2026-08 region = eu-central
```

current retrieval должен выбирать valid/latest active record.

Оба значения могут оставаться в temporal history.

---

# 50. Non-temporal conflicts

Если одновременно существуют:

```text
prefers detailed reports
prefers concise reports
```

без понятного времени или scope, автоматически выбирать одно нельзя.

Создать:

```text
MemoryConflict
```

или candidate for human review.

---

# 51. Memory and Human Review feedback

Review самого результата может быть источником Candidate Memory.

Например пользователь:

```text
"Эта версия слишком перегружена."
```

может создать candidate:

```text
avoid high UI density
```

Но не обязательно автоматически.

Curator должен учитывать repeated evidence и explicitness.

---

# 52. Artifact review

Accepted Artifact сам по себе не означает, что каждый contained claim становится preference memory.

Необходимо различать:

```text
accepted result
```

и:

```text
accepted behavioral preference
```

---

# 53. Memory deduplication

Несколько похожих statements:

```text
"предпочитает минимализм"
"любит простой UI"
"не хочет перегруженные экраны"
```

не должны бесконечно раздувать memory.

Curator может предложить consolidation.

Но consolidation должна сохранять provenance исходных records.

---

# 54. Memory compaction

Если memory становится большой:

```text
records
→ summaries / clusters / indexes
```

допустимы.

Но original accepted records не должны исчезать только потому, что LLM создала summary.

Summary является derived Artifact.

---

# 55. Index is not truth

Vector DB / SQLite / graph index может использоваться для retrieval.

Но index должен быть rebuildable.

Canonical state — persistent records и provenance.

```text
Canonical Records
      ↓
Rebuildable Index
```

Не наоборот.

---

# 56. Recommended conceptual storage

Физический layout не является обязательным, но семантически может выглядеть так:

```text
workspace/

  identity/
    principal.json

  roles/
    product-owner.json
    cto.json

  runs/
    <run-id>/
      run.json
      events.jsonl
      artifacts/

  memory/
    principal/
    perspective/
    candidates/
    reviews/

  skills/
    ...

  indexes/
    memory.sqlite
```

---

# 57. Git-friendly state

Там, где возможно, canonical memory records должны быть:

```text
human inspectable
diffable
portable
```

Но contract не требует Git как единственный storage.

---

# 58. Immutable history vs mutable current view

Полезная модель:

```text
Memory Records = append/supersede history

Current Memory View = derived active state
```

То есть update не обязательно означает in-place mutation.

Это облегчает audit и temporal reasoning.

---

# 59. Memory API

Минимальная semantic API surface:

```text
remember(...)
propose(...)
review(...)
supersede(...)
forget(...)
retrieve(...)
inspect(...)
```

Не обязательно реализовывать буквально такими методами.

Но semantics должны существовать.

---

# 60. remember()

Используется для разрешённых explicit/trusted записей.

Должен требовать:

```text
scope
kind
value
authority
source
```

---

# 61. propose()

Создаёт Candidate Memory.

```text
status = candidate
```

Не участвует в ordinary retrieval как established truth.

---

# 62. review()

Human decision:

```text
accept
reject
edit-and-accept
```

Результат review сам является persistent decision.

---

# 63. supersede()

Создаёт новое active значение и связывает со старым.

Старое не участвует как current state.

---

# 64. forget()

Удаляет knowledge из active/retrievable memory semantics.

Forget не является обычным supersede.

---

# 65. retrieve()

Возвращает structured Relevant Memory Set.

Не просто текстовый blob.

Например:

```text
RelevantMemorySet

items[]
reasonByItem[]
scope
retrievalTime
```

---

# 66. inspect()

Позволяет ответить:

> Почему эта память сейчас используется?

Например:

```text
Memory M42

scope:
  Principal + Product Owner

authority:
  human-reviewed

derived from:
  Run 18
  Run 24

used in:
  current Run
```

---

# 67. No hidden memory

AgentSuite не должен иметь отдельную скрытую auto-memory, которая конкурирует с canonical Memory Model.

Если inference provider или host environment имеет собственную memory feature, она должна:

```text
быть отключена
```

или:

```text
быть явно интегрирована как отдельный declared source
```

Никакой невидимой персонализации.

---

# 68. Memory security

До persistence должны применяться policy checks:

```text
secret?
sensitive?
allowed scope?
explicit user instruction?
retention permitted?
```

Memory Curator не получает права обходить security policy.

---

# 69. Memory deletion consistency

После `forget()` значение не должно оставаться доступным через:

```text
vector index
cached retrieval
derived profile
search
UI
```

Индексы должны синхронно инвалидироваться/rebuild.

---

# 70. Memory tests

До сложного UI необходимо создать Memory Contract Suite.

Минимальные scenarios:

```text
M01 explicit fact stored
M02 explicit preference stored
M03 inferred preference becomes candidate
M04 candidate does not affect normal retrieval
M05 accepted candidate becomes retrievable
M06 rejected candidate never affects context
M07 relevant memory retrieved
M08 irrelevant memory excluded
M09 anti-preference preserved
M10 supersede selects new value
M11 temporal history preserved
M12 forget removes active knowledge
M13 forgotten record absent from index retrieval
M14 secrets rejected
M15 unknown remains unknown
M16 contradictory records detected
M17 PO memory isolated from CTO
M18 Principal memory shared across roles
M19 project-scoped memory does not leak
M20 Evidence does not become preference
M21 current Evidence outranks old preference where truth is concerned
M22 retrieval IDs persisted in Run
M23 reload produces same active memory state
M24 index can be rebuilt from canonical records
M25 memory context fits configured retrieval budget
```

---

# 71. Tests should be mechanical

Предпочитать deterministic assertions.

Например:

```text
record exists
record absent
status changed
scope correct
retrieval contains ID
retrieval excludes ID
secret not persisted
old record superseded
```

Не использовать LLM judge там, где можно проверить состояние напрямую.

---

# 72. Memory budget

Relevant Memory Set должен иметь semantic budget.

Не загружать:

```text
top 100 nearest vectors
```

просто потому что они найдены.

Context Builder должен ограничивать количество и размер memory records.

---

# 73. Memory relevance transparency

Для каждой retrieved memory желательно иметь machine-readable причину:

```text
role match
project match
intent relevance
explicit constraint
recent accepted decision
```

Это улучшает debugging и Observation.

---

# 74. Memory in Observation Mode

Когда memory реально используется:

```text
MEMORY ◉
```

может стать активным capability.

Context Explorer:

```text
MEMORY

Relevant experience

M42 · Human review before automation
M51 · Preserve empty beginning
M68 · Sources appear on demand
```

Это не обязательно часть первой реализации.

Но Memory Model должен это позволять.

---

# 75. Memory is not automatically a capability

До реализации real retrieval adapter:

```text
MEMORY
```

не должно появляться в Observation только как декоративная кнопка.

UI показывает только реально существующие capabilities.

---

# 76. Principal initialization

При первом запуске AgentSuite может минимально получить:

```text
Как вас называть?
Для какого продукта/контекста вы используете AgentSuite?
В каком отношении AgentSuite действует для вас?
```

Не создавать длинный personality wizard.

Остальной опыт формируется постепенно.

---

# 77. Initialization data is persistent state

Эти ответы сохраняются как structured Principal data.

Не только в:

```text
initial-system-prompt.txt
```

System prompt каждый Run получает их как projection.

---

# 78. Principal can evolve

Если пользователь меняет:

```text
organization
role relationship
preferred language
```

используются normal memory/state update semantics.

Identity не должна быть зашита навсегда в исходный prompt.

---

# 79. Different Principals

Architecture должна не исключать будущий режим:

```text
Principal A
Principal B
Team
Organization
```

Даже если R14 поддерживает только `local-owner`.

Не hard-code имя пользователя в Role Definition.

---

# 80. Team memory

Future extension может иметь:

```text
Organization Memory
Team Memory
Principal Memory
Perspective Memory
```

Но эти уровни не входят в минимальную реализацию.

Contract лишь запрещает делать всё глобальным.

---

# 81. Memory and Role fork

PO → CTO:

```text
Principal shared
Current Evidence shared
Role changes
Perspective Memory scope changes
```

То есть новый CTO Run может использовать:

```text
Principal-level memory
CTO Perspective Memory
```

но не PO-specific memory без явной причины.

---

# 82. Memory and Evidence fork

Reuse Evidence не означает reuse Perspective Memory.

Эти процессы независимы.

```text
same facts
different worldview
different relevant experience
```

---

# 83. Memory provenance is part of causality

Полная будущая цепочка решения:

```text
Sources
   ↓
Evidence
   ↓
Validation
   ↓

Role ──────────┐
               │
Relevant Memory├→ Synthesis
               │
Intent ────────┘
                    ↓
                  Output
```

Пользователь должен иметь возможность установить обе причины:

```text
какие факты использовались
```

и:

```text
какой прошлый опыт повлиял
```

---

# 84. Truth hierarchy

Необходимо различать authority domains.

### World truth

приходит через:

```text
Source
Evidence
Validation
```

### User preference / experience

приходит через:

```text
Principal
Perspective Memory
Human Review
```

### Professional interpretation

приходит через:

```text
Role
Synthesis
```

Ни один слой не должен незаметно маскироваться под другой.

---

# 85. Memory cannot fabricate Evidence

Если memory говорит:

```text
"раньше мы считали retention слабым"
```

это не является текущим Evidence о retention.

Research должен при необходимости проверить текущий мир заново.

---

# 86. Staleness

Memory Record может иметь:

```text
staleAfter
```

или derived staleness policy.

Особенно для mutable world facts.

Но preferences могут быть долговечнее.

Staleness policy зависит от kind.

---

# 87. Current facts should usually stay Evidence

Для быстро меняющейся реальности:

```text
software version
price
current metric
current API
team state
```

лучше снова смотреть в source, чем полагаться на Perspective Memory.

---

# 88. User corrections have high authority

Если пользователь говорит:

> Нет, я этого больше не хочу.

Memory system должна не спорить со старой inferred memory.

Новая explicit correction имеет высокий authority.

---

# 89. Memory cannot silently rewrite history

Если пользователь меняет preference, прошлые Runs остаются исторически такими, какими были.

Нельзя пересобирать старый Run с новой памятью и делать вид, что он всегда использовал её.

Run должен хранить IDs memory records, актуальных во время execution.

---

# 90. Reproducibility

Для completed Run должны быть доступны ссылки на:

```text
Principal projection
Role version
Relevant Memory Set
Evidence
Artifacts
Events
```

Это позволяет понять historical decision context.

---

# 91. Memory versioning

Role definitions и persistent memory могут эволюционировать.

Run должен знать версии или immutable IDs использованного state.

---

# 92. Context snapshot

Не обязательно копировать все memory records внутрь Run.

Допустимо сохранять:

```text
memoryRecordIds
roleVersion
principalSnapshotRef
```

если referenced state immutable/versioned.

---

# 93. Memory and privacy UI

Пользователь в будущем должен иметь возможность спросить:

```text
Что ты обо мне помнишь?
```

AgentSuite должен ответить из canonical memory store.

Не из LLM guess.

---

# 94. Self-inspection

Также:

```text
Почему ты это учёл?
```

может возвращать:

```text
Role
Evidence
Memory
Sources
```

которые действительно участвовали в current Run.

---

# 95. User control

Будущий Memory UI должен позволять:

```text
inspect
accept
reject
edit
forget
```

Но UI implementation не является частью этого contract.

---

# 96. No automatic personality drift

Repeated model outputs не должны постепенно менять Perspective Memory без Human Review.

Иначе AgentSuite будет персонализироваться на собственные предыдущие галлюцинации.

---

# 97. Memory loop

Правильный цикл:

```text
Persistent Memory
      ↓
Relevant Retrieval
      ↓
Run
      ↓
Outcome
      ↓
Candidate Experience
      ↓
Human Review
      ↓
Persistent Memory
```

Human Review является стабилизирующей границей.

---

# 98. Evidence loop is separate

```text
Current World
      ↓
Sources
      ↓
Evidence
      ↓
Validation
```

Этот цикл выполняется независимо от memory personalization.

---

# 99. Combined model

```text
                       PRINCIPAL
                           │
              ┌────────────┴────────────┐
              │                         │
        Product Owner                  CTO
              │                         │
      Perspective Memory       Perspective Memory
              │                         │
              └────────────┬────────────┘
                           │
                         Intent
                           │
                           ▼
                    Context Builder
                 ┌─────┬─────┬─────┐
                 │     │     │     │
              Memory Evidence Role Skills
                 │     │     │     │
                 └─────┴──┬──┴─────┘
                          ▼
                       Harness
                          │
                          ▼
                         Run
                     /          \
                 Journal       Artifacts
                     \          /
                      \        /
                       Outcome
                          │
                          ▼
                  Memory Candidates
                          │
                       Review
                     /        \
                 accept       reject
                   │
                   ▼
            Perspective Memory
```

---

# 100. Core invariants

AgentSuite Memory implementation MUST preserve:

### M1

Prompt is not canonical memory.

### M2

Principal, Role, Evidence and Perspective Memory are different concepts.

### M3

Every memory record has scope and provenance.

### M4

Agent-inferred memory does not become trusted automatically.

### M5

Human-reviewed memory is distinguishable from inferred memory.

### M6

Secrets are rejected before memory persistence.

### M7

Unknown values remain unknown.

### M8

Supersede and Forget are distinct operations.

### M9

Memory is temporal.

### M10

Perspective Memory is scoped at least by Principal + Role.

### M11

Evidence is not automatically converted into Perspective Memory.

### M12

Current Evidence can contradict old memory without being overridden by it.

### M13

Retrieval returns only relevant memory.

### M14

Every Run records which memory records influenced it.

### M15

No hidden secondary auto-memory may influence the Run.

### M16

Memory indexes are rebuildable and are not canonical truth.

### M17

Old Runs retain their historical memory context.

### M18

Rejected Candidates never influence ordinary retrieval.

### M19

Forgotten memory never returns through indexes or caches.

### M20

Observation must never claim memory was used unless Runtime actually retrieved it.

---

# 101. Minimal implementation boundary

The first implementation does NOT need:

```text
vector database
graph database
memory UI
automatic summarization
skill evolution
organization memory
team memory
memory replay
semantic clustering
```

Minimal useful vertical slice:

```text
PrincipalProfile
Role-scoped MemoryRecord
Candidate Memory
Human Review state
retrieve()
supersede()
forget()
Run.retrievedMemoryIds
Memory Contract tests
```

---

# 102. Recommended implementation sequence

### Phase A — Identity

```text
PrincipalProfile
Acting Context
Principal projection into Harness Context
```

### Phase B — Explicit memory

```text
user-explicit preferences
scope
temporal records
retrieve
forget
supersede
```

### Phase C — Candidate memory

```text
Run → Candidate
Human Review
accept/reject
```

### Phase D — Perspective retrieval

```text
Principal + Role + Intent
→ Relevant Perspective Memory
→ Synthesis
```

### Phase E — Observation

```text
MEMORY capability
retrieved items
memory provenance
```

### Phase F — procedural learning

```text
Skill Curator
procedures
Harness improvements
```

Do not jump directly to Phase F.

---

# 103. Definition of Done for a real memory system

Memory is not considered implemented merely because AgentSuite can write text into a file.

A valid implementation must prove:

```text
remember
retrieve relevant
exclude irrelevant
update
supersede
forget
reject secrets
preserve unknowns
respect role scope
respect project scope
record provenance
survive restart
rebuild index
expose what influenced Run
```

---

# 104. Product meaning

From the user's point of view memory should eventually feel like:

> AgentSuite remembers how we work together, but does not confuse our past decisions with current reality.

It knows:

```text
кто я
какую роль сейчас играет
какой опыт этого ракурса я одобрил
какие решения мы принимали раньше
```

Но когда мир изменился, оно снова смотрит на мир.

---

# 105. Final Memory Law

> **AgentSuite remembers experience, not truth by assumption.**

Truth remains grounded in current Sources and Evidence.

Memory preserves identity, preferences, reviewed experience and reusable procedures.

Each new Run receives only the memory relevant to its current Intent.

And every piece of memory that influences a result must have a visible origin, scope, authority and history.

