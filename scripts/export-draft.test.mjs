// The Phase 2 exit check, end to end: what the proposal editor exports drops
// into content/concepts/ and the real validator accepts it. Lives here (not in
// src/) because it shells out to the validator.
import { execFileSync } from 'node:child_process';
import { cpSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { NEW_CONCEPT, exportFiles, newDraft } from '../src/community/draft.ts';
import { formatEntity, readConceptSources } from './lib/concept-files.mjs';

const draft = {
  ...newDraft(() => 0.5, new Date('2026-10-15T12:00:00Z')),
  label: 'Jeans scale',
  type: 'property',
  description: 'Sample: the length scale above which gravity overcomes pressure support.',
  domains: ['Cosmology'],
  claim: 'Sample claim.',
  relations: [
    { key: 'r1', source: NEW_CONCEPT, target: 'structure_formation', relationship: 'is a condition of', conditions: [] },
    { key: 'r2', source: 'zeldovich_approximation', target: NEW_CONCEPT, relationship: 'relates', conditions: [{ label: 'linear growth' }] },
  ],
};
const files = exportFiles(draft);

describe('exported proposal files', () => {
  const dir = mkdtempSync(join(tmpdir(), 'atlas-export-'));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));
  const target = join(dir, 'content/concepts');
  cpSync('content/concepts', target, { recursive: true });
  for (const f of files) writeFileSync(join(dir, f.path), f.content);

  it('are formatted exactly like the content scripts format them', () => {
    for (const f of files) expect(f.content).toBe(formatEntity(JSON.parse(f.content)));
  });

  it('pass npm run validate when dropped into content/concepts/', () => {
    const before = readConceptSources('content/concepts').graph;
    const out = execFileSync(process.execPath, ['scripts/validate-concepts.mjs'], {
      env: { ...process.env, CONCEPTS_DIR: target },
      encoding: 'utf8',
    });
    expect(out).toContain(`✓ content/concepts valid — ${before.nodes.length + 1} nodes`);
    expect(out).toContain(`${before.edges.length + 2} edges`);
  });

  it('compile into the graph with no file-level problems', () => {
    const { graph, problems } = readConceptSources(target);
    expect(problems).toEqual([]);
    expect(graph.nodes.some((n) => n.label === 'Jeans scale')).toBe(true);
  });
});
