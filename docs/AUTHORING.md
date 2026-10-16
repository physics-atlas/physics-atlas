# Authoring Guide — adding topics & content

Content lives in **two places**:

| You want to add… | Edit | Format |
|---|---|---|
| A **learning goal** ("be able to derive X") with its subgoals + prerequisites | `content/goals/<name>.md` | Markdown outline — [see below](#learning-goals-markdown) |
| A **topic / area** on the map, or resources (books, videos) | [`src/data/topics.json`](../src/data/topics.json) | JSON |
| A **concept-graph node/edge** (pilot, "Concept map" tab) | [`content/concepts/`](../content/concepts/) — one file per node / edge | JSON — [see below](#where-concepts-live-one-file-each) |

Either way: edit, run `npm run validate`, done. The site rebuilds the graph
automatically.

## Learning goals (Markdown)

This is the everyday format — write the outline, the build turns it into the
map. **Every learning goal is a real node**: it has its own subgoals, its own
prerequisites, and *any* of them can be clicked to become the main goal.

Create `content/goals/parallel-transport.md`:

```markdown
# Parallel transport   {id: general-relativity/parallel-transport}

Be able to derive and use the parallel transport equation.

## Subgoals

- Explain all the elements of the parallel transport equation.
- Distinguish between the geodesic equation and parallel transport.

## Prerequisites

### Linear Algebra   {ref: la-tensors}

- Comfortably manipulate matrix equations.        {id: matrix-eqs}
- Use and explain Einstein index notation.        {id: einstein}
- Distinguish abstract vector spaces and 1-forms. {id: duals, needs: matrix-eqs, einstein}

### Calculus   {ref: calculus-geometry}

- Compute derivatives.   {id: compute-derivatives}
- Compute Jacobians.     {needs: compute-derivatives}
```

What each part does:

| Line | Meaning |
|---|---|
| `# Title {id: topicId/goalId}` | The learning goal itself. `topicId` must be a topic in topics.json (its home — e.g. `general-relativity`); `goalId` is a new kebab-case id you choose. |
| Text under the title | The goal's one-line description. |
| `## Subgoals` | Its checkbox breakdown — "what you can do". Each bullet becomes one checkbox. |
| `## Prerequisites` | The areas this goal builds on. |
| `### Area {ref: topicId}` | An **area** — must be an existing topic id. Its bullets become learning goals *of that area*. |
| `- text {id: …, needs: …}` | One learning goal. `id` optional (auto-slugged from the text, but write it if others reference it). `needs` lists learning goals that come **first**. |

`needs` rules:

- Bare id (`matrix-eqs`) = a sibling in the **same** area.
- Cross-area = `areaTopicId/goalId` (e.g. `la-tensors/duals`).
- These become real prerequisite edges — they order the curriculum and draw
  the arrows on the map. Keep them acyclic; the validator checks.

Reuse is by id: writing the same `{id:}` under the same `{ref:}` area in
another file refers to the *same* learning goal (first definition wins, and
the validator warns if a later one disagrees). So a second goal that also
needs `la-tensors/duals` just lists it — the learner ticks it once.

If an area doesn't exist yet, add it to topics.json as a normal topic first
(see below), then point `{ref:}` at it.

## Adding a topic

Append an object to the `topics` array:

```json
{
  "id": "quantum-field-theory",
  "title": "Quantum Field Theory",
  "category": "method",
  "description": "One or two sentences: what is this and why would someone learn it?",
  "prerequisites": ["quantum-mechanics", "special-relativity"],
  "featured": false,
  "content": []
}
```

Field rules:

| Field | Rule |
|---|---|
| `id` | kebab-case (`lower-case-with-dashes`), unique. Never change an id later without updating everyone who lists it as a prerequisite. |
| `title` | Human-readable name shown on the node. |
| `category` | **Optional** — leave the field out as long as you're not sure; such topics appear neutral grey with the legend entry *Not yet categorized*, and the validator won't complain. Adding it later is a one-word diff. If set: `field` — a domain of physical phenomena you study (electromagnetism, cosmology, condensed matter). `method` — a formalism/tool applied across fields (Lagrangian mechanics, QFT, fluid dynamics, numerics). `math-concept` — mathematics (calculus, linear algebra, tensors, the metric). Drives node color and the legend. |
| `prerequisites` | ids of topics to learn **directly before** this one. Only direct edges — don't list calculus on cosmology; the graph walks the chain for you. `[]` for entry-point topics. |
| `featured` | `true` shows the topic in the goal picker on the landing view. Optional. |
| `content` | list of learning resources, see below. `[]` is allowed (validator warns but passes). |
| `subtopics` | **Optional** — a missing `subtopics` array is a valid, permanent state (a plain node), not a gap to fill; ~28 of the current topics have none yet, Sophie annotates incrementally. See [below](#subtopics-optional-per-topic) for the format. When present, the topic renders open on the map by default (its subtopics shown as child nodes), collapsible via the ⊕/⊖ toggle. |

## Adding content to a topic

```json
{
  "type": "video",
  "title": "The Theoretical Minimum — Cosmology",
  "author": "Leonard Susskind (Stanford)",
  "url": "https://theoreticalminimum.com/courses",
  "note": "Full lecture course pitched exactly at this level."
}
```

- `type`: `book` · `video` · `course` · `notes` · `article`
- `url`: optional (books often have none), must start with `http(s)://`
- `note`: one sentence of guidance — *why this resource / which chapters / what order*. This is the most valuable field; always write it.

## Subtopics (optional, per topic)

A topic can carry a `subtopics` array — its chapter-level parts, each with its
own prerequisites. This is what makes minimal curricula possible: someone
learning *The Hydrogen Atom* gets only *Eigenvalues & Eigenvectors* from
Linear Algebra, not the whole course. Annotate incrementally — topics without
`subtopics` keep working as one block.

```json
{
  "id": "linear-algebra",
  "...": "...",
  "subtopics": [
    { "id": "vectors-and-spaces", "title": "Vectors & Vector Spaces", "prerequisites": ["hs-math"] },
    {
      "id": "eigenvalues-and-eigenvectors",
      "title": "Eigenvalues & Eigenvectors",
      "description": "Directions a transformation only stretches.",
      "prerequisites": ["matrices-and-linear-maps", "determinants"],
      "content": []
    }
  ]
}
```

| Field | Rule |
|---|---|
| `id` | kebab-case, unique **within its topic**. |
| `title` | Shown as a curriculum step. |
| `description` | Optional, shown when the step is expanded. |
| `prerequisites` | Refs in three forms — see below. |
| `optionalPrerequisites` | Same ref forms; *enrichment*, not required. Curriculum shows these steps with an "optional" badge and a hide toggle; the map draws optional topic edges dashed. On overlap with `prerequisites`, mandatory wins. |
| `outcomes` | Optional subgoals — the tickable "what you can do" breakdown, shown in the step detail, the map card, the topic page and the PDF. Each is `{ "id": "kebab-id", "text": "Can do …" }`; add `"needs": ["other-id"]` to order them. Usually easier to author in Markdown (above); this is the inline form. |
| `content` | Optional own resources; when empty/absent the step shows the parent topic's resources. |

Topics support `optionalPrerequisites` (topic ids) and `outcomes` too.
Keep the union of mandatory + optional edges acyclic — the validator checks it,
because the curriculum ordering runs on both together.

Prerequisite refs, resolved in this order:

1. `"linear-algebra/eigenvalues-and-eigenvectors"` — full `topic/subtopic` ref, works across topics.
2. `"determinants"` — shorthand for a **sibling** subtopic of the same topic.
3. `"hs-math"` — a whole topic, allowed **only** if that topic has no subtopics
   of its own. Referencing an annotated topic bare is an error — pick the
   specific subtopic you need.

Consistency rule: a cross-topic ref should stay inside topics your topic
already (transitively) builds on — the validator warns otherwise, because it
usually means a topic-level edge is missing from the map.

A topic's hand-authored `subtopics` (here in topics.json) and its
Markdown-compiled ones (`content/*.md`, above) share one id space — pick ids
that don't collide, or the validator reports a duplicate subtopic id.

## Skills (optional, top-level)

Next to `topics` the file can carry a `skills` array — study habits shown as a
collapsible "Skills to practice along the way" panel under every curriculum
(they are *not* graph nodes and have no prerequisites):

```json
{ "id": "dimensional-analysis", "title": "Dimensional analysis & estimation", "description": "…", "content": [] }
```

## Concept graph (pilot)

The concept graph is a **second, independent dataset**: it doesn't replace `topics.json`,
and it renders in its own view, the "Concept map" tab (`?mode=concepts`). It models Sophie's
pilot CSVs: concept-level nodes with 16 types and typed, directional edges that read as
sentences, rather than topics.json's course-level `Topic`/`Subtopic` shape.

### Where concepts live: one file each

Every concept and every relation is its own small file in `content/concepts/`:

```
content/concepts/
├── graph.json                    { "version": 1 }
├── nodes/parallel_transport.json one concept
└── edges/e6.json                 one relation
```

```json
// content/concepts/nodes/parallel_transport.json
{
  "id": "parallel_transport",
  "type": "method",
  "label": "Parallel Transport",
  "importance": 4,
  "attrs": { "description": "…", "domain": "General relativity" }
}
```

```json
// content/concepts/edges/e6.json
{
  "id": "e6",
  "source": "tangent_vector",
  "target": "parallel_transport",
  "relationship": "Strict Prerequisite for"
}
```

- **To add a concept or relation, add a file; to change one, edit its file; to remove one,
  delete its file.** The file name must be the `id` plus `.json`, and the validator refuses
  a mismatch.
- **Why one file each:** every concept gets its own history (`git log content/concepts/nodes/parallel_transport.json`
  shows who changed it and when), and two people editing different concepts never conflict.
  The community-review work builds on this.
- **`src/data/concepts.json` is generated** from these files by `npm run build:content`
  (which `dev`, `build`, `validate` and `test` all run first). It isn't in git. Don't edit it:
  your changes would be overwritten. While `npm run dev` is running, saving a concept file
  recompiles automatically and the map reloads.
- Keep the files in the standard format: 2-space indentation, as above. The validator warns
  about a hand-formatted file. It still works, but its history becomes harder to read.
- The order of files doesn't matter. The map, the search and the lists sort concepts
  themselves.

### Domains

`attrs.domain` names the research area(s) a concept belongs to. It must come from the
`domains` list in `src/data/conceptVocabulary.json`, so the same field is always spelled the
same way. That matters: the community-review work will route proposals to experts by domain.
Separate several with " / ", for example `"General relativity / Astrophysics"`. To use a new
domain, add it to the list first, and `npm run validate` points out any typo.

> **Open for Sophie:** the list contains both `Relativity` (4 concepts) and the more specific
> `Special relativity` / `General relativity`. They were kept exactly as authored, so nothing
> changed meaning, but you may want to settle on one.

### Node types

The 16 types (key → what it means), from `src/data/conceptVocabulary.json`:

| Type | Meaning |
|---|---|
| `physical_system` | Physical system — a thing being modeled (spacetime, a nucleus, a plasma). |
| `property` | Property/quantity — an attribute of a system (curvature, half-life, four-velocity). |
| `phenomenon` | Phenomenon — an observed effect (gravitational lensing, alpha decay). |
| `process` | Process/dynamics — a change or evolution over time or space (diffusion, radioactive decay). |
| `model_regime` | Model/behaviour regime — a simplified theory valid in some limit (Newtonian gravity, special relativity). |
| `theory` | Theory/framework — an organised body of concepts and principles (general relativity, quantum field theory). |
| `formalism` | Mathematical formalism — the math machinery used (linear algebra, differential geometry). |
| `equation` | Law/equation — a named equation, with its own attribute shape (below). |
| `method` | Method/technique — a technique applied to get a result (parallel transport, orthogonal projection). |
| `experiment` | Experiment/evidence — an observation or apparatus (the 1919 eclipse expedition, RHIC). |
| `dataset` | Data/dataset — recorded measurements or simulation output (CMB maps, a galaxy catalogue). |
| `claim` | Claim/hypothesis — a proposition that can be tested (a dark-matter mass range is excluded). |
| `finding` | Finding/result — a reported outcome (a measured Hubble constant, a detected spectral line). |
| `learning_goal` | Learning goal — a "can do X" outcome; a small, minimal node (no `domain`). |
| `resource` | Educational resource — a book/video/quiz (no `description`/`domain`). |
| `misconception` | Misconception — a common wrong idea, linked to the concept it's about. |

**What learners see.** Clicking a type in the concept map's legend opens its
definition from `conceptVocabulary.json` → `nodeTypeDefinitions`, keyed by the
type key above:

```json
"phenomenon": {
  "term": "Phenomenon",
  "definition": "An empirically observed or theoretically characterised effect …",
  "examples": ["Interference", "superconductivity"],
  "distinctions": ["Phenomenon versus process: …"]
}
```

`term` is the ontology's name for the type (shown when it differs from the short
label), `examples` is a list of short names, and `distinctions` spells out types
that are easy to confuse with this one (use `[]` when there are none). A type
with no entry shows "no agreed definition yet", and `npm run validate` warns about
it. Every type currently has one.

### Per-type `attrs`

| Type | Fields |
|---|---|
| Every type except `equation`, `learning_goal`, `resource` | `description` (required), `domain` (optional) |
| `equation` | `description`, `equation` (the formula, string), `variables` (`{symbol, meaning}[]`), `conditions` (`string[]`), `representations` (`string[]`), `domain` (optional) |
| `learning_goal` | `description` only — **no `domain`** |
| `resource` | `link` (http/https), `mediaType`, `estimatedMinutes` (number), `rating` (0–5), `reviewCount` (integer) — **no `description`/`domain`** |

### Writing an edge

`source` + `relationship` + `target` must read as a sentence: *"{source
label} {relationship} {target label}."* The `relationship` string is looked
up (trimmed, case-insensitive) against the template table in
`conceptVocabulary.json` — an edge whose relationship isn't in the table
fails validation. The 32 known relationships:

| `relationship` | Sentence template |
|---|---|
| `strict prerequisite for` | `{s} is a strict prerequisite for {t}.` |
| `relates` | `{s} relates to {t}.` |
| `helps understand` | `{s} helps understand {t}.` |
| `described by` | `{s} is described by {t}.` |
| `has a` | `{s} has a {t}.` |
| `is one property of` | `{s} is one property of {t}.` |
| `is derived by` | `{s} is derived by {t}.` |
| `is derived from` | `{s} is derived from {t}.` |
| `is a condition of` | `{s} is a condition of {t}.` |
| `leads to` | `{s} leads to {t}.` |
| `depends on` | `{s} depends on {t}.` |
| `explains` | `{s} explains {t}.` |
| `links` | `{s} links to {t}.` |
| `is a` | `{s} is a {t}.` |
| `assumes a` | `{s} assumes a {t}.` |
| `describes` | `{s} describes {t}.` |
| `happens in` | `{s} happens in {t}.` |
| `exhibits` | `{s} exhibits {t}.` |
| `under` | `{s} is under {t}.` |
| `predicts` | `{s} predicts {t}.` |
| `applies to` | `{s} applies to {t}.` |
| `valid under` | `{s} is valid under {t}.` |
| `uses` | `{s} uses {t}.` |
| `expressed by` | `{s} is expressed by {t}.` |
| `tested by` | `{s} is tested by {t}.` |
| `concerns` | `{s} concerns {t}.` |
| `requires` | `{s} requires {t}.` |
| `supported by` | `{s} is supported by {t}.` |
| `addresses` | `{s} addresses {t}.` |
| `approximates` | `{s} approximates {t}.` |
| `assumes` | `{s} assumes {t}.` |
| `is a class of` | `{s} is a class of {t}.` |

The twelve from `exhibits` to `addresses` follow the intended pattern by node type (not enforced by the
validator):

| Source type | Relationship | Target type |
|---|---|---|
| Physical system | `exhibits` | Phenomenon |
| Model | `explains` / `predicts` | Phenomenon |
| Model | `applies to` | Physical system |
| Model | `uses` | Mathematical formalism |
| Model | `expressed by` | Law/equation |
| Model | `tested by` | Experiment |
| Learning goal | `concerns` | any physics node |
| Learning goal | `requires` | Learning goal |
| Learning goal | `supported by` | Educational resource |
| Learning goal | `addresses` | Misconception |

On the concept map every edge carries its relationship name as a label along
the line (hidden when zoomed far out, larger when the edge is highlighted);
hovering the line enlarges its name and pops out the two concepts it joins.
The full sentence appears in each concept's card under **Relations**.

Adding a new relationship type means adding a row to `conceptVocabulary.json`
first — the validator refuses any edge whose relationship isn't in the table.

### Conditions and assumptions — on the edge, not a node

A condition is not a concept of its own: it qualifies a relation. Write it as
an optional `conditions` list on the edge it applies to:

```json
{
  "id": "e63",
  "source": "zeldovich_approximation",
  "target": "structure_formation",
  "relationship": "approximates",
  "conditions": [
    {
      "label": "linear potential",
      "description": "The assumption that the gravitational potential keeps its initial, linear-theory form …"
    }
  ]
}
```

This reads *"Zel'dovich approximation approximates Structure Formation under the
assumption of linear potential."* Several conditions read *"under the assumptions
of A and B"*. `label` is required and sits mid-sentence, so write it in lower case
unless it's a name. `description` is optional and shows on the card. On the map the
edge label gets a second line, *"assuming linear potential"*. Cards list the
conditions under a type-specific heading (e.g. **Valid under** for a model,
**Applies under** for a phenomenon). Leave the field out when there are none, since
an empty list fails validation.

An equation's own `attrs.conditions` (plain strings, see above) stays as it is.
That list describes the equation itself, not one of its relations.

### How the concept curriculum is built

Any concept can be picked as a goal ("★ Show path to this" on its card, or
`?mode=concepts&goal=<id>`). Only `strict prerequisite for` edges build a
path: the goal's steps are every concept reachable backwards over those edges,
ordered by the same rule as topic curricula (a concept comes after everything
it needs; ties go to the shallower concept, then alphabetically by id).
Resources join a step via `helps understand`; all other relations are shown as
context on the card but never add a step. If another relation (e.g.
`depends on`) should pull concepts into paths, that's a one-line change — ask
for it.

A goal with no incoming `strict prerequisite for` edge produces a one-step
path (just the goal) with a "No prerequisites are linked to this goal yet"
note — currently `lg_alpha_decay_nucleons` and
`lg_alpha_radiation_properties`.

### `importance` (1–5)

An optional integer, 1 (minor detail) to 5 (landmark). It sets the circle's
size and its name's size, and how far out the concept stays visible: the map
works like a street map, where zoomed out you see only the landmarks, and zooming in
reveals more detail. On the whole-map overview, concepts of importance 4 and 5
show. Importance 3 appears at about 1.5× that zoom, 2 at about 2×, and 1 at about
3×. Importance 5 never disappears. A concept you've selected, its direct
connections, and every step of an active goal path always stay visible,
whatever their importance. Hovering a concept also shows its hidden neighbours.

Every concept currently has a **placeholder** importance assigned by Claude
(landmark theories and frameworks 5, learning goals and resources 1–2). Change
them freely. A missing value falls back to `generality`, then to a
connection-count estimate (learning goals 1).

### `generality` (1–5)

An optional integer, 1 (most specific) to 5 (most general). It no longer drives
size directly; it's the fallback when `importance` is missing.

### What a concept's card shows

Clicking a concept highlights its direct connections in both directions (silver
leads into it, gold leads out of it) and opens its card: the
description, the epistemic status, then sections that depend on its type —
e.g. a phenomenon lists the conditions it applies under (the `conditions` on its
own relations, or on the relations of the system/model that exhibits it), where it is seen and what explains
it, plus its learning goals (still TBD). The sections are configured per type in
`src/graph/cardSections.ts`; they list linked concepts of the right type in
either edge direction, so they fill in as you add edges. Every relation is
also listed under **All relations**.

### `epistemicStatus`

An optional top-level string on any node saying how settled the concept is,
e.g. `"epistemicStatus": "Candidate"` (Wave Dark Matter). It appears on the
concept's card; a missing value shows a **To-do** marker. Known values live in
`conceptVocabulary.json` → `epistemicStatuses`; using a new value is fine but
the validator warns until you add it there. Leave the field out rather than
writing an empty string.

### `review` — an open question for you

A `review` field on a node or edge is an open question, not an error —
delete it once you've decided. Current open items from the migration:

1. `relates`/`Relates` casing (11× `Relates`, 1× `relates` on `e55`) — same
   edge type once normalized; validator warns, nothing to fix urgently.
2. `e57` (`exponentials → decay_equation`, "has a") reads backwards compared
   to the other `has a` edges — source/target may be swapped.
3. `e7` ("is derived from"), `e39`/`e40` ("is derived by") read in opposite
   senses for what looks like one relationship — direction and/or type to
   be decided.
4. `e35` (`quark_gluon_plasma → rhic`, "Described by") — RHIC is the
   experimental apparatus; a different edge type might fit better.
5. `lg_alpha_decay_nucleons` and `lg_alpha_radiation_properties` (learning
   goals) have no edges at all — no prerequisite links them to any concept.
6. Four `resource` nodes link to `example.com` placeholder URLs — replace
   with real links when you have them.

### Ids

Ids stay **snake_case**, exactly as exported from Sophie's CSVs
(`quark_gluon_plasma`, `lg_pt_3`) — they're a different id space from
topics.json's kebab-case ids, kept for traceability back to her source files.
Concepts added through the proposal editor get a slug of their name plus a short
random suffix (`jeans_scale_k3f9`), so two proposals never pick the same id.

### Taking in a proposal from the editor

The proposal editor (`?mode=concepts&community=1` → **Propose a concept**) exports
exactly the files a merge adds:

1. **Download the files** gives `<id>.json` for the concept and `<id>_e1.json`, `<id>_e2.json`, …
   for its relations. Put the first into `content/concepts/nodes/` and the rest into
   `content/concepts/edges/`.
2. Run `npm run validate`. The files are already in the canonical format and carry no
   positions; the map lays the concept out like any other.
3. The proposer's **pull-request text** (title, claim, what it adds, evidence) is the
   description for the commit or pull request. The claim and evidence are for reviewers and
   stay out of the concept files.
4. Set `importance` yourself. The editor doesn't ask for it, so a new concept starts at the
   fallback size until you do.

## Before committing

```bash
npm run validate
```

This first compiles `content/**/*.md` into the map, then validates everything
together. Catches: duplicate/malformed ids, prerequisites (and `needs`)
pointing to things that don't exist, cycles (A needs B needs A — also through
subtopic chains), bare refs to annotated topics, bad URLs, missing fields. If
it prints `✓ topics.json valid`, the site will render.

Lines starting with `⚠` are advisories, not failures — the most common is
"topic-level prerequisite … is not referenced by any subtopic", which just
means an area's learning goals don't yet cover everything it builds on.

## Rules of thumb for good graph shape

- A topic with more than ~5 direct prerequisites is probably too big — split it.
- If two topics always appear together, consider merging them.
- Prefer adding a *humbler* intermediate goal (e.g. Special Relativity) over
  one giant leap — endings at different depths are a feature of this site.
