# R15.2.1.2 — Research Relevance & Result Materialization Closure

Review checkpoint, 2026-09-13. Product acceptance is not established.

## Baseline

HEAD: `5c18702` (Bound model queue waits and simplify research examples).
The worktree already contained uncommitted R15.2.1 / R15.2.1.1 changes.
They were preserved. No commit, push, history rewrite, or workspace/ edits.
The user's screenshots are the manual failure evidence; VSync messages do
not explain content coercion, source selection, or overlapping HTML text.

## RED reproductions

Before production changes, `node scripts/result-materialization-audit.mjs`
failed all six initial cases. After changes, the expanded suite passes 11/11.

| Case | Actual boundary tested | Result |
| --- | --- | --- |
| Structured description lost | canonicalLimitations | RED → GREEN |
| Warning substituted for content | bindClaimEpistemics statement projection | RED → GREEN |
| Warning used in slide regions | Story planner → slidesHtml → DOM | RED → GREEN |
| Internal files selected | createLocalSource search | RED → GREEN |
| Final question echo | actual Story closing scene / closure | RED → GREEN |
| Long Russian text lost | Story pagination → actual HTML DOM | RED → GREEN |

The last case proves text retention and short titles, **not pixel geometry**.
Additional tests cover limitation shapes, real HumanView surface HTML,
out-of-scope Evidence rejection, demo pack isolation, and run-owned attachments.

## Structured limitation fix

Shared `presentLimitation` explicitly handles strings; arrays; objects with
text, message, description, reason, limitation, unknown, or gap; and nested
limitations, unknowns, gaps, or items arrays. Null/missing values produce no
content. Unknown objects produce a safe human fallback, never raw JSON.
Recursion is bounded. Research no longer calls String on conflicts/unknowns
before preserving their descriptions. Canonical text and Human surfaces use
the same presenter.

## Content vs status

Before: a candidate interpretation produced the long warning beginning
“Непроверенная интерпретация: самостоятельный вывод не установлен…”.

After, the tested canonical source statement is preserved as:

- text: “Из перенесённых задач часть зависела от интеграционной платформы.”
- statusLabel: “Утверждение источника”
- attributionLabel: “Источник сообщает”
- limitation: “Предложенная интерпретация не установлена.”
- provenanceRefs: original source/Evidence references.

This does not restore untrusted model rhetoric. Only canonical source-claim
content is projected. A reference or quote is not proof of semantic support.
Narrative retains visible attribution; source claims are not promoted to facts.

## Source contamination root cause

The server constructed the local research source over configured repository
roots (default `.`). Its substring search admitted implementation files.
Research also used the fallback query `PO Agent Suite product context`, and
the random path appended `PO Agent Suite Data Narrative Slides Evidence`.
Fallback extraction could then turn literal source snippets into attributed
Evidence. This explains imports/templates without assuming a VSync problem.

The server root is now system-internal, excluded from ordinary research
searches. Both artificial query additions were removed. Explicit local
providers/attachments remain possible.

## Source scope contract

Local results distinguish system-internal, explicit-local-context,
user-attached and training-fixture scope. Gather records admitted source
identities in EvidenceSet. Synthesis rejects a foreign source ID before
calling the model when that manifest exists.

`context.add` now tags documents with the originating Run. Search allows the
current Run and its immediate parent. Unrelated Runs cannot retrieve those
attachments. Arbitrary-depth ancestry is not implemented/tested here.
Legacy artifacts without manifests remain compatible; they are not evidence
that historical source scoping has been verified.

## Demo/training isolation

Ordinary local search excludes training documents. Explicit demo search
selects only its named pack. Source cards say “Учебный источник”; Story and
HTML retain the system-owned “Учебный пример” marker.
The isolation tests exercise the actual local adapter, not an LLM relevance
classifier. Third-party adapters must respect the source contract; this
checkpoint does not certify arbitrary adapters that ignore search options.

## Result closure

The pure result projection contains currentConclusion, limitations,
missingInformation, nextAction, statements and numericBindings.
For comparison data, the conclusion uses the canonical metric statement.
Without a usable comparison, it reports insufficient information and asks
for the recorded missing information. For example, the continuity fixture
asks to obtain information about whether the cohorts are comparable.

The final scene no longer copies objective as its result. This blocks the
observed direct-echo path, not arbitrary semantic paraphrases. No intervention
or causal result is invented. Generic gaps still yield generic requests;
this is not a ready PO hypothesis or a universal question-answering validator.

## Story

Story retains the question, source content, limitations and closure. Scene
text is projected from canonical sources, not the warning string. Narrative
sections now have separate concise titles, substantive text and statement
metadata. Story validation also compares resultClosure against the canonical
projection.

## Human View

Human surfaces share explicit limitation/statement presentation. The tested
HTML preserves substantive content, the missing baseline and demo marker.
Source cards can show origin, available scope/excerpt and session-linked
claims; missing source names are not invented. This is not a browser test of
every application result route or global context-discovery panel.

## Slides

Scenes have fixed concise titles (e.g. “Сведения из источника”), body text,
one status slot in the header, optional limitation and provenance footer.
The footer does not repeat the body. Long prose is split at whitespace with
references retained; the former maximum scene cap no longer discards pages.
The filler minimum-count roadmap was removed. Styles are retained.

## Layout

Semantic structure and pagination precede the new safe content-region CSS.
DOM tests retain the last sentence of long Russian input without title
ellipsis. Browser bootstrap reported no browser; its browser list was empty.
No before/after automated screenshots or font-ready geometry measurements
were possible. Scrollable overflow is a fallback, not proof that exported
slides fit. Chart-plus-body layouts and all themes still need visual review.

## Checkout golden result

Existing cell-backed regressions pass: control 63.102%, new mobile 59.401%,
difference −3.701 percentage points. Canonical cell values are unchanged;
only deterministic display rounding is used. Demo/provenance and the lack
of established causality/significance remain present. No diagnostic counter
is substituted for a product metric.

## Platform-team contamination result

Actual system-internal local search returns no results without explicit
permission. A selected training pack is isolated from other packs. A
run-owned attachment is absent from unrelated search and available to an
immediate continuation. This proves mechanical source boundaries, not
semantic topical relevance or semantic entailment.

## Tests

Final successful commands (each exit code checked):

- npm run test:result-materialization — 11/11
- npm run test:subject-integrity — 10/10
- npm run test:truth-integrity — 8/8
- npm run test:epistemic-text-continuity — 8/8
- npm run test:showcase — six scenarios
- npm run test:generative-session-e2e
- npm run test:runtime
- npm run test:human-view
- npm run test:human-surface-semantics
- npm run test:narrative-argument
- npm run test:slides — DOM, not geometry
- npm run test:data-charts
- npm run test:research
- npm run test:integrity
- npm run test:research-extend
- npm run test:unified-capabilities
- npm run check
- git diff --check

Research/Integrity initially failed with sandbox listen EPERM, then passed
with permission to open local HTTP servers. Earlier attribution assertions
were corrected to inspect the new status slot and retained substantive text;
the Narrative attribution regression itself was fixed in production.
Showcase's arbitrary 8–12 scene assertion was replaced with content/closure
checks because lossless pagination may produce 13 scenes.

## Browser status

NOT_PROVEN. No available browser. Manual AppImage acceptance is PENDING.

## Review build

`npm run package -- --config.directories.output=dist/r15.2.1.2` — exit 0.
Separate output directory preserves the previous top-level AppImage.

Path: `/media/surzam/DATA/prez/dist/r15.2.1.2/PO Agent Suite-0.1.0.AppImage`

SHA-256: `2032622a6e140abc52353dba227fbbb95cbd685ae937b0ce62be1460603a4a32`

This build is for review, not a manual acceptance result.

## Changed files

New in this corrective slice: core/result-closure.mjs,
public/ui/statement-presentation.js, scripts/result-materialization-audit.mjs,
and this report.

Modified within the cumulative dirty tree: core/claim-epistemics.mjs,
core/epistemic-text.mjs, core/narrative-argument.mjs,
core/runtime-capability-dispatch.mjs, harnesses/research.mjs,
harnesses/synthesis.mjs, harnesses/narrative.mjs,
harnesses/presentation-story-planner.mjs, research/service.mjs,
research/sources.mjs, public/ui/human-view.js, server.mjs, package.json,
scripts/subject-integrity-audit.mjs,
scripts/epistemic-text-continuity-audit.mjs, scripts/showcase-audit.mjs.

## Known limitations and acceptance

This slice does not prove source-to-claim semantic support. Global operator
source inventories, legacy non-manifest artifacts, arbitrary-depth context
inheritance, and every legacy renderer have not been certified. Screenshots
and manual product usability remain unproven. Do not treat automated PASS
as a full product-quality research acceptance.

STRUCTURED_LIMITATION_ACCEPTANCE = PASS (tested current shapes)
CONTENT_STATUS_ACCEPTANCE = PASS (tested canonical materializers)
SOURCE_SCOPE_ACCEPTANCE = PARTIAL (current local/manifest path tested)
DEMO_ISOLATION_ACCEPTANCE = PASS (local adapter and selected pack)
RESULT_CLOSURE_ACCEPTANCE = PARTIAL (observed echo blocked; generic gaps remain)
STORY_ACCEPTANCE = PASS (automated canonical path)
SLIDE_CONTENT_ACCEPTANCE = PASS (DOM/content)
SLIDE_LAYOUT_ACCEPTANCE = NOT_PROVEN
TRUTH_INTEGRITY_REGRESSION = PASS
BROWSER_PRODUCT_ACCEPTANCE = NOT_PROVEN
MANUAL_APPIMAGE_ACCEPTANCE = PENDING
R15_2_1_ACCEPTANCE = PARTIAL

## Git status

Changes remain uncommitted, including the previous slices. No push or
workspace/ changes. R15.2.2 and R15.3.0 were not started.
