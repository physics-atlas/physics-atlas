# Physics Atlas (sophie_scicom)

An accessible map of physics concepts organised as a **graph**: every concept
is linked to what it stands on and what it leads to, by relations that read as
sentences. Zoom out for the landmarks, zoom in to reveal the specific concepts
around them, or pick any concept as a goal and get the path of prerequisites
that leads to it. The **Community** tab is where others propose new concepts
and edits, each one a pull request reviewed on GitHub.

**Live:** https://physics-atlas.gnmdaudt.workers.dev

![Home — animated galaxy landing page](docs/screenshots/home.png)

More views in [docs/screenshots/](docs/screenshots/).

## Run

```bash
npm install
npm run dev        # http://localhost:5173
```

- `?mode=concepts` opens the concept map, `?mode=community` the community view.

## Commands

| Command | What |
|---|---|
| `npm run dev` | dev server |
| `npm run build` | typecheck + production build to `dist/` |
| `npm run validate` | check `content/concepts/**` (ids, references, types, cycles) |
| `npm test` | unit tests |
| `npm run lint` | oxlint |

## Editing content

Every concept and relation is its own file in [`content/concepts/`](content/concepts/).
See **[docs/AUTHORING.md](docs/AUTHORING.md)** — then `npm run validate`.

## Structure

```
content/concepts/  the concept graph: nodes/<id>.json + edges/<id>.json
src/
├── data/          types.ts, conceptVocabulary.json (concepts.json is generated)
├── graph/         concepts.ts (sizes, zoom depth, learning paths), layoutOptimize.ts, conceptLayout.ts (built once, shipped), contents.ts (the atlas pages' chapters), typeColors.ts
├── community/     proposals, the proposal editor's drafts, the GitHub-backed store
└── components/    GraphView (Cytoscape), ConceptMapView, ConceptCard, DraftEditor, Legend, PageView (atlas pages)
server/, worker/   the Cloudflare Worker: sign-in with GitHub, proposals ↔ pull requests
scripts/           compile-concepts.mjs, validate-concepts.mjs, smoke-test.mjs
docs/              DESIGN-DECISIONS.md (all chosen + alternative pathways), AUTHORING.md
```

## Design decisions

All choices (stack, graph library, UI concept, authoring flow) and the
alternatives kept open as future pathways: **[docs/DESIGN-DECISIONS.md](docs/DESIGN-DECISIONS.md)**.
