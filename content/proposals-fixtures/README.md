# Sample proposals (test fixtures)

These files are **not real proposals and not curated content**. They exist so the proposed
layer (community-review Phase 1) can be seen and tested before proposals come from pull
requests (Phase 3). They only appear in the **Community** view (`?mode=community`).

Each file is one proposal in the shape of `src/community/types.ts` → `Proposal`. A unit test
checks every file against the confirmed graph, so a fixture that stops fitting (e.g. it points
at a concept that was renamed) fails `npm test`.

Two of them show what Phase 2b added: `sample-jeans-mass.json` relates to the *Jeans scale*
sample and so lists it in `dependsOn` (move `sample-jeans-scale.json` away to see that relation
dropped), and `sample-edit-vlasov.json` is an **edit** of a confirmed concept (`edits`,
`removals`).
