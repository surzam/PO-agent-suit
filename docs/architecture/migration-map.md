# Migration map

| Existing component | Decision | Target boundary |
|---|---|---|
| `research/service.mjs` | ADAPT | Research Harness and event producers |
| `research/sources.mjs` | KEEP, then ADAPT | Source capabilities for Research Harness |
| `research/storage.mjs` | ADAPT | Artifact Store; retain generation export compatibility |
| `server.mjs` model calls | EXTRACT gradually | Inference provider boundary |
| `server.mjs` fallback | ADAPT | Demo/local harness fallback policy |
| `server.mjs` Data generation | ADAPT | Data Harness |
| `server.mjs` Narrative generation | ADAPT | Narrative Harness |
| `server.mjs` Slides/PPTX rendering | ADAPT | Slides Harness and presentation exporter |
| `public/index.html` | ADAPT | Browser client of Runtime API |
| `electron/main.mjs` | KEEP as optional adapter | Desktop client; not a product boundary |
| `product-lore.md` and `skills/` | KEEP, then formalize | Role/worldview and harness policy inputs |
| `template-library/` | KEEP | Slides capability package |
| `Indexator` | KEEP OUTSIDE | Separate product and future context provider |

## R5 boundary result

R4's transitional `runtime.research()` bridge is replaced by generic `runtime.run({ stages })`. The CLI registers `brief`, `research` and `validation` Harnesses, then describes workflows as data. The core has no Research- or Validation-specific dispatch path.

The legacy Research implementation is still called by `harnesses/research.mjs`; it remains unaware of `Run`, `Event` and the new runtime journal. Validation is a thin new Harness based on the existing Research rules: Evidence must exist, retain IDs, claims, source URIs, recognized confidence and recognized kind.

## R6 boundary result

The existing semantic work was found in `server.mjs`: `renderResearchGeneration()` asks the existing provider for a StoryPlan, normalizes scene claims, and filters scene `evidenceIds` against Research Evidence. R6 adds a separate Synthesis Harness that uses the same provider boundary to create a general `SynthesisPlan`; StoryPlan remains a later presentation specialization.

`ValidationReport` and `SynthesisPlan` are new immutable runtime artifacts with explicit upstream IDs. Neither Harness mutates the earlier EvidenceSet or ValidationReport.

## R7 boundary result

The legacy Narrative entrypoint is `narrativeMarkdown(plan, research, meta)` in `server.mjs`. R7 exports that existing implementation and adds `harnesses/narrative.mjs` as a thin adapter from `SynthesisPlan` to the internal legacy StoryPlan shape. Narrative now consumes the semantic plan and creates a new `Narrative` artifact with lineage to the plan.

No standalone legacy Narrative LLM call or independent thesis selection was found. The adapter supplies wording, transitions and section structure from the plan; it does not mutate upstream artifacts.

## R8 boundary result

The actual Data capability is `dataFromEvidence(brief, research)` in `research/service.mjs`; `dataHtml()` only renders the resulting table. R8 exports the existing calculation function and wraps it in `harnesses/data.mjs`. The adapter selects fact Evidence referenced by SynthesisPlan, preserving `Evidence ID` rows and adding Claim/Evidence row provenance.

`research-analysis` materializes Narrative and DataArtifact as siblings from SynthesisPlan. Data does not consume Narrative, and Narrative does not consume Data.

## Delivery order

1. Prove generic Run/Event/Artifact persistence with a headless Brief Harness.
2. Add CLI inspection and stable run storage.
3. Register a generic Harness Registry and dispatch Research through the legacy adapter.
4. Add Validation as a second Harness and preserve Evidence lineage.
6. Adapt existing Slides renderer behind the same harness contract; Narrative and Data are proven by R7/R8.
7. Reconnect the browser UI to the same Runtime API.
8. Keep Electron optional and add more roles/workflows only after the vertical slice is stable.
## R9 — Slides Harness

| Component | Decision | Reason |
|---|---|---|
| Legacy `slidesHtml` | KEEP | Existing renderer already accepts StoryPlan + structured data. |
| StoryPlan adapter | EXTRACT | Shared thin adapter translates SynthesisPlan without moving AgentSuite types into legacy code. |
| Slides execution | ADAPT | `Slides Harness` runs through Registry/Dispatch and returns `Presentation`. |
| Presentation lineage | KEEP/ADAPT | Actual sibling inputs are SynthesisPlan and DataArtifact; Narrative is not falsely declared as a dependency. |
| PPTX/PDF export | KEEP separate | Export is not made the foundational Presentation artifact in R9. |

R9 proves that an output artifact can be materialized from a semantic plan and another derived artifact without capability-specific Core logic. The full path is `Brief → EvidenceSet → ValidationReport → SynthesisPlan → {Narrative, DataArtifact, Presentation}`.

## R10 — explicit fork/rerun

| Component | Decision | Reason |
|---|---|---|
| Cross-run storage | REUSE by reference | Original artifact identity and file ownership remain intact. |
| Fork metadata | ADAPT | New Run records `parentRunId` and `reusedArtifactIds`. |
| Input resolution | EXTRACT | Runtime derives required artifact types from registered Harness `inputs`. |
| Rerun execution | KEEP generic | `fork()` dispatches the selected suffix through the same Registry. |
| Cache/invalidation | DEFER | R10 is explicit reuse, not automatic freshness policy. |

R10 proves Slides-only and Narrative-only reruns without re-executing upstream capabilities. Reused artifacts generate `ArtifactReused` facts in the child timeline; newly generated artifacts belong to the child Run. The original Run remains unchanged.

## R11 — Role / Worldview fork

| Component | Decision | Reason |
|---|---|---|
| Role definitions | EXTRACT | `roles/registry.mjs` provides a small contract for priorities, questions and criteria. |
| Role resolution | ADAPT | Runtime passes resolved role context generically; Core does not branch on role IDs. |
| Synthesis | ADAPT | The existing provider boundary receives worldview context and stores role provenance. |
| Evidence/Validation | KEEP neutral | The same factual state is reusable across professional perspectives. |
| Downstream outputs | REGENERATE | Narrative/Data/Presentation depend on the new role-dependent SynthesisPlan. |

R11 proves a Product Owner → CTO fork: Brief, EvidenceSet and ValidationReport keep their original identity; SynthesisPlan and downstream outputs are new. The role changes interpretation and decision framing, not factual truth.

## R12 — `suite serve` and Browser console

| Component | Decision | Reason |
|---|---|---|
| Existing `server.mjs` legacy API | KEEP | Existing UI/API regression behavior remains intact. |
| AgentSuite HTTP | EXTRACT | `api/agentsuite-api.mjs` adapts HTTP to Runtime methods. |
| Workflow assembly | EXTRACT | `app/execution.mjs` shares Harness wiring for service clients. |
| Browser | ADD thin client | `public/agentsuite.html` renders persisted Runs, Events, Artifacts, Roles and lineage. |
| Live updates | DEFER | Refresh/polling is enough for the first remote console. |

R12 adds `suite serve`, default loopback binding, generic Run/Artifact endpoints and browser Role forks. Runtime semantics are not duplicated in the server or browser; legacy routes remain compatible.
