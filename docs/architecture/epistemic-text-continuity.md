# R15.2.1.1 — Epistemic Continuity for Model-Authored Text

## Baseline

HEAD: `5c18702` (Bound model queue waits and simplify research examples).
Truth Integrity baseline: `05a646c`; audited predecessor: `480207d`.
Tree was dirty: R15.2.1 subject-data implementation and tests were already
uncommitted. This corrective slice is also uncommitted. No history rewrite,
commit, push, packaging or workspace/ access was performed.

## Current R15.2.1 diff state

The cumulative diff retains CSV identity, subject metrics, diagnostic separation,
cell-backed chart/table resolution and source-attribution changes. This report
supplements `subject-data-integrity.md`; it does not retroactively turn earlier
tests into evidence for text guarantees.

## Model-authored field inventory

| Field | Producer / canonical inputs | Can introduce a claim? | Boundary after correction / risk |
| --- | --- | --- | --- |
| question, goal | Intent/Brief; user task and context | Yes, within task framing | Quoted as task, explicitly not a result; upstream intent extraction not reimplemented |
| objective | Synthesis model; Brief/Evidence/Validation | Yes | Candidate ignored; system `taskStatement(Brief)` owns output |
| audience | Synthesis model / role | Possible injected prose | Derived from canonical role, not candidate |
| keyClaims[].claim, interpretation, assumption, recommendation | Synthesis model; Evidence IDs | Yes | Existing IDs resolved; arbitrary wording rejected; closed source projection or explicit unsupported interpretation/proposal |
| uncertainties | Synthesis model; Evidence/Validation unknowns/conflicts | Yes, including omission | Candidate cannot replace canonical union; source artifact refs retained |
| structure, requestedOutputs | Synthesis model | Potential free strings | Not used as result prose by this path; not promoted to semantic authority |
| Data title | Data Harness; Synthesis objective | Inherits framing | Now inherits explicit task framing |
| Data insights / research need findings | Research/Data; evidence and research metadata | Yes | Remain interpretation unless source-backed; not used to author Narrative thesis or new Story conclusions |
| Narrative thesis | Narrative builder; Synthesis textContext | Yes | Explicit `thesisKind: task-framing`; no freely authored result accepted |
| Narrative claims, assumptions, gaps, markdown | Structured argument + Validation + Data | Yes | Canonical source wording, closed unsupported placeholders, canonical limitations, cell-resolved observations |
| Story topic, situation, centralThesis, scene title/thesis/evidence, unknowns, nextStep | Existing deterministic Story planner; Synthesis + Data | Yes | Same closed projection; validator rebuilds and compares result wording and scenes |
| Presentation title/body/footer | Existing Slides Harness / Story renderer | Yes | No model call; preserves Story wording; system-owned demo flag and accessible limitations |
| Hypothesis prose | Existing deterministic projection; Narrative/Data | Yes | Inherits safe framing; template hypothesis quality deliberately not addressed |
| Legacy modelPlan, motto, speakerScript, interpretation, legacy narrativeMarkdown | server legacy renderResearchGeneration / direct research render | Yes | NOT closed by this slice; separate legacy path remains a limitation |

Canonical Runtime Research uses `researchOnly:true`, so it does not invoke the
legacy `renderResearchGeneration` model author. The latter is still exported and
connected to the legacy research service. This report does not claim repository-wide
free-text safety or safe historical artifacts.

## RED reproductions

Before production edits, `node scripts/epistemic-text-continuity-audit.mjs`
ran the real Synthesis Harness → Narrative Harness → Story builder and failed 4/4:

1. Objective accepted `Новая версия ухудшила checkout conversion.` unchanged.
2. Interpretation rendered `Новый checkout снизил conversion на 3.701 п.п.`
   despite only temporal source support.
3. Story rendered `Разница статистически значима.` without statistical authority.
4. Story unknowns became `[]`, losing the canonical group-comparability limitation.

All four now pass. Additional tests were added after the fix; no claim is made
that those additional tests were observed RED beforehand.

## Statement grounding contract

Existing Synthesis claims gain a `statement` projection:

```text
id, statementKind, claimRefs, evidenceRefs, epistemicClass,
attributionMode, text, interpretationStrength,
validation { accepted, reason, policyVersion }
```

`epistemic` contains resolved source claims with evidenceId, sourceId/sourceUri,
statement, quoteVerified, confidence, epistemicStatus and epistemicClass.
Classes are derived from referenced records; model-supplied classes are dropped.
Invalid Evidence IDs fail the existing Synthesis path.

Synthesis also persists:

```text
textContext { policyVersion, task, limitations }
textValidation { objective, uncertainties }
```

Task and limitation IDs are deterministic hashes. Claim statement ID is derived
from claim ID. Numerical statement ID is derived from metric ID.
No new Runtime type or independent evidence store was introduced.

## Epistemic continuity policy

This is a closed renderer, not an NLI engine. A valid reference alone cannot make
a paraphrase true. Candidate text different from the canonical projection is not
accepted; the materialization uses referenced source wording or an explicit
unsupported placeholder. No lexical blacklist determines correctness. No extra
LLM grading call or unbounded retry was introduced.

## Attribution handling

Source claims are rendered as `Источник сообщает: ...`; conflicted support adds
`Есть расхождения`. Non-factual/unverified interpretations cannot become quoted
source facts. Evidence/source references remain available in claim metadata.

## Causality handling

Numerical differences are observations, not interventions' effects. Numerical
statements set `causalAuthority:false` and retain the authority limitation.
Source causal language can survive only inside explicit source attribution;
it never becomes system-verified causality.

## Statistical-significance handling

`statisticalAuthority: not-verified`. Local arithmetic cannot manufacture a test,
p-value, confidence interval or significant result. Literal source reports can
be quoted with attribution. No statistics engine was added.

## Uncertainty preservation

Evidence metadata and Validation unknowns/conflicts form a deduplicated canonical
union, with artifact refs and field identity. Model uncertainty strings cannot
erase or replace it. Narrative stores limitations and gaps; Story stores the full
limitations list independent of scene limits. Actual HTML has an expandable
`Ограничения исследования` block retaining this list.

## Objective semantics

`Задача исследования (не вывод): «<Brief question/goal>»`.
Even a leading user question is not materialized as evidence. Missing old task
context fails closed: `Исследовательская задача не сохранена.`

## Interpretation semantics

Unverified candidate interpretation is replaced by an explicit statement that
an independent conclusion has not been established, plus its source supports.
`interpretationStrength: unsupported`; rhetoric cannot bypass Narrative's
deterministic ceiling. This deliberately loses expressive paraphrases rather
than pretending to prove their entailment. A rich PO interpretation is NOT claimed.

## Numeric grounding

`metricStatement` calls the existing cell resolver. Stored metric value is not
trusted. Numerical statement fields include metricRefs, cellRefs, rowRefs,
sourceArtifactIds, semanticValue, semanticUnit, display, causalAuthority and
statisticalAuthority. `validateMetricWording` accepts only the resolved projection;
unknown IDs and changed/invented numbers are rejected.

## Rounding policy

Canonical value stays unchanged; display supports explicitly 1 or 3 decimals.
Ratio → percent multiplication and decimal rounding are deterministic. Other
precision settings fail. No text-to-number inference is used.

## Demo marker

Narrative and Story carry `Учебный пример` / demo classification. Slides Harness
derives the demo flag from DataArtifact, not model scene flags. Actual HTML is
tested for the marker. Existing subject-table marker remains unchanged.

## Checkout golden result

Real fixture cells yield displayed completion rates **63.102%** and **59.401%**,
with new-mobile minus control **−3.701 percentage points**. Canonical unrounded
values are preserved. At one decimal the difference is −3.7 pp. Output describes
the group difference in provided data and says causality is not established;
no statistical significance is asserted by the calculation.

## Tests

Actual successful commands (after corrections):

- `npm run test:epistemic-text-continuity` — 8 behavioral tests.
- `npm run test:subject-integrity` — 10 tests, including real Harness → HTML/JSDOM.
- `npm run test:truth-integrity` — 8 tests.
- `npm run test:narrative-argument`.
- `npm run test:research`.
- `npm run test:showcase` — 6 scenarios.
- `npm run test:generative-session-e2e`.
- `npm run test:hypothesis-metrics`.
- `npm run test:data-charts`.
- `npm run test:po-hypothesis`.
- `npm run test:slides` — 35 templates, DOM not visual geometry.
- `npm run test:runtime`.
- `npm run test:integrity`.
- `npm run check`.
- `git diff --check`.

Research/integrity initially encountered sandbox `listen EPERM`; successful
reruns allowed local HTTP. Older Narrative/Truth/Showcase assertions initially
failed because they expected ungrounded objective/assumption prose or unquoted
limitations. Fixtures/assertions now distinguish canonical limitations from
model candidate strings; reference, strength and immutability checks remain.

## Changed files

Micro-slice: core/epistemic-text.mjs, core/claim-epistemics.mjs,
core/narrative-argument.mjs, harnesses/synthesis.mjs, harnesses/narrative.mjs,
harnesses/presentation-story-planner.mjs, harnesses/slides.mjs, server.mjs,
package.json, scripts/epistemic-text-continuity-audit.mjs,
scripts/subject-integrity-audit.mjs, scripts/narrative-argument-audit.mjs,
scripts/truth-integrity-audit.mjs, scripts/showcase-audit.mjs and this report.
Other dirty files belong to the preceding cumulative R15.2.1 slice.

## Known limitations

- Legacy model-authored render path and historical artifacts are not migrated.
- Free paraphrase entailment is not solved; unsupported wording is suppressed.
- Narrative thesis remains task-framing, not a newly authored interpretation.
- Story still reads Synthesis/Data, not Narrative/Hypothesis; no R15.2.2 work.
- Ready hypothesis/template issue, real Decision Deck sequencing remain.
- Slide truncation/layout, browser/Electron visual acceptance, model streaming,
  Human DOM identity, InputSurface/interrupt interactions remain future gates.
- Graphify inventory was stale for these modules; direct code audit was used.
  PO/quality skills guided separation of observation, interpretation and proposal.

## Git status / acceptance

Changes remain uncommitted for review; no push; workspace/ untouched.
Canonical R15.2.1 Runtime consumers have passed the focused guarantees below.
Full product-wide R15.2.1 acceptance stays PARTIAL because legacy textual exports
are not covered; the report intentionally does not broaden PASS to those paths.

```text
MODEL_TEXT_EPISTEMIC_ACCEPTANCE = PASS (canonical Runtime path)
ATTRIBUTION_CONTINUITY = PASS (canonical Runtime path)
OBSERVATION_CONTINUITY = PASS
INTERPRETATION_CONTINUITY = PASS (closed conservative projection)
UNCERTAINTY_CONTINUITY = PASS
CAUSALITY_BOUNDARY = PASS (canonical Runtime path)
STATISTICAL_SIGNIFICANCE_BOUNDARY = PASS (canonical Runtime path)
NUMERIC_TEXT_GROUNDING = PASS (resolved numerical observations)
DEMO_MARKER_CONTINUITY = PASS
R15_2_1_ACCEPTANCE = PARTIAL (legacy exports not closed)
PRODUCT_DEFECT_REMAINING = YES
```

STOP. No R15.2.2, package, related work or experiment execution.
