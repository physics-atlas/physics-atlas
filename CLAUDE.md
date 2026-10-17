# Physics Atlas (sophie_scicom) — Development Plan

> Single source of truth for the agent workflow. The agents read this file on
> every run as project context. Keep it lean.

## Project Vision

An accessible database of physics learning content, organised as a
**prerequisite DAG** (directed acyclic graph — not a tree: calculus,
mechanics etc. feed many paths). A learning goal (e.g. Cosmology) sits at the
top and connects through its prerequisites down to the fundamentals. Each
topic carries content (books, YouTube lectures, courses). Sophie maintains
the content; learners pick a goal — ambitious (Cosmology) or modest
(Special Relativity) — and get a generated curriculum.

**Type:** Static SPA — no backend (v1)
**Stack:** React 19 + TypeScript + Vite, Cytoscape.js + dagre for the graph
**Audience:** Self-learners; the content author is Sophie (non-dev)

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
| Validate | `npm run validate` | Data gate: topics.json + content/concepts/** (ids, refs, cycles, vocabularies) |
| Test | `npm test` | Vitest unit tests (`src/**/*.test.ts`, `scripts/**/*.test.mjs`) — pure logic: layout geometry, sentences, the concept file format |
| Smoke | `CHROME_BIN=/usr/bin/google-chrome npm run smoke` | Browser smoke via puppeteer; needs a running dev server |
| Dev server | `npm run dev` | Vite |
| Dev URL | `http://localhost:5173` | Chrome DevTools navigation target; `?mode=explore` for the explorer view; `?mode=community` for the community view (the **Community** tab; open to everyone until sign-in, Phase 3) |
| DB migrate | *(empty — no backend)* | |

## Architecture Overview

```
sophie_scicom/
├── content/
│   ├── concepts/     # THE concept graph: graph.json + nodes/<id>.json + edges/<id>.json
│   └── goals/        # Markdown learning-goal maps (compiled into generated-units.json)
├── src/
│   ├── data/         # topics.json + types.ts (schema); concepts.json is GENERATED (gitignored)
│   ├── graph/        # dag.ts (ancestors, topological curriculum ordering), levelColors.ts
│   ├── community/    # community review: proposal types, validation, overlay, store, claim text,
│   │                 # the editor's draft (draft.ts: export without positions, useDraft.ts)
│   ├── components/   # GraphView (Cytoscape wrapper), GoalView, ExplorerView,
│   │                 # ContentList, Legend
│   ├── App.tsx       # mode switch (goal | explore), reads ?mode= from the URL
│   └── App.css       # all styles; tokens as CSS variables in :root
├── scripts/          # compile-*.mjs (content → src/data), validate-*.mjs, lib/concept-files.mjs
└── docs/             # DESIGN-DECISIONS.md, AUTHORING.md
```

## Key Patterns / Modules

- **`src/data/topics.json`** — the topic data. **`content/concepts/`** — the concept graph, one
  file per node and edge (each concept has its own git history; parallel proposals never touch
  the same file), compiled into the generated `src/data/concepts.json`. Never edit the generated
  file. Schema rules in `docs/AUTHORING.md`. Run `npm run validate` after every data change.
- **`src/graph/dag.ts`** — `ancestorsOf()` (transitive prerequisites),
  `curriculumFor()` (topologically sorted curriculum),
  `expandedCurriculumFor()` (unit granularity: unit refs are `topicId` or
  `topicId/subId`, subtopic resolution rules mirrored in the validator).
  Graph logic belongs here, not in components.
- **`src/graph/levelColors.ts`** — validated level palette (foundation
  `#1baf7a`, core `#2a78d6`, advanced `#4a3aa7`, goal `#eb6834`). No
  magic hex values in components; app-chrome tokens in `App.css :root`.
- **`GraphView.tsx`** — the only place that touches Cytoscape. Selection/
  highlight via classes (`chosen`, `dimmed`, `onpath`) without re-layout.
- **Layout convention:** topic maps use dagre `rankDir: 'BT'` — goals at the top,
  fundamentals at the bottom. Edges point from prerequisite → dependent topic.
  The concept map is direction-free: a force layout scored for legibility
  (`src/graph/layoutOptimize.ts`, Decision 15).

## Subsystems (scope selection for the live-qa agent)

- `GraphRendering` (Cytoscape, layout, highlighting)
- `CurriculumLogic` (dag.ts, ordering, ancestors)
- `DataSchema` (topics.json, validator)
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
- Content changes (topics.json) need `npm run validate` as a gate.
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
(`github.com/subutayebru/physics-atlas`): backlog and roadmap live in the repo and are
committed with every feature — a parallel issue tracker would be, for solo development, a
second place for the same truth. No agent pushes; you do that by hand.

## Deliberately not now

- No own server or database. The community-review epic (`.claude/plans/epic-community-review.md`,
  Decision 18) adds GitHub as the backend plus a tiny serverless proxy — nothing beyond that.
- No native mobile app.
- No D3/React Flow rewrite (deliberate paths, see DESIGN-DECISIONS.md).
- Agents don't invent new physics *content* — Sophie curates content.

## Next bigger topics (roadmap hooks)

- Progress tracking (localStorage checkmarks per topic, % in the curriculum)
- Default-mode decision (goal-first vs. explorer) after user comparison
- Deployment (own repo + GitHub Pages)
- Search + filter by content type
