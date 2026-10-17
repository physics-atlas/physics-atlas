---
feature-id: epic (phases become features 33+ as each is scheduled)
title: Community proposals, expert review and an auditable graph history
estimated-complexity: high
data-impact: schema
status: D1, D3 and D4 (principle) accepted 2026-10-15; D2, D5, D6 and D7 open (block Phases 3–6, not 0–2)
---

## Context

Today the concept graph has one author (Sophie) who edits `src/data/concepts.json` in git;
everyone else can only read. The goal is to let **experts propose** nodes and edges, have
**other experts verify or dispute** them, and let **domain stewards merge** what reaches
consensus. All of this has to happen with a **public, immutable history** that shows who did
what. Contested ideas stay visible as part of a live debate instead of being deleted.

The brief has four parts:

1. A **staging-area editor**: ghost nodes and edges drawn over the live graph without
   changing it, with conflict detection.
2. A **proposed layer**: a show/hide toggle for confirmed and proposed items, a proposal card
   with the claim, its evidence and three vote buttons, and a quorum rule.
3. **"Git for Science"**: branches, comments on nodes, steward merges, verified identity, an
   audit log and blame.
4. A **Contested** status with a dispute thread.

This reverses a standing project decision. `CLAUDE.md` → "Deliberately not now" says *no
backend, no accounts, no CMS*. Phase 0 replaces that with a recorded Decision 18 instead of
quietly drifting from it.

### What already exists and points this way

- `epistemicStatus` (`src/data/types.ts:161`, vocabulary "Candidate") — a per-node
  certainty marker. "Proposed / Contested" is its community-driven successor.
- `review` on nodes and edges (`types.ts:163`, `:187`) — a one-line open question for the
  author. It's the seed of a discussion thread.
- The validator already detects **duplicate (source, target, type) edges**
  (`scripts/validate-concepts.mjs:169`, `:200`) and **strict-prerequisite cycles**
  (`scripts/lib/find-cycle.mjs`). These are the server-side half of conflict detection.
- The content pipeline already **compiles authored files into the app's JSON**
  (`scripts/compile-content.mjs`, used for `content/goals/*.md`). The same pattern can
  compile per-node files.
- The canvas already draws status by **CSS-like classes without re-layout**:
  `PINNED` (`GraphView.tsx:29`), `zoom-hidden` (`:358`), dashed `optional-edge` (`:290`).
  Ghost and proposed elements are more classes in the same pattern.

---

## My take on the blueprint

| Blueprint item | Verdict | Why / what instead |
|---|---|---|
| React Flow canvas | **Change → keep Cytoscape** | We've invested in Cytoscape: direction-free layout search, zoom level of detail, map controls, the a11y work. React Flow is DOM-based and nicer for editing, but this is a rewrite that `CLAUDE.md` explicitly ruled out. The ghost layer is just more element classes in the same instance. Edge drawing can use `cytoscape-edgehandles` (one small dependency). |
| Drag the proposed node onto the canvas | **Keep — as a visual thinking aid** *(revised after review)* | On a large graph it's hard to picture in your head where a new idea fits. Dragging the ghost around the live graph is how the proposer *works that out*. The position is a sketch, never data: it isn't saved with the proposal. Once a proposal is merged, the node is placed by the normal layout and shown under the accessibility rules like everything else. While the ghost is being dragged, the concepts nearest to it light up and are offered as one-click connections, so the gesture turns into edges. Dragging still can't be the *only* way (WCAG 2.5.7): the same proposal can be built entirely with the form and the search combobox, and keyboard users get the same "nearby concepts" suggestions from the concepts they've already connected. |
| Yellow / orange / red for draft / proposed / contested | **Change** | Fill colour already means *node type*, and red, amber and olive are type colours (`typeColors.ts`). Status goes on the **outline + badge + text** instead: draft = dashed glowing outline; proposed = dashed outline + "Proposed · ✓3 ✗1" badge; contested = double outline + ⚑ "Contested" badge. A proposed phenomenon still reads as a phenomenon, and status never relies on colour alone. |
| The ghost layer "doesn't change the canvas" | **Keep, and make it a hard rule** | Confirmed nodes must not move while someone is sketching or viewing proposals, otherwise the map you're reasoning about shifts under you. Your own draft sits wherever you drop it. *Other people's* proposals (which carry no position) are placed next to their connections by the force layout with confirmed nodes **fixed**: an extension of `forceLayout()` in `layoutOptimize.ts`, not a new engine. |
| Neo4j for the graph | **Drop** | 64 nodes today, and even 10,000 fit in browser memory. The queries we need (neighbours, paths, closure) already exist in `concepts.ts` / `dag.ts`. A graph DB would be a second source of truth that has to be kept in sync with git. |
| PostgreSQL for users and votes | **Defer** | Not needed if GitHub is the backend (below). It's the fallback if we outgrow it. |
| isomorphic-git on our own server | **Change → GitHub as the git backend** | This is the biggest simplification; see the next section. |
| Every vote is a commit | **Change** | Committing every vote spams the history and causes merge conflicts. Votes are **pull-request reviews**, which are timestamped, attributed and public. The **merge commit records the final tally and the approvers** as trailers (`Verified-by: Jane Doe <ORCID 0000-…>`). Every vote stays traceable, and the content history stays readable. |
| TipTap rich text + LaTeX | **Change → Markdown + `$…$` LaTeX, rendered with KaTeX** | TipTap stores JSON that diffs and blames poorly, and readable blame is the whole point. Markdown in a plain textarea with a live preview is accessible and works with screen readers. KaTeX is one render-only dependency. Revisit TipTap only if experts ask for it. |
| ORCID or institutional e-mail for moderators | **Keep ORCID; e-mail later** | ORCID OAuth proves *identity*. **Expertise** ("Cosmology") still needs attesting: a curator or steward approves the tag, and that approval is itself a reviewed change to a public `community/experts.json`. Institutional e-mail needs a mail-sending backend, so it comes later. |
| Quorum: 3 domain-expert Verify votes and no open Dispute | **Keep, as a configurable policy** | On day one there won't be three cosmology experts. The rule lives in `community/policy.json`, per domain, with a **bootstrapping** default (e.g. 1 steward approval while fewer than 5 verified experts are in the domain). Applying it requires a **controlled `domain` vocabulary**: today `attrs.domain` is free text. |
| Contested instead of rejected | **Keep — and extend to confirmed items** | A *confirmed* node can also be challenged later. A contested item stays on the main graph with a ⚑ badge and a link to its dispute thread. |
| Review queue with a mini-graph | **Keep** | It reuses `GraphView` with `fitIds` on the affected neighbourhood (the same sub-view as the click highlight). |

### GitHub as the "Git for Science" backend (recommended)

Every concept of the brief maps onto something GitHub already does reliably:

| Brief | GitHub mechanism |
|---|---|
| A proposal creates a branch | A branch + pull request with the new or changed node and edge files (one proposal per PR) |
| Comment directly on the node | A PR review comment anchored to that node's file. Our UI shows them as a thread on the node |
| Verify / Dispute / Needs clarification | A PR review with a structured first line (`verify` / `dispute` / `clarify`); Dispute = "Request changes" |
| Domain stewards merge | Stewards per domain in `community/experts.json`; the "Quorum" Action reads each changed node's `domain` and requires a steward of that domain (folders stay flat, Decision 19) + branch protection |
| Quorum, and no unresolved disputes | A GitHub Action reads `policy.json` + `experts.json` and the reviews, and reports a **required status check** "Quorum" |
| Contested | A label `contested` → on merge, it writes `status: contested` + a thread link into the node |
| Immutable history, blame | `git log --follow` on the node's own file; signed merge commits |
| Public audit log | The repository's merged-PR and review event feed, cached as `audit.json` |

**What it costs:**
- Every contributor needs a GitHub account (common among physicists; non-developers never
  see GitHub, because our UI wraps it).
- A **tiny serverless proxy** (a Cloudflare Worker or similar) is needed for the OAuth token
  exchange and to cache API reads against rate limits.
- Dependence on one vendor: everything goes through a `ProposalStore` interface so an own
  backend (Postgres event log + server-side git) can replace it.

**When to choose the own backend instead (D1):**
- Contributors without GitHub accounts are essential.
- Votes must be private.
- The policy can't be expressed as an Action.

---

## Target architecture

```
 Browser (static SPA on GitHub Pages)                 GitHub
 ┌───────────────────────────────────────┐          ┌──────────────────────────────┐
 │ Concept map (Cytoscape)               │  reads   │ main: content/concepts/**    │
 │  confirmed ─ solid                    │◀─────────│   one JSON file per node/edge│
 │  proposed  ─ dashed + badge   ◀───────┼──┐       │ open PRs = proposals         │
 │  contested ─ double + ⚑               │  │       │ reviews  = votes + threads   │
 │  draft     ─ ghost (local only)       │  │       │ labels   = contested, …      │
 │ Staging editor · Proposal card        │  │       │ Action "Quorum" (policy.json,│
 │ Review queue · Blame · Audit log      │  │       │   experts.json, node domains)│
 │ ProposalStore interface ──────────────┼──┼──────▶│ signed merge commits         │
 └───────────────────────────────────────┘  │       └──────────────────────────────┘
                     ▲                      │                    ▲
                     │ OAuth (GitHub, ORCID)│ cached proposals,  │ API (app token)
                     ▼                      │ audit feed         │
              ┌──────────────────────────────────────────────────┴───┐
              │ Serverless proxy: token exchange, read cache, ORCID   │
              │ linking. No database: state lives in git.             │
              └───────────────────────────────────────────────────────┘
```

## Data model changes

- **One file per entity:** `content/concepts/nodes/<id>.json`, `content/concepts/edges/<id>.json`
  (flat folders; stewards are routed by the `domain` field, not by path). They're compiled into
  `src/data/concepts.json` at build time, which reuses the `compile-content.mjs` pattern. The
  benefits:
  - per-node blame;
  - parallel PRs that don't conflict;
  - small, readable diffs.
- **Status on main:** `status?: 'confirmed' | 'contested'` (missing = confirmed). *Proposed*
  items are never on main; they're the open PRs, overlaid by the client.
- **Claim and evidence:** `claim` (Markdown + LaTeX) and
  `evidence: [{ kind: 'arxiv' | 'doi' | 'url' | 'equation', ref, note? }]`. The validator
  checks the arXiv and DOI formats.
- **Stable, collision-free ids:** new ids are a slug plus a short random suffix
  (`jeans_scale_k3f9`), so two parallel proposals never collide.
- **Controlled `domain` vocabulary** in `conceptVocabulary.json`. It's needed for routing to
  stewards and for quorum.
- **Community data:**
  - `community/experts.json` — ORCID, GitHub handle, expertise tags, and who attested them;
  - `community/policy.json` — quorum rules per domain;
  - stewards per domain live in `experts.json` (roles), not in `CODEOWNERS`.
- **Migration:** `epistemicStatus` stays (the author's certainty); `status` is the
  community's verdict. Open `review` notes become the first threads.

---

## Phases

Each phase can be shipped on its own and tested in the browser. Each one is worth keeping even
if we stopped after it. Phases 1–5 live in the **Community** view (`?mode=community`, a header tab
since feature-44, open to everyone until sign-in in Phase 3); it replaced the `?community=1` flag.

**Hands-on testing:** `docs/TESTING-COMMUNITY-REVIEW.md` has a step-by-step check for every
built phase. Each phase's work isn't done until its section there is written and verified.

### Phase 0 — Decisions and groundwork *(no visible change)* — ✅ done 2026-10-15 (feature-33)

- **Scope:**
  - Decisions D1–D7 (below); Decision 18 in `DESIGN-DECISIONS.md`; update `CLAUDE.md`
    "Deliberately not now".
  - **Add Vitest** — the repo has no unit tests, and this epic is mostly pure logic: conflict
    detection, quorum, diffing, compiling.
  - **Split `concepts.json` into per-entity files** + a compile step + the validator reading
    the files; `concepts.json` becomes generated.
  - The controlled `domain` vocabulary.
- **Exit:**
  - `npm run validate && npm run build && npm test` are green.
  - The compiled graph equals today's by id (nodes and edges identical; node order is now by id).
  - The smoke test still reports 64 nodes and 66 edges.
- **Value if we stop here:** cleaner diffs and per-node blame for Sophie's own edits.

### Phase 1 — The proposed layer, read-only *(fixtures, no backend)* — ✅ done 2026-10-15 (feature-34)

> **As built** (differences from the scope below, all deliberate):
> - Proposals are an **overlay** (`ConceptOverlay`, `src/community/proposals.ts`), added
>   *after* the confirmed layout instead of being merged into `conceptElements()`, so they
>   can't enter the layout search or its cache. `placeNew()` (layoutOptimize.ts) places them
>   with every confirmed node fixed. When the background search improves the confirmed
>   layout, the overlay is re-placed and glides along.
> - The proposal card is its own component (`ProposalCard.tsx`), lazy-loaded together with
>   KaTeX, and reuses `RelationSentence` and the card styles. Claims are written in a small
>   tested Markdown subset (`richText.ts`).
> - The toggles sit in the map's control bar (bottom right), not at the top. A toggle
>   never moves the view (changed after testing: it used to re-frame). With confirmed hidden, the concepts a proposal
>   attaches to stay as faint context.
> - Keyboard route: a "Proposed — not yet confirmed" group in the concept list. A confirmed
>   concept's card lists the open proposals about it.
> - Gotchas found and fixed: Cytoscape doesn't support `:not(...)` selectors (it silently
>   matches everything; use `.not()`); Vitest 5's on-disk module cache kept stale
>   `import.meta.glob` results (`fsModuleCache: false`).

- **Scope:**
  - A `ProposalStore` interface plus a `FixtureStore` (2–3 hand-written proposals in
    `content/proposals-fixtures/`).
  - `GraphView` merges the proposed elements into `conceptElements()` (`:715`) as
    `status-proposed` / `status-contested` classes: dashed or double outline, a badge and a
    text label.
  - Toolbar toggles **Show confirmed** / **Show proposed** (`aria-pressed`, next to "Show all
    concepts").
  - Proposed nodes are placed **incrementally**: `forceLayout()` gets a `fixed` set, so
    confirmed positions never move and the layout cache (`:491`) stays valid.
  - A **proposal card** (reusing `ConceptCard` + `cardSections`): the claim with KaTeX, the
    evidence links, a read-only tally, and a "Proposed by …" line.
  - The legend gains the status styles; the type colours stay.
- **Exit:**
  - With `?community=1`, the fixtures render dashed or contested and confirmed nodes don't
    move.
  - Both toggles work, and the card reads correctly with a screen reader.
  - Unit tests cover placement with fixed nodes and the merge of the proposed layer.
  - The smoke test is extended.
- **Value:** we can test the visual language with Sophie and experts before writing any
  backend.

### Phase 2 — Staging-area editor *(local drafts, export)* — ✅ done 2026-10-15 (feature-35)

> **As built** (differences from the scope below, all deliberate):
> - **No `cytoscape-edgehandles`.** While drafting, *clicking* any confirmed concept connects
>   it to the ghost, and the nearest ones carry "＋ Connect?" in their label. That's simpler
>   than drawing an edge and isn't a dragging-only action (WCAG 2.5.7), so the dependency
>   wasn't needed. Relations between two existing concepts are added from the form.
> - **One draft per browser** (`src/community/useDraft.ts`, localStorage). The ghost's
>   position lives only in `GraphView` (`draftPlaceRef`), never in the draft, so it can't be
>   exported. The draft's relations point at a placeholder (`NEW_CONCEPT`) until export, so
>   renaming the concept never re-creates the ghost.
> - **Suggestions:** after a drag, the concepts within reach of the ghost on the map; before
>   any drag, the graph neighbours of what's connected (the keyboard route); none before
>   either. A keyboard connection glides the ghost next to its anchors (`placeNew`) and frames
>   them if they're off screen. **Bring the draft into view** recovers a ghost left behind by a
>   search jump.
> - **Opening the editor zooms in** (never out) to a level where mid-importance names are
>   readable. The ghost is drawn mid-sized; that size is display only.
> - **Conflicts are hints, never blocks:** `src/graph/conflicts.ts` (similar names via
>   normalisation + trigram Dice + an abbreviation list; duplicate / reversed relations against
>   the map, the draft and other open proposals; strict-prerequisite loops with their path).
>   Only missing fields and malformed evidence stop an export (`draftProblems`).
> - **Export:** the node file + one file per relation (formatted like `formatEntity`), the
>   pull-request text, and the whole proposal as one fixture-format file. An end-to-end test
>   (`scripts/export-draft.test.mjs`) runs the real validator on an exported draft;
>   `validate-concepts.mjs` gained `CONCEPTS_DIR` for that.
> - Found while testing Phase 1: the display toggles no longer move the view, and zooming
>   with the + / − buttons now counts as the user moving the view.

The editor is canvas-first: its job is to help the proposer *see* where an idea fits. The
form is the accessible equivalent, not a replacement.

- **Scope:**
  - **Add node** drops a ghost (`status-draft`) at the centre of the view. The proposer
    drags it to where it seems to belong. The ghost carries a live "nearby concepts" ring:
    the 3–5 nearest concepts light up with a "Connect?" affordance, and picking one starts an
    edge to it.
  - **Moving the ghost never moves the confirmed graph**, and the ghost's position is
    session-only. It isn't exported and isn't stored with the proposal.
  - **The form panel beside the canvas** is always open while drafting: the type picker shows
    the legend's definitions; label, claim (Markdown + LaTeX preview) and evidence fields.
    Typing a label already runs conflict detection.
  - **Add edge**: draw from the ghost (or any node) with `cytoscape-edgehandles`, *or* pick
    both ends with `SearchBox`. The relation picker shows sentence templates and the live
    sentence ("Jeans scale is a condition of Structure Formation"); conditions can be added.
  - **Keyboard and screen-reader route:** the form plus `SearchBox` builds the same proposal
    without the canvas. Once a first connection exists, "nearby concepts" suggestions come
    from that connection's neighbourhood instead of from screen distance. The canvas
    recentres on the draft's neighbourhood, so sighted keyboard users still get the visual
    aid.
  - **Conflict detection, live, as a pure tested module `src/graph/conflicts.ts`:**
    - similar labels (normalised + trigram similarity + a small synonym list);
    - an existing (source, target, type) edge, the same logic as the validator at `:200`;
    - a reversed duplicate;
    - a strict-prerequisite cycle (`find-cycle.mjs`).
    - It answers "Did you mean …?" and highlights the existing node with the same pinned
      highlight as a selection.
  - Drafts are kept in `localStorage` (the `useProgress` pattern).
  - **Export** as files, or "Copy as pull request" instructions.
- **Exit:**
  - **Pointer flow:** drag a ghost next to Structure Formation, accept one "Connect?"
    suggestion, draw a second edge, and get a duplicate warning. No confirmed node moves at
    any point (a test compares positions before and after).
  - **Keyboard-only flow:** build the same proposal with the form and search alone.
  - The exported files carry **no positions** and pass `npm run validate` when dropped into
    `content/concepts/`. After a rebuild, the new node sits where the normal layout puts it.
- **Value:** Sophie (and invited experts) can author through the UI right away and submit by
  hand.

### Phase 2b — Several drafts, dependencies, edits — ✅ done 2026-10-16 (feature-42)

Requested after Phase 2 testing. **One proposal is still one concept and its relations**,
reviewed on its own (the Risks row below stands), but the editor works on several at once.

- **Several drafts** (`useDrafts()`, localStorage v2; a Phase 2 draft is moved over once).
  Each new concept has its own ghost (`@draft:<suffix>`); dragging one makes its draft the open
  one.
- **Dependencies:** a relation into another draft, or into a concept of someone else's open
  proposal, puts that proposal in `dependsOn`. `proposalProblems()` requires it (a relation
  into another proposal's concept without listing it is an error).
  `resolveDependencies()` drops relations whose dependency is no longer open, records them in
  `dropped`, and leaves out a proposal that's left with nothing. A new concept stays even with
  no relations left. Discarding a draft removes the relations other drafts had into it — the
  local version of a rejection.
- **Edits:** "Propose an edit" on a card opens the same form, filled in from the concept
  (`newEditDraft()`). An edit proposal has `edits: [node]` (same id), new `edges`, and
  `removals` (confirmed relation ids). Fields the form doesn't show are kept, in the file's own
  key order, so the diff shows only what changed. The map previews the edit on the concept
  itself; other people's edits are marked "✎ Edit proposed", and their removals are drawn
  dotted with "(removal proposed)".
- **For Phases 3–5:** a dependent PR can only be merged after its dependencies. When a
  dependency PR is closed unmerged, the relation files pointing at its concepts are removed
  from the dependent PR (a bot commit, or the steward on merge) — the same rule as
  `resolveDependencies()`. An edit PR replaces the node file and deletes the removed edge
  files.

### Phase 3 — Identity and submitting proposals *(GitHub backend goes live)*

- **Scope:**
  - The serverless proxy: GitHub OAuth, a read cache, ORCID OAuth linking.
  - `GitHubStore implements ProposalStore`: **Submit** creates a branch + one PR per proposal
    from the Phase 2 draft, and the PR body carries the claim and evidence.
  - The proposed layer now reads open PRs (cached).
  - Sign-in UI; the "Verified expert" badge comes from `experts.json`.
  - A test repository / staging deploy so real data is never touched during testing.
- **Exit:**
  - Submitting from the staging site opens a PR in the test repo.
  - The proposal appears dashed for a second browser within a minute.
  - The CI validator runs on the PR.
- **Value:** real, attributed proposals, with immutable history from day one.

### Phase 4 — Review: votes, threads, quorum, contested

- **Scope:**
  - The proposal card gets **Verify / Dispute / Needs clarification**. Each requires a
    comment for Dispute and Clarify, and is submitted as a structured PR review.
  - **Threads** on nodes from PR review comments, with replies.
  - The quorum rule is a **pure function** `src/community/quorum.ts`, shared by the UI ("2
    of 3 verified-expert votes, 1 open dispute") and by the **"Quorum" GitHub Action**
    (a required check).
  - The `contested` label → red-outline ⚑ state with its dispute thread; resolving the thread
    clears it.
- **Exit:**
  - Unit tests for the quorum: distinct users, expertise tags, disputes blocking,
    bootstrapping.
  - An end-to-end run in the test repo: 3 verifies → check green; 1 dispute → check red.
- **Value:** consensus is visible on the map.

### Phase 5 — Moderation: roles, review queue, merge

- **Scope:**
  - Roles from `experts.json` (stewards per domain, curators).
  - A **Review queue** view (a new mode, `?mode=review`): pending proposals filtered by the
    steward's domains, each with a **mini-graph** of the affected neighbourhood (`GraphView`
    + `fitIds`), the discussion, and the quorum status.
  - Actions: **Merge** (when the check is green and every `dependsOn` proposal is merged),
    **Mark contested**, **Request changes**, **Close as duplicate** (curators: pick the
    surviving node, re-point its edges). Closing a proposal drops the relations its dependents
    had into it (Phase 2b).
  - The merge commit carries the approvers as trailers.
  - Remove the `?community=1` flag.
- **Exit:**
  - A steward merges in the test repo; the next deploy shows the node solid.
  - A curator duplicate-merge leaves no dangling edges (validator).
- **Value:** the full loop from proposal to confirmation.

### Phase 6 — Accountability: blame, audit log, badges

- **Scope:**
  - **Blame** on every card: a timeline from `git log --follow` of the node's file (created,
    edited, approved by whom; links to the PR).
  - A **public audit log** sidebar, generated at deploy time from merged PRs and reviews into
    `audit.json`, plus a live tail through the proxy.
  - Verified-expert badges throughout, with the affiliation from ORCID (when public).
- **Exit:**
  - Every confirmed node shows its creator and approvers.
  - The audit log matches the PR history for the test repo.

### Phase 7 — Hardening

- **Scope:**
  - Abuse handling: rate limits in the proxy; only verified experts count toward quorum; an
    edit-war cooldown.
  - **GDPR review.** Real names in an immutable public log can conflict with the right to
    erasure. Commits should reference stable pseudonymous ids that resolve to names through
    `experts.json`, which *can* be edited.
  - Performance when there are hundreds of open proposals.
  - Docs for experts (`docs/CONTRIBUTING-EXPERTS.md`).
  - Whether TipTap is actually wanted.
  - An accessibility pass with NVDA and VoiceOver.

---

## Cross-cutting rules

- **Accessibility (`docs/ACCESSIBILITY.md`):**
  - Every action in the editor and review flow has a keyboard and form path.
  - Status is always text + badge + outline style, never colour alone.
  - Ghosts respect "Reduce motion": the glow doesn't pulse.
- **The confirmed graph stays stable:** sketching and viewing proposals never move
  confirmed nodes or invalidate the layout cache.
- **Sketch positions are never data:** a proposal stores content (node, edges, claim,
  evidence), never coordinates. Merged nodes are laid out by the normal layout and follow
  `docs/ACCESSIBILITY.md` like every other node.
- **One source of truth:** git. The client and proxy only cache.
- **Logic in pure modules, with tests:** `conflicts.ts`, `quorum.ts` and the compile step. UI
  components stay thin.
- **Content stays the experts' work:** agents never author or vote on physics content.

## Decisions needed (my recommendation first)

Also accepted on 2026-10-15: keep Cytoscape; votes aren't commits; status is shown by
outline + badge + text, not colour; Markdown + LaTeX instead of TipTap; dragging is a visual
aid whose positions are never saved (see Phase 2).

| # | Decision | Recommendation | Status | Blocks |
|---|---|---|---|---|
| D1 | Backend | **GitHub repo + PRs + a serverless proxy** (vs own Postgres + server-side git) | ✅ Accepted | Phase 3 |
| D2 | Identity | **GitHub login for all; ORCID linking for the expert badge**; institutional e-mail later | Open | Phase 3 |
| D3 | Expertise attestation | **A curator or steward approves tags through a reviewed PR to `experts.json`** | ✅ Accepted | Phase 4 |
| D4 | Quorum defaults | **3 verified-expert Verify votes + no open Dispute; bootstrap = 1 steward approval while a domain has fewer than 5 experts** | ✅ Bootstrap principle accepted; the exact numbers are defaults in `policy.json`, to be tuned | Phase 4 |
| D5 | Initial stewards and curators | Sophie as curator + steward for her domains; who else? | Open | Phase 5 |
| D6 | Who may propose | **Anyone signed in**; only verified experts' votes count toward quorum, other votes show as "community signal" | Open | Phase 3 |
| D7 | Public identity in the audit log | **Display names + ORCID shown; commits reference pseudonymous ids** (GDPR — needs a legal check) | Open | Phase 6 |

## Risks

| Risk | Mitigation |
|---|---|
| Cold start: no experts, so nothing ever reaches quorum | Bootstrap policy (D4); invite 3–5 experts per pilot domain before Phase 4 |
| GitHub API rate limits or outage | The proxy caches; the build-time snapshot means the map works with only the confirmed layer |
| Large proposals that are hard to vote on | One proposal = one node + its edges, or one edit; the UI won't bundle more |
| Ghost placement moves things or looks wrong | Fixed-node placement plus unit tests on positions; fixtures in Phase 1 before any real data |
| Scope: this is several months of work | Every phase is independently useful (0: blame, 2: UI authoring, 4: visible consensus) and we can pause after any of them |
