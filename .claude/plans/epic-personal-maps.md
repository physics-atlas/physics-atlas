# Epic: personal maps (course maps first)

**Status:** Phases 0–4 done (2026-11-22). Next: the long term.

## Context

The atlas is one shared, reviewed map. Users now want **their own maps**: built from
scratch, referencing concepts of the main map, shared with people they choose as editors
or viewers, and with an atlas page per concept, as accessible as the main map's.

**Short term (the pilot):** one educator builds a map for his course, so his students can
use its learning goals. Sophie (sophelsa) and mhardtke help build it. They work at
different times, so **comments** on the map are needed while it's being built. Students
open it with a **link** and don't sign in.

**Long term:** a premium feature for educators and researchers, with more robustness:
many maps, accounts beyond GitHub, quotas, deletion and export of one's data, backups.

**How this relates to the community-review epic** (`epic-community-review.md`): it's a
separate track, not its next phase. It reuses what that epic built — GitHub sign-in and
sessions (Phase 3), the invite list and per-user flags (`experts.json`, Decision 43's
`publish`), the editor and its checks, the map, both layouts, the atlas pages — and needs
one piece of that epic's Phase 5: **roles**.

## Decision 50 (proposed): where personal maps live

| Option | For | Against |
|---|---|---|
| **A. Cloudflare D1** (SQL) behind the existing Worker — **recommended** | Members, roles, share links and comment threads are simple tables; fast; same hosting and the same sign-in; viewers need no account; grows into the premium version | Breaks "no own database" (Decisions 18, 25; `CLAUDE.md` *Deliberately not now*) — this decision lifts it for personal maps only. We then hold private user data: privacy notice, deletion, export, backups |
| B. One GitHub repo per map, in an organisation the App manages | "Git is the truth" holds; history for free | Every edit is a commit or pull request — slow for three people building together; GitHub rate limits; comments would be GitHub issues, outside the app; every editor needs GitHub; organisation admins see every map; doesn't scale to a premium product |
| C. Course map as files in this repo (`content/maps/<id>/`), edited through the proposal flow | Nothing new to run; build-time layout and validation | Public to anyone (the repo and site are public); every change waits for a merge and a deploy; no comments in the app; would be rebuilt for the long term anyway |

**Recommendation: A.** The atlas itself stays in git, unchanged. A personal map is a
person's working material, not reviewed knowledge; it doesn't need git's review trail,
but it keeps its own **revision history** (who changed what, when) in the database.

With A, the GitHub-account question resolves as:
- **Editors and commenters** sign in. Today that's GitHub (all three pilot users have it).
- **Viewers with the link** need nothing.
- Long term, more sign-in options (e-mail link, Google, ORCID) can be added behind the
  same session.

## Principles

- **One format.** A personal map's concepts, relations and pages use the atlas's own format
  (`types.ts`, `conceptVocabulary.json`, the page Markdown + LaTeX). The same checks,
  renderer and accessibility apply, and a map exports to files — and later, one of its
  concepts can be proposed to the atlas.
- **References, not copies.** A map can include main-map concepts by id. They show as they
  are on the atlas, marked as from the atlas, and stay current when the atlas changes.
  A map's own relations may connect them.
- **Accessibility as on the main map** (`docs/ACCESSIBILITY.md`): every map has the
  concept list, cards, legend, keyboard routes, both arrangements, reduce motion, and an
  atlas page per concept with depths. Comments too: threads are lists, reachable by
  keyboard, announced, never colour alone.
- **Students aren't tracked.** Opening a link needs no account; progress (completed goals) stays in
  the browser, never on the server.
- **The link is a secret, revocable.** "Anyone with the link" is an unguessable token in the
  address; the owner can turn it off or make a new one. Maps aren't listed or indexed.

## Privacy (Decision 51)

- **Responsible:** Guilherme Daudt and Sophie Ashworth, jointly (Art. 26 GDPR), in Germany;
  contact morph_initiative@protonmail.com.
- **The only personal data:** a signed-in person's GitHub account number and username — no
  e-mail, name, avatar or IP address in the database — plus their maps, comments and edits.
- **Link viewers (students):** nothing stored; progress stays in the browser.
- **Account deletion:** username and number go; maps they own go; in others' maps their
  comments and edits stay as "former member". Comments removed on request.
- **Who sees what:** members see content, usernames, comments, history; a link, the content only.
- **Cloudflare's part:** infrastructure, encryption at rest and in transit, replication,
  restore points, its data processing agreement. **Ours:** a permission check on every
  request, parameterised queries, unguessable revocable links, limits, rendering through
  our own Markdown parser, short log retention and no IPs or tokens in logs, two-factor
  sign-in on the accounts, export and deletion, breach reporting within 72 hours.
- **The notice:** `docs/PRIVACY-NOTICE.md`, a draft with a "Before publishing" list — first of
  all, the font served from the site instead of Google Fonts.

## Data model (D1)

| Table | Holds |
|---|---|
| `users` | id, GitHub id and login (later other providers), display name |
| `maps` | id, title, description, owner, created, updated, `revision` (for conflicts) |
| `map_members` | map, user, role: `owner` · `editor` · `commenter` · `viewer` |
| `map_links` | map, token, role (`viewer`), created, revoked |
| `map_items` | map, kind (`node` · `edge` · `page` · `ref`), item id, JSON body (the atlas format), revision |
| `map_revisions` | map, revision, user, time, what changed (item ids) — the history |
| `comments` | map, anchor (node, relation, page depth, or the map), thread, author, body (Markdown), created, resolved |

Pictures (later): Cloudflare R2, the same rules as the atlas's figures.

## Phases

### Phase 0 — Decisions *(no visible change)*
- ✅ Decision 50 accepted; Decision 51 (privacy) recorded.
- ✅ The role flag: `"maps": true` in `experts.json`; `/api/me` says `canMakeMaps` once
  `MAPS_DB` is bound (`server/api.ts`, tested).
- ✅ The schema: `migrations/0001_personal_maps.sql`, tested against SQLite
  (`scripts/maps-schema.test.mjs`: only GitHub id and username, "former member", cascades, roles).
- ✅ Set-up steps: `docs/PERSONAL-MAPS-SETUP.md`. ✅ Privacy notice drafted: `docs/PRIVACY-NOTICE.md`.
- ✅ **By hand:** the database created (EU jurisdiction, `physics-atlas-maps`), bound as
  `MAPS_DB`, migration applied (checked 2026-11-21: 7 tables + Wrangler's, no migration pending).
- ✅ **By hand:** `"maps": true` on `main` for gdaudt, sophelsa, mhardtke and subutayebru (2026-11-21).
- ✅ The notice published at `?mode=privacy`, English and German (`content/privacy/`); the font
  served from the site (`@fontsource/sora`); no Impressum or joint-controller arrangement for now.
- ✅ Limits for the pilot — set with Phase 2's API.
- **Exit:** the database bound; `/api/me` says `canMakeMaps: true` for the educator.

### Phase 1 — A map that isn't the atlas *(read-only, from a fixture)* — ✅ done 2026-11-21
- ✅ `src/maps/map.ts`: `PersonalMap` (own nodes, edges, pages; atlas concepts by id),
  `resolveMap` (one graph: own concepts, the atlas concepts it uses as the atlas has them now,
  the atlas's relations between those, its own relations; a reference the atlas lost is left
  out and named), `mapProblems`. Tested (`src/maps/map.test.ts`).
- ✅ The sample: `content/maps-fixtures/sample-course.json` (`src/maps/fixtures.ts`) — five atlas
  concepts, two sample course goals, one own page; every own text marked "Sample".
- ✅ `?mode=map&map=<id>` shows it with the atlas's own map view — cards, list, legend, search,
  both arrangements (laid out in the browser); `&view=pages` its pages. A bar under the header:
  "Personal map", its title, **Map** / **Pages**, **Back to the atlas**.
- ✅ Atlas concepts marked **From the atlas** on their card, in the list and on their page,
  with a link to their atlas page.
- ✅ Links stay in the map (`lib/mapScope.ts`: `pageHref`/`relationHref`/`hrefOf` take the map);
  pages come from a page source (`PageSourceContext`: the map's own, else the atlas's). Page
  editing is off in a map until Phase 2. "Map contents", "End of the map".
- ✅ Smoke: the map, a card, a page with every link inside the map, the own page.
- **Note:** a bare `?mode=map` (the retired topic map's address) still lands on the atlas map.

### Phase 2 — Saved maps and editing
- ✅ API (`server/maps.ts`): create a map, list "My maps", read, save items with the revision
  the map was opened at — per item: someone else's newer save of the same item is refused (409)
  and the map shown as it now is, never silently overwritten; saves of different items both stay.
  Every save is checked whole (`mapProblems`) and recorded in `map_revisions`. Tested against the
  real schema (Node's SQLite standing in for D1).
- ✅ `?mode=maps` (**My maps**); a saved map opens from the server (members only; signed out, it
  asks to sign in). The sample map is gone.
- ✅ The map bar's panel: rename; add an atlas concept by search; remove one (with the map's own
  relations to it); members.
- ✅ Members: the owner adds editors, commenters or viewers by GitHub username (the server looks up
  the account id); removes them; anyone may leave.
- ✅ Limits for the pilot: 20 maps per owner, 1000 items per map, 50 members (`LIMITS` in `server/maps.ts`).
- ✅ The first course map, seeded (`scripts/seed-map.mjs`, `scripts/maps-seed/newtonian-mechanics.json`):
  owner walterpfeiffer1; sophelsa, mhardtke, onedandelion, gdaudt editors; the atlas's subgraph from
  Newtonian (Classical) Mechanics — without its relation to Newtonian gravity — to Four-velocity,
  by its relation to Velocity only (22 concepts). **By hand:** run the seed (`docs/PERSONAL-MAPS-SETUP.md`).
- ✅ **Part 2** (2026-11-22): the proposal editor in a map mode — **Add a concept to this map**, and **Edit** /
  **Delete from the map** on the map's own concepts; a draft saves into the map (`proposalChanges` in
  `src/maps/api.ts`: its concept, relations, removals of the map's own relations, page) instead of a pull
  request; no evidence, author or pictures; drafts kept per map in the browser. The atlas's concepts and
  relations stay as the atlas has them. A page is edited on its page (own concepts only), and **Review and
  save** brings it to the editor. A page-only edit now counts as a change (also on the atlas).
- ✅ **Course goals** (2026-11-22; asked for with part 2): a map's course-level goals, each only a name
  and an ordered set of the map's learning goals (its topic-level goals, own or the atlas's) — not concepts,
  never on the atlas. Kept as map items of kind `goal` (`migrations/0002_course_goals.sql`, **applied by
  hand**). The map bar's **Course goals (n)** opens them in both the map and the pages: every course goal
  with its learning goals, and every learning goal on the map with the course goals it's in; picking one
  centres it on the map or opens its page, by the view that's open. Editors make, rename, order (move
  up/down), fill and delete them; a concept that leaves the map leaves its course goals too.
- **Exit:** the educator, Sophie and mhardtke can build one map together; history recorded.

### Phase 3 — Comments *(the pilot's asynchronous work)* — ✅ done 2026-11-22
- ✅ Threads on a concept, a relation, a page depth, or the whole map; reply (a reply reopens a resolved
  thread); resolve; reopen; delete your own comment (a thread others replied to stays — resolve it; the
  owner may delete any). API in `server/maps.ts` (`/comments`), the anchors in `src/maps/comments.ts`;
  the existing `comments` table, no migration. Limits: 4000 characters, 2000 comments per map.
- ✅ "New since your last visit" markers (in words: **New**), kept in the browser only — when the person
  last closed the comments or left the map; the map bar's **Comments (n open, m new)**; the panel lists
  threads, open / resolved / all, or only those about the chosen concept.
- ✅ Owners, editors and commenters see them; viewers (members) and link viewers don't.
- ✅ New comments are checked for every 30 s while the map is open and the tab visible; someone else's
  are announced in a polite live region ("New reply from @… about …").
- **Exit:** a thread can be started, answered and resolved by keyboard; a screen reader hears
  new replies.

### Phase 4 — Sharing with the course — ✅ done 2026-11-22
- ✅ The link: every map has one from its creation (`migrations/0003_share_links.sql` gave the maps made
  before theirs; the seed makes one). The owner and editors see it in the map's panel (**Share with a
  link**) and copy it; only the owner makes a new one — the old stops working — or turns it off. It opens the map, its pages and course goals without sign-in; not its
  members, comments or history (`POST /api/shared`, `handleShared` in `server/maps.ts`; `map_links`).
  The token sits after `#` in the address (`?mode=map#share=<token>`) and goes to the server in a
  request body: it never appears in a request address, so never in request logs. The map bar says
  **Shared map**; links inside stay on the shared address.
- ✅ **Students mark the learning goals they have completed** (done early, 2026-11-22, for every member;
  link viewers get it with the link): a "Completed" tick on each learning goal in the course goals panel
  and on its card in the map; counts per course goal; ✓ on the map. Kept in the browser only, per map
  (`completedKey` in `src/maps/map.ts`, the `useProgress` store); the privacy notice says so. New UI: the atlas has no "learned" ticks in use —
  they exist only inside the path panel, which opens only from a `?goal=<id>` link since Decision 48
  removed "Show path to this". The browser storage under them (`useProgress`) can be reused.
- The course goals panel (Phase 2) is what students use to find their way; nothing in the map
  opens a path. Whether a learning goal's path should be offered in a map is a separate decision,
  not part of this phase unless asked for.
- **Exit:** a student opens the link on a phone, sees the course goals, and ticks the ones they've completed.

### Long term — personal maps as a premium feature
- Sign-in beyond GitHub; organisations (a department, a research group); roles per organisation.
- Quotas and plans; billing.
- Account deletion and data export (GDPR); backups; abuse handling for public links.
- History view (who changed what), restore a revision.
- Propose a map's concept to the atlas (the existing draft and pull-request flow).
- Real-time co-editing only if asynchronous work with comments turns out not to be enough.
- An accessibility pass with NVDA and VoiceOver.

## Risks

| Risk | Answer |
|---|---|
| The pilot has a course date | Phases 1–4 are scoped to one map and three editors; nothing in them waits for the long term |
| A database means private data and its duties | Minimal data (handle, name, comments); a privacy notice in Phase 0; deletion and export before any wider release |
| Two editors save at once | Revision check on every save; per-item saves, so different concepts never conflict |
| Atlas concepts referenced by a map are later renamed or removed | References resolve live; a removed one shows as "no longer on the atlas" with its last known name |
| Lifting "no database" spreads to the atlas | Decision 50 limits it to personal maps; the atlas stays in git |
