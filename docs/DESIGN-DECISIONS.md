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

> *2026-10:* the topic layer is retired (Decision 26) — the concept graph, with any concept
> as a goal, is the whole site, and a small Cloudflare backend takes community proposals
> (Decision 25).

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
| **Colour = node type, 12-colour palette (`src/graph/typeColors.ts`)** | ✅ Chosen | Derived from the seed's ColorBrewer *Paired* hues by moving each colour's lightness into the band that clears 3:1 on both `--page` surfaces (dark `#070b14` / light `#f3f5fa`) — the pale Paired members (`#ffff99`, `#a6cee3`, `#b2df8a`, `#fb9a99`, `#fdbf6f`, `#cab2d6`) measured 1.04–1.89 on light as-is. All twelve now sit at 3.08–5.79 (dark) / 3.12–5.86 (light); numbers per type in the file header. Paired's hue families are kept, so related types read as siblings; closest pair ΔE76 13.4 (conditions/formalism, same family by design). *2026-10: superseded by Decision 29 (one hue family per type group).* |
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

> *2026-10:* the search now runs once at build time and the layout ships with the site (Decision 34).
Geometry lives in `src/graph/layoutOptimize.ts`; Cytoscape glue in GraphView.

**Cost:** separated components need more room, so the whole-map overview
zooms out further (0.57 → 0.37 at 1440×900). **Open paths:** a compound
(domain-grouped) layout, an ELK layered layout with proper crossing
minimisation (new dependency), orthogonal/bundled edge routing, or
precomputing the layout at build time instead of searching in the browser.

## Decision 15 — Concept layout: direction-free force layout (2026-10)

Supersedes Decision 14's per-component dagre run. Dagre ranked every concept
graph bottom-to-top, so all edges pointed upward even where the relation has no
"up" (e.g. "is one property of") — the layout spent its freedom on direction
instead of legibility. Each connected component is now arranged by a seeded
spring-electrical (Fruchterman–Reingold) layout in which edge direction plays no
part: each pair's ideal distance grows with both nodes' label boxes, the result is
rotated so its long axis runs horizontally, overlapping names are pushed apart,
and a greedy clean-up swaps node positions while that lowers the score. The score
counts edge crossings + edges passing through another node's circle *or name* +
overlapping name boxes (tie-break: total edge length). The background search,
component packing, glide and cache from Decision 14 are kept (search over 24
seeds per component; cache key bumped to `-v2`). Pure geometry in
`src/graph/layoutOptimize.ts`. The topic maps keep dagre `BT`.

**Cost:** "fundamentals at the bottom" no longer holds on the concept map — the
arrowheads carry direction. **Open paths:** `fcose`/ELK stress layouts (new
dependency), keeping dagre as one more candidate in the search, or a learner
toggle between a layered and a free layout.

## Decision 16 — Conditions are edge attributes; 16 node types (2026-10)

> *2026-10:* conditions on relations were replaced — assumptions are concepts listed in a concept's `assumes` (Decision 33).

A condition only means something relative to a relation: the Zel'dovich
approximation approximates structure formation *under the assumption of* a
linear potential. As a `conditions` node it was joined to only one end of that
claim ("Zel'dovich approximation assumes Linear Potential"), and the relation it
qualified didn't show it at all. The `conditions` node type is gone. An edge can carry
`conditions: [{label, description?}]`, which the sentence renders as "under the
assumption(s) of …", the map label shows as a second line ("assuming …"), and the
card lists by type (Valid under / Applies under / Conditions / Linked conditions).
Migrated: linear potential → e63 (approximates), weak-field low-velocity limit
→ e13 (Einstein eqs. leads to Newtonian gravity), large number → e58 (decay
equation describes alpha decay), ultralight mass → e66 (wave dark matter exhibits
interference, `review` open). Lorentz invariance had no relation to qualify and
stays a node, retyped to `property` (`review` open).

The node-type ontology's five types without a counterpart were added:
`process`, `theory`, `dataset`, `claim`, `finding`. Their colours are
placeholders in the validated contrast band (`typeColors.ts`); they have no
glyph yet and no nodes yet.

**Cost:** an edge now carries more text, so labels on conditional edges take two
lines. **Open paths:** conditions as reusable shared entities (e.g. one "weak-field
limit" referenced by many edges), a "condition" relation from an edge to a node
(reification), or conditions on nodes as well as edges.

## Decision 17 — Importance drives size and a map-style zoom level of detail (2026-10)

Supersedes Decision 13's "size = generality" and "zoom-linked fade" rows. A new
node field `importance` (1–5) sets the circle radius (7…27) and the label size
(12…18 px). Zooming works like a street map: a concept of importance *i* is shown
only once the zoom reaches a multiple of the whole-map overview zoom (5 always,
4 from 0.8×, 3 from 1.45×, 2 from 2.2×, 1 from 3.2×). Edges to a hidden concept
hide with it, and hidden concepts are fully transparent and can't be clicked,
rather than faded to 0.3. Because the thresholds are relative to the overview, they
keep working as the graph grows. The selected concept, its neighbours, the goal and
the goal path are pinned and always show, and hovering a concept briefly reveals
its hidden neighbours. Names too small to read on screen are dropped
(`min-zoomed-font-size`). The fallback chain is importance → generality → a degree
estimate. Every node got a placeholder importance (7 × 5, 11 × 4, 18 × 3,
13 × 2, 15 × 1) for Sophie to revise.

The mouse-wheel zoom also got faster: `wheelSensitivity` went from 0.3 to 1, Cytoscape's default.

**Cost:** zoomed out, whole sub-graphs can drop to their landmark (or vanish
if they have none), and the overview shows fewer lines. **Open paths:**
hiding by on-screen collision instead of fixed thresholds (Google Maps' actual rule),
a "show everything" toggle, or clustering hidden concepts into a count badge.

## Decision 18 — GitHub as the backend for community review (2026-10)

Overrides "no backend, no accounts" from the v1 constraints, for one purpose: letting experts
propose, review and confirm concepts with a public, immutable history
(`.claude/plans/epic-community-review.md`). The git repository stays the **only source of
truth**:

- a proposal is a branch + pull request (one proposal per PR);
- votes are structured PR reviews (Verify / Dispute / Needs clarification), not commits;
- the quorum rule is a required GitHub Action check;
- the merge commit records who approved.

The app stays a static SPA on GitHub Pages. The only addition is a tiny serverless proxy for
the OAuth token exchange and cached API reads, with no database.

Also decided: keep Cytoscape (no React Flow); show status by outline + badge + text, never by
colour; Markdown + LaTeX (KaTeX) instead of TipTap; dragging a ghost node is a visual aid
whose position is never saved; a curator approves expertise tags; quorum has a bootstrapping
mode for domains with few experts.

**Cost:** contributors need a GitHub account; we depend on GitHub's API and its rate limits
(mitigated by the proxy cache, plus a build-time snapshot so the map always works). **Open
paths:** an own backend (a Postgres event log + server-side git) behind the same
`ProposalStore` interface, if GitHub accounts or public votes become a barrier.

## Decision 19 — The concept graph is stored one file per node and edge (2026-10)

`src/data/concepts.json` was one 1,200-line file. For per-concept history ("blame") and
proposals that never collide, every node and edge is now its own file in
`content/concepts/{nodes,edges}/<id>.json`, plus `graph.json` for top-level fields. The files
are compiled into a generated, gitignored `src/data/concepts.json`, so the app and its types
are unchanged. The format lives in one module, `scripts/lib/concept-files.mjs`, which the
compiler, the validator and the tests share. The validator checks file name = id and
canonical formatting.

The output is **ordered by id**, never by authoring order. A shared order file would put every
proposal back into conflict. The two lists that showed authored order ("All concepts as a
list", concept search) now sort alphabetically by label. Edges were already in id order; node
order changed, so a first-time visitor's layout search starts differently (the layout cache is
keyed by the sorted id set, and its key was bumped to v4 for the overlap fix below).

`attrs.domain` is now a **controlled vocabulary** (`conceptVocabulary.json` → `domains`,
several as "A / B"), because steward routing and quorum need exact domain names. The 14
values were kept exactly as authored.

Found by the first unit tests: `removeOverlaps()` stopped pushing at exactly the margin, so
floating-point residue (~1e-15 px) counted as phantom overlaps in the layout score. It now
pushes 1 px past the margin.

**Open paths:** per-domain folders (if `CODEOWNERS` routing is wanted; today the quorum
Action can read `domain` directly), YAML instead of JSON for easier hand-editing.

## Decision 20 — Proposals are an overlay on a fixed confirmed layout (2026-10)

The proposed layer (community review, Phase 1) is drawn **on top of** the confirmed graph,
never mixed into it. The confirmed graph is laid out, searched and cached exactly as before.
Proposals are added afterwards and placed by `placeNew()`:

1. each proposed concept starts at the centre of the concepts it connects to;
2. a short local force run settles it, with every confirmed node fixed;
3. it's pushed clear of every name it would overlap.

So proposals can't move a confirmed concept or invalidate the layout cache, which the smoke
test checks (0 px moved). When the background search improves the confirmed layout,
proposals are re-placed and glide along.

Status never borrows a colour, because fill already means type (Decision 13). A proposal has
a **dashed** outline, a contested one a **double** outline and ⚑, edges are dashed or dotted,
and every proposed concept carries its status and tally in words in its label ("Proposed ·
✓2 ✗0 ?1"). The legend, the card and the concept list repeat it in text.

The proposal card loads lazily with KaTeX (~265 kB, plus fonts), so the map's own bundle
grows only by the small proposal logic.

**Open paths:** clustering many proposals around one concept into a count badge once there
are dozens; per-proposal hover previews; drawing proposed *edits* to confirmed concepts
(Phase 2+).

## Decision 21 — The proposal editor: a draggable sketch, click to connect (2026-10)

The proposal editor (community review, Phase 2) puts a **ghost** of the new concept on the
map. The proposer drags it to work out where the idea fits. Large graphs are hard to picture
in your head, and that's all the drag is for:

- **The position is never data.** It lives only in `GraphView` for the session. The draft
  (`src/community/draft.ts`) holds content only, and the export carries no coordinates (a
  test checks this). Once merged, a concept is placed by the normal layout.
- **Confirmed concepts never move** for the ghost; the smoke test checks 0 px.
- **Connecting is a click, not a drag.** While drafting, clicking a confirmed concept adds a
  relation to it, and the concepts nearest the ghost say "＋ Connect?" in their labels. This
  replaced the planned `cytoscape-edgehandles` edge drawing: no new dependency, and it isn't
  a dragging-only action (WCAG 2.5.7).
- **The form is a complete route of its own.** Search connects, and suggestions then come
  from the graph neighbours of what's connected. The ghost glides next to its connections, so
  a keyboard user gets the same visual aid without dragging.
- **Conflicts are hints, not blocks** (`src/graph/conflicts.ts`): similar names
  (normalisation, trigram similarity, a short abbreviation list), duplicate or reversed
  relations (against the map, the draft and other open proposals), strict-prerequisite loops.
  A curator may well accept a near-duplicate on purpose. Only missing fields and malformed
  evidence stop an export.
- **One draft per browser**, in localStorage, until Phase 3 submits drafts as pull requests.
  New ids are a slug plus a fixed random suffix (`jeans_scale_k3f9`), so a renamed draft keeps
  one identity and two drafts never collide.

**Open paths:** several drafts at once; proposing an *edit* to a confirmed concept;
edge-only proposals without a new concept (possible in the data, not offered by the editor);
real edge drawing if experts ask for it.

## Decision 22 — Generality sizes the circle, importance sets zoom visibility (2026-10)

> *2026-10:* importance now runs 1–10 (Decision 31); the numbers below are the old 1–50 scale.

Supersedes the size half of Decision 17. Size and zoom visibility were both driven by
`importance`; they're now two independent attributes:

| Attribute | Scale | On the map |
|---|---|---|
| `generality` | 1 (most specific) – 10 (most general) | circle radius, 7 … 27 px |
| `importance` | 1 (minor detail) – 50 (landmark) | how far out the concept stays visible, and its name's size (12 … 18 px) |

The finer scales let authors rank concepts against each other without ties at every step.
Zoom visibility is interpolated between the old five thresholds (`revealZoom()` in
`src/graph/concepts.ts`), so 50 always shows and about 37 and up show on the overview, as 4
and 5 did. Each attribute falls back to a connection-count estimate, never to the other, so a
big general idea can be a minor stop and a narrow one a landmark.

**Migration:** importance × 10, Sophie's 12 generality values × 2. The other 52 concepts got
generality from their placeholder importance × 2, so their size didn't change. Ten circles
changed size, so the layout cache key moved to v5. Both values are optional fields in the
proposal editor, which also made the claim optional: without one, reviewers vote on the
concepts and relations as written.

**Open paths:** label size following generality instead of importance; a "size by" switch
in the map controls.

## Decision 23 — Many drafts, one proposal each; dependencies instead of bundles (2026-10)

A subgraph proposal (several concepts reviewed as one) was considered and set aside: it
makes votes all-or-nothing and reverses the "one proposal = one concept + its relations"
rule. Instead:

| Need | How |
|---|---|
| Sketch several related concepts | The editor holds several drafts; each new concept has its own ghost. Each draft is exported, and later submitted, on its own. |
| Relate to something not yet accepted | A relation into another draft or into someone else's open proposal adds that proposal to `dependsOn`. |
| That other proposal is rejected | `resolveDependencies()` drops the relations into it (they're listed as `dropped` on the card); the rest of the dependent proposal stands. Discarding one of your own drafts does the same to your other drafts. |
| Order | A dependent proposal merges only after what it depends on (Phase 5). |
| Change something that exists | An **edit proposal**: the same form, filled in from the concept (`edits`, `removals`, new `edges`). It keeps fields the form doesn't show, in the file's key order, so its diff and blame stay readable. |

**Why not bundles:** reviewers judge one idea at a time, a disputed concept can't hold an
uncontroversial one hostage, and the history stays one concept per pull request.

**Open paths:** a "submit these together" convenience that opens several PRs at once;
showing a dependency chain on the map; edits to relations themselves (today a changed
relation is a removal plus a new one).

## Decision 24 — Depth by zoom: much bigger general concepts, importance as depth (2026-10)

> *2026-10:* importance now runs 1–10 (Decision 31) — every value ÷ 5, the same depths.

Refines Decision 22's numbers; the graph stays a graph (nesting general concepts around
specific ones was considered and set aside). The goal is a depth effect: zooming in around
Dark Matter reveals specific concepts and relations that don't show until you're close.

| Piece | Rule |
|---|---|
| Size | Generality 1–10 → radius 7 … 270 px, ×1.5 per step (10 is ten times the old maximum). Geometric, so small stays visibly small. |
| Depth | Importance sets the reveal zoom: 50 always, 40 on the overview, each 8 points lower twice as close (`revealZoom()`), down to ~30× for 1. Every value is its own depth. |
| Names | From radius 50 (generality 6), the name sits inside the circle on a plate, radius ÷ 3 in size, so the biggest concepts read on the overview. Smaller concepts keep 12–18 px names below the circle. |
| Zoomed past | A circle wider than 90% of the view fades to a faint outline and stops catching clicks — you're looking at what's around it. |
| Layout | Long-range repulsion uses one typical spacing for every pair; a node's size only counts when two nodes are close. Without this, ten huge circles spread the whole graph out and the specific concepts around them ended up a screen apart. Layout cache v6. |

Verified: overview of 64 concepts shows 18, with 9 landmark names readable; 6× closer to
Dark Matter shows Wave Dark Matter, PDF, Structure Formation, Vlasov eq.,
Schrödinger–Poisson eq., Zel'dovich approximation and Airy solution with their relations.

**Open paths:** label collision handling (importance as priority) once the graph is denser;
a "you are near …" orientation line; tuning the reveal curve per the real content.

## Decision 25 — A GitHub App opens proposals; people only sign in (2026-10)

Phase 3 (submitting proposals) while the repository stays **private** and is shared with many
experts, none of whom should be able to push.

| Option | Verdict |
|---|---|
| Repository collaborators | ↩ rejected: on a personal account a collaborator can always push; read-only roles need an organisation, and branch protection on a private repository needs a paid plan |
| Fork + pull request | ↩ rejected: needs every expert to have read access first, invited one by one |
| **A GitHub App writes; people only sign in** | ✅ chosen |

How it works: a proposer signs in with GitHub (the App reads their profile once and discards
the token). The App's own installation token creates a branch, one commit **authored by the
proposer** (their noreply address), and the pull request. Only handles on the invite list
(`community/experts.json`) may submit while the repository is private. Everyone else still
browses, drafts and exports. The pull request carries the proposal as hidden JSON, so the map
rebuilds the proposed layer from open pull requests. The backend runs in the site's Cloudflare
Worker (`worker/index.ts` → `server/api.ts`): no database, a signed session cookie, short caches.

**Trade-off:** attribution rests on the App and this backend, not on GitHub's own review
records. Every action is still in the pull request's history. Once the repository is public,
native reviews can take over voting (Phase 4) without changing submission.

**Open paths:** ORCID linking for the badge; a public mode where anyone signed in may
propose; hiding open proposals from people who aren't invited, if that's ever wanted.

## Decision 26 — The topic layer is retired; the concept map is the whole site (2026-10)

The "Learning goal" tab and everything only it led to — the topic map, topic pages, the
topic data (`src/data/topics.json`), the Markdown learning-goal maps (`content/goals/`),
their compile and validate scripts, print sheets and dagre — are removed. The concept graph
already covers the same ground: a learning goal is a concept of type `learning_goal`, and any
concept can be a goal with a path of strict prerequisites (`conceptPathFor()`).

| Piece | Now |
|---|---|
| Home search | Searches concepts and opens the concept map centred on the pick |
| Home chips | "Start from a landmark": the importance-50 concepts, taken from the data |
| Old addresses | `?mode=goal`, `topic`, `map` and `explore` land on the concept map |
| Progress | Unchanged: the same storage key, concept ids prefixed `concept:` |

The topic data stays in git history (last at commit `795a9bc`) if any of it should be
carried into concepts. **Open path:** a curated list of featured goals for the home page,
if landmarks turn out not to be good starting points.

## Decision 27 — A relation's line takes the larger attributes of its two ends (2026-10)

> *2026-10:* its *name* now takes the smaller end's size (Decision 34); the line is unchanged.

Zoomed out, lines were 1.5 model px wide — about 0.15 px on screen at the overview, so the
landmarks looked unconnected. Now each line keeps an **on-screen** width, from the more
general of its two concepts, and an opacity from the more important one (`edgeWeight()`):

| Attribute | Line |
|---|---|
| Generality (larger end) | Narrowest on-screen width 1 px (two generality-1 ends) … 4 px (a generality-10 end), on the same log scale as the circles but damped — circles span 7–270 px |
| Importance (larger end) | Opacity 0.30 … 0.65 dark, 0.42 … 0.75 light |
| Zoomed in | The model width (1.5) takes over once it's wider on screen; highlighted lines (hover, path, proposals, drafts) use 2.5 and full opacity |

A line still hides when either end is hidden by the zoom: a line into nothing reads as a
broken map. **Open path:** fading a line toward a hidden end instead of hiding it.

## Decision 28 — The layout packs tighter: spacing 0.84 (2026-10)

> *2026-10:* relation names now get their own room in the layout (Decision 32); `SPACING` still scales the rest.

Every ideal distance in the force layout (attraction, long-range repulsion, contact push) and
the gaps between separate clusters are scaled by `SPACING` (`layoutOptimize.ts`).
`removeOverlaps` keeps concept names apart, but nothing keeps relation names clear of the
circles, so the factor trades compactness against relation names hidden under circles.
Measured on the 64-concept graph (a relation name counts as covered when its label box
touches a circle):

| `SPACING` | Mean relation length | Overview zoom | Relation names covered |
|---|---|---|---|
| 1 (before) | 633 model px | 0.106 | 2 |
| 0.7 (first try) | 441 (−30%) | 0.141 | 14 |
| **0.84 (chosen: 0.7 + 20%)** | 540 (−15%) | 0.125 | 4 |

The four left (e13, e15, e16 around Einstein Field Equations / Newtonian Gravity /
the gravity goal, and e66) are short lines between big circles; two of them were covered
even at spacing 1. Layout cache v8.

**Open path:** room per relation for its own name — make an edge's ideal length at least
its two radii plus its label's width — instead of spreading the whole map.

## Decision 29 — One hue family per type group (2026-10)

The legend's three groups (Learning, Research, Knowledge) now each have their own hue family,
so a type's group reads from its colour: Knowledge cool (green → teal → blue), Research
violet → pink, Learning warm (red → amber). Each colour is generated in OKLCH at its hue and
a lightness of 0.51–0.63 (alternating, so neighbours in a family differ in lightness too),
then checked:

| Check | Result |
|---|---|
| Contrast on both surfaces (WCAG 1.4.11, ≥ 3:1) | All pass; tightest experiment 3.18 dark, phenomenon 3.19 light — `typeColors.test.ts` guards it |
| Closest pair within a group (CIEDE2000) | theory / formalism 10.9 |
| Closest pair across groups | finding / formalism 18.3 |
| Colour-vision deficiency | Some cross-hue pairs come close (e.g. dataset / model regime 2.2 under deuteranopia) — unavoidable for 16 hues in one lightness band; the type is always also in words (label, legend, card) |

Supersedes Decision 13's palette row; numbers per type in the file header.

## Decision 30 — Fun mode: lonely concepts speak up, fluff is a type of its own (2026-10)

A playful view of the same map, behind a **Fun mode** button in the map controls. It's off
on every visit and stays on while switching between Concept map and Community.

| Piece | Rule |
|---|---|
| Lonely concepts | Every shown concept with no shown relation gets a speech bubble ("I'm lonely, please connect me with someone!", or one of two variants, always the same per concept). The bubble follows the concept's importance: it shows and hides with it at every zoom, and its text is the size of the concept's name. Clicking it opens the concept, like clicking the circle. |
| Bubbles are HTML | Real buttons over the canvas, not canvas drawings: crisp text, keyboard-reachable, a visible name that starts with the concept's (WCAG 2.5.3). They sit under every panel, hide while their concept is under the card, and when two would overlap the more important concept keeps its bubble (like map labels). |
| Fluff | A node type, `fluff`, in its own **Fun** legend group: mustard (hue 110, the gap between Learning's amber and Knowledge's greens) and a smiley glyph, so it never relies on colour. Considered: a `fluff: true` flag on any type — set aside so a joke never looks like physics. |
| Fluff stays out of the way | With fun mode off it's in no search, list, legend or editor type list, and the proposed layer hides fluff proposals. It never joins a learning path: the validator refuses fluff in `strict prerequisite for`. It has no epistemic status. |
| Nothing moves | Fluff is drawn as a layer, like proposals: placed around what it connects to with every confirmed concept fixed, never in the layout cache. Turning fun mode on or off leaves the map exactly where it was. |

`sample_schrodingers_cat` (with relation `e71`) is a labelled sample to rename or delete.
**Open paths:** more fun-mode additions; a "connect me" shortcut from a bubble into the
proposal editor in the Community view.

## Decision 31 — Map and editor adjustments: the view stays, importance 1–10, LaTeX equations (2026-10)

| Change | Rule |
|---|---|
| The view stays | Clicking off a concept, or closing the proposal editor, no longer glides back to the whole map — the view stays where the user is. Opening a concept still fits its connections; **⤢** is the way back to the whole map. |
| Importance 1–10 | Same range as generality. Every value was divided by 5 (all were multiples of 10), and the depth curve rescaled to match: the overview shows from 8 (was 40), and each step below is ~1.5× closer (1.6 points per doubling, was 8) — so every concept appears at exactly the zoom it did. Drafts saved in a browser carry a version; older ones are read at a fifth of their importance. Open pull requests made before this hold the old numbers and no longer fit (importance > 10) until edited. |
| Relation picker | The relation type is picked from its sentences with the relation **bold** and the two concepts quieter (`--muted`, still ≥ 8.7:1 — dimmed, never grey text). A native `<select>` can't style part of an option, so it's the WAI-ARIA APG select-only combobox (`RelationPicker.tsx`): a button and a listbox with the keyboard of a native select (arrows, Home/End, Page keys, type-ahead on the relation's words, Enter/Space/Tab to choose, Escape to close). Considered: CSS `appearance: base-select` — Chromium only so far. |
| Relation names grow with their line | A relation's name is sized like its line: 11 px × the line's generality factor (1–4), nudged by importance (×0.8–1.2) — 11 to ~53 model px. *Capped at 2.5× (±10%) in Decision 32.* Highlighted names and the wrap width scale with it. So a landmark's relations read at the zoom where its line is bold, and short-range detail stays small. |
| The map guide steps aside | The "Colour = kind of concept…" guide shows for 3 seconds, then folds into a **How to read this map** button at the top middle; opened again, it stays until closed. (WCAG 2.2.1: the content moves out of the way, but stays one click away with no time limit.) |
| Equations are LaTeX | The equation and every variable symbol are LaTeX, typeset on the card by KaTeX exactly like the editor's preview (loaded on demand: the card shows the source for a moment). The six equations were transcribed from Unicode text into LaTeX — same formulas. The validator warns when KaTeX can't typeset one. |
| Several representations | `representations` holds other ways of writing the same equation: `{name, equation?, variables?}`, each with its own variable names. The editor edits the main form's variables and each representation's. Einstein's three representation names became objects with only a name. |

## Decision 32 — The layout makes room for every relation name (2026-10)

> *2026-10:* names are now sized from a glyph table at build time, and by the smaller end (Decision 34).

Until now the layout didn't know relation names existed: every relation got the same fixed
90 px (× `SPACING`) between its two concepts' footprints. Once names grew with their line
(Decision 31), 30 of the 66 sat under a circle. Now the names are part of the layout:

| Piece | Rule |
|---|---|
| Each relation's own length | A relation's ideal length is the usual spacing, or — when its name needs more — both circles plus the name's measured length, the target's arrowhead and 14 px either side (`labelRoom`). While a line is shorter than that, the force layout pushes its ends apart instead of pulling. |
| Measured, not guessed | Names are measured in the font they're drawn in (`edgeLabelSize`, italic), wrapped where Cytoscape wraps them, with their plate. Cytoscape centres a name on the *visible* part of its line (between the circles, short of the arrowhead), so the layout does too. The arrowhead is taken at its largest — at the zoom where the name first shows, where lines are widest. |
| Scored | A name under a circle (or under a concept's own name) counts twice a crossing in the layout search, so of the 24 arrangements the one with clear names wins. |
| Stretched | After the search, any relation still too short for its name has its ends moved apart along its line, then overlapping concepts are pushed apart again — a few rounds (`stretchForLabels`). Proposals, fluff and drafts are placed the same way, moving only themselves. |
| Safety net | A name a shown circle still covers is hidden until its relation is highlighted (hover, selection, goal path). |
| Names grow less | A relation name grows with its line up to 2.5× (±10% by importance) instead of 4.8×: 11 to ~30 px. Bigger, and the names alone forced very long lines between the big concepts. |

Measured on the 64-concept map (checked exactly: each name as Cytoscape draws it, rotated,
against every circle): relation names under a circle **30 → 0**, none hidden by the safety
net; mean relation length 538 → 700 model px, whole-map zoom 0.125 → 0.111. In the
Community view no shown name is covered; 3 proposal relations, placed among fixed concepts,
have their names hidden until hovered. Layout cache v9.

**Open paths:** names overlapping each other (where lines cross) aren't scored yet; a
proposal could be allowed to nudge the confirmed concepts next to it.

## Decision 33 — Assumptions are concepts a concept `assumes`; relations get cards (2026-10)

> *2026-10:* an assumption is now words on the concept, pointing to a concept only when the map has one; the concepts created for assumptions were removed (Decision 35).

Supersedes Decision 16's "conditions are edge attributes". Assumptions will be common, so
each is a concept of its own and a concept lists what it assumes — no line on the map.

| Piece | Rule |
|---|---|
| `assumes` | An optional top-level list of concept ids on a concept. Not a relation: nothing is drawn. The card lists it under a type-specific heading (Valid under, Applies under — also through the linked system or model — Conditions, else Assumes), the other side lists **Assumed by**, and selecting either marks the other with a dotted outline (pattern, not colour; the card says it in words). The layout ties them together invisibly, so they sit near each other without counting as crossings. Lonely-concept bubbles (fun mode) don't fire for a concept held by an assumption. |
| Migration | The four relation conditions became concepts — Weak-field low-velocity limit, Large number, Linear potential (model/behaviour regime) and Ultralight mass (property) — each assumed by its relation's **source** (the user's choice, over a hand-picked mapping that would have put the weak-field limit on Newtonian Gravity). Descriptions carried over unchanged; type, importance and generality are placeholders under a `review`. The `assumes` and `assumes a` relationship types were removed; the validator refuses relation `conditions` and points to `assumes`. |
| Relation cards | Clicking a line, or **Details** beside a relation in a concept's card (the keyboard route), opens the relation's card: its type, the sentence, From / To, and two optional fields — `description` (how they connect) and `derivation` — both Markdown + LaTeX. The proposal editor has both per relation. The relation and its two concepts stand out on the map while the card is open. Proposing a description or derivation for an *existing* relation isn't possible from the editor yet (open path). |
| Formalism formulas | A mathematical formalism's `attrs.formulas`: `{equation, name?, variables?}[]` — formulas that show how it works, typeset on its card ("Formulas"), editable in the proposal editor. The validator checks each with KaTeX. |
| Map guide | Its button moved into the header, between the search and the view tabs. |
| Legend | Ends with: "This categorization does not claim to be exhaustive or fundamental — we welcome discussion and contribution on this framework." |
| Glyphs | Every type has one now: ten more from Sophie's second sketch (flag, open book, thought with ≠, question, magnifier, flask, bar chart, step in a cycle, gear, Newton's apple), drawn in the same 24-unit line style. |

**Open paths:** an "edit relation" proposal (description, derivation, type) for confirmed
relations; assumptions of a proposal on another proposal's concept (only confirmed ones now).

## Decision 34 — Big concepts spread out, small ones gather round; the layout is built once (2026-10)

The map read the wrong way round: the big concepts sat in a clump in the middle, touching
(Einstein Field Equations and Spacetime 15 px apart), and the specific ones drifted to the
edge on long lines (big ↔ small: median 909 model px, the longest of any pair). The cause
was the force layout itself: every concept pushed equally, big ones are pulled to the middle
by their many relations, and a small concept, held by one line, was pushed outwards by all
the others. Now:

| Piece | Rule |
|---|---|
| Clearance | Two circles keep at least 1.5 × the smaller radius between their rims (`clearance`): a circle-and-a-half between two landmarks, the usual margin between two details. The force layout's contact push and `removeOverlaps` both enforce it, the score counts a breach like a tangle, and the gaps between separate groups and in the row of unconnected concepts respect it too. |
| Push by size | A concept pushes in proportion to √(its radius ÷ the median radius), within 0.3–3: big ones keep each other at a distance, small ones barely push, so they can gather. |
| Short lines to details | A relation's ideal length is its two radii plus a short gap (90 × `SPACING`), or the room its name needs if that's more — no longer padded by both concepts' name boxes. |
| Pulled to its parent | A concept is pulled 3× harder by its most general neighbour, so it settles beside that one rather than between several. |
| Names by the smaller end | A relation's name takes its size from the *smaller* of its two concepts (`relationFontSize`); the line keeps the larger (Decision 27). A detail only shows once you zoom in to it, so its relation needn't carry an overview-sized name — and a shorter name lets it sit close to its big concept. |
| No stray lines | A relation longer than 2.5× its ideal length counts as a tangle, once more per further multiple (`countStretched`). Without it the swap clean-up traded a few crossings for lines across the whole map: Einstein Field Equations ended up alone at one edge, 13× its ideal length from its neighbours. Longest relation now 4.6× its ideal. |
| Swaps scored incrementally | Swapping two concepts only changes what involves them, so each trial swap scores just that (their relations, their boxes, the names they could cover) instead of the whole layout — the same result (a test checks it against the full re-score), 5× faster. The 85-concept map, one group of 72, takes about 45 s instead of 4 minutes. Limiting swaps to similar-sized concepts would be faster still but scored clearly worse (best 18 → 20 tangles), so it isn't done. |
| Built once | The layout is a pure function of the graph (`src/graph/conceptLayout.ts`: no Cytoscape, no DOM). `npm run build:content` runs it (`scripts/build-layout.mjs`, under a minute for 24 seeds per group) and writes `src/data/conceptLayout.json`, which the app ships; the browser only packs the groups for its viewport. The file is reused while the graph and the layout code are unchanged; it's generated, not committed (like `concepts.json`), so Cloudflare's build makes it for every deploy. The browser's search and its localStorage cache are gone; the search runs in the browser only if the shipped file doesn't match the graph (a content edit without a rebuild). |
| Measured without a browser | Names are sized from a glyph table (`src/graph/glyphWidths.json`, `scripts/measure-glyph-widths.mjs`): each character's width, the larger of the system font (Segoe UI) and Arial (close to Helvetica / San Francisco), so a name is never drawn longer than the layout planned. A concept's box takes its wrapped height and its unwrapped width, whichever way the browser wraps it. The layout key is built from the data (types, sizes, names, relations), never from measured sizes, which can differ in the last digit between Node and a browser. |

Measured: big ↔ small lines **909 → 176** median, big ↔ mid **481 → 351**, big circles at
least 1.5 radii apart (was 15 px at the closest); in the app, no relation name hidden at
any zoom and nothing moves after load. (Before: the 69-concept map; after: the 85-concept
map pulled since, so the extents aren't comparable — 9805 × 5199 before, 9277 × 7740 after.)
The covered-name check no longer reads a circle's border as a name under it.

**Content fixed with it:** the merged proposals in the old format were migrated —
importance on the 1–50 scale ÷ 5 (Euler equation 5, Fluid 4, General relativity 10), and
the four relation conditions moved into the `assumes` of each relation's source (at first
as concepts of their own; Decision 35 made them words): At non-relativistic energies
(Electron), A single valued velocity field (Euler equation), On large scales (Spacetime),
Locally (Special Relativity). A
relation to a concept that doesn't exist (the validator's error) is now skipped when the app
loads, with a console warning, instead of stopping the map from drawing.

**Open paths:** a layout that goes from big to small (place the big concepts first, then
each smaller size around them with the bigger ones held still), if the forces stop being
enough as the map grows — the build's search grows roughly with the cube of the largest
group; per-pair gaps between packed groups instead of one gap for all.

## Decision 35 — An assumption is words on the concept, not a concept of its own (2026-10)

Revises Decision 33. Making every assumption a concept filled the map with concepts that
didn't exist before and were nothing more than the assumption's name — Large number,
Locally, On large scales — each with placeholder sizes and a review note. An assumption
needn't be a concept: what it means is written on the concept that assumes it.

| Piece | Rule |
|---|---|
| Shape | `assumes` is a list of `{ label, description?, concept? }`: a few words, more detail if it helps, and — only when the map has one — the concept it is. Each needs a label or a concept; with a concept and no label, the concept's name is used. |
| Card | Listed under the type's heading (Valid under, Applies under, Conditions, else Assumes), each in its words with its description under it; one pointing to a concept is a link to it. |
| Map | Only an assumption pointing to a concept does anything on the map: the dotted outline on selection, **Assumed by** on that concept, the invisible layout tie, and it keeps a concept from counting as lonely. An assumption in words only is on the card alone. |
| Editor | A row per assumption (name, "In more detail"); **Add an assumption**, or a search that adds one pointing to a confirmed concept (unlinkable again). Drafts saved with the old list of ids load as rows pointing to those concepts. |
| Validator | Checks the shape, unknown fields, the concept exists and isn't the concept itself, and that nothing is listed twice (the same concept, or the same words). |
| Content | The eight concepts created for assumptions were removed and written back into the concepts that assumed them, in their words: Weak-field low-velocity limit (Einstein Field Equations), Large number (Decay equation), Linear potential (Zel'dovich approximation), Ultralight mass (Wave Dark Matter) — each with its description — and At non-relativistic energies (Electron), A single valued velocity field (Euler equation), On large scales (Spacetime), Locally (Special Relativity). Reviews: Wave Dark Matter keeps Sophie's open question about Ultralight mass; Spacetime and Special Relativity ask whether the assumption sits on the right concept, since it came from a relation. 86 → 78 concepts. |

**Open path:** linking an existing assumption in words to a concept later, from the editor
(today: add the concept from the search and remove the words).

## Decision 36 — The atlas as pages: a page per concept, chapters from the map (2026-10)

An alternative to the canvas, after university lecture notes (a contents sidebar, Previous /
Up / Next, numbered blocks): every concept has a page. Planned in five steps — (1) pages
from the data we have, (2) written pages (`content/pages/<id>.md`, numbered blocks),
(3) pages in proposals (the page file in the same pull request — the backend builds each
file's path from the id, so it can add this one too), (4) static HTML per page at
`/atlas/<id>/`, held to the strictest accessibility, (5) figures, equation numbers,
exercises, a PDF. Step 1 is done:

| Piece | Rule |
|---|---|
| Chapters | Like the map reads (Decision 34): a concept's parent is its most general neighbour that's more general than itself (relations, and assumptions that point to a concept); one with none is a chapter. Chapters and sections go bigger first, then more important, then A→Z, and are numbered like a book (3, 3.1, 3.1.1); reading order walks the tree depth-first. `src/graph/contents.ts`, pure. |
| The page | Section number, the concept with its kind, field and status, **Show on the map**; Definition (a ruled block); the equation or formulas typeset; what it assumes (type's heading); **How it connects** — every relation as a sentence, out and in, with its description and derivation folded; the type's own sections (Explains, Applies to…); Assumed by; **In this chapter/section**. Previous / Up / Next above and below, and the trail of chapters. |
| Sidebar views | **Contents** (the tree, sections folded except around the current page), **Neighbours** (the current page's relations, out and in, and linked assumptions), **By kind** (type families → kinds → A→Z). One filter for all: a name, kinds of concept, and kinds of relation (the Neighbours view). Filtering keeps the tree's shape — a section above a match shows as context. The chosen view is remembered in this browser. |
| Ways in | **Open its page** on every concept's card; an **Atlas pages** tab; search opens the page while on the pages; **Read the atlas as pages** on the home page; **Show on the map** back. |
| Address | `?mode=page&concept=<id>` (`?mode=page`: the chapters); each move is a history entry. Fluff has no page. |
| Card | Stays as it is — short; the page is the long form. |
| Loading | The page view is its own chunk, loaded on first visit. |

Accessibility is in docs/ACCESSIBILITY.md → Atlas pages (axe clean in both themes and on a phone).

**Open paths:** a curated contents file that overrides the automatic order; the next four
steps above.

## Decision 37 — Pages in Typst at many depths; relation pages; connections; relation categories (2026-10)

Corrections to step 1 of the atlas pages (Decision 36), which also bring in most of
steps 2 and 3:

| Piece | Rule |
|---|---|
| Typst only | A page is written in Typst, not Markdown or LaTeX: `content/pages/<id>/depth-<n>.typ`. Typst 0.15 compiles it at build time (`scripts/compile-pages.mjs`, typst.ts's Node compiler) to HTML with **MathML** equations — real text that's read out, zooms and reflows, instead of pictures of maths. The compiler runs sandboxed in `content/pages`; its output is checked for scripts, frames, forms, handlers and unsafe links (the build stops), and sanitized again when shown (`lib/typstHtml.ts`, an allowlist). Pinned: `@myriaddreamin/typst-ts-node-compiler` 0.8.0-rc3 (a release candidate wrapping Typst 0.15). |
| Depths | A page has as many depths as its authors write — unnamed, 1, 2, 3…, each going further, each standing alone. A reader picks one (a "Depth" radio group); the choice carries to the next page. Blocks are numbered within the section: Definition 3.1.2 on page 3.1. The atlas preamble (`scripts/lib/atlas-preamble.typ`) gives the blocks (definition, theorem, lemma, example, remark, checkpoint; objectives and proof unnumbered) and links (`#concept`, `#relation`). |
| Typst equations | An equation's or a formalism's maths can be Typst: `attrs.notation: "typst"` (one notation per concept, LaTeX by default). Compiled to MathML at build time (`src/data/typstMath.json`); KaTeX stays for LaTeX. |
| Editor | **Its maths is written in** LaTeX / Typst; a **Page** field — a Typst text per depth, **Add a deeper level**, a quick reference, a preview. The previews are approximate (Typst maths converted to LaTeX by tex2typst, a light reading of Typst markup): no browser build of Typst fits — its compiler is 30 MB, over Cloudflare's 25 MiB per-file limit. An edit leaves the page alone until "Edit the page" loads it, so a proposal can't wipe a page by accident. The page travels in the same pull request (`pages` in the proposal; the backend builds each path from the checked id; dropped depths are deleted). |
| Relation pages | Every relation has a page (`?mode=page&relation=<id>`): the relation as a sentence, its category, its two concepts with their definitions, how they connect, the derivation, other relations between the two. For now from the card's information. Reached from "About this relation" on a concept's page and **Open its page** on the relation's card. |
| How it connects | A drawing of the page's neighbourhood — first-order connections on the inner ring, second-order on the outer (by the neighbour that reaches them) — then the relations grouped by category, each with **Further, through X** listing that neighbour's other connections. |
| Relation categories | Ten broader kinds of relation (`relationCategories` in conceptVocabulary.json): Learning order, Dependence, Derivation, Description, Explanation and prediction, Evidence, Classification and parts, Occurrence, Conditions, Association — the two directions of a relation together (derived from / by, describes / described by), relates with links. Every type is in exactly one; the validator refuses a new type without one. |
| Filters | Kinds of concept by family and kinds of relation by category, each group folding, with an "All of …" checkbox that's checked, unchecked or mixed. |

**Open paths:** a Typst build in the browser for exact previews (if a smaller compiler
appears); showing a proposed page in the Community view; written relation pages
(`content/pages/relations/…`); equation numbers in Typst's HTML export (not yet
supported upstream).

## Multi-agent workflow (web-dev-agent-system)

**Installed 2026-07-02** (Setup B from `../web-dev-agent-system-main`):
`.claude/` agents, `.mcp.json` (Chrome DevTools MCP), `scripts/preflight.sh` +
init-template.sh`, `start-dev-session.command`, `BACKLOG.md`, `ROADMAP.md`.
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
