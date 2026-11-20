# The privacy notice — for maintainers

The notice is **published on the site** at `?mode=privacy` (English) and
`?mode=privacy&lang=de` (German), linked from the header on every view and next to each
"Sign in with GitHub". Its text lives in two files, rendered by the atlas pages' own
Markdown renderer (`src/components/PrivacyView.tsx`):

- `content/privacy/en.md`
- `content/privacy/de.md` — the repository's one exception to "everything in English":
  it's for the site's German readers.

Decision 51 records what it describes. It was written without legal advice; have it
checked when the project grows (and before personal maps become a paid feature).

## Changing it

Change **both** files the same way, and update the date in their first line. The notice
must stay true — revisit it whenever any of these changes:

| If this changes | Section |
|---|---|
| What the server keeps about a signed-in person (`server/session.ts`, `migrations/`) | 3, 5 |
| What the browser stores (keys starting `physics-atlas-`) | 2 |
| A new third party the site contacts (fonts, scripts, images, analytics) | 2, 7 |
| Log retention (the Worker's *Observability* settings, 7 days) or backups (D1 Time Travel, 30 days on the paid plan) | 2, 6 |
| Where the database is kept (EU jurisdiction, `physics-atlas-maps`) | 7 |
| Who runs the site, the address, the contact e-mail | 1 |
| Account deletion or data export becomes a button | 6, 8 |

## Settled (2026-11-21)

- **Responsible:** Guilherme Daudt and Sophie Ashworth, jointly; Bielefeld, NRW, so the
  authority is the LDI NRW. No separate written arrangement between them for now.
- **Fonts:** Sora is served from the site (`@fontsource/sora`, imported in `src/main.tsx`)
  instead of Google Fonts, which sent every visitor's IP address to Google (LG München I,
  20 Jan 2022, 3 O 17493/20).
- **Impressum:** not needed for now — the site is run privately, without financial benefit.
  Revisit when personal maps become a paid feature (§ 5 DDG).
- **Request logs:** 7 days. Keep *Include invocation logs* off in the Worker's *Observability*
  settings, so the logs hold only the server's own lines (usernames on sign-in, publishing
  and feedback; errors) — no IP addresses.
- **Sign-in age:** 16.
