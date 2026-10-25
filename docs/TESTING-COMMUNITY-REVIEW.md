# Testing the community-review work, phase by phase

A hands-on checklist for checking each phase of the community-review epic
(`.claude/plans/epic-community-review.md`) yourself. Every phase gets a section when it's
built. Each section starts with the automated checks and then walks through what to try by
hand, with what you should see.

Commands are for **PowerShell** (the default terminal in VS Code on Windows), run from the
`physics-atlas` folder.

**Where it lives:** the **Community** tab in the header (or **Propose concepts and review** on
the home page) opens the community view, <http://localhost:5173/?mode=community>: the concept
map with the proposals and the proposal editor. It's open to everyone until sign-in arrives in
Phase 3. Older links with `?mode=concepts&community=1` still work and open the same view.

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
| `npm test` | All tests pass (`Tests 32 passed` at Phase 0; later phases add more — 63 after Phase 1) |
| `npm run build` | `✓ built in …`, no TypeScript errors. A "chunks larger than 500 kB" note is pre-existing. |
| `npm run lint` | No output after `> oxlint`, which means no warnings. |

To see what the tests check, run `npm run test:watch`. It re-runs on every save. Try breaking
something on purpose: in `src/graph/concepts.ts`, in `joinList`, change the word `and` in
`` `${items.slice(0, -1).join(', ')} and ${…}` `` to `&`, and save. Two tests fail and say
exactly what broke: **joinList reads naturally** (`expected 'a & b' to be 'a and b'`) and
**conditionClause is singular or plural** (the sentence "… under the assumptions of x and y").
Undo the change, and they all pass again. Press `q` to quit.

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
     "importance": 10,
     "generality": 10,
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
- **The layout is ready at once:** it's computed when you run `npm run dev` (or any
  `build:content`) and shipped with the page, so nothing glides after load. After a content
  change, `npm run build:content` lays the map out again (about half a minute).
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
Gravity": true`. The run ends with `console errors: none` and no failures; any failure is
new. (The two old feature-20 failures went with the topic views, Decision 26.)

### 8. After committing: history per concept

Each concept now has its own git history:

```powershell
git log --oneline -- content/concepts/nodes/dark_matter.json
```

Its history starts at the Phase 0 commit. Everything before that is in the old single file:
`git log --oneline -- src/data/concepts.json`. After you push, the GitHub **Actions** tab
shows the deploy job running a new `npm test` step.

---

## Phase 1 — the proposed layer, read-only (feature-34)

**What changed:**
- In the **Community** view, the concept map shows **proposals** on top of the confirmed graph.
  For now these are sample proposals from `content/proposals-fixtures/`, clearly labelled
  "Sample". The steps below use the first three; Phase 2b added two more (a dependent
  proposal and an edit), so the counts in your list and in the smoke output are now higher.
- Each proposal is marked by its outline and a badge in its label, not by colour: the fill
  stays the type colour.
- Proposals never move confirmed concepts.
- New toggles: **Show confirmed** and **Show proposed**.
- Clicking a proposal opens a **proposal card** with the claim (with LaTeX), evidence and a
  read-only vote tally.
- The plain **Concept map** tab is unchanged.

### 1. Automated checks

```powershell
npm test
npm run validate
npm run build
npm run lint
```

| Command | You should see |
|---|---|
| `npm test` | `Test Files 4 passed (4)` · `Tests 63 passed (63)`. The new tests cover placing proposals without moving anything, checking proposals against the graph (taken ids, missing concepts, unknown types, bad arXiv / DOI), the three fixtures, and the claim text format. |
| `npm run build` | As before, plus a separate `ProposalCard-….js` chunk (~265 kB) and the KaTeX fonts. Formula rendering only loads when you open a proposal. |
| `npm run validate`, `npm run lint` | Unchanged from Phase 0. |

### 2. See the proposed layer

1. `npm run dev`, then open <http://localhost:5173/?mode=community>.
2. In the legend (bottom left), a new row reads **Confirmed · Proposed — dashed outline ·
   ⚑ Contested — double outline**, each with a matching outline swatch.
3. Search for **Structure Formation**. Next to it you'll find:
   - **Jeans scale**, with a dashed outline and the label *Jeans scale / Proposed · ✓2 ✗0 ?1*,
     joined by a dashed line labelled *is a condition of (proposed)*;
   - **Non-linear structure growth**, dashed, joined to Structure Formation (*relates
     (proposed)*) and to the Zel'dovich approximation (*predicts (proposed)*).
4. Search for **Wave Dark Matter**. Next to it is **Ultralight mass > 10⁻²² eV**, with a
   **double** outline, the label *⚑ Contested · ✓1 ✗2 ?0*, and a **dotted** line labelled
   *concerns (contested)*.
5. Compare with <http://localhost:5173/?mode=concepts> (no flag): the confirmed concepts are
   in exactly the same places; only the proposals are gone.

### 3. Open a proposal card

1. Click **Jeans scale**. The card opens on the right:
   - a dashed pill: **PROPOSAL · NOT YET CONFIRMED**;
   - **The claim**, with the Jeans length rendered as a formula, λ_J = c_s √(π/(Gρ));
   - "Proposed by Sample contributor A · Oct 1, 2026";
   - **What it would add**: the concept itself, plus "Jeans scale is a condition of
     Structure Formation", where *Structure Formation* is a link;
   - **Evidence**: the formula as a display equation, and an *arXiv:0000.00001 ↗* link
     (a placeholder, so the page won't exist);
   - **Votes so far**: ✓ 2 Verify · ✗ 0 Dispute · ? 1 Needs clarification, and "Voting
     opens in a later phase."
2. Click **Ultralight mass > 10⁻²² eV**. The pill has a double outline and reads **⚑
   CONTESTED PROPOSAL**, and a double-bordered box **Why it's contested** shows the dispute
   summary.
3. Click **Non-linear structure growth**. It shows "Sample expert B ✓ Verified expert" and
   a display formula.
4. Click the confirmed **Structure Formation**. Its normal card now ends with **Open
   proposals about this concept (2)**, and each entry opens that proposal.

### 4. The layer toggles

The control bar (bottom right) has **Show confirmed** and **Show proposed**. Both are on
when the page loads.

- **Show proposed** off: all three proposals and their lines disappear. Turn it back on.
- **Show confirmed** off: only the proposals stay, plus the three confirmed concepts they
  connect to (Structure Formation, Zel'dovich approximation, Wave Dark Matter), shown
  faintly. Turn it back on.
- **None of the three toggles moves the view.** Zoom in somewhere (wheel or the + button),
  open a card if you like, then flip **Show all concepts**, **Show confirmed** and **Show
  proposed** on and off: the zoom and position stay exactly where you left them. Use ⤢
  (Show the whole map) if you want to re-frame.
- **Concept map** and **Community** are two tabs on the same map: switching between them keeps
  your zoom and position, and only the proposals come and go. (This replaced keeping
  `community=1` in the URL)
  and the proposals on the map.

### 5. Keyboard and screen reader

1. Tab to **All concepts as a list** and press Enter. A new first group, **Proposed — not
   yet confirmed (3)**, lists each proposal with its status in words ("Proposed · ✓2 ✗0 ?1",
   "⚑ Contested · …").
2. Tab to *Jeans scale* and press Enter. The card opens and focus moves into it. A screen
   reader reads the card's heading and then its sections. Formulas are read as maths, because
   KaTeX also outputs MathML.
3. Press **Escape**. The card closes and focus returns to *Jeans scale* in the list.
4. Tab to the control bar. Both toggles are announced as toggle buttons, "pressed" or "not
   pressed".

### 6. Light theme and reduced motion

- Switch to the light theme (☀/🌙 button). The outlines and badges stay readable, and the
  header is now light too (it used to stay dark grey, which made the title hard to read).
- **Reduce motion** on: opening a card jumps instead of gliding.

### 7. Smoke test

As in Phase 0 (two terminals). The new community section prints:

```
rank of each proposal's anchor among the nearest confirmed concepts: [ 2, 2, 2 ]
proposed layer: 3 concepts, 4 relations, contested ultralight_bound_s3; confirmed nodes moved: 0
proposal card: { proposedBy: true, sentence: true, tally: true }
layer toggles: { proposedOff: 'false', overlayHidden: true, confirmedOff: 'false', hiddenConfirmed: 61, anchorShown: true }
```

Each rank must be 1–3 (the proposal sits next to what it connects to), and **confirmed nodes
moved** must be 0. As before, the run ends with only the two known feature-20 failures.

### 8. Try your own proposal (optional)

Copy `content/proposals-fixtures/sample-jeans-scale.json` to a new file, change `id`, the
concept's `id` and the relation's `id`, and point the relation at another confirmed concept.
Save, and it appears on the map (reload the page).

Break it on purpose, e.g. point `target` at `nothing_here`: the proposal is left out, and
the browser console says why (`Proposal "…" left out: … points at "nothing_here", which is
neither confirmed nor proposed`). `npm test` fails for the same reason. Delete the file
afterwards.

---

## Phase 2 — the proposal editor, local drafts (feature-35)

**What changed:**
- The **Community** view has a **＋ Propose a concept** button. It opens an
  editor where the concept card usually sits, and a dashed, glowing **ghost** concept
  appears on the map.
- **Drag the ghost** to work out where the idea fits. The concepts nearest it are offered as
  connections ("＋ Connect?"). **Clicking any concept on the map** connects it.
- The **form** does everything without the canvas: name, kind (with its definition),
  connections (search), relation as a full sentence, assumptions, description, field, the
  claim (Markdown + LaTeX preview), evidence, your name.
- **Conflict detection, live:** similar names ("Did you mean …?"), a relation that already
  exists, one that says the opposite, and loops of strict prerequisites.
- The draft is **saved in this browser** and can be **exported**: the node and relation
  files for `content/concepts/`, a pull-request text, or one proposal file.
- Where you dragged the ghost is **never saved or exported** — it's a sketch.
- Fixed from Phase 1 testing: **Show all concepts / Show confirmed / Show proposed** no
  longer reset the view (see Phase 1, step 4).

### 1. Automated checks

```powershell
npm test
npm run validate
npm run build
npm run lint
```

| Command | You should see |
|---|---|
| `npm test` | `Test Files 7 passed (7)` · `Tests 110 passed (110)`. New: conflict detection (similar names, duplicates, reversed relations, loops), the draft (ids, what it exports, missing fields, malformed evidence, generality / importance ranges, the optional claim, reading it back), and an end-to-end check that **exported files pass the real validator** when dropped into a copy of `content/concepts/`. |
| `npm run build` | As before, plus a separate `DraftEditor-….js` chunk. The editor only loads when you open it. |
| `npm run validate`, `npm run lint` | Unchanged. |

### 2. Open the editor

1. `npm run dev`, then open <http://localhost:5173/?mode=community>.
2. Top left, above "All concepts as a list": **＋ Propose a concept**. Click it.
3. The editor opens on the right, with a dashed pill **DRAFT · NOT SUBMITTED · SAVED IN THIS
   BROWSER**, and focus moves into it.
4. If you were zoomed far out, the map zooms in so names are readable. In the middle of the
   free map area there's a grey, dashed, glowing circle: **New concept / Draft · not
   submitted**. The legend gains **Your draft — dashed, glowing**.
5. **Connections** shows no suggestions yet. They appear once you drag the ghost or connect
   something.

### 3. Pointer flow: work out where it fits

1. Type **Test concept** as the name and choose **Property/quantity** as the kind. The ghost
   takes the name and the type's colour and glyph. Below the picker, the type's definition
   and examples appear (the same text as the legend).
2. Use the header search to jump to **Structure Formation** (the editor stays open). The ghost
   is now off screen: click **Bring the draft into view** (under Connections), and it moves to the middle of the
   view.
3. **Drag the ghost** close to Structure Formation. As you drag, the nearest concepts get a
   soft glow and **＋ Connect?** under their name, and the editor lists them under **Nearest
   on the map**.
4. Click **＋ Connect to Structure Formation**. A dashed blue line *relates (draft)* appears.
   Under Connections: "**Test concept** relates to Structure Formation.", and the status line
   says *Connected to Structure Formation — choose the relation under Connections.*
5. **Click Structure Formation on the map.** While drafting, clicking a concept connects it
   instead of opening its card. Since this is the same relation again, the second one shows
   **⚠ You already added this relation above.** Click its **Remove**.
6. Open the first relation's **Relation** list. Every option is the full sentence, e.g. "Test
   concept is a condition of Structure Formation". Pick that one; the line on the map updates.
7. **Add an assumption**, type *linear potential*. The sentence now ends "under the
   assumption of linear potential", and the map line adds "assuming linear potential".
8. Throughout, **no confirmed concept moves** — only the ghost.

### 4. Conflict detection

**Similar names** (in the Name field, replace the text each time):

| Type | You should see |
|---|---|
| `Structur formation` | A gold box: *≈ Already on the map with a similar name — did you mean one of these?* listing **Structure Formation** (*similar name*) with **Show on map**. On the map, Structure Formation gets a gold ring and **≈ Similar name** under its name. |
| `SR` | **Special Relativity** (*abbreviation*) |
| `EFE` | **Einstein Field Equations** (*abbreviation*) |
| `Jeans scale` | **Jeans scale** (*same name · an open proposal*), the sample proposal |

**Show on map** glides to that concept and highlights it the way a click does, while focus
stays in the editor.

**Relations between existing concepts:** open **Add a relation between two concepts already
on the map**.

1. From **Zel'dovich approximation** to **Structure Formation**, then set the relation to
   *approximates*: **⚠ This relation is already on the map.**
2. Click **Swap direction**: **⚠ The map already says the opposite: "Zel'dovich approximation
   approximates Structure Formation."**
3. Add another: from **Tangent vector** (pick exactly that entry, not "Construct tangent
   vectors…") to **Linear Algebra**, set to *is a strict prerequisite for*: **⚠ Strict
   prerequisites would go round in a loop: Linear Algebra → Vector space → Tangent vector →
   Linear Algebra.**
4. Remove these relations again.

### 5. Keyboard-only flow

1. **Discard the draft…** → **Discard** (bottom of the editor) to start fresh.
2. Tab to **＋ Propose a concept** and press Enter. Focus moves into the editor.
3. Tab to **Name** and type a name. Tab to **Kind of concept** and choose one with the arrow
   keys.
4. Tab to the **Connect … to a concept** search, type *Zel*, choose with ↓ and Enter. The
   ghost **glides next to Zel'dovich approximation** and the view frames both. Under
   Connections, **Near what you connected** offers that concept's neighbours (e.g.
   Structure Formation).
5. Everything else is reachable with Tab, Enter, Space and the arrow keys. Every field has a
   visible label, and screen readers announce the status line ("Connected to …").

### 6. Fill in, check, export

1. Fill in **Description** and tick a **Field** (e.g. Cosmology).
2. Type `10` in **Generality**: the ghost grows to the largest circle. Type `1`: it shrinks to
   the smallest. Type `12`: **Check and export** lists *Generality is a whole number from 1 to
   10.* Set it back to something in range. **Importance** (1–10) works the same way. It
   changes how far out the concept stays visible, which the ghost doesn't show, because a
   draft is always visible. Both fields are optional.
3. The **claim** is optional too. Leave it empty and the export is still *Ready*, and the
   pull-request text has no Claim section. Or write one with maths, e.g. `Growth stays linear
   while $\delta \ll 1$.`; the preview below renders the formula.
4. **Add evidence** with kind *arXiv id* and type `abc`. Under **Check and export**:
   *Evidence 1 isn't a valid arXiv id.* Each item there is a button that jumps to its field.
   Change it to `2101.01234` (a placeholder).
5. When nothing is missing, **Check and export** says *Ready* and offers:
   - **Download the files (N)**: one node file plus one file per relation. Chrome may ask
     once to allow several downloads.
   - **Copy pull-request text**: title, claim, what it adds (as sentences), evidence links,
     the file list.
   - **Download as one proposal file**: the whole proposal, for
     `content/proposals-fixtures/`.
   - **Show the files**: exactly what's in each.
6. Open a downloaded file: there's **no x, y or position** anywhere.

**Try the files in the repo** (undo afterwards):

1. Put the node file into `content/concepts/nodes/` and the relation files into
   `content/concepts/edges/`.
2. `npm run validate` → `✓ content/concepts valid — 65 nodes …`.
3. The running dev server recompiles. Open the plain **Concept map** tab: your
   concept is an ordinary solid node, placed by the normal layout, and its card opens like
   any other.
4. `git clean -n content/concepts` lists the new files; delete them (or run `git clean -f
   content/concepts`).

Or put the single proposal file into `content/proposals-fixtures/` and reload with
the **Community** tab: it shows as a dashed proposal with your claim. Delete it afterwards.

### 7. Saved between visits; close and discard

- **Reload** the page. The button now reads **＋ Continue your drafts (1)**, and opening it
  restores everything. The ghost goes next to its connections: where you dragged it isn't
  kept, by design.
- **Close — keep the drafts** (or ×): the ghost disappears and focus returns to the button.
- **Discard this draft…** asks *Discard "Add …"?* with **Discard** / **Keep it**.
- With **Show confirmed** off, the ghost, its lines and the concepts it connects to stay
  visible (those concepts faintly).

### 8. Light theme and reduced motion

- Light theme: field borders, the gold warning box, the dashed relation boxes and the ghost
  all stay readable.
- **Reduce motion** on: the ghost jumps instead of gliding. Nothing pulses (the glow is
  steady anyway).

### 9. Smoke test

As in Phase 0 (two terminals). The new editor section prints:

```
view kept through the toggles: true
editor, keyboard: { editorFocused: true, rank: 1, draftEdges: 1, suggestions: 'Near what you connected＋ Connect to Structure Formation＋ Connect to Non-linear structure growth (not accepted yet)' }
editor, pointer: { offered: [ '＋ Connect to Structure Formation', … ], relations: 3, duplicate: true, ghostLabel: 'Smoke test concept\nDraft · not submitted', confirmedMoved: 0 }
editor closed: { ghostGone: true, focusOnButton: true, button: '＋ Continue your drafts (1)' }
```

**rank** must be 1–3 (the ghost sits next to its connection), and **confirmedMoved** must be
0. The run still ends with only the two known feature-20 failures. (Since Phase 2b,
suggestions can include other people's proposals, marked *not accepted yet*.)

---

## Phase 2b — several drafts, dependencies, editing a concept (feature-42)

**What changed:**
- **One proposal is still one concept and its relations**, but the editor holds **several
  drafts** at once. Each is exported, and later submitted, on its own.
- A draft can relate to **another of your drafts**, or to **someone else's open proposal**.
  That makes it **depend** on that proposal (`dependsOn`). If the dependency is rejected or
  withdrawn, the relations pointing at it are **dropped**, and the rest of the dependent
  proposal stands. Discarding one of your drafts does the same to your other drafts.
- **Propose an edit** on any concept's card opens the same form, filled in from the concept.
  You can change fields, add relations, and propose removing existing ones. The concept on the
  map previews the edit.
- Two new samples: *Jeans mass*, which depends on the *Jeans scale* proposal, and an **edit**
  of *Vlasov eq.*

### 1. Automated checks

| Command | You should see |
|---|---|
| `npm test` | `Test Files 7 passed (7)` · `Tests 132 passed (132)`. New: relations between drafts and the dependencies they create; dropping relations when a dependency is gone (and a proposal of only relations disappearing); edits (filled in, "change something" check, fields the form doesn't show kept in the file's own key order, removals and the files to delete); reading a Phase 2 draft into the new format; the two samples; and the validator accepting an exported **edit** (file replaced, relation added, one deleted). |
| `npm run validate`, `npm run build`, `npm run lint` | Unchanged. |

### 2. The new samples on the map

Open <http://localhost:5173/?mode=community>.

1. Near *Jeans scale* there's a new dashed proposal, **Jeans mass**, with two dashed lines:
   one to *Jeans scale* (itself only proposed) and one to *Structure Formation*.
2. Click **Jeans mass**. Its card has a **Depends on** section: *Sample: Jeans scale…* — *still
   open, it has to be accepted first*.
3. **Vlasov eq.** (a confirmed concept) has a dashed ink outline and *✎ Edit proposed · ✓1
   ✗0 ?0* under its name. The relation *Structure Formation → Vlasov eq.* is dotted and reads
   *relates (removal proposed)*; a new dashed line reads *described by (proposed)*.
4. Click **Vlasov eq.** Under **Open proposals about this concept**, click *Sample: edit Vlasov
   eq.…*. The panel shows the **edit proposal**: an *EDIT PROPOSAL* pill, **What it would
   change** with *Generality 4 → 6*, *Adds: …* and a struck-through *Removes: …*. **← Back to
   Vlasov eq.** returns to the concept's card.
5. The concept list's *Proposed — not yet confirmed* group now lists the edit too.

### 3. Simulate a rejection

1. Move `content/proposals-fixtures/sample-jeans-scale.json` out of the folder (e.g. to your
   desktop). Reload.
2. **Jeans scale** is gone. **Jeans mass** stays, with only its line to Structure Formation.
   Its card now says the dependency is *no longer open — 1 relation dropped*, and lists the
   dropped relation struck through under *Dropped, because what they pointed at was rejected
   or withdrawn*.
3. Put the file back and reload: the relation is back.

### 4. Several drafts, and a dependency between them

1. **＋ Propose a concept**. Name it *Test A*, choose a kind, and connect it to Structure
   Formation (search or click).
2. At the top of the editor, **Your drafts** lists *Test A · open*. Click **＋ Another
   concept**: a second ghost appears, and *New concept · open* is now the open one.
3. Name it *Test B*. On the map, **click Test A's ghost**. Test B gets the relation *Test B
   relates to Test A*. Under it: *Depends on "Add Test A", which isn't accepted yet. If it's
   rejected, this relation is dropped.* **Check and export** starts with *This proposal depends
   on another proposal: Add Test A*. Once exported, Test B's proposal file lists it under
   `"dependsOn"`, and its pull-request text has a **Depends on** section.
4. Suggestions and the search now also offer other people's proposals (*not accepted yet*) and
   your other drafts (*your draft*). Choosing one makes a dependency in the same way.
5. **Dragging a ghost** makes its draft the open one. You can also switch with the **Your
   drafts** buttons.
6. Open *Test A* and **Discard this draft…**. The confirmation says *One of your other drafts
   points at it; those relations will be removed.* Discard it. The status reads *Removed 1
   relation from your other drafts that pointed at it*, and Test B is left with no relations
   (its export now asks you to connect it).

### 5. Propose an edit

1. Close the editor, click **Kinetic theory**, and click **✎ Propose an edit** at the bottom
   of its card.
2. The editor opens as **Propose an edit: Kinetic theory**, filled in from the concept: name,
   kind, description, field, generality, importance. The map glides to the concept, which now
   reads *✎ Editing · draft* with a dashed glowing outline.
3. **Check and export** says *Change something — a field, a new relation, or a relation to
   remove.*
4. Change **Generality**: the concept's circle on the map grows or shrinks as you type.
5. Under **Connections → Its relations now**, press **Propose removing** on one relation. It's
   struck through with *removal proposed*, and on the map that line turns dotted with *(your
   draft removes this)*. Press it again to undo.
6. Export: the node file has the **same name** as the concept's file (it replaces it), and
   fields the form doesn't show (review notes, equation variables) are kept, in the same key
   order. The removed relations are listed as *Delete `content/concepts/edges/…json`*.
7. **✎ Propose an edit** on the same concept again opens the draft you already have, not a new
   one.

### 6. Smoke test

The community section now also prints:

```
proposed layer: 4 concepts, 7 relations, contested ultralight_bound_s3; confirmed nodes moved: 0
dependent proposal and edit: { dependent: true, editLabel: 'Vlasov eq.\n✎ Edit proposed · ✓1 ✗0 ?0', removal: true }
two drafts: { ghosts: 2, between: 1, deps: '…Add Smoke test concept…' } after discarding the first: { ghosts: 1, draftEdges: 0, status: '…Removed 1 relation from your other drafts that pointed at it.' }
edit form: { title: 'Propose an edit: Kinetic theory', name: 'Kinetic theory', subject: true, existing: 1 }
```

As before, only the two known feature-20 failures.

---

## Phase 3 — sign in with GitHub, submit as a pull request (feature-36)

**What changed:**
- A small **backend** on Cloudflare (the Worker script `worker/index.ts` → `server/api.ts`): sign in
  with GitHub, the list of open proposals, and submitting one.
- **Submitting** opens one pull request per proposal in the repository, through a **GitHub
  App**: the proposer needs no access to the repository. The commit is authored by them; the
  pull request carries the readable description and, hidden at the end, the proposal itself.
- **Who may submit:** signed-in GitHub users on the invite list (`community/experts.json`, or
  the `ALLOWED_PROPOSERS` setting). Everyone can still browse, draft and export.
- The **Community** view shows the open pull requests as proposals (refreshed every 45 s), or
  the sample proposals where the backend isn't set up — including `npm run dev`.
- A **Checks** workflow runs validate, lint, test and build on every push and pull request
  (it replaced the old GitHub Pages deploy).

### 1. Automated checks (no set-up needed)

| Command | You should see |
|---|---|
| `npm test` | `Test Files 8 passed (8)` · `Tests 150 passed (150)`. New: `server/api.test.ts` runs the whole backend against a simulated GitHub — the App token (and turning GitHub's key format into one Web Crypto accepts), sign-in and its state check, refusing a tampered session and off-site redirects, the invite list, refusing cross-site submissions, the commit authored by the proposer with the right files (an edit's deleted relations too), the server deciding the author and tally itself, dependencies that aren't open yet, and the list rebuilt from pull requests. |
| `npm run build` | Also type-checks `server/` and `worker/`. |
| Smoke test | A new line, against a simulated backend: `phase 3 (simulated backend): { noBackend: true, signInHref: '/api/auth/login?return=%2F%3Fmode%3Dcommunity', sent: 'Add Smoke submitted concept', editorOpen: false, proposals: [ 'Smoke submitted concept\nProposed · ✓0 ✗0 ?0' ], … #12 … }` |

### 2. Locally (no backend)

`npm run dev` → **Community** tab. At the top of the left panel: *Showing **sample** proposals —
this site isn't connected to GitHub yet. You can still draft and export.* The editor's
**Check and export** has no Submit button, only the downloads — as before.

### 3. On Cloudflare, with this repository

Follow `docs/COMMUNITY-BACKEND-SETUP.md` (deploy the Worker script, the settings, the invite list). Then:

1. `https://<your-site>/api/me` → `"configured": true`.
2. **Community** tab → **Sign in with GitHub** → GitHub asks to let *Physics Atlas (test)* read
   your profile → back on the same page: *Signed in as … @you*.
3. Not on the invite list? The panel says so, and **Check and export** explains you can't
   submit yet. Add yourself (step 3 of the set-up guide) and reload within five minutes.
4. Write a proposal. **Check and export** → **Submit as a pull request**. The editor closes,
   the panel says *Submitted "Add …": pull request #N ↗*, and the proposal is on the map,
   dashed. Its card has **Pull request #N on GitHub ↗**.
5. In the repository: a pull request labelled `proposal`, a branch `proposal/…`, one
   commit **authored by you** with the node and relation files (an edit also deletes the
   relations it removes), and the **Checks** workflow running.
6. A second browser (or a private window) shows the proposal within a minute.
7. **Two drafts that depend on each other:** Submit is held back on the second — *Submit "Add
   …" first* — until the first is in. Then the second's pull request lists it under **Depends
   on**.
8. **Sign out** (in the panel) and the Submit button turns back into *Sign in with GitHub to
   submit*.

---

## Map depth — zooming reveals detail (feature-43)

Not part of the community-review phases, but tested the same way. Open
<http://localhost:5173/?mode=concepts> (or the **Community** tab).

1. **The whole map:** only the landmarks show (about 18 of 64 concepts). The biggest ones —
   Dark Matter, Spacetime, Einstein Field Equations, Differential Geometry, … — have their
   name inside the circle, on a dark plate, readable at this zoom.
2. **Zoom towards Dark Matter** (wheel or +). At about 3× more concepts appear around it; at
   about 6× you see Wave Dark Matter, PDF, Structure Formation, Vlasov eq.,
   Schrödinger–Poisson eq., Zel'dovich approximation and Airy solution, with the relations
   between them.
3. **Keep zooming** past Dark Matter: once its circle is wider than the screen it fades to a
   faint outline, and what's around it — the specific concepts and their relation names —
   takes over.
4. **Show all concepts** (map controls) turns the depth off: everything shows at any zoom.
5. Change a concept's `importance` in `content/concepts/nodes/<id>.json` (the dev server
   reloads): lower it and the concept appears later as you zoom in (each step lower,
   about 1.5× closer); `10` makes it always visible. Change `generality` and its circle grows or
   shrinks by 1.5× per step. Undo with `git restore content/concepts`.

`npm test` covers the rules (radius per generality, label sizes, every importance its own
depth).

---

## Coming phases — how you'll test them

These are previews from the plan's exit criteria. Each gets full, step-by-step instructions
when it's built.

| Phase | You'll check |
|---|---|
| **4 — Voting and contested** | Verify, Dispute and Needs clarification on a proposal. The quorum status updates ("2 of 3 verified-expert votes, 1 open dispute"). The "Quorum" check on the PR turns green or red. Marking a proposal contested shows ⚑ and its dispute thread. |
| **5 — Moderation** | As a steward: the review queue lists your domain's proposals, each with a mini-map. Merge one, and after the deploy it shows solid. As a curator: merge two duplicates and check no relation is left dangling. |
| **6 — Accountability** | Every confirmed concept shows its history (created / edited / approved by whom, with links). The audit log matches the test repo's pull requests. Expert badges show where they should. |
| **7 — Hardening** | Rate limits, privacy settings, and a screen-reader pass with NVDA and VoiceOver. |
