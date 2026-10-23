# Authoring Guide — adding concepts & relations

All content is the **concept graph**: concept-level nodes with 16 types and typed,
directional relations that read as sentences ("Einstein Field Equations leads to
Newtonian Gravity"). It renders as the "Concept map" tab (`?mode=concepts`), and the
"Community" tab (`?mode=community`) is where others propose additions and edits.

| You want to add… | Edit | Format |
|---|---|---|
| A **concept** | `content/concepts/nodes/<id>.json` | JSON — [see below](#where-concepts-live-one-file-each) |
| A **relation** between two concepts | `content/concepts/edges/<id>.json` | JSON — [see below](#writing-an-edge) |

Edit, run `npm run validate`, done. The site rebuilds the map automatically.

(The older topic layer — `topics.json`, the topic map, topic pages and the "Learning goal"
view — was retired in Decision 26. A learning goal is now a concept of type
`learning_goal`, and any concept can be a goal: see
[How the concept curriculum is built](#how-the-concept-curriculum-is-built).)

## Where concepts live: one file each

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
  "importance": 40,
  "generality": 8,
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

## Domains

`attrs.domain` names the research area(s) a concept belongs to. It must come from the
`domains` list in `src/data/conceptVocabulary.json`, so the same field is always spelled the
same way. That matters: the community-review work will route proposals to experts by domain.
Separate several with " / ", for example `"General relativity / Astrophysics"`. To use a new
domain, add it to the list first, and `npm run validate` points out any typo.

> **Open for Sophie:** the list contains both `Relativity` (4 concepts) and the more specific
> `Special relativity` / `General relativity`. They were kept exactly as authored, so nothing
> changed meaning, but you may want to settle on one.

## Node types

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

## Per-type `attrs`

| Type | Fields |
|---|---|
| Every type except `equation`, `learning_goal`, `resource` | `description` (required), `domain` (optional) |
| `equation` | `description`, `equation` (the formula, string), `variables` (`{symbol, meaning}[]`), `conditions` (`string[]`), `representations` (`string[]`), `domain` (optional) |
| `learning_goal` | `description` only — **no `domain`** |
| `resource` | `link` (http/https), `mediaType`, `estimatedMinutes` (number), `rating` (0–5), `reviewCount` (integer) — **no `description`/`domain`** |

## Writing an edge

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

## Conditions and assumptions — on the edge, not a node

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

## How the concept curriculum is built

Any concept can be picked as a goal ("★ Show path to this" on its card, or
`?mode=concepts&goal=<id>`). Only `strict prerequisite for` edges build a
path: the goal's steps are every concept reachable backwards over those edges,
in reading order (a concept comes after everything it needs; ties go to the
shallower concept, then alphabetically by id).
Resources join a step via `helps understand`; all other relations are shown as
context on the card but never add a step. If another relation (e.g.
`depends on`) should pull concepts into paths, that's a one-line change — ask
for it.

A goal with no incoming `strict prerequisite for` edge produces a one-step
path (just the goal) with a "No prerequisites are linked to this goal yet"
note — currently `lg_alpha_decay_nucleons` and
`lg_alpha_radiation_properties`.

## `generality` (1–10): the circle's size

An optional integer, 1 (most specific) to 10 (most general). It sets the size of
the concept's circle on the map. Each step makes the circle 1.5× wider, so 10 is
almost 40 times the size of 1:

| Generality | 1 | 2 | 4 | 6 | 8 | 10 |
|---|---|---|---|---|---|---|
| Circle radius (px at zoom 1) | 7 | 10 | 23 | 53 | 118 | 270 |

From generality 6 up, the name is written **inside** the circle, like a region's
name on a map, and grows with it. Zoom in far enough that a circle is wider than
the screen and it fades to a faint outline: you've zoomed past it, and what's
around it takes over.

The 12 values from Sophie's sheets (on the old 1–5 scale) were doubled. The
other concepts got a **placeholder** generality from Claude's old importance
value (also doubled). Change them freely. A missing value falls back to a
connection-count estimate (learning goals 1).

## `importance` (1–50): how close you have to zoom to see it

An optional integer, 1 (minor detail) to 50 (landmark). The map works like a
street map: zoomed out you see only the landmarks, and zooming in reveals more
and more specific concepts, with the relations between them. Every value is its
own depth — each 8 points lower needs a zoom twice as close:

| Importance | Appears at |
|---|---|
| 50 | always |
| 40 | the whole-map view |
| 32 | 2× closer |
| 24 | 4× closer |
| 16 | 8× closer |
| 8 | 16× closer |
| 1 | about 30× closer |

So to have very specific concepts around *Dark Matter* show only when you're
right next to it, give them a low importance; they sit next to it because
they're connected to it. A concept you've selected, its direct connections, and
every step of an active goal path always stay visible, whatever their
importance. Hovering a concept also shows its hidden neighbours. **Show all
concepts** in the map controls turns the depth off.

Every concept has a **placeholder** importance assigned by Claude (old 1–5 scale
× 10: landmark theories and frameworks 50, learning goals and resources 10–20).
Change them freely. A missing value falls back to a connection-count estimate
(learning goals 1).

The two are independent on purpose. A very general idea can still be a minor
stop on this map (a big circle that only appears up close), and a narrow one can
be a landmark (a small circle that's always there).

## What a concept's card shows

Clicking a concept highlights its direct connections in both directions (silver
leads into it, gold leads out of it) and opens its card: the
description, the epistemic status, then sections that depend on its type —
e.g. a phenomenon lists the conditions it applies under (the `conditions` on its
own relations, or on the relations of the system/model that exhibits it), where it is seen and what explains
it, plus its learning goals (still TBD). The sections are configured per type in
`src/graph/cardSections.ts`; they list linked concepts of the right type in
either edge direction, so they fill in as you add edges. Every relation is
also listed under **All relations**.

## `epistemicStatus`

An optional top-level string on any node saying how settled the concept is,
e.g. `"epistemicStatus": "Candidate"` (Wave Dark Matter). It appears on the
concept's card; a missing value shows a **To-do** marker. Known values live in
`conceptVocabulary.json` → `epistemicStatuses`; using a new value is fine but
the validator warns until you add it there. Leave the field out rather than
writing an empty string.

## `review` — an open question for you

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

## Ids

Ids stay **snake_case**, exactly as exported from Sophie's CSVs
(`quark_gluon_plasma`, `lg_pt_3`), kept for traceability back to her source
files.
Concepts added through the proposal editor get a slug of their name plus a short
random suffix (`jeans_scale_k3f9`), so two proposals never pick the same id.

## Taking in a proposal from the editor

The proposal editor (`?mode=community` → **Propose a concept**) exports
exactly the files a merge adds:

1. **Download the files** gives `<id>.json` for the concept and `<id>_e1.json`, `<id>_e2.json`, …
   for its relations. Put the first into `content/concepts/nodes/` and the rest into
   `content/concepts/edges/`.
2. Run `npm run validate`. The files are already in the canonical format and carry no
   positions; the map lays the concept out like any other.
3. The proposer's **pull-request text** (title, claim, what it adds, evidence) is the
   description for the commit or pull request. The claim and evidence are for reviewers and
   stay out of the concept files.
4. Check `generality` (circle size, 1–10) and `importance` (zoom visibility, 1–50). The
   proposer may have suggested them; if a field is missing, set it yourself, or the concept
   falls back to a size and visibility estimated from its connections.

**An edit** (from **✎ Propose an edit** on a concept's card) exports the concept's file under
its own name: it **replaces** the old one. Its new relations are extra files, and the
relations it removes are listed as files to **delete**. Fields the form doesn't show (review
notes, equation variables, epistemic status) are carried over unchanged.

**A proposal that depends on another one** (its pull-request text has a **Depends on**
section) relates to a concept that isn't accepted yet. Take in the one it depends on first.
If you reject that one, delete the dependent proposal's relation files that point at it, and
take in the rest as usual.

## Before committing

```bash
npm run validate
```

This compiles `content/concepts/**` into the map, then checks it. Catches:
duplicate or malformed ids, relations pointing at concepts that don't exist,
unknown types and relation names, cycles in `strict prerequisite for` (A needs
B needs A), and missing fields. If it prints `✓ content/concepts valid`, the
site will render.

Lines starting with `⚠` are advisories, not failures — for example a learning
goal with no incoming `strict prerequisite for` relation, or concepts without
an `epistemicStatus` yet.

## Rules of thumb for good graph shape

- A concept with more than ~5 strict prerequisites is probably too broad — split it.
- If two concepts always appear together, consider merging them.
- Prefer adding a *humbler* intermediate goal over one giant leap — paths that
  end at different depths are a feature of this site.
