# AgentSuite target model

## Core definitions

| Concept | Meaning |
|---|---|
| Intent | The user's requested outcome. |
| Role | A worldview: questions, priorities, language and decision criteria. |
| Harness | A replaceable capability module with inputs, policies, events and artifacts. |
| Event | A persisted fact that happened during a Run. |
| Artifact | A durable result with provenance and a stable identity. |
| Workflow | A declarative composition of roles, harnesses and event dependencies. |
| Run | One execution of a Workflow, including events, artifacts and configuration. |

## Target flow

```text
User Intent
    ↓
Suite Runtime
    ├── Role / Worldview
    ├── Workflow
    ├── Context
    ├── Event Journal
    └── Artifact Store
          ↓
    Research Harness
          ↓
    Validation Harness
          ↓
    SynthesisPlan
       ├── Data Harness
       ├── Narrative Harness
       └── Slides Harness
          ↓
    CLI / Browser / Automation clients
```

## Event vocabulary

The first shared vocabulary is:

```text
RunRequested
BriefCreated
ResearchRequested
SourceDiscovered
EvidenceCollected
EvidenceValidated
SynthesisPlanCreated
ArtifactCreated
RunCompleted
RunFailed
```

The first implementation uses an in-process dispatcher and an append-only JSONL journal. A distributed broker is deliberately out of scope until local semantics are proven.

## Role and Harness composition

Roles and capabilities are orthogonal:

```text
Product Owner + Research + Validation + Narrative + Slides
CTO           + Research + Architecture + Slides
Investor      + Data + Validation + Narrative
```

`StoryPlan` remains a PO/presentation specialization. The general runtime should use a broader `SynthesisPlan` or permit workflows to produce other artifact models directly.

## Non-negotiable properties

- Runtime works without a browser.
- Runtime does not depend on a specific LLM vendor.
- Harnesses communicate through contracts and events, not UI internals.
- Artifacts remain readable after the process exits.
- A Run can be inspected from CLI and browser using the same persisted state.
- Evidence provenance and unknowns survive synthesis.

## R5 execution invariant

The core executes workflow stages through a Harness Registry and one generic dispatch operation. Core does not contain capability-specific execution methods or branches for Research, Validation, Data or Slides.

Harnesses return a small result contract:

```js
{
  artifacts: [{ type, data }],
  events: [{ type, payload }]
}
```

The Runtime assigns artifact IDs, persists artifacts, appends events, correlates `runId`, and owns Run status. A new in-process Harness can be registered without changing `core/runtime.mjs`.

Validation creates a new `ValidationReport` that references an immutable `EvidenceSet`; it does not rewrite Research history.

## R6 synthesis boundary

`SynthesisPlan` is the semantic contract between validated research and future output-producing Harnesses. It references `Brief`, `EvidenceSet` and `ValidationReport`, records objective/audience, and stores key claims with explicit Evidence IDs or an explicit non-factual kind such as `interpretation`, `assumption`, `recommendation` or `unknown`.

Output-producing Harnesses SHOULD consume an explicit synthesis artifact rather than independently reinterpret raw research state. Every derived Artifact SHOULD preserve explicit lineage to the upstream Artifacts from which it was produced.

Synthesis is intentionally sequential in R6. Fan-out to Data, Narrative and Slides is prepared by `requestedOutputs` and `structure`, but is not implemented yet.

## R7 narrative boundary

`Narrative` is the first downstream consumer of `SynthesisPlan`. The Narrative Harness adapts the plan to the legacy StoryPlan shape and invokes the existing `narrativeMarkdown()` implementation. It does not run a second synthesis step or choose a new central thesis.

The resulting artifact references `SynthesisPlan` through `sourceArtifactIds` and may read EvidenceSet read-only for exact supporting wording. The semantic plan remains unchanged.

## R8 semantic fan-out

`Narrative` and `DataArtifact` are sibling consumers of `SynthesisPlan`. The workflow may execute them sequentially, but neither output depends on the other. `DataArtifact` preserves the legacy table shape and adds row-level Claim/Evidence provenance; it is not a new BI subsystem.

## R9 presentation boundary

The legacy Slides path is `renderResearchGeneration()` → `slidesHtml(plan, meta, data)`. Its actual inputs are the legacy StoryPlan shape and structured data; it does not consume the Narrative artifact. R9 therefore uses the sibling-renderer model:

```text
SynthesisPlan
  ├── Narrative
  ├── DataArtifact
  └── Presentation
```

The Slides Harness adapts `SynthesisPlan` to the legacy StoryPlan shape, passes the persisted `DataArtifact` to the existing HTML renderer, and creates an immutable `Presentation` whose `sourceArtifactIds` are `[SynthesisPlan, DataArtifact]`. HTML is retained as presentation model output; binary export remains a separate legacy concern. Core has no Slides-specific dispatch logic.

Derived artifacts describe actual derivation. If a future renderer consumes Narrative, that dependency must be added explicitly rather than inferred from the workflow.

## R10 explicit fork and reuse

`Run` records one execution history, while a later Run may explicitly reference immutable Artifacts from an earlier Run. The runtime uses a minimal cross-run reference model: source artifact files remain under the original `runs/<source-run>/artifacts` directory, and the forked Run records the original artifact ID, `ownerRunId`, `parentRunId` and an `ArtifactReused` event. No content cache or copy is introduced.

The generic operation is `runtime.fork({ sourceRunId, fromStage, stages })`. Required input types are taken from registered Harness metadata for the selected downstream stages. Missing inputs fail explicitly; Core does not know which capability is being rerun. A new output is persisted under the new Run and receives the new Run ownership, while its lineage may point to source artifacts owned by the parent Run.

The CLI exposes this as:

```bash
suite rerun <run-id> --from slides
```

Reuse is visible in inspection and does not append events to the original Run. This is explicit rerun/fork, not automatic caching, freshness detection or invalidation.

## R11 role/worldview fork

Roles are explicit semantic inputs to Synthesis, not prompt labels. The Role Registry currently provides `product-owner` and `cto` definitions with priorities, questions and decision criteria. Core passes resolved role context through generic HarnessContext; it contains no role-specific branches.

Research and factual Validation remain worldview-neutral. A Role fork reuses `Brief`, `EvidenceSet` and `ValidationReport`, then creates a new role-dependent `SynthesisPlan` and regenerates downstream outputs. Every plan records `roleId` and compact worldview provenance. Role may change priorities, framing and recommendations, but must not change factual Evidence IDs or values.

`Brief` currently preserves the original Intent plus neutral workflow metadata, so it is reusable for the R11 proof. If future Brief generation adds role framing, that concern should be separated before making Brief non-reusable.

## R12 Browser remote console

CLI and Browser are peer clients of the same Runtime. `api/agentsuite-api.mjs` is a transport adapter: it exposes Runs, Artifacts, Roles, Workflows and generic Run/fork operations, but does not execute Research, Synthesis or Slides itself. `app/execution.mjs` assembles the existing Registry and Harnesses for both HTTP commands and CLI-compatible execution.

`suite serve` defaults to `127.0.0.1:8080`; an explicit `--host 0.0.0.0` prints a local-network exposure warning. The browser console derives its Run detail, event timeline, artifact list and Role worldview from API responses. A Role switch creates a new forked Run and never mutates the displayed Run. Polling/refresh is sufficient in R12; no frontend state machine is authoritative.
