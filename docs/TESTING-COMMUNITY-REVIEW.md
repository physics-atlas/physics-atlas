# Testing the community-review work, phase by phase

A hands-on checklist for checking each phase of the community-review epic
(`.claude/plans/epic-community-review.md`) yourself. Every phase gets a section when it's
built. Each section starts with the automated checks and then walks through what to try by
hand, with what you should see.

Commands are for **PowerShell** (the default terminal in VS Code on Windows), run from the
`physics-atlas` folder.

## One-time setup

1. Open a **new** terminal, so it picks up Node on the PATH, and check:

   ```powershell
   node --version   # v24 or newer
   npm --version
   ```

   If `node` isn't found, add `C:\Program Files\nodejs` to your PATH or restart VS Code.

2. Install the dependencies (again after every pull that changes `package.json`):

   ```powershell
   npm install
   ```

3. Tell the smoke test where Chrome is (for this terminal session):

   ```powershell
   $env:CHROME_BIN = "C:\Program Files\Google\Chrome\Application\chrome.exe"
   ```

**Undoing experiments:** once a phase is committed, `git restore content/concepts` (or
`git restore <file>`) puts any file you changed back, and `git clean -n content/concepts`
lists new files you added. Before that commit, undo your edits by hand.

---

## Phase 0 — groundwork (feature-33)

**What changed:**
- The concept graph moved into one file per concept and per relation under
  `content/concepts/`.
- `src/data/concepts.json` is now generated from those files and isn't in git.
- Domains come from a fixed list.
- There are unit tests.
- Nothing about the app *should* look different, apart from two lists now being alphabetical.

### 1. Automated checks

```powershell
npm run validate
npm test
npm run build
npm run lint
```

| Command | You should see |
|---|---|
| `npm run validate` | `✓ compiled 64 concepts, 66 relations` … `✓ content/concepts valid — 64 nodes (11 types), 66 edges (18 types), strict prerequisites acyclic`. The ⚠ lines are pre-existing content notes (open reviews, example links). |
| `npm test` | `Test Files 3 passed (3)` · `Tests 32 passed (32)` |
| `npm run build` | `✓ built in …`, no TypeScript errors. A "chunks larger than 500 kB" note is pre-existing. |
| `npm run lint` | No output after `> oxlint`, which means no warnings. |

To see what the tests check, run `npm run test:watch`. It re-runs on every save. Try breaking
something on purpose: in `src/graph/concepts.ts`, in `joinList`, change the word `and` in
`` `${items.slice(0, -1).join(', ')} and ${…}` `` to `&`, and save. Two tests fail and say
exactly what broke: **joinList reads naturally** (`expected 'a & b' to be 'a and b'`) and
**conditionClause is singular or plural** (the sentence "… under the assumptions of x and y").
Undo the change, and all 32 pass again. Press `q` to quit.

### 2. The new file layout

In the VS Code explorer, open `content/concepts/`:

- `graph.json` contains only `{ "version": 1 }`.
- `nodes/` has 64 files, e.g. `dark_matter.json`, and `edges/` has 66, e.g. `e63.json`
  (Zel'dovich approximation → approximates → Structure Formation, with its "linear potential"
  condition).

Check that the generated file is out of git:

```powershell
git ls-files src/data/concepts.json        # prints nothing: not tracked
git check-ignore -v src/data/concepts.json  # names the .gitignore line that ignores it
```

### 3. Edit a concept and watch the map update

1. Start the app: `npm run dev`, then open <http://localhost:5173/?mode=concepts>.
2. Open `content/concepts/nodes/dark_matter.json` and change `"label": "Dark Matter"` to
   `"label": "Dark Matter (test)"`. Save.
3. Within a second or two, the terminal logs `✓ compiled 64 concepts …` and the browser
   reloads. Search for "Dark" in the header: the result reads **Dark Matter (test)**.
4. Change the label back and save. The map returns to normal.

### 4. Add and remove a concept

1. With the dev server still running, create `content/concepts/nodes/test_concept.json`:

   ```json
   {
     "id": "test_concept",
     "type": "property",
     "label": "Test concept",
     "importance": 5,
     "attrs": {
       "description": "A temporary concept for checking Phase 0.",
       "domain": "Cosmology"
     }
   }
   ```

2. The map reloads. Open the **All concepts as a list** panel (top left) → *Property/quantity*:
   **Test concept** is listed, in alphabetical order. It's unconnected, so it sits in the row
   of lone concepts.
3. `npm run validate` now reports **65 nodes**, plus a warning that `test_concept` has no
   edges.
4. Delete the file. The map and the counts go back to 64.

### 5. Watch the validator catch mistakes

Try each experiment, run `npm run validate`, read the message, then undo it.

| Experiment | Expected result |
|---|---|
| Rename `nodes/pdf.json` to `nodes/pdf_renamed.json` | `✗ content\concepts\nodes\pdf_renamed.json: "id" is "pdf" but the file is named "pdf_renamed.json" — they must match` · `1 problem(s) in content/concepts — nothing compiled` (exit code 1) |
| Make a node file invalid JSON (e.g. delete its last `}`) | `✗ content\concepts\nodes\<file>.json: cannot read/parse — …` (exit code 1) |
| In `dark_matter.json`, set `"domain": "Astroparticles"` | `✗ node "dark_matter": unknown domain "Astroparticles" — use one from conceptVocabulary.json "domains" (several: "A / B"), or add it there first` |
| Put a whole node file on one line (valid, but not formatted) | `⚠ content\concepts\nodes\<file>.json: not in canonical formatting (2-space JSON) — it works, but diffs read best formatted`. This is only a warning: validation still passes. |
| In `edges/e63.json`, set `"target": "jeans_scale"` (a concept that doesn't exist) | `✗ edge "e63": unknown target "jeans_scale"` |
| Set `"domain": "General relativity / Cosmology"` | Passes: " / " lists several domains |

While `npm run dev` is running, a "nothing compiled" error also shows in the dev-server
terminal. The page keeps showing the **last good** data until the file is fixed.

### 6. What should look different in the app

- **Alphabetical lists:** open **All concepts as a list**. Within each type, concepts are
  A→Z. In the header search, type "e": results are alphabetical too.
- **A one-time fresh layout:** because of the overlap fix, the map computes a new
  arrangement on first load (about 1–4 seconds of glide). In Chrome DevTools → *Application*
  → *Local Storage* → `http://localhost:5173`, the saved layout key is now
  `physics-atlas-concept-layout-v4`.
- **Everything else unchanged:** clicking a concept, its card, the goal path ("★ Show path
  to this"), the legend definitions and zooming all behave as before.

### 7. Smoke test (the browser end-to-end run)

You need two terminals.

```powershell
# terminal 1
npm run dev

# terminal 2
$env:CHROME_BIN = "C:\Program Files\Google\Chrome\Application\chrome.exe"
npm run smoke
```

Look for `concept map: 64 nodes, 66 edges` and `concept card has "leads to Newtonian
Gravity": true`. The run ends with exactly **two known failures** (feature-20, from before
this work): `optional toggle did not reduce the curriculum` and `expected 13 diff-geo
learning goals, got 14`. Any other failure is new.

### 8. After committing: history per concept

Each concept now has its own git history:

```powershell
git log --oneline -- content/concepts/nodes/dark_matter.json
```

Its history starts at the Phase 0 commit. Everything before that is in the old single file:
`git log --oneline -- src/data/concepts.json`. After you push, the GitHub **Actions** tab
shows the deploy job running a new `npm test` step.

---

## Coming phases — how you'll test them

These are previews from the plan's exit criteria. Each gets full, step-by-step instructions
like Phase 0 when it's built.

| Phase | You'll check |
|---|---|
| **1 — Proposed layer (fixtures)** | With `?mode=concepts&community=1`: sample proposals appear with a dashed outline and a "Proposed" badge (and contested ones with a double outline and ⚑). Confirmed concepts don't move when proposals are toggled on or off. The **Show confirmed / Show proposed** toggles work. The proposal card shows the claim (with LaTeX), its evidence links and a read-only vote tally. All of it works by keyboard and is read correctly by a screen reader. |
| **2 — Staging editor** | Drag a ghost concept next to Structure Formation and see nearby concepts offer "Connect?". Draw an edge. Get a "Did you mean …?" warning for a duplicate label and for an existing edge. Confirmed concepts never move. Build the same proposal using only the keyboard. Export it and check the files contain **no positions** and pass `npm run validate`. |
| **3 — Sign-in and submitting** | On a staging site connected to a **test repository**: sign in with GitHub, link an ORCID iD, submit a proposal, and see a pull request appear in the test repo. A second browser shows the proposal dashed within a minute. |
| **4 — Voting and contested** | Verify, Dispute and Needs clarification on a proposal. The quorum status updates ("2 of 3 verified-expert votes, 1 open dispute"). The "Quorum" check on the PR turns green or red. Marking a proposal contested shows ⚑ and its dispute thread. |
| **5 — Moderation** | As a steward: the review queue lists your domain's proposals, each with a mini-map. Merge one, and after the deploy it shows solid. As a curator: merge two duplicates and check no relation is left dangling. |
| **6 — Accountability** | Every confirmed concept shows its history (created / edited / approved by whom, with links). The audit log matches the test repo's pull requests. Expert badges show where they should. |
| **7 — Hardening** | Rate limits, privacy settings, and a screen-reader pass with NVDA and VoiceOver. |
