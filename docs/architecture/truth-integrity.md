# Truth Integrity — corrective slice 1

Audited baseline: `480207d`. Schema validity is not factual confirmation.

## Authority audit

| Field | Actual authority | Consumers |
|---|---|---|
| ValidationReport.valid / item.valid | Legacy structural gate: required ID, claim, sourceUri, allowed kind/confidence; report also requires nonempty items | Synthesis/Data admission; retained for compatibility |
| structurallyValid | Explicit alias of item.valid | Epistemic mapping and Human presentation |
| status | Not emitted by this Validation Harness; legacy status values grant no factual authority | Historical consumers must not interpret validated as truth |
| Evidence.confidence | Extraction-reported direct/corroborated/inferred/conflicted; no independent verification or numeric confidence | Validation classification |
| Evidence.kind | fact/interpretation/unknown from extraction; Synthesis separately uses evidence-backed/interpretation/assumption/recommendation/unknown | Presentation classification and Narrative selection |
| issues | Missing fields or invalid vocabulary; not a refutation | Structural diagnostics |
| conflicts | Unbound strings from EvidenceSet.metadata; not typed thesis-conflict edges | Narrative limitations, preserved verbatim |
| unknowns | Unbound strings from EvidenceSet.metadata | Narrative gaps/basis |

Data retains structural admission gates. Its row provenance references validation
decision IDs; this linkage does not imply that a row is confirmed true. Insights
are not read as Evidence by the Narrative Harness. No EvidenceSet is read directly.

## Validation contract

Decision fields: decisionId, evidenceId, valid, structurallyValid,
epistemicStatus, epistemicBasis, evidenceKind, confidence, claim, sourceUri, issues.
Claim/kind/confidence/sourceUri are snapshots of the referenced Evidence, not
new claims or validation inferences.

- `conflicted`: Evidence.confidence is conflicted, including structurally invalid records.
- `supported`: structurally valid, kind=fact, confidence=direct or corroborated.
  This means **reported source support**, not verified truth, corroboration
  verification, source independence or causal evidence.
- `uncertain`: all other cases. No unsupported/rejected epistemic state is
  inferred from a schema failure. Legacy decisions without explicit authority
  are uncertain to Human presentation and contribute zero positive strength.

Human mapping is centralized in `presentValidationDecision`:

- supported fact: «Указана опора на источник; достоверность не проверена»;
- conflicted: «В исходных данных отмечено расхождение»;
- uncertain/legacy: «Достоверность не установлена»;
- absent decision: no verdict.

Interpretations are labelled «Интерпретация». Only factual content with explicit
supported structural decision can use «Факт». Other content remains an unverified
assertion. No `valid: true` or legacy `status: validated` can mean «Подтверждено».

## Narrative policy

Deduplicate claim references by claim ID, Evidence weight by evidenceId across
all claims, before calculating strength. Conflicting Evidence is excluded from
positive support. Missing or ambiguous decisions grant no positive weight.

No positive source-reported support => unsupported. At least one => weak.
Moderate/strong are unreachable with current authority: source count is not
independence. Counter/unknown/assumption/gap additions cannot increase strength.
Basis retains supportingValidated (legacy name meaning reported support only),
supportingUncertain, counterEvidence, counterValidated, unresolved, conflicts,
unknowns, assumptions, gaps, authority and ceiling. This is not model confidence.

Counter membership is a relation to a decision marked conflicted, not a new
Evidence kind. Selected claims referencing it enter counterClaims. Omitted
conflicted Evidence is retained with its existing Evidence ID and
`claimDetails.refType = evidence`; selected Synthesis IDs use refType=claim.
This is limiting material, **not a declaration that it contradicts the thesis**.
Unbound conflict strings remain limitations because no canonical relevance edge
exists. Nothing infers such an edge by matching text.

## Materialization / compatibility

Narrative v2 reads SynthesisPlan, DataArtifact and optional ValidationReport;
sourceArtifactIds records exactly the artifacts present and read. Missing report
is allowed for legacy callers with unsupported strength. No transitive ancestors
are inserted. Existing persisted artifacts are not rewritten or regenerated.

Persisted claimDetails, categories, thesis, assumptions, gaps and strength basis
are the sole input to `materializeNarrativeMarkdown`. The old callback is accepted
for API compatibility but not called. Markdown escapes artifact markup and uses
no model. Older persisted Markdown is unchanged and may still contain earlier
wording; this slice fixes generation and Human decision mapping, not migration.

## Verification record

Before production changes, `node scripts/truth-integrity-audit.mjs` failed 5/5:
false confirmed DOM, duplicate weak→strong, missing C2 counter, missing vr direct
source ID, legacy structural boolean contributing strength. The same five tests
pass after correction. Further cases exercise all 12 kind/confidence pairs,
100 duplicates, missing references, ambiguity, real Synthesis→Narrative,
input immutability, omitted conflicts, JSON reconstruction and materialization.

`npm run test:truth-integrity` bundles the requested epistemics, wording,
strength, counter-evidence and lineage checks. Old Human/Narrative tests were
updated to the explicit contract, not used as proof of the new guarantees.

## Deferred

Human keyed DOM, Renderer Adapter integration, InputSurface/HumanInterrupt UI,
Hypothesis proposal generation, Decision Deck scenes, rendered chart lineage,
model observability and browser product acceptance remain separate work.
