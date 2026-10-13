# Design Decisions — Sophie SciCom (Physics Prerequisite Graph)

> Decision log, 2026-07-02. Every option is preserved here as a possible future
> pathway — the "Chosen" marks the current path, not a closed door. When we
> divert, add a dated note under the relevant section instead of deleting.

## Vision

An accessible database of physics learning content organized as a
**prerequisite DAG** (directed acyclic graph — not a tree: topics like
calculus and mechanics feed many paths). A final learning goal (e.g.
cosmology) sits at the top and connects down through prerequisites to
fundamentals. Content (books, YouTube lectures, courses) is attached to each
topic. A student picks a goal — ambitious (cosmology) or humble (special
relativity) — and gets a generated curriculum. **v1 is fully static: no backend.**

---

## Decision 1 — Stack

| Option | Status | Notes |
|---|---|---|
| **React + TypeScript + Vite** | ✅ Chosen | Typed schema, easy growth into curriculum/progress features, matches web-dev-agent template defaults. Deploys as pure static files. |
| Vanilla JS + Vite | ↩ pathway | Lighter; revisit if the app should become an embeddable widget. |
| Svelte + Vite | ↩ pathway | Leaner output; revisit if bundle size ever matters a lot. |

## Decision 2 — Graph visualization

| Option | Status | Notes |
|---|---|---|
| **Cytoscape.js + dagre layout** | ✅ Chosen | DAG layouts, pan/zoom, events, subgraph highlighting out of the box. |
| D3.js custom | ↩ pathway | Total visual freedom (animated path reveal, custom node cards) at ~2–3× effort. Revisit for a "wow" redesign. |
| React Flow (+ dagre/elk) | ↩ pathway | Rich React-component nodes (inline book/video badges). Revisit if node cards need to be much richer than Cytoscape styling allows. |

## Decision 3 — UI concept

| Option | Status | Notes |
|---|---|---|
| **Home → Concept map → Goal** (2026-10-01) | ✅ Current | Home's "Explore the concept map" button and the first header tab now open `?mode=concepts` (the concept map, Decision 12/13) instead of the topic full map. The topic full map has no nav entry point anymore but is unchanged and still reachable at `?mode=map` (alias `explore`); `TopicPage` "Show on map" and the Home hero search's topic hits still deep-link there, since concept ids can't resolve topic ids. **Learning goal** = curriculum + resources, unchanged. |
| Home → Map → Goal (updated 2026-07-03) | ↩ pathway | The previous current row: landing = cosmic hero (animated spiral galaxies, `Galaxy.tsx`) with hero search + featured-goal chips + "Explore the full map" opening the whole DAG (`large` GraphView variant), floating glass detail card — deliberately *no resources* there; "Build curriculum →" jumps into goal mode. Topic full map still at `?mode=map` (alias `explore`); restore by re-adding the tab + pointing `onExplore` back. |
| Goal-first as landing | ↩ superseded | The v1 landing (goal picker straight away). Still one click away via header tabs. |
| Curriculum-list-first | ↩ pathway | Linear syllabus view, graph secondary. Elements of it live inside goal mode (the ordered curriculum sidebar); could be promoted to its own view later. |

## Decision 4 — Content authoring

| Option | Status | Notes |
|---|---|---|
| **One JSON file + validator** | ✅ Chosen | `src/data/topics.json`, schema documented in `docs/AUTHORING.md`, `npm run validate` catches broken prereq refs, cycles, duplicate ids. |
| Markdown file per topic | ↩ pathway | Revisit when topics need long-form notes; compile step .md → JSON. |
| In-browser editor | ↩ pathway | Revisit when Sophie authors regularly and git editing becomes friction; admin view exports JSON. |

> **2026-07-17** — schema `version: 2`: topics gained optional `subtopics`
> (see Decision 7) and the file gained a top-level `skills` array (Decision 8).
> Still one JSON file + validator; both additions are backwards-compatible.

## Decision 5 — Visual identity (updated 2026-07-02)

**Cosmic dark theme** (user request, ref: dreiraum.studio feel — flowing,
premium, constant subtle motion):
- Deep-space ground `#070b14`, glass panels (`backdrop-filter` blur), Sora
  display face + system body, gradient title.
- Background: canvas starfield (drift + twinkle, `Starfield.tsx`) + three
  CSS nebula blobs (60–95s drift cycles). All motion respects
  `prefers-reduced-motion`.
- Node palette re-validated for the dark surface (`#0d1220`, dataviz
  six-checks, worst adjacent CVD ΔE 13.4): foundation `#199e70`, core
  `#3987e5`, advanced `#d55181` (violet failed protan vs blue — magenta
  chosen instead), goal `#d95926`. Light-theme palette preserved in git
  history (pre-redesign) as a pathway.

## Decision 6 — Deployment (default, not yet executed)

GitHub Pages (or Netlify drop) — the build is static. Note: this folder
currently lives inside the larger `dev-bru` git repo; before deploying, give
`sophie_scicom` its own repository.

## Decision 7 — Subtopic granularity (2026-07-17)

Motivation: "to understand the hydrogen atom I need eigenvalues from linear
algebra and integrals from calculus — not the whole courses." Curricula are
now computed at **unit** granularity: a unit is a whole topic (`hs-math`) or a
subtopic (`quantum-mechanics/hydrogen-atom`).

| Option | Status | Notes |
|---|---|---|
| **Nested `subtopics` inside topics** | ✅ Chosen | Map stays at 34 topic nodes; subtopics live in `topics.json` with cross-topic refs (`linear-algebra/eigenvalues-and-eigenvectors`). Subtopics are pickable as goals (search, goal dropdown, map-card chips) and produce minimal curricula grouped by parent topic ("only: …"). Progressive: unannotated topics keep working as one block. Logic in `src/graph/dag.ts` (`buildUnitGraph`, `expandedCurriculumFor`). |
| Subtopics as first-class map nodes | ↩ pathway | Most precise but ~150+ nodes on the map; revisit with clustering/zoom levels. |
| Cytoscape compound nodes (subtopics drawn inside topics) | ↩ pathway | Same data model would feed it; revisit if the map should show fine structure. |
| Separate file per topic's subtopics | ↩ pathway | Ties into the "Markdown file per topic" pathway of Decision 4. |

Data notes: annotating waves-oscillations surfaced a missing topic edge —
`linear-algebra → waves-oscillations` (normal modes are an eigenvalue
problem) — now added. Known simplification: `systems-of-odes` does not ref
linear algebra (LA is not a topic-ancestor of ODEs; keeps the validator
warning-free). Pilot annotation covers the hydrogen-atom chain: calculus-1,
linear-algebra, differential-equations, waves-oscillations, quantum-mechanics.
Classical-mechanics is the natural next topic to annotate (would shrink the
hydrogen path further) — pure data work, no code.

## Decision 8 — Soft skills as sidebar, not DAG nodes (2026-07-17)

| Option | Status | Notes |
|---|---|---|
| **Curated `skills` list, shown as a collapsible panel under every curriculum** | ✅ Chosen | Problem-solving, dimensional analysis, scientific computing, reading practice — habits, not prerequisites. Keeps the map clean. `SkillsPanel.tsx`. |
| Skill nodes in the graph | ↩ pathway | Would let topics require skills; revisit if skills ever gate content. |
| Per-topic skill tags | ↩ pathway | Finer targeting ("this topic is where you start computing"); revisit with more skills. |

## Decision 9 — Client feedback round 1: optional prerequisites, objectives, PDF export (2026-07-20)

Client asked for "clear learning goals; label mandatory and optional" and
"option to download material as PDF".

| Option | Status | Notes |
|---|---|---|
| **Optionality as `optionalPrerequisites` + two-closure curriculum** | ✅ Chosen | Mandatory closure M vs union closure F from the goal; a step is optional iff in F but not M (so an optional step's own prerequisites stay optional unless independently required). Order always computed on F — hiding optional steps is a pure filter, mandatory steps never reorder. Default: shown with "optional" badges + hide toggle. Dashed edges on the map. |
| Weighted/leveled edges (recommended/helpful/…) | ↩ pathway | More nuance than binary; revisit if Sophie needs it. |
| **`objectives` per topic/subtopic** | ✅ Chosen | "After this step you can …" bullets in step detail, map card, PDF. Pilot: QM + its 8 subtopics. |
| **PDF via always-rendered print sheet + `window.print()`** | ✅ Chosen | Dedicated `.print-sheet` (dark-on-white serif, checkbox glyphs, explicit URLs) shown only in `@media print`, scoped with `body:has(.print-sheet)`; no dependency. |
| Client-side PDF library (jsPDF etc.) | ↩ pathway | Real download button without print dialog; revisit if the print flow confuses users. |

Remaining client asks (simulations, exercises w/ hidden solutions, equation
popups, approach labels, ratings) recorded as feature-8…12 in BACKLOG.md with
the client's reference links.

## Decision 10 — Node color encodes category, not altitude (2026-08-30)

`Topic.level` (foundation/core/advanced/goal) drove node color but carried no
information the dagre `BT` layout wasn't already showing via height. What
learners actually want to read off the graph is the *kind* of node: a physics
field, a method/formalism, or a math concept.

| Option | Status | Notes |
|---|---|---|
| **`Topic.category?: 'field' \| 'method' \| 'math-concept'`, optional** | ✅ Chosen | Replaces `level` outright (`src/graph/categoryColors.ts`). Palette re-measured for both surfaces (`--page` dark `#070b14`, light `#f3f5fa`): field `#199e70` (5.78/3.12), method `#e2574c` (5.34/3.38), math-concept `#3987e5` (5.41/3.34), uncategorized `#7a86a0` — the light theme's existing `--muted` (5.38/3.35). Worst adjacent CVD pair (Machado matrices, ΔE76 Lab): Protanopie field/method 14.4; the neutral stays 18.9+ from every category so "not yet categorized" never reads as a fourth content group. Sophie's mapping (34/40 topics) is authoritative — six topics (`lagrangian-mechanics`, `optics`, `standard-model`, `quantum-gravity-frontiers`, `stellar-astrophysics`, `galaxies-large-scale-structure`) intentionally carry no `category` yet: an unclassified topic is a valid, permanent content state (render neutral grey, legend entry "Not yet categorized"), not a migration remnant the validator should flag. **Update (2026-08-30, Decision 11):** those six topics are gone — deleted outright in feature-14, not just left uncategorized. |
| Mandatory `category` | ↩ rejected | Would force Sophie to invent classifications for topics she doesn't yet have an opinion on — exactly the noise that makes color-coding untrustworthy. |
| Keep `level` alongside `category` | ↩ pathway | If the altitude information turns out to be useful after all (e.g. a "how advanced is this" filter), re-add it as a second optional field rather than reviving it as the color driver. |

Also decided:

- **Ziel-Highlighting (Explorer):** picking a learning goal on the map now
  marks it gold (`GraphView.tsx` `.goal-node`, reusing the existing
  gold/silver vocabulary from click-selection) and highlights the exact
  Unit-Closure via `goalPathFor()` (`src/graph/dag.ts`, a thin adapter over
  `expandedCurriculumFor` — no second traversal). Cross-topic **unit** edges
  are drawn on demand so the highlighted units don't render as disconnected
  islands when their parent topic isn't expanded.
- Form-coding per category (e.g. cytoscape `cut-rectangle` for `method`) —
  ↩ pathway, deliberately **not** built now. `width/height: 'label'` shapes
  change text metrics and would touch layout; the weak field/method
  red-green pair is instead covered by the mandatory text-label redundancy
  already required project-wide (node label, legend text, category text in
  map card / topic page / PDF header).
- Fine-grained (unit-level) goal highlighting in `GoalView` — ↩ pathway;
  `GoalView` still dims via the coarse `ancestorsOf`. Bringing the same
  `goalPathFor` treatment there is a follow-up, kept out of this feature to
  stay reviewable.
- A fourth content category (e.g. `application`) — ↩ pathway, revisit if the
  "uncategorized" group turns out to be a real cluster rather than a
  temporary gap.
- **Note (Decision 13):** category colour still applies to the topic views
  (full map, learning goal, topic page); only the concept map colours by node
  type — until feature-18 decides how the two datasets relate.

## Decision 11 — Real deletion, default-open subtopics, viewport-only hover-zoom (2026-08-30)

Direct feedback after the first look at feature-13 live: the six uncategorized
topics read as unfinished clutter, subtopics hid behind a toggle nobody
found, and hovering did nothing to help orient on the large map.

| Option | Status | Notes |
|---|---|---|
| **Delete the six uncategorized topics outright** (`lagrangian-mechanics`, `optics`, `standard-model`, `quantum-gravity-frontiers`, `stellar-astrophysics`, `galaxies-large-scale-structure`) | ✅ Chosen | Removed from `topics.json` with their prerequisite references cleaned up (not left as dangling ids). No new filter/hide logic needed — Search, Home, the legend and GraphView all just reflect the smaller list. Accepted content regression: `general-relativity`, `quantum-field-theory`, `black-holes-gravitational-waves` and `cosmology` each lose one prerequisite step; `quantum-mechanics` loses its only optional prerequisite. Sophie re-adds any of these later as properly `category`-tagged topics when she has real content for them. |
| Keep them, just hide from the map | ↩ rejected | Would need a second "hidden" concept next to the existing optional `category`; the six topics had no content or classification anyway — nothing worth preserving in the live data. |
| **Annotated topics default-open on the map** | ✅ Chosen | `expandedIds` now initializes to all topics with `subtopics`, not an empty set (`MapView.tsx`). The ⊕/⊖ toggle still works for manual collapse — this only changes the starting state. Makes subtopics part of the normal map reading experience instead of a feature nobody discovers, and is also the structural precondition for cheap hover-zoom below (child nodes already exist in the graph on hover, so zooming is a pure viewport op, never a re-layout). |
| **Hover-zoom as a pure `cy.animate({fit})` viewport op, gated to `large && !goalId`** | ✅ Chosen | Second, independent use of the same pattern the search-jump `focus` effect already uses (`GraphView.tsx`) — no new mechanism. Dwelling over an open topic node (`node.isParent()`) fits the viewport to that node + its children with padding, then reverts to the exact pre-hover pan/zoom on mouse-out; both directions animate (respecting `prefers-reduced-motion`) and use the project's existing 350ms interaction-timing convention (the double-tap window). Explicitly **not** a fisheye/lens distortion — cytoscape has no such primitive, and a real lens would fight the dagre layout. Gated off once a goal is picked (`goalId` set): the view is then deliberately pinned to the highlighted path, and re-fitting on every hover would fight that focus. |
| Fisheye / isolate-lens on hover | ↩ pathway | Would need a custom rendering layer (cytoscape has no built-in lens); revisit only if plain zoom/pan turns out to be insufficient for orientation on a much bigger graph. |
| Hover-zoom always on, even with a goal picked | ↩ rejected | Would undo the goal-path focus (Decision 10) on every stray hover — confusing right when the user most wants the view to hold still. |

## Decision 12 — Concept graph as a second dataset (2026-09)

Sophie's pilot CSVs (54 concept-level nodes, 12 types, typed sentence edges —
`docs/physics-atlas-migration-brief.md`) model a finer granularity than
`topics.json`'s 35 course-level topics. Landing the schema (feature-15)
raised the question of how the two relate.

| Option | Status | Notes |
|---|---|---|
| **Coexist: `src/data/concepts.json` next to `topics.json`, nothing renders yet** | ✅ Chosen | Different granularities (course-level topic vs. concept-level node); mechanically converting would force the agent to invent type assignments and generality values — Sophie's content, not ours. Both datasets validate independently (`validate-topics.mjs`, `validate-concepts.mjs`) until Sophie decides the mapping (feature-18, blocked). |
| Replace `topics.json` now | ↩ rejected | Deletes every current curriculum (8 featured goals incl. Cosmology, the compiled parallel-transport goal) for a dataset that only covers three pilot domains. |
| Convert topics into typed concept nodes mechanically | ↩ rejected | Would mean an agent invents each topic's node type and generality — exactly the "don't invent physics content" line the project draws. |

Also decided:

- **Vocabulary as a shared JSON, not a mirrored table:** `src/data/conceptVocabulary.json`
  (12 node types, the 17-entry edge sentence template table, known
  `mediaType`s) is read by both `src/data/types.ts` and
  `scripts/validate-concepts.mjs` — one source, not two copies that could
  drift (the risk the existing `dag.ts`/`validate-topics.mjs` mirror comment
  warns about). Adding a relationship type means adding one row here.
- **`review` as the flag mechanism:** data-quality questions Sophie needs to
  resolve (a casing duplicate, a likely-reversed edge, an inconsistent
  derived-from/by direction, a questionable edge type, two orphan learning
  goals) are recorded as a `review` string on the node/edge, surfaced by the
  validator as a warning, never silently fixed. Sophie clears one by
  deleting the field.
- **snake_case ids kept from the CSVs**, not renamed to kebab-case — they're
  a disjoint id space from topics.json by construction, and renaming would
  break traceability back to Sophie's source files.
- **`generality` is optional, integer 1–5**, not authored in this migration
  (the seed only has a degree heuristic) — easiest scale for a non-dev to
  assign later; the render fallback (feature-16) lives in one function.
- **Pathway:** if Sophie sends raw CSVs again, port
  `convert_seed_data.py`'s parsing/sentence logic into
  `scripts/import-concepts-csv.mjs` (brief §4) rather than hand-merging JSON
  a second time.

## Decision 13 — Concept map view: type colour, generality size, sentence edges (2026-09)

The concept graph (Decision 12) gets its own view, `?mode=concepts`
("Concepts (pilot)" tab), rendered by `GraphView` as a second input variant
(`concepts` prop) — GraphView stays the only file touching Cytoscape. The
topic views are unchanged.

| Option | Status | Notes |
|---|---|---|
| **Colour = node type, 12-colour palette (`src/graph/typeColors.ts`)** | ✅ Chosen | Derived from the seed's ColorBrewer *Paired* hues by moving each colour's lightness into the band that clears 3:1 on both `--page` surfaces (dark `#070b14` / light `#f3f5fa`) — the pale Paired members (`#ffff99`, `#a6cee3`, `#b2df8a`, `#fb9a99`, `#fdbf6f`, `#cab2d6`) measured 1.04–1.89 on light as-is. All twelve now sit at 3.08–5.79 (dark) / 3.12–5.86 (light); numbers per type in the file header. Paired's hue families are kept, so related types read as siblings; closest pair ΔE76 13.4 (conditions/formalism, same family by design). |
| **Size = generality, one fallback rule (`nodeRadius()` / `effectiveGenerality()` in `src/graph/concepts.ts`)** | ✅ Chosen | Learning goals are always the smallest circle (r 7); an authored `generality` 1–5 maps to r 8…24; otherwise the degree fallback `min(24, 7 + 5.7·√degree)` reproduces the seed preview's radii. No node has authored generality yet, so sizes shift automatically as Sophie adds values. |
| **Layout: dagre `BT` over all edges** | ✅ Chosen | Same `layoutFor` as the topic views (only `nodeSep` widened for circles). Every `strict prerequisite for` edge points upward — the ordering the curriculum (feature-17) depends on. Accepted cost: non-prerequisite edges ("is one property of") also read vertically. |
| `cose` force layout | ↩ pathway | Built into Cytoscape (no dependency); a `layoutFor` change if Sophie finds the vertical reading of non-prerequisite edges misleading. |
| Concentric-by-generality layout | ↩ rejected | Double-encodes generality (already size) and ignores the edges entirely. |
| **1-hop highlight** (hover and selection) | ✅ Chosen | A transitive closure over mixed relation types ("relates" chains) is meaningless and lights half the graph; the topic views keep their transitive silver/gold trees. |
| **Relations as sentences** | ✅ Chosen | On hover only (a hovered node's incident edges, or a hovered edge) — 59 always-on labels would be unreadable — and always in full in the detail card, where the other node's name is a button that selects + focuses it. |
| **Zoom-linked fade** | ✅ Chosen | A node recedes (`zoom-faded`, opacity 0.3, no label) when its on-screen radius drops below 6 px, its label hides below 8 px; an edge fades when both ends have. Zoomed out, the general concepts remain; zooming in brings back specific ones and learning goals. Faded nodes stay tappable, hover/selection always show them fully, and the tween is off under `prefers-reduced-motion`. Thresholds are tuning values, not requirements. |
| Shape per type | ↩ pathway | The CVD redundancy channel for twelve hues that cannot all be pairwise CVD-safe. Not built now: every node has a visible text label, the legend names every type, the card states the type in text, and "Browse by type" lists every node grouped by type (also the keyboard path — canvas nodes aren't focusable). |

## Decision 14 — Concept layout: per-component dagre + crossing search (2026-10)

One dagre run over the whole concept graph interleaved unrelated sub-graphs
(e.g. the Einstein-equations resource sat inside the dark-matter cluster) and
left 44 straight-line edge crossings. Now each connected component is laid out
on its own (label-inclusive spacing), unlinked concepts share one compact row,
and the components are shelf-packed to best fit the viewport. A background
search re-runs dagre per component over 24 seeded node orders, each followed
by a rank-swap clean-up, and keeps the arrangement with the fewest crossings +
edges-through-circles (tie-break: total edge length): 44 → 9 crossings on the
current data. The map shows the quick layout first, glides to the better one
(~4 s on first load) and caches it per graph (memory + localStorage).
Geometry lives in `src/graph/layoutOptimize.ts`; Cytoscape glue in GraphView.

**Cost:** separated components need more room, so the whole-map overview
zooms out further (0.57 → 0.37 at 1440×900). **Open paths:** a compound
(domain-grouped) layout, an ELK layered layout with proper crossing
minimisation (new dependency), orthogonal/bundled edge routing, or
precomputing the layout at build time instead of searching in the browser.

## Multi-agent workflow (web-dev-agent-system)

**Installed 2026-07-02** (Setup B from `../web-dev-agent-system-main`):
`.claude/` agents, `.mcp.json` (Chrome DevTools MCP), `scripts/preflight.sh` +
`init-template.sh`, `start-dev-session.command`, `BACKLOG.md`, `ROADMAP.md`.
`CLAUDE.md` carries the real stack commands (npm, port 5173) and architecture.
Preflight: ✅ (gh CLI missing → `github: disabled` until the repo split).

Remaining manual step: create `.claude/settings.local.json` from
`.claude/settings.local.json.example` — it grants the agent session its
Bash/Write permissions, so it must be created by the user, then restart
Claude Code so `.mcp.json` loads.

**Slimmed down 2026-09-25:** the 13 template agents were reduced to five
(`planner`, `developer`, `reviewer`, `committer`, `live-qa`) plus the
`orchestrator.md` playbook; waves are derived from `live-qa:` commits instead
of a lock file, and the GitHub issue workflow was dropped. See `CLAUDE.md` →
Agent System. Start a session with `./start-dev-session.sh`.

## Roadmap hooks (later)

- Progress tracking (localStorage checkmarks per topic → curriculum shows % done)
- More domains (quantum computing, particle physics, astro instrumentation)
- Difficulty/effort estimates per topic; multiple curricula presets
- Search + filter by content type (book / video / course / paper)
