# Community

`experts.json` is the **invite list** while the repository is private: only the GitHub
handles listed here can submit proposals from the site (the Physics Atlas app opens the pull
request on their behalf). Anyone can browse, draft and export.

```json
{
  "experts": [
    { "github": "their-handle", "name": "Display name", "verified": false, "domains": ["Cosmology"] }
  ]
}
```

- `github` — required; their GitHub handle (case doesn't matter).
- `verified` — a curator has attested their expertise (Decision 18): their proposals show
  "✓ Verified expert". Leave it `false` until then.
- `domains` — what they're expert in, from `src/data/conceptVocabulary.json` → `domains`
  (used by the quorum rules in Phase 4).

Adding someone is itself a pull request, so the list has its own history. The site re-reads
it within five minutes. For a quick test, the `ALLOWED_PROPOSERS` setting
(docs/COMMUNITY-BACKEND-SETUP.md) adds handles without touching this file.
