# AgentSuite Package, Capability & Distribution Architecture

**Status:** Architecture Design Freeze
**Scope:** Packages, capabilities, distributions, installation, provenance and integration with external agent package ecosystems
**Primary external reference:** Microsoft Agent Package Manager / OpenAPM
**Related contracts:**

* AgentSuite Memory Model / Memory Contract
* AgentSuite Observation UX Grammar
* AgentSuite Runtime / Harness model

---

# 1. Purpose

AgentSuite должен уметь развиваться не только через изменение Core.

Новые профессиональные ракурсы, навыки, источники, MCP integrations, workflows и специализированные возможности должны иметь возможность появляться как устанавливаемые и переносимые компоненты.

При этом AgentSuite не должен становиться:

* собственным несовместимым package ecosystem;
* копией APM;
* набором prompt-файлов;
* runtime, напрямую зависящим от конкретного package manager;
* системой, в которой установленный package автоматически получает execution authority.

Главный принцип:

> **Package определяет, что может быть доставлено системе. Runtime определяет, что система действительно может выполнить.**

---

# 2. Architectural separation

AgentSuite разделяет минимум четыре независимых plane:

```text
┌───────────────────────────────────────────┐
│ MEMORY PLANE                              │
│                                           │
│ Что система помнит                        │
│                                           │
│ Principal                                 │
│ Perspective Memory                        │
│ reviewed experience                       │
│ episodic references                       │
└───────────────────────────────────────────┘

┌───────────────────────────────────────────┐
│ PACKAGE / DISTRIBUTION PLANE              │
│                                           │
│ Что системе установлено                   │
│                                           │
│ packages                                  │
│ bundles                                   │
│ skills                                    │
│ agents                                    │
│ hooks                                     │
│ MCP declarations                          │
│ versions                                  │
│ integrity                                 │
│ policy                                    │
└───────────────────────────────────────────┘

┌───────────────────────────────────────────┐
│ RUNTIME PLANE                             │
│                                           │
│ Что система делает сейчас                 │
│                                           │
│ Harness Registry                          │
│ Workflows                                 │
│ Runs                                      │
│ Events                                    │
│ Artifacts                                 │
└───────────────────────────────────────────┘

┌───────────────────────────────────────────┐
│ WORLD / SOURCE PLANE                      │
│                                           │
│ На что система может смотреть             │
│                                           │
│ Files                                     │
│ MCP resources                             │
│ local data                                │
│ external sources                          │
│ current Evidence                          │
└───────────────────────────────────────────┘
```

Эти plane связаны, но не заменяют друг друга.

---

# 3. External reference: APM

Microsoft APM является dependency/install/integrity system для agent context.

Его текущая модель включает manifest, lockfile, dependency resolution, policy и deployment agent primitives в layout конкретного harness.

APM управляет такими primitives, как:

```text
instructions
skills
prompts
agents
hooks
commands
plugins
MCP servers
```

APM намеренно не является agent runtime.

AgentSuite принимает эту границу как совместимую со своей архитектурой.

---

# 4. Fundamental APM boundary

AgentSuite SHALL NOT считать:

```text
APM package
=
AgentSuite Harness
```

и SHALL NOT считать:

```text
APM agent
=
AgentSuite Role
```

и SHALL NOT считать:

```text
APM MCP declaration
=
permission to execute MCP
```

Это разные уровни abstraction.

---

# 5. Core concepts

Стабильные concepts Package Plane:

```text
Distribution

Package

Bundle

Primitive

Installed Component

Capability

Capability Provider

Harness Adapter

Installation Record

Capability Provenance

Policy

Integrity

Version

Target
```

---

# 6. Distribution

`Distribution` отвечает на вопрос:

> Какой законченный вариант AgentSuite мы хотим предоставить пользователю?

Например:

```text
PO Suite

Research Suite

Architecture Suite

Engineering Suite
```

Distribution — не отдельный Runtime.

Это композиция поверх одного AgentSuite Runtime.

---

# 7. Distribution is not application fork

Неправильно:

```text
AgentSuite
PO Suite app
CTO Suite app
Research Suite app
Architecture Suite app
```

Правильно:

```text
                 AgentSuite Runtime
                        │
        ┌───────────────┼──────────────┐
        │               │              │
      PO Suite      Research Suite  Architecture Suite
```

Distribution определяет доступную композицию.

---

# 8. Distribution may contain

Концептуально Distribution может определять:

```text
Role / Worldview definitions

Workflow definitions

Harness configuration

Built-in Harnesses

Package dependencies

Capability requirements

Default presentation configuration

Compatibility constraints
```

Это не означает, что все перечисленные сущности должны распространяться через APM.

---

# 9. PO Suite

Текущий AgentSuite может рассматриваться как первая opinionated Distribution:

```text
PO Suite
```

с:

```text
Product Owner worldview

Intent Discovery

Research

Validation

Synthesis

Narrative

Data

Presentation
```

и набором доступных capability providers.

Это не должно быть жёстко зашито в AgentSuite Core.

---

# 10. Package

`Package` отвечает:

> Какой переносимый набор agent-related компонентов может быть установлен?

Package может происходить:

```text
built-in

local development

APM

local bundle

Git source

future package provider
```

AgentSuite Core не должен предполагать единственный источник packages.

---

# 11. Bundle

`Bundle` — materialized переносимый installation artifact.

Например:

```text
directory

zip

packaged plugin artifact
```

Bundle — транспортная форма.

Bundle не является runtime state.

---

# 12. Primitive

`Primitive` — единица, которую внешний package ecosystem способен доставить.

В APM это могут быть:

```text
instructions
skills
prompts
agents
commands
hooks
MCP
```

AgentSuite может распознавать часть этих primitive types.

Но external primitive не становится AgentSuite concept автоматически.

---

# 13. Capability

`Capability` отвечает:

> Какую наблюдаемую возможность Runtime способен использовать?

Примеры:

```text
filesystem.read

model.inference

github.search

github.issue.read

web.fetch

document.read

memory.retrieve
```

Capability является Runtime-facing abstraction.

---

# 14. Package ≠ Capability

Один Package может предоставить:

```text
0
1
N
```

Capabilities.

Например:

```text
github-research-package

contains:

skill
instructions
MCP declaration
```

после installation/adaptation может дать:

```text
github.search
github.read_repository
github.read_issue
```

---

# 15. Capability Provider

Capability Provider реализует Capability.

Например:

```text
Capability:
github.search

Provider:
MCP GitHub adapter
```

или:

```text
Capability:
filesystem.read

Provider:
local filesystem adapter
```

---

# 16. Capability may be built-in

Не все Capabilities происходят из Package.

Например:

```text
model.inference
filesystem.read
artifact.read
runtime.inspect
```

могут быть встроены.

Provenance всё равно должно быть известно.

---

# 17. Harness

Harness остаётся AgentSuite execution concept.

Harness отвечает:

> Какая bounded professional capability выполняет stage workflow и какие artifacts/events она производит?

Например:

```text
Research Harness

inputs:
  Intent
  Brief

uses:
  Files
  Model
  MCP

outputs:
  EvidenceSet
```

---

# 18. Harness does not equal tool

Harness может использовать несколько Capabilities.

```text
Research Harness
        │
        ├── filesystem.read
        ├── github.search
        ├── web.fetch
        └── model.inference
```

Harness является исполнителем workflow stage.

Capabilities являются средствами исполнения.

---

# 19. Harness Adapter

Если external primitive требует integration с AgentSuite runtime semantics, используется Adapter.

```text
External Primitive
       ↓
Adapter
       ↓
AgentSuite Capability
       ↓
Harness
```

Adapter переводит внешний installation representation в bounded runtime interface.

---

# 20. Core is package-manager agnostic

AgentSuite Core SHALL NOT содержать:

```text
if packageSource == "apm"
```

в execution semantics.

Core видит:

```text
Capability Registry
Harness Registry
Role Registry
Workflow Registry
```

Package layer отвечает за population этих registries.

---

# 21. APM Adapter

APM интегрируется через отдельный adapter/provider boundary.

Концептуально:

```text
APM
 ↓
APM Adapter
 ↓
Installed Component Registry
 ↓
Capability Resolution
 ↓
AgentSuite Runtime
```

APM не становится Core dependency.

---

# 22. Why APM is external

APM является самостоятельным быстро развивающимся проектом.

AgentSuite не должен зависеть от:

```text
конкретной версии CLI

конкретного target matrix

конкретного package schema

конкретного registry
```

для работы своего Runtime.

AgentSuite должен существовать даже без установленного APM.

---

# 23. Installed Component Registry

AgentSuite должен иметь read model установленных компонентов.

Например:

```text
InstalledComponent

id

source
package

version

provider

primitiveType

installationScope

integrity

policyStatus

installedAt

capabilities[]

target
```

Это runtime-readable inventory, не обязательно новый canonical package database.

---

# 24. Installation Record

Installation operation должна оставлять provenance.

Минимально:

```text
что установлено

откуда

какая версия

какой integrity state

какая policy использовалась

какой target

какие files/components были materialized
```

---

# 25. Capability provenance

Пользователь должен иметь возможность спросить:

> Откуда у AgentSuite эта способность?

И получить:

```text
Capability

github.search

provided by:
github-research

package source:
...

version:
...

integrity:
verified

used by:
Research Harness
```

---

# 26. APM local bundle flow

AgentSuite может использовать APM local bundle installation как один из способов доставки переносимых capabilities.

Current APM bundle flow conceptually performs:

```text
detect
↓
policy
↓
integrity verification
↓
target deployment
↓
lock recording
```

AgentSuite не должен дублировать эту работу без причины.

---

# 27. Imperative bundle install

Локальный bundle имеет пользовательский смысл:

> Добавь этот готовый набор возможностей в мою текущую систему.

Это отличается от declarative dependency.

---

# 28. Declarative dependency

Distribution или project configuration может объявлять:

> Для корректной работы мне требуются эти packages.

Это conceptually соответствует manifest-driven dependency model.

---

# 29. Two installation meanings

Следует различать:

```text
REQUIRED DEPENDENCY
```

и:

```text
USER INSTALLED EXTENSION
```

Например:

```text
PO Suite requires:
research-basics
```

против:

```text
User installs:
github-product-research
```

---

# 30. Distribution dependency graph

Distribution может зависеть от packages.

```text
PO Suite

depends on:

research-core
presentation-core
```

Packages могут иметь transitive dependencies.

Package provider может разрешать этот graph.

AgentSuite не обязан самостоятельно реализовывать dependency resolver, если используется APM.

---

# 31. Installed ≠ enabled

Критический invariant:

```text
INSTALLED
≠
AVAILABLE TO RUNTIME
```

Компонент может быть установлен, но:

```text
disabled
policy-blocked
misconfigured
missing secret
missing runtime adapter
incompatible
```

---

# 32. Enabled ≠ active

Также:

```text
AVAILABLE
≠
ACTIVE
```

Capability может быть доступна, но не использоваться текущим Run.

Observation должен различать:

```text
installed
available
active
failed
blocked
```

---

# 33. Installed ≠ authorized

Наличие package/MCP declaration не означает permission выполнять действие.

Execution authority принадлежит Runtime / Harness policy.

Например:

```text
GitHub MCP installed
```

не означает:

```text
AgentSuite may mutate repository
```

Read/write capabilities должны иметь разные authority.

---

# 34. Installation plane and runtime plane

Главная граница:

```text
PACKAGE PLANE

что достигло машины
что прошло integrity
что прошло install policy

               ≠

RUNTIME PLANE

что разрешено текущему Harness
что выполняется
какое действие произошло
```

Эта граница не должна размываться.

---

# 35. Integrity

Package Plane должен иметь понятие integrity.

Для external packages желательно знать:

```text
source identity
version/ref
content hash
verification status
```

AgentSuite не должен говорить пользователю:

```text
verified
```

если реальной integrity verification не было.

---

# 36. Policy

Installation Policy отвечает:

> Может ли этот package/component быть установлен?

Runtime Policy отвечает:

> Может ли установленная Capability быть использована сейчас?

Это две разные policies.

---

# 37. Install Policy examples

```text
allowed package sources

allowed MCP declarations

allowed primitive types

required integrity hashes

allowed targets

organization restrictions
```

---

# 38. Runtime Policy examples

```text
read-only filesystem

network disabled

GitHub mutation denied

secret access denied

user approval required
```

---

# 39. Secrets

Packages никогда не должны содержать персональные secrets как часть переносимого capability state.

Правильно:

```text
GitHub capability installed

credential required
```

Неправильно:

```text
bundle contains personal token
```

Secret storage принадлежит отдельному secure boundary.

---

# 40. Memory is never packaged

Следующие сущности НЕ являются частью distributable package:

```text
Principal

Principal Memory

Perspective Memory

Human Review history

private Runs

private sources

credentials
```

Никакая Distribution не должна поставляться вместе с personal memory своего автора.

---

# 41. Portable vs Personal

Архитектурная граница:

```text
PORTABLE

Role Definition
generic Workflow
generic Harness
Skills
Instructions
Commands
Hooks
MCP declarations
presentation defaults


LOCAL / PERSONAL

Principal
Perspective Memory
Runs
Human Decisions
private Sources
Secrets
```

---

# 42. Role portability

Role Definition может быть переносимой.

Например:

```text
Product Owner worldview
```

Но:

```text
Alexander's Product Owner Perspective Memory
```

не переносится вместе с Role.

---

# 43. Costume metaphor

Продуктовая метафора:

```text
Distribution / Package
=
костюм + навыки + доступные инструменты

Perspective Memory
=
опыт ношения этого костюма для конкретного Principal
```

Поэтому новый package может расширить костюм.

Он не переписывает накопленный опыт.

---

# 44. Installing a new Distribution

Например пользователь добавляет:

```text
Architecture Suite
```

Устанавливаются:

```text
CTO Worldview

Architecture workflows

Architecture skills

Architecture capability requirements
```

Но Principal остаётся тем же.

Если CTO Perspective Memory уже существовала:

```text
same Principal
+
updated CTO Distribution
+
existing CTO Memory
```

создают обновлённый персональный CTO experience.

---

# 45. Distribution versioning

Distribution должна иметь version identity.

Run должен иметь возможность установить:

```text
какая Distribution
какая версия Role
какие Harness versions
какие installed capability versions
```

участвовали в execution.

---

# 46. Reproducibility

Для completed Run желательно иметь возможность восстановить:

```text
Distribution version

Role version

Harness versions

Capability Providers

Package versions

Relevant Memory IDs

Source/Evidence lineage
```

Это не обязательно означает абсолютную bit-for-bit повторяемость model output.

Это означает reproducible execution context provenance.

---

# 47. Package updates

Package update не должен молча переписывать historical Runs.

Старый Run сохраняет ссылки на state, который использовался тогда.

Новый Run использует новую available version.

---

# 48. Drift

Если installed package files были изменены после installation:

```text
integrity state
```

не должен оставаться `verified`.

Если package provider поддерживает drift detection, AgentSuite может использовать результат.

---

# 49. Capability Registry

Runtime-facing registry должен работать с normalized descriptors.

Например:

```text
CapabilityDescriptor

id

kind

provider

version

origin

status

permissions

operations

metadata
```

Конкретная schema может изменяться.

Стабильным является смысл Registry.

---

# 50. Capability statuses

Минимально:

```text
installed

available

active

disabled

blocked

misconfigured

unavailable

failed
```

Не все состояния обязательно persistent.

---

# 51. Observation UX

Package Plane должен быть видим только там, где это помогает понять систему.

На пустом стартовом экране:

```text
НЕ показывать package manager.
```

В Observation:

```text
FILES
MODEL
GITHUB
MEMORY
```

показывают реальные Runtime Capabilities.

---

# 52. Capability Inspector

По клику:

```text
GITHUB
```

можно показать:

```text
Capability
GitHub Search

Provider
MCP

Installed by
github-research package

Version
...

Integrity
verified

Status
available

Used by
Research
```

---

# 53. Observation provenance

Во время execution:

```text
CapabilityStarted(github.search)
```

может визуально активировать:

```text
GITHUB ◉
```

Package installation сама по себе не создаёт activity.

---

# 54. Context Explorer

Capability может раскрывать собственный resource space.

Например:

```text
FILES

project/
docs/
```

или:

```text
GITHUB

repositories/
issues/
pull requests/
```

Package/Capability integration тем самым влияет на доступный World.

---

# 55. Package does not automatically become World

После установки:

```text
GitHub capability
```

становится доступен способ взаимодействия с World.

Но GitHub data не становится Context автоматически.

Harness должен реально запросить resource.

---

# 56. Source provenance

Если Capability произвела Source/Evidence:

```text
Package
 ↓
Capability
 ↓
Source
 ↓
Evidence
 ↓
Claim
 ↓
Output
```

должна быть прослеживаемая цепочка.

---

# 57. Capability provenance and Evidence provenance

Это два разных вопроса:

```text
Откуда этот факт?
```

→ Source/Evidence provenance.

```text
Каким инструментом агент получил этот факт?
```

→ Capability provenance.

Обе цепочки полезны.

---

# 58. Community ecosystem

AgentSuite не должен требовать изменения Core для каждого community extension.

Желаемый путь:

```text
community package
       ↓
installation
       ↓
adapter / normalized capability
       ↓
registry
       ↓
existing Harness or new installable Harness
```

---

# 59. Extension levels

Внешнее расширение может добавить:

### Level 1 — Capability

```text
GitHub Search
```

### Level 2 — Skill / Procedure

```text
how to research a repository
```

### Level 3 — Harness

```text
Architecture Analysis Harness
```

### Level 4 — Workflow

```text
architecture-review
```

### Level 5 — Distribution

```text
Architecture Suite
```

Не все уровни должны поддерживаться через один package primitive.

---

# 60. Harness packaging

Если AgentSuite позднее допускает external Harnesses, Harness должен иметь собственный AgentSuite contract:

```text
id
inputs
outputs
events
requiredCapabilities
version
compatibility
```

APM может быть средством доставки его файлов.

Но Harness semantics определяются AgentSuite.

---

# 61. Role packaging

То же относится к Role Definition.

APM `agent` primitive может быть полезным source representation.

Но AgentSuite Role/Worldview contract остаётся собственным.

Adapter может импортировать совместимые данные.

---

# 62. Skills

External Skill может:

```text
использоваться Harness напрямую
```

или:

```text
быть адаптирован в Procedural Memory / Skill Registry
```

Но install не означает automatic promotion в trusted procedural memory.

---

# 63. Package content is executable context

Agent instructions/skills/prompts способны менять поведение модели.

Поэтому package content рассматривается как потенциально executable behavioral input.

Следовательно:

```text
integrity
policy
origin
version
```

являются security properties, а не косметическими metadata.

---

# 64. Human authority

Установка нового package может существенно изменить возможности агента.

Поэтому user-facing install должен ясно показывать:

```text
что добавляется

какие capability types

какие MCP integrations

какие hooks

какие permissions могут потребоваться
```

до activation там, где это materially affects authority.

---

# 65. Install does not imply trust escalation

Package не может самостоятельно:

```text
включить forbidden network

получить secrets

получить filesystem write authority

обойти Human Review

обойти Runtime Policy
```

---

# 66. Built-in and external must share Runtime contracts

Research Harness не должен различать:

```text
built-in filesystem capability
```

и:

```text
external GitHub capability
```

на уровне execution lifecycle, кроме operation-specific semantics.

Обе проходят через generic Capability boundary.

---

# 67. AgentSuite manifest

AgentSuite может иметь собственный distribution/project manifest.

Он отвечает за AgentSuite concepts:

```text
Distribution identity

Roles

Workflows

Harnesses

Capability requirements

Package dependencies
```

Физическое имя/schema manifest является replaceable implementation detail до отдельного schema freeze.

Не превращать APM manifest в AgentSuite domain manifest.

---

# 68. APM manifest

`apm.yml` принадлежит APM dependency plane.

Если он используется:

```text
AgentSuite manifest
       ↓
declares requirement
       ↓
APM/provider configuration
       ↓
apm.yml / lock / bundle
```

Конкретная integration может быть adapter-driven.

---

# 69. Lockfile

Package provider lockfile является механизмом воспроизводимости package resolution.

AgentSuite может ссылаться на lock identity/hash в execution provenance.

Но Core не обязан интерпретировать весь lock format.

---

# 70. Package provider interface

Conceptually:

```text
PackageProvider

discover()
inspect()
install()
verify()
listInstalled()
update()
remove()
audit()
```

Это conceptual interface, не обязательная первая implementation API.

APM Adapter может реализовывать её часть.

---

# 71. No package installation from Harness

Harness не должен самостоятельно устанавливать package во время Research без отдельного authority flow.

Правильно:

```text
Harness discovers missing capability

→ CapabilityRequired

→ Human / policy decision

→ Package Plane installs

→ capability becomes available

→ execution may resume/new Run
```

---

# 72. Missing capability

Если Harness понимает:

```text
для задачи нужен GitHub access
```

UI может показать:

```text
Для этого исследования нужна возможность:
GitHub

[ Добавить возможность ]
```

а не:

```text
APM install ...
```

Пользователь видит продуктовый смысл.

Package manager остаётся под капотом.

---

# 73. Missing source vs missing capability

Не смешивать:

```text
нет нужного Source
```

и:

```text
нет способности получить Source
```

Пример:

```text
Capability exists:
FILES

but required folder not added
```

→ Add Source.

```text
GitHub capability absent
```

→ Add Capability.

---

# 74. Missing secret

Третье состояние:

```text
Capability installed
but credential unavailable
```

→ Configure Access.

Это не installation failure и не source deficiency.

---

# 75. Product vocabulary

Пользовательский язык:

```text
Возможность

Источник

Ракурс

Навык

Набор возможностей
```

Технический язык в Details:

```text
Package

Primitive

Provider

Target

Lock

Integrity

Adapter
```

---

# 76. Capability acquisition UX

В будущем:

```text
Для следующего шага AgentSuite нужен доступ к GitHub.

GitHub позволит Research Harness читать repository,
issues и pull requests.

Источник пакета: ...
Integrity: verified

[ Добавить возможность ]
```

После установки:

```text
GitHub
READY
```

---

# 77. Offline/local-first

AgentSuite должен оставаться usable с локально установленными packages без обязательного cloud marketplace.

Local bundles являются first-class installation source.

Registry/marketplace — optional discovery.

---

# 78. Marketplace is not architecture

AgentSuite Package Model не зависит от наличия централизованного marketplace.

Package discovery может происходить:

```text
local file

Git

organization registry

APM registry

community catalog

manual import
```

---

# 79. Distribution export

В будущем пользователь должен иметь возможность экспортировать переносимую конфигурацию своего Suite.

Но export не должен включать personal memory/secrets по умолчанию.

Например:

```text
EXPORT

Roles
Workflows
Harness configuration
Package dependencies
presentation presets
```

не:

```text
Principal
private runs
Perspective Memory
credentials
```

---

# 80. Personal backup is separate

Backup пользователя может включать:

```text
Principal
Memory
Runs
Artifacts
Reviews
```

Но это:

```text
Personal State Backup
```

а не:

```text
Distribution Bundle
```

Эти export paths принципиально различаются.

---

# 81. Package update vs personal evolution

Два независимых процесса:

```text
Package Update
→ изменилась переносимая способность

Memory Evolution
→ изменился опыт конкретного Principal
```

Они не должны автоматически переписывать друг друга.

---

# 82. Memory Curator and Package Plane

Memory Curator не устанавливает packages.

Он может обнаружить:

```text
часто не хватает GitHub capability
```

и предложить Candidate Recommendation.

Installation остаётся Package Plane decision.

---

# 83. Skill Curator and Package Plane

Skill Curator потенциально может создать reusable Skill candidate.

Но путь:

```text
local learned procedure
↓
review
↓
portable Skill
↓
package authoring
```

должен быть явным.

Personal learned procedure не становится community package автоматически.

---

# 84. Self-improvement boundary

AgentSuite может со временем улучшать свои Skills.

Но self-improvement SHALL distinguish:

```text
learned locally
reviewed locally
packaged
published
installed elsewhere
```

Это разные authority boundaries.

---

# 85. Package provenance in Run

Run может фиксировать:

```text
usedCapabilityIds

providerVersions

packageRefs
```

для тех capabilities, которые реально использовались.

Не нужно записывать весь inventory машины в каждый Run.

---

# 86. Observation

Observation показывает только реально использованные installed capabilities.

Например:

```text
FILES      read
MODEL      inference
GITHUB     search
```

и позволяет inspect происхождение каждой.

---

# 87. Self-inspection

AgentSuite должен быть способен ответить:

> Что ты сейчас умеешь?

из Capability Registry.

Не из LLM imagination.

---

# 88. Package self-inspection

Также:

> Почему ты умеешь работать с GitHub?

Ответ:

```text
Installed capability:
github.search

Provider:
...

Package:
...

Version:
...
```

---

# 89. Runtime self-inspection

Отдельно:

> Что ты сейчас используешь?

Ответ приходит из текущего Run/Event Journal.

Не из installed inventory.

---

# 90. Memory self-inspection

И отдельно:

> Что ты обо мне помнишь?

Ответ приходит из Memory Plane.

Таким образом три вопроса имеют три разных authoritative stores:

```text
Что умеешь?
→ Capability Registry

Что делаешь?
→ Runtime Journal

Что помнишь?
→ Memory Store
```

---

# 91. World self-inspection

Четвёртый вопрос:

> К каким данным у тебя есть доступ?

Ответ:

```text
Context Roots
Source Providers
available MCP resources
```

Это World Plane.

---

# 92. Complete self-representation

Вместе:

```text
IDENTITY
кто я

PRINCIPAL
для кого я работаю

VIEW
как я смотрю

MEMORY
какой опыт я помню

CAPABILITIES
что я умею

WORLD
куда я могу посмотреть

RUNTIME
что я делаю

EVIDENCE
что я установил

STORY
что я создал
```

Это полная саморепрезентация AgentSuite.

---

# 93. Stable concepts vs replaceable components

## Stable

```text
Distribution

Package

Capability

Capability Provider

Harness

Installation provenance

Integrity

Policy

Portable vs Personal boundary
```

## Replaceable

```text
APM

specific package registry

specific bundle format

specific manifest filename

specific lockfile implementation

specific marketplace

specific installer UI
```

Это позволяет использовать APM сегодня, не превращая AgentSuite в wrapper вокруг APM.

---

# 94. External compatibility principle

Если внешний standard/package ecosystem уже качественно решает:

```text
package resolution
bundle integrity
target deployment
lockfiles
policy
```

AgentSuite SHOULD adapt to it before building a proprietary equivalent.

Но external standard SHALL NOT redefine AgentSuite Runtime semantics.

---

# 95. OpenAPM compatibility

OpenAPM может использоваться как один из portability formats.

AgentSuite-specific concepts, которых нет в OpenAPM, остаются AgentSuite concepts.

Не расширять OpenAPM ad hoc так, чтобы это создало proprietary fork без необходимости.

---

# 96. Security invariant

Agent Package является behavioral supply-chain input.

Поэтому external context должен рассматриваться так же серьёзно, как executable dependency.

Installation without:

```text
origin
integrity
policy
```

не должна изображаться как trusted.

---

# 97. Runtime authority invariant

Ни package, ни hook, ни MCP primitive не могут самостоятельно повысить Runtime authority.

Runtime policy всегда является последней границей перед действием.

---

# 98. Personal-state invariant

Portable artifact никогда по умолчанию не содержит personal state.

```text
Distribution export
≠
Personal backup
```

---

# 99. Memory invariant

Package installation никогда напрямую не создаёт Perspective Memory.

Package может добавить capability/skill.

Memory появляется через:

```text
experience
review
explicit user statement
```

---

# 100. Evidence invariant

Package content также не становится Evidence только потому, что оно установлено.

Instructions/skills являются behavioral context.

Facts о мире проходят Source/Evidence pipeline.

---

# 101. Capability truth invariant

Observation не показывает Capability как available, если Runtime adapter действительно не способен её использовать.

Installed files недостаточны.

---

# 102. Distribution invariant

Distribution является declarative composition AgentSuite capabilities.

Она не является fork Core.

---

# 103. Provider invariant

APM является provider Package Plane, а не canonical AgentSuite Runtime component.

---

# 104. Package design questions

Перед добавлением любого нового package concept необходимо ответить:

```text
Что переносится?

Откуда это пришло?

Кто это установил?

Как проверена целостность?

Как это становится Capability?

Какие permissions оно получает?

Как оно отображается в Observation?

Можно ли удалить его без потери personal memory?
```

Если последние два слоя смешаны — архитектура нарушена.

---

# 105. First implementation boundary

Первый Package Plane vertical slice НЕ требует:

```text
marketplace

publication

automatic updates

community UI

remote registry

package authoring UI

distribution editor

skill generation
```

Достаточно:

```text
Installed Component Registry

Capability Registry provenance

built-in provider

APM adapter discovery

local bundle install adapter

integrity status

package → capability mapping

Observation inspection
```

---

# 106. Recommended implementation sequence

## Phase A — Capability truth

Зафиксировать:

```text
CapabilityDescriptor
CapabilityRegistry
Provider
Status
Provenance
```

и перевести Observation на реальные descriptors.

---

## Phase B — Built-in provenance

Даже текущие:

```text
FILES
MODEL
```

должны иметь origin/provider metadata.

---

## Phase C — APM read integration

Научиться видеть:

```text
APM-installed components
versions
targets
integrity
```

без installation UI.

---

## Phase D — Local bundle installation

Через APM Adapter:

```text
inspect bundle
dry-run
verify
install
refresh capability registry
```

---

## Phase E — Human capability acquisition

`MissingCapability`:

```text
Harness
→ capability requirement
→ user understands reason
→ installation
→ capability becomes available
```

---

## Phase F — Distribution manifest

Только после доказанного package/capability boundary формализовать portable AgentSuite Distribution composition.

---

## Phase G — ecosystem

Позже:

```text
package authoring
publication
marketplaces
community distributions
```

---

# 107. Contract tests

Минимальная Package Contract Suite:

```text
P01 built-in capability discoverable

P02 installed component does not imply active capability

P03 disabled capability unavailable to Harness

P04 package provenance retained

P05 package version retained

P06 integrity unknown is not reported verified

P07 installation cannot bypass Runtime policy

P08 external MCP does not gain write authority automatically

P09 missing credential ≠ missing package

P10 missing source ≠ missing capability

P11 uninstall removes capability availability

P12 uninstall does not delete Perspective Memory

P13 package update does not rewrite old Run provenance

P14 old Run retains old provider/package refs

P15 bundle install refreshes registry

P16 failed integrity prevents trusted installation

P17 policy rejection does not expose capability

P18 Observation shows only configured capabilities

P19 Observation activity requires Runtime event

P20 package inventory survives restart

P21 Package Plane can operate without Memory Plane

P22 Memory Plane can operate without APM

P23 AgentSuite Runtime can operate without APM

P24 personal export is distinct from distribution export

P25 secret never enters package metadata

P26 capability origin can be inspected

P27 Run records only capabilities actually used

P28 package content does not become Evidence automatically

P29 package install does not become memory automatically

P30 APM adapter failure does not break Core Runtime
```

---

# 108. Definition of Done

Package & Capability architecture считается реализованной не тогда, когда AgentSuite умеет выполнить:

```text
apm install
```

а когда система способна ответить на четыре разные группы вопросов:

### Что установлено?

```text
Package Plane
```

### Что я умею?

```text
Capability Registry
```

### Что я сейчас использую?

```text
Runtime Journal
```

### Что я об этом помню?

```text
Memory Plane
```

и эти ответы не смешиваются.

---

# 109. Product meaning

С пользовательской точки зрения package architecture должна ощущаться просто:

> Если AgentSuite чего-то не умеет, я могу дать ему новую способность.

После этого способность становится видимой частью системы.

Я могу увидеть:

```text
что она делает

откуда она взялась

кто её предоставил

какая версия установлена

проверена ли она

когда агент реально ею пользуется
```

При этом мои личные истории и накопленный профессиональный опыт остаются моими.

---

# 110. Final architecture

```text
                         PRINCIPAL
                             │
                             ▼
                       ROLE / VIEW
                             │
                             ▼
                    PERSPECTIVE MEMORY
                             │
                             │
WORLD ───────────────→ CONTEXT BUILDER
                             │
                             ▼
                         RUNTIME
                     ┌───────┴────────┐
                     │                │
                  HARNESS        CAPABILITY
                     │                ▲
                     │                │
                     │         Capability Registry
                     │                ▲
                     │                │
                     │      Installed Components
                     │                ▲
                     │                │
                     │       PACKAGE PROVIDERS
                     │          ┌─────┴─────┐
                     │       Built-in      APM
                     │
                     ▼
                  EVIDENCE
                     │
                     ▼
                  SYNTHESIS
                     │
                     ▼
                   STORY
```

---

# 111. Final laws

### Package Law

> **Installed context is not execution authority.**

### Capability Law

> **Runtime uses capabilities, not packages.**

### APM Law

> **APM may deliver AgentSuite abilities, but it does not define AgentSuite Runtime semantics.**

### Memory Law

> **What the agent learned about its Principal is never bundled with what the agent knows how to do.**

### Distribution Law

> **A Suite is a portable composition of worldview, workflow and abilities — not a fork of AgentSuite Core.**

### Provenance Law

> **Every meaningful external ability must be traceable from package origin to capability use.**

### Personal State Law

> **The costume may travel. The experience of wearing it belongs to its Principal.**

