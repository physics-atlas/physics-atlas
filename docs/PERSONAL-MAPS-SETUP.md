# Setting up personal maps

Personal maps (Decision 50, `.claude/plans/epic-personal-maps.md`) keep their data in a
**Cloudflare D1** database next to the Worker that already runs the site. The atlas itself
doesn't use it: it stays in git.

Until the database exists and is bound, nothing changes on the site — `/api/me` simply
says `canMakeMaps: false`. These steps need your Cloudflare account, so they're done by
hand, once.

## 1. Create the database

In the project folder, signed in to Cloudflare (`npx wrangler login`):

```bash
npx wrangler d1 create physics-atlas-maps --jurisdiction eu
```

`--jurisdiction eu` keeps the data inside the EU. If your Wrangler or plan doesn't offer it,
use a location hint instead: `--location weur` (Western Europe) — then the data is *placed*
in Europe, but not guaranteed to stay there; say so in the privacy notice.

Wrangler prints a block like:

```jsonc
{
  "d1_databases": [
    { "binding": "DB", "database_name": "physics-atlas-maps", "database_id": "…" }
  ]
}
```

## 2. Bind it to the Worker

Add it to `wrangler.jsonc`, with the binding named **`MAPS_DB`** (that's what the server
looks for):

```jsonc
  "d1_databases": [
    {
      "binding": "MAPS_DB",
      "database_name": "physics-atlas-maps",
      "database_id": "<the id Wrangler printed>",
      "migrations_dir": "migrations"
    }
  ],
```

The id isn't a secret; it's fine in the repository. Don't add the block before the
database exists: a deploy with an unknown id fails.

## 3. Create the tables

```bash
npx wrangler d1 migrations apply physics-atlas-maps --remote
```

This runs `migrations/0001_personal_maps.sql`, `0002_course_goals.sql` (course goals: a map's items
may also be a course goal) and `0003_share_links.sql` (a share link for each map that has none). Later migrations are new numbered files in `migrations/`; the same
command applies the ones not applied yet — **run it again after deploying a version that adds one**,
before anyone saves a course goal. `npm test` checks the
schema against SQLite (`scripts/maps-schema.test.mjs`).

## 4. Who may create maps

In `community/experts.json`, add `"maps": true` to whoever may **create** maps — for the
pilot, the educator:

```json
{ "github": "<their GitHub username>", "name": "…", "verified": true, "maps": true }
```

People they add to a map as editors, commenters or viewers need no flag, and people with
the map's link need no account at all.

## 5. A map made ahead of time (optional)

A map can be made before its owner first signs in, from a seed file in `scripts/maps-seed/`
(the owner, the members and their roles, the atlas concepts it uses):

```bash
node scripts/seed-map.mjs scripts/maps-seed/newtonian-mechanics.json seed.sql
npx wrangler d1 execute physics-atlas-maps --remote --file seed.sql
```

The script asks GitHub's public API for each username's account id (the database keys people by
it). Without a token GitHub allows 60 lookups an hour per connection; if the script says GitHub
refused a lookup, wait an hour or set `GITHUB_TOKEN` to any personal access token (no scopes
needed). It writes `seed.sql` only when every account was found — check it said so before running
the second command. Running the SQL again changes nothing once the map exists. The map is then at
`?mode=map&map=<its id>`, and under **My maps** for each member once they sign in. Delete
`seed.sql` afterwards; it isn't needed again.

## 6. Privacy, before anyone uses it

- **Request logs:** in the Worker's *Observability* settings, keep log retention short and
  don't add logging of IP addresses or share-link tokens. The notice states the retention.
- **Backups:** D1's *Time Travel* keeps restore points (how many days depends on the plan);
  the notice states the window.
- **The notice:** `docs/PRIVACY-NOTICE.md` is a draft; its "Before publishing" list has to
  be done first — in particular, serving the font from the site instead of Google Fonts.
- **Two-factor sign-in** on the Cloudflare and GitHub accounts that can reach the database.
