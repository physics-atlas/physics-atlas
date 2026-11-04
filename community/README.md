# Community

`experts.json` is the **invite list** while the repository is private: only the GitHub
handles listed here can submit proposals from the site (the Physics Atlas app opens the pull
request on their behalf). Anyone can browse, draft and export.

```json
{
  "experts": [
    { "github": "their-handle", "name": "Display name", "verified": false, "publish": false, "domains": ["Cosmology"] }
  ]
}
```

- `github` — required; their GitHub handle (case doesn't matter).
- `verified` — a curator has attested their expertise (Decision 18): their proposals show
  "✓ Verified expert". Leave it `false` until then.
- `publish` — may publish directly (Decision 43): the editor offers **Publish now** beside
  **Submit as a pull request**, and the app merges the pull request as soon as it's opened.
  Meant for the curators while the graph is being built; leave it out otherwise. The
  `DIRECT_PUBLISH=off` setting turns it off for everyone at once.
- `domains` — what they're expert in, from `src/data/conceptVocabulary.json` → `domains`
  (used by the quorum rules in Phase 4).

Adding someone is itself a pull request, so the list has its own history. The site re-reads
it within five minutes. For a quick test, the `ALLOWED_PROPOSERS` setting
(docs/COMMUNITY-BACKEND-SETUP.md) adds handles without touching this file.
