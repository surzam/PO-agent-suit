# Current system audit

## Product boundary

The repository currently implements a local-first PO Agent Suite application. The main user path is a browser UI served by a Node HTTP server; Electron is an optional desktop shell around the same server.

The current product promise is:

```text
question → research → Evidence → Data → Narrative → Slides → PPTX
```

## Runtime entrypoints

- `server.mjs` is the current HTTP entrypoint and contains most orchestration and rendering logic.
- `electron/main.mjs` starts `server.mjs` on an ephemeral localhost port and opens the browser UI.
- `launch.sh` installs/starts the Electron shell and registers the Linux desktop launcher.
- `public/index.html` is the chat-first client. It starts generations through the HTTP API and opens artifacts in new tabs.
- `cli/suite.mjs` is the headless client for the AgentSuite Runtime. It can run `brief`, `research` and `research-synthesis` workflows.

## Current legacy UI execution flow

```text
public/index.html
  → POST /api/brief/turn or POST /api/generations
  → research/service.mjs
  → research/sources.mjs
  → Evidence + DataArtifact
  → server.mjs renderResearchGeneration()
  → Narrative + Slides + legacy PPTX
  → research/storage.mjs
  → /api/artifact/:generationId/:kind
```

The research service emits progress stages through an in-process subscription/SSE mechanism. These stages are useful operationally, but they are currently job states rather than a general persisted event model.

## R6 headless execution flow

```text
cli/suite.mjs
  → core/runtime.mjs
  → core/registry.mjs
  → Brief / Research / Validation / Synthesis Harness
  → persistent Run events and derived artifacts
```

The Synthesis Harness consumes the persisted in-memory outputs of Brief, EvidenceSet and ValidationReport. It calls the existing exported `modelJson` provider boundary and does not invoke the legacy renderer.

## Implemented capabilities

- llama.cpp/OpenAI-compatible model boundary;
- random and user-directed research modes;
- local file search with path and format restrictions;
- optional DuckDuckGo HTML research with SSRF and response-size protections;
- Evidence IDs, source metadata, confidence and unknowns;
- generated Data, CSV, Narrative, HTML Slides and PPTX;
- immutable generation folders and restart recovery for exports;
- template library with 34 indexed templates plus the codebase-to-course entry;
- variation by generation ID, angle, temperature and style history;
- API, research and slide audits.

## Current architectural tensions

1. `server.mjs` owns HTTP, model calls, fallback generation, style selection, rendering and legacy compatibility.
2. `research/service.mjs` is a useful domain service but its job model is not yet the general `Run` model.
3. Data, Narrative and Slides already share a generation ID, but they are produced through a presentation-oriented pipeline rather than a generic artifact graph.
4. The persisted export manifest is an artifact index, not yet an event journal.
5. Roles and viewpoints are present in prompts and product lore, but are not first-class runtime objects.
6. The existing desktop shell is convenient, but the product contract does not require Electron.

## Product boundaries

`Indexator` is explicitly outside this product. Backlog indexing and prioritization are not current Suite responsibilities.

The configured Jira/Trello/CRM connectors are product intent, not current Phase 1 implementations. Current source implementations are local files and optional web search.
