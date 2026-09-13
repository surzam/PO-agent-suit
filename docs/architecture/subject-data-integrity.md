# R15.2.1 — Subject Data & Epistemic Continuity

## Boundary and baseline

Baseline: `5c18702 Bound model queue waits and simplify research examples`.
Truth closure already exists as `05a646c`; it was not recommitted or rewritten.
R15.2.1 is uncommitted for review. No push, no workspace migration, no packaging.

THE SAME CLAIM MUST NOT BECOME MORE CERTAIN WHEN IT MOVES TO A MORE PERSUASIVE MEDIUM.

Structural validity is not epistemic support. Source wording is not independent verification.
Arithmetic over provided cells is not a causal or statistical significance test.
Diagnostic metrics are not product metrics. Missing or invalid values are not zero.

## Actual path

Source document → deterministic CSV parser → EvidenceSet.sourceTables →
DataArtifact.sourceTables / subjectMetrics → shared metric resolver →
ChartSpec → existing Slides Harness / HTML renderer.

The Human table uses the same resolver. Neither table nor chart trusts the cached
metric `value`: both resolve its formula against the referenced cells.
The original Evidence rows remain for compatibility; subject tables are additive.

SourceTable fields: `id, sourceId, sourceUri, sourceTitle, sourceKind, columns, rows`.
Column: `id, name`. Row: `id, cells`. Cell: `id, columnId, rawValue, parsedValue?, unit?`.
IDs hash source identity, URI and table records, then column/row positions. Rebuilding
the same input preserves IDs; changed/reordered input is a new table version.

Parser: comma-delimited CSV, UTF-8 BOM, quoted fields, escaped quotes, embedded newlines,
CRLF/LF, missing cells. Limits: 1 MiB UTF-8, 10,000 data rows, 128 columns.
Malformed CSV is recorded as an unknown, not converted into invented measurements.
No formula evaluation, eval, locale-number guessing or statistical engine.
`12%` is a typed value 12 percent, not 0.12. Explicit `[unit]` headers are supported.
Unparseable/missing cells retain raw text and have no numeric value.

## Metric contract and policy

Subject metric fields: `id, name, metricClass: subject, epistemicClass: observation,
operator, formula: {operator, inputs}, cellRefs, rowRefs, sourceTableRefs, unit, value`.
Ratios also carry `displayUnit: percent` and `comparisonKey`; ratio differences carry
`metricRefs`. Here observation means a provided measurement, not independently verified reality.

Operations: direct, ratio, difference, percentage-point-difference.
Binary cell operations require matching explicit units; zero denominators, missing values,
incompatible units, nonfinite numbers and invalid references yield unavailable (`null`).
Percentage-point difference accepts percent cells or two referenced ratio metrics.

Automatic ratios are deliberately bounded to registered headers:
`purchase_completed / sessions`, `numerator / denominator`.
Two rows with the same outcome/segmentation can be compared; variant/group labels
remain in the metric names. Difference direction is second row minus first row.
No arbitrary model-generated expressions or automatic significance calculation.

Diagnostic counters remain as `diagnosticMetrics` objects with
`name, value, unit, basis, metricClass: diagnostic`.
Legacy `numericMetrics` now contains only subject values for compatible consumers.
Legacy untyped metric tuples alone cannot create a chart or Hypothesis baseline.
Hypothesis feature/template behavior was not redesigned in this slice.

ChartSpec: `id, kind: bar, title, metricRefs, rowRefs, cellRefs, sourceTableRefs,
sourceArtifactId, claimRef`. Unsupported kinds are rejected. References resolve
to DataArtifact source tables and thus to EvidenceSet source data and original source URI.
There is no fabricated Evidence item for every CSV cell. An empty evidenceIds set
is legitimate when the preserved source table has no extracted text claim.

## Checkout arithmetic

Real repository fixture `showcase/checkout-conversion/data/funnel.csv`:

| Group | Completed / sessions | Completion |
| --- | --- | --- |
| control mobile | 32731 / 51870 | 63.1019857336% |
| new mobile | 31126 / 52400 | 59.4007633588% |

Difference: −3.7012223748 percentage points, not a relative percentage change.
A separate deterministic fixture checks 420/1000, 486/1000 → 42%, 48.6%, +6.6 pp.
These are provided/demo data. They do not prove causality or significance.

## Epistemic materialization

Research verifies that an extraction quote is a substring of the supplied document.
Verified extraction uses the literal quote as the claim, not the model's stronger paraphrase.
An unverified quote cannot grant factual authority; its output is an interpretation.
Deduplication occurs after selecting canonical quote text and uses source identity + text.

Synthesis evidence-backed claims bind to source statements. They carry
`epistemic: {class, evidenceRefs, sourceClaims, causalAuthority: false,
statisticalAuthority: not-verified}`. Source claims retain source identity, URI,
confidence and epistemic status. Conflicted sources retain a visible disagreement marker.
Interpretations and proposals remain explicitly labeled, not observations.

Human View labels new extracted source claims «Утверждение источника» rather than «Факт».
Narrative claimDetails retain epistemics; markdown is a materialization of those details.
Story scenes and persisted slide models retain the epistemic claim references.
Attribution is visible in source-backed text; slide semanticRole reflects its class.
Demo marking is added to completed Human result, Narrative, Table and slide headers.

## Regression evidence

Before production edits, behavioral regressions were RED:

- no subject data still emitted four diagnostic charts;
- an attributed claim became unqualified «Конверсия выросла»;
- temporal evidence became «Обновление повысило конверсию»;
- a model-added «статистически значим» reached the actual Story scene.

All four are GREEN in `npm run test:subject-integrity`.
The expanded 10-test suite executes real ResearchService, Research, Validation,
Synthesis, Data, Narrative and Slides Harness functions, then inspects actual HTML
with JSDOM. It checks raw cells, rates, differences, chart refs, demo marking,
interpretation classification and corrupted cached values. Model/provider responses
are deterministic fixtures, not live inference. JSON rebuild stability is tested.

Older tests that accepted numbers without lineage were corrected to use actual
source-table fixtures or to assert rejection. Their old expectations were not restored.
The Runtime narrative test now expects the source quote rather than an ungrounded paraphrase.
`test:slides` checks 35 templates and six layout families structurally; it is explicitly
not a geometry or visual-acceptance test.

## Remaining review boundaries

Final commands/results (all actually run):

```text
npm run test:subject-integrity             PASS — 10 behavioral tests
npm run test:truth-integrity               PASS — 8 behavioral tests
npm run test:narrative-argument            PASS
npm run test:human-validation              PASS
npm run test:human-fact                    PASS
npm run test:human-surface-semantics        PASS
npm run test:human-view                    PASS — existing static audit only
npm run test:po-hypothesis                 PASS
npm run test:hypothesis-metrics            PASS
npm run test:data-charts                   PASS
npm run test:po-hypothesis-artifact        PASS — harness emission
npm run test:hypothesis-epistemics         PASS — unmeasured input rejected
npm run test:po-deck-charts                PASS — projection
npm run test:po-decision-deck-integration  PASS — existing metadata seam only
npm run test:generative-session-e2e        PASS
npm run test:runtime                      PASS
npm run test:integrity                    PASS
npm run test:research                     PASS
npm run test:showcase                     PASS — six deterministic scenarios
npm run test:slides                       PASS — 35 templates, DOM/structure
npm run test:reliability                  PASS
npm run test:capabilities                 PASS
npm run check                            PASS
git diff --check                         PASS
```

Research/integrity local HTTP-server attempts encountered sandbox `listen EPERM`;
their authorized reruns passed. Earlier legacy metric/chart and narrative test
expectations failed and were corrected as explained above; final results are not
a claim that the original tests were sufficient. The old Decision Deck metadata
test does not prove that actual hypothesis scenes exist.

Acceptance for this review:

```text
SUBJECT_DATA_ACCEPTANCE = PASS (bounded CSV path)
CHART_LINEAGE_ACCEPTANCE = PASS (source cells → actual HTML bars)
SOURCE_CLAIM_CONTINUITY = PASS (tested source-backed path)
EPISTEMIC_CONTINUITY = PARTIAL (arbitrary model-authored prose not closed)
R15_2_1_ACCEPTANCE = PARTIAL
FULL_R15_2_ACCEPTANCE = NOT_PROVEN
MANUAL_APPIMAGE_ACCEPTANCE = NOT_PROVEN
```

- No blanket claim that arbitrary model-authored interpretation/objective/uncertainty
  prose has been semantically verified. The deterministic protection demonstrated here
  is source-backed claim materialization, not a general natural-language truth oracle.
- Existing StoryPlan still reads Synthesis/Data directly. Reordering it to consume
  Narrative/Hypothesis is R15.2.2; no new semantic scene workflow was introduced here.
- Ready Hypothesis templates and actual Decision Deck completeness remain R15.2.2 work.
- Source metrics outside registered ratios remain direct measurements; units absent
  from the source are not invented. No locale CSV dialect inference or generic table extraction.
- Source charts use a simple honest bar renderer; label fit, pagination, semantic
  title truncation, default theme, and contrast are for R15.2.3 visual review.
- Old persisted results are not rewritten. They must not be assumed to have new lineage.
- Browser/AppImage manual acceptance, model streaming/observability, DOM identity,
  InputSurface/HumanInterrupt and full provenance navigation remain separate gates.

Do not interpret successful unit/DOM regressions as full R15.2 product acceptance.
STOP for review before R15.2.2.
