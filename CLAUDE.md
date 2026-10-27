# Physics Atlas (sophie_scicom) — Development Plan

> Single source of truth for the agent workflow. The agents read this file on
> every run as project context. Keep it lean.

## Project Vision

An accessible map of physics **concepts**, organised as a typed graph: every
concept links to what it stands on and what it leads to, by relations that read
as sentences. Zooming reveals detail (importance), circle size shows generality,
and any concept can be picked as a goal to get its path of strict prerequisites.
Sophie maintains the content; the community proposes additions and edits as
pull requests (the Community tab). The older topic layer (topics.json, topic map,
topic pages, "Learning goal" view) was retired — Decision 26.

**Type:** SPA on a Cloudflare Worker (static assets + a small /api for sign-in and proposals)
**Stack:** React 19 + TypeScript + Vite, Cytoscape.js for the graph
**Audience:** Self-learners and domain experts; the content author is Sophie (non-dev)

Design decisions + deliberately open alternatives:
`docs/DESIGN-DECISIONS.md` (don't delete — every option stays as a path).

## Language

Everything in this repo is written in **English** — code, comments, docs, plans, reviews,
backlog/roadmap entries and commit messages.

## Stack Commands

| Command | Value | Use |
|---|---|---|
| Install | `npm install` | Dependencies |
| Build | `npm run build` | **Hard gate** — tsc + vite build, must run clean |
| Typecheck | `npx tsc -b` | Typecheck gate |
| Lint | `npm run lint` | oxlint |
| Validate | `npm run validate` | Data gate: content/concepts/** (ids, refs, cycles, vocabularies) |
| Test | `npm test` | Vitest unit tests (`src/**/*.test.ts`, `server/**/*.test.ts`, `scripts/**/*.test.mjs`) — pure logic: layout geometry, sentences, the concept file format, palette contrast, the API |
| Smoke | `CHROME_BIN=/usr/bin/google-chrome npm run smoke` | Browser smoke via puppeteer; needs a running dev server |
| Dev server | `npm run dev` | Vite |
| Dev URL | `http://localhost:5173` | Chrome DevTools navigation target; `?mode=concepts` for the concept map; `?mode=community` for the community view (the **Community** tab); `?mode=page&concept=<id>` for a concept's atlas page (the **Atlas pages** tab) |
| DB migrate | *(empty — no backend)* | |

## Architecture Overview

```
sophie_scicom/
├── content/
│   ├── concepts/     # THE concept graph: graph.json + nodes/<id>.json + edges/<id>.json
│   └── pages/        # atlas pages in Markdown + LaTeX: <concept-id>/depth-1.md, depth-2.md, … (checked by scripts/check-pages.mjs)
├── src/
│   ├── data/         # types.ts (schema) + conceptVocabulary.json; concepts.json is GENERATED (gitignored)
│   ├── graph/        # concepts.ts (sizes, zoom depth, edge weight, learning path), dag.ts,
│   │                 # layoutOptimize.ts (force layout), conceptLayout.ts (build-time layout), typeColors.ts, conflicts.ts,
│   │                 # contents.ts (the atlas pages' chapters — closest more general concept, Decision 39 — reading order, sidebar views)
│   ├── community/    # community review: proposal types, validation, overlay, store, claim text,
│   │                 # the editor's draft (draft.ts: export without positions, useDraft.ts)
│   ├── components/   # GraphView (Cytoscape wrapper), ConceptMapView, ConceptCard,
│   │                 # DraftEditor, ProposalCard, Legend, Home, PageView (the atlas pages, lazy)
│   ├── App.tsx       # mode switch (home | concepts | community | page), reads ?mode= (and ?concept=) from the URL
│   └── App.css       # all styles; tokens as CSS variables in :root
├── server/           # community backend (Cloudflare): sign-in with GitHub, proposals ↔ pull requests
├── worker/           # the Cloudflare Worker script: /api/* → server/api.ts, the rest → static assets
├── community/        # experts.json — the invite list while the repo is private
├── scripts/          # compile-concepts.mjs (content → src/data), check-pages.mjs (the atlas pages),
│                     # build-layout.mjs, validate-concepts.mjs, lib/concept-files.mjs
└── docs/             # DESIGN-DECISIONS.md, AUTHORING.md, COMMUNITY-BACKEND-SETUP.md
```

## Key Patterns / Modules

- **`content/concepts/`** — the concept graph, one
  file per node and edge (each concept has its own git history; parallel proposals never touch
  the same file), compiled into the generated `src/data/concepts.json`. Never edit the generated
  file. Schema rules in `docs/AUTHORING.md`. Run `npm run validate` after every data change.
- **`src/graph/concepts.ts`** — the concept rules: `nodeRadius()` (generality → size),
  `revealZoom()` (importance → zoom depth), `edgeWeight()` (a line takes the larger
  generality and importance of its two ends), `conceptPathFor()` (a goal's learning path,
  built on `dag.ts`). Graph logic belongs here, not in components.
- **`src/graph/typeColors.ts`** — validated type palette, one hue family per legend group
  (Knowledge cool, Research violet–pink, Learning warm, Fun mustard — fun mode only). No magic hex values in components;
  app-chrome tokens in `App.css :root`.
- **`GraphView.tsx`** — the only place that touches Cytoscape. Selection/
  highlight via classes (`chosen`, `dimmed`, `onpath`) without re-layout.
- **Layout convention:** the concept map is direction-free: a force layout scored for
  legibility (`src/graph/layoutOptimize.ts`, Decision 15), every ideal distance scaled by
  `SPACING` (Decision 28), each relation long enough for its own name (Decision 32), big concepts kept apart and small ones
  pulled to their most general neighbour (Decision 34). The layout is computed at build time
  (`src/graph/conceptLayout.ts`, run by `scripts/build-layout.mjs` in `npm run build:content`) and shipped as
  `src/data/conceptLayout.json` (generated, not committed); a change to the layout code re-runs it — no cache key to bump.

## Subsystems (scope selection for the live-qa agent)

- `GraphRendering` (Cytoscape, layout, highlighting)
- `CurriculumLogic` (concepts.ts learning path, dag.ts ordering)
- `DataSchema` (content/concepts, validator)
- `Routing` (mode switch, URL param)
- `DesignSystem` (tokens, palette, legend)
- `Accessibility`
- `Performance`

## Conventions

- TypeScript strict, 2-space indent, no new dependencies without a plan.
- No comments by default; only non-obvious WHYs.
- Edit > Write: modify existing files.
- a11y-first: semantic HTML, visible labels (node colours never carry meaning
  alone — legend + ink labels are mandatory). The bar is **WCAG 2.2 AA**, and the
  design principle is **UDL**: offer more than one way to perceive, act and stay
  engaged. Rules, measured tokens and known gaps: `docs/ACCESSIBILITY.md`.
  Animations go through `reducedMotion()` in `src/lib/motion.ts`.
- Content changes (content/concepts) need `npm run validate` as a gate.
- Don't generate design assets — the user supplies assets.

## Agent System

Five agents + a playbook in `.claude/agents/` — details in `orchestrator.md`.

| Agent | When |
|---|---|
| `planner` | only shape-critical features (graph/layout, schema, new view mode, content deletion) |
| `developer` | every feature |
| `reviewer` | every feature — runs the gates, checks against the conventions above |
| `committer` | after a green review, and at wave close |
| `live-qa` | only at wave close (browser) |

**Wave** = whatever has been committed since the last `live-qa:` commit; it closes after
3 features, when `## Open` is empty, or on request. No lock file, no counter — git is the
source of truth.

Artifacts: plans in `.claude/plans/`, reviews and wave reports in `.claude/reviews/`.
Start: `./start-dev-session.sh`.

Deliberately **no** GitHub issue workflow, even though the repo now has its own remote
(`github.com/physics-atlas/physics-atlas`): backlog and roadmap live in the repo and are
committed with every feature — a parallel issue tracker would be, for solo development, a
second place for the same truth. No agent pushes; you do that by hand.

## Deliberately not now

- No own server or database. The community-review epic (`.claude/plans/epic-community-review.md`,
  Decisions 18 and 25) uses GitHub as the backend plus a small Cloudflare function (`server/`):
  no database, nothing beyond that. Hosting is Cloudflare; CI is `.github/workflows/checks.yml`.
- No native mobile app.
- No D3/React Flow rewrite (deliberate paths, see DESIGN-DECISIONS.md).
- Agents don't invent new physics *content* — Sophie curates content.

## Next bigger topics (roadmap hooks)

- Community review Phases 4–7 (`.claude/plans/epic-community-review.md`)
- Shape per type, so colour never has to carry the type (Decision 13)
