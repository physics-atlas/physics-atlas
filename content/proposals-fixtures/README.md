# Sample proposals (test fixtures)

These files are **not real proposals and not curated content**. They exist so the proposed
layer (community-review Phase 1) can be seen and tested before proposals come from pull
requests (Phase 3). They only appear on the concept map with `?community=1`.

Each file is one proposal in the shape of `src/community/types.ts` → `Proposal`. A unit test
checks every file against the confirmed graph, so a fixture that stops fitting (e.g. it points
at a concept that was renamed) fails `npm test`.
