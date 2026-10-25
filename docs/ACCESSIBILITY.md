# Accessibility and Universal Design for Learning

Physics Atlas follows two standards:

- **Universal Design for Learning (UDL 3.0, CAST)** — the design principle. Learners
  differ in how they take in information, how they act on it, and what keeps them
  going. The atlas offers more than one way through each of these instead of a single
  "standard" path.
- **WCAG 2.2, level AA** — the minimum technical standard for every view.

Every new UI element has to meet the rules below. The reviewer agent checks them
(see the a11y laws in `.claude/agents/reviewer.md`).

## UDL in the atlas

### Multiple means of representation (the "what" of learning)

| Practice | Where |
|---|---|
| Every visual encoding has a text equivalent | Node colour → type name in the label, legend and card; size → generality and "zoom in for more" → importance, both explained in the legend and in the editor's field hints; silver/gold direction → "From this concept" / "Into this concept" in the card's text; proposal status → dashed / double outline **plus** "Proposed · ✓2 ✗0 ?1" / "⚑ Contested" in the label, card, list and legend; the editor's glows → "Draft · not submitted", "＋ Connect?" and "≈ Similar name" in the labels, repeated as lists in the editor |
| The graph has a non-visual equivalent | **All concepts as a list** panel; every relation as a full sentence ("Zel'dovich approximation approximates Structure Formation under the assumption of linear potential.") in the card |
| Vocabulary is defined where it's used | Clicking a type in the legend opens its definition, examples and "not to be confused with" notes |
| The display can be adjusted | Light/dark theme; **Reduce motion**; **Show all concepts** (turns off zoom level of detail); browser zoom up to 400% |
| Information comes in layers | Zoom level of detail shows landmarks first and reveals more specific concepts the closer you look (importance is a depth: each 8 points lower, twice as close); **Show all concepts** turns the depth off; the card opens with a description and leaves the full relation list collapsed |

### Multiple means of action and expression (the "how")

| Practice | Where |
|---|---|
| Everything works from the keyboard | Skip link, search (combobox), list panel, card, legend, map controls, the whole proposal editor; Escape closes the card and the type definition |
| No action needs a precise gesture | Zoom-in / zoom-out / whole-map buttons alongside wheel, pinch and drag. In the proposal editor, dragging the ghost is only a thinking aid: connecting is a click (on the map or a "＋ Connect to …" button) or a search, and suggestions also come from what's already connected |
| Writing is supported, not policed | The proposal editor names each kind of concept with its definition, reads every relation back as a sentence, previews LaTeX, and turns problems into a list of links to the field; conflicts are hints ("Did you mean …?"), never blocks |
| More than one way to find a concept | Search, the list by type, goal paths, clicking a neighbour in the card |
| Learners can plan and track their work | Goal paths with an ordered list of steps; "Learned" checkboxes and progress count |

### Multiple means of engagement (the "why")

| Practice | Where |
|---|---|
| Learners choose the goal | Any concept can become a goal ("Show path to this") |
| Self-paced, no time limits | Nothing advances or expires on its own |
| Distraction can be switched off | **Reduce motion** stops the animated starfield, galaxy and map glides |
| Progress is visible | Path progress ("3 of 8 learned"), learned markers on the map |

## WCAG 2.2 AA rules for contributors

**Perceivable**

- **Text contrast ≥ 4.5:1** against the panel and page backgrounds in *both* themes,
  and **≥ 3:1** for large text, icons, borders and focus indicators. Use the
  `App.css :root` tokens (`--ink`, `--ink-2`, `--muted`, `--accent-ink`, `--gold`,
  `--silver`). They are measured; don't add hard-coded text colours.

  | Token | Dark (page / panel) | Light (page / white) |
  |---|---|---|
  | `--ink-2` | 15.15 / 13.75 | 10.42 / 11.36 |
  | `--muted` | 13.50 / 12.26 | 8.75 / 9.55 |
  | `--gold` | 10.46 / 9.50 | 4.87 / 5.31 |
  | `--silver` | 13.48 / 12.24 | 4.97 / 5.42 |

- **No grey text for de-emphasis.** `--ink-2` and `--muted` are high-contrast
  (≥ 8.7:1). Secondary text is marked by typography, using the shared rules
  under "secondary text" in `App.css`:

  | Meaning | Cue |
  |---|---|
  | Label / metadata (section headings, a card's type line) | uppercase + letter-spacing + semibold |
  | Count | outlined pill |
  | Note, hint, empty state, secondary context ("via …", "— parent topic") | italic |
  | Done / learned | strikethrough, beside the ticked checkbox or ✓ |
  | Relation name on the map | italic on a background plate (concept names are upright) |
  | Big concept's name (generality 6+) | inside its circle, on a plate (surface colour, 78%) so it reads over the type colour |
  | Zoomed past a concept | its circle fades to a faint outline; the concept is still in the list, search and cards |
  | Proposed / contested concept | dashed / double outline + the status and tally in words in its label ("Proposed · ✓2 ✗0 ?1"); never a status colour |
  | Draft (editor) | dashed outline with a steady glow + "Draft · not submitted"; concepts offered or flagged say "＋ Connect?" / "≈ Similar name"; warnings carry ⚠ / ≈ and a gold border, not gold text |
  | The open draft (of several) | a heavier, larger glow on the map; in the editor's draft list a solid, heavier border plus the word "open" |
  | Edit (yours / someone else's) | dashed glowing outline + "✎ Editing · draft" / dashed ink outline + "✎ Edit proposed · ✓…" on the confirmed concept |
  | Removal proposed | dotted line + "(removal proposed)" / "(your draft removes this)" on it; in lists, struck through + "removal proposed" or "Removes:" |
  | Not accepted yet / depends on | "(not accepted yet)" in suggestions; "Depends on … — if it's rejected, this relation is dropped" under the relation |
  | Optional field | the word *optional*, in italic, after the label |
  | Placeholder | italic |

  Add a new secondary element to the matching group instead of picking a dimmer
  colour.
- **Colour never carries meaning alone** — pair it with text, a glyph, a shape, a
  pattern (dashed = optional) or position. Links in running text are underlined.
- **Minimum text size 12px** in the UI; canvas labels drop out below 9px on screen
  instead of rendering unreadably small.
- **Images and canvases have a text alternative.** The graph canvas is
  `role="img"` with a name that points to the keyboard route; decorative canvases
  (starfield, galaxy) are `aria-hidden`.

**Operable**

- **Keyboard:** every action is reachable with Tab / Shift+Tab / Enter / Space /
  arrows / Escape, with no keyboard traps. DOM order is the reading and tab order, so
  overlays go before the canvas in the DOM.
- **Visible focus:** the global `:focus-visible` ring (3px, `--accent-ink`). Never
  remove an outline without replacing it.
- **Target size ≥ 24×24 CSS px** for every control (inline links in a sentence are
  exempt). Close buttons are 32px; map controls 36px.
- **No dragging-only actions:** offer a button for anything done by drag, wheel or
  pinch.
- **Motion:** every animation must stop under `reducedMotion()` (`src/lib/motion.ts`)
  — the OS setting or the in-app toggle. CSS animations are covered globally by the
  `data-motion` rules in `App.css`; JS animations must call `reducedMotion()` when
  they run, not once at load.
- **Bypass blocks and page titles:** the skip link targets `<main id="main">`; every
  view sets `document.title` and has one `h1` (visually hidden where the design
  has no visible one).

**Understandable**

- **Focus follows intent:** changing view moves focus to `<main>`. Opening a concept
  card moves focus into it, and closing it returns focus to where the user came
  from. The proposal editor does the same, returning focus to "Propose a concept";
  "Show on map" from inside the editor highlights the concept but leaves focus there.
- **Predictable:** controls keep their place and meaning across views. A toggle keeps
  a fixed label and exposes its state with `aria-pressed`. A display toggle (Show all
  concepts, Show confirmed, Show proposed) changes what's drawn, never where the view
  is.
- **Signing in** is a plain link ("Sign in with GitHub") with the reason next to it; the
  submit result is announced (a polite status for success, an alert for a refusal, in words).
- **Forms:** every field has a visible `<label>`; hints are tied to their field with
  `aria-describedby`; groups of checkboxes are a `fieldset` with a `legend`; problems are
  listed in words, each a button that moves focus to its field. Destructive actions ask
  first ("Discard everything? Discard / Keep it").
- **Plain language:** labels say what happens ("Show path to this", "Show the
  whole map"), not just an icon.

**Robust**

- Native elements first (`button`, `a`, `input`, `details`); ARIA only where HTML
  has no equivalent.
- Follow the WAI-ARIA Authoring Practices patterns exactly: the search is a
  **combobox** (role on the input, `aria-controls`, `aria-activedescendant`,
  `aria-expanded`); options never contain other interactive elements.
- Status changes that aren't focus moves are announced with a polite live
  region (search result counts, the goal bar).
- Landmarks: `header`, `nav` ("Views"), `main`, `aside` (the card, named by its
  heading), named groups for the legend, map controls and display settings.

## Known gaps

- **The graph canvas itself is not keyboard-operable.** Nodes on a Cytoscape canvas
  can't take focus. The equivalent route is search, the list panel and the card's
  relation links. A keyboard-navigable canvas (arrow keys between neighbours) is a
  possible next step.
- **Relations open a card by click or by keyboard.** Lines on the canvas aren't
  focusable, so every relation also has a **Details** button in its concepts' cards
  (All relations) that opens the same card; focus moves into it and Escape returns.
  What a selected concept assumes is marked with a dotted outline (a pattern, not a
  colour) and named on the card.
- **Not yet tested with assistive technology.** A pass with NVDA + Firefox and
  VoiceOver + Safari, and an automated axe check in `npm run smoke`, are still to do.
  The proposal editor is the most form-heavy part, so it should come first.
- **The ghost can't be moved by keyboard.** By design: its position is a sketch,
  not data, and the keyboard route gets the same help another way (the ghost follows
  what's connected, and suggestions come from those concepts' neighbours).
- **Type colours are not CVD-safe pairwise.** Sixteen types in one hue family per
  group (Decision 29) leave some cross-family pairs close under deuteranopia or
  protanopia. The type is always also in words — the label, the legend and the card —
  and `typeColors.test.ts` keeps every fill at ≥ 3:1 on both surfaces.
- **The map guide hides itself after 3 seconds** (WCAG 2.2.1). It's never lost: the
  "How to read this map" button at the top middle (`aria-expanded`) brings it back, and
  opened that way it stays until closed.
- **The relation picker is a custom combobox** (the WAI-ARIA APG select-only pattern),
  because a native select can't bold part of an option. It keeps the native keyboard
  (arrows, Home/End, Page keys, type-ahead, Enter/Space/Tab, Escape). The concept names in
  it are dimmed with `--muted` (≥ 8.7:1), not grey. Not yet checked with a screen reader.
- **Fun mode's speech bubbles hide with their concept.** They're real buttons (in the
  tab order after the canvas, named "‹concept›: ‹line›"), but a bubble whose concept the
  zoom hides, or that would overlap a more important one, is hidden too — so not every
  lonely concept is reachable at every zoom. "Show all concepts" brings every concept
  back; the concept list reaches them all. Turning fun mode on is announced in a status
  message.
