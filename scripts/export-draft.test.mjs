// The editor's exit check, end to end: what the proposal editor exports drops
// into content/concepts/ and the real validator accepts it — a new concept,
// and an edit (its file replaced, new relations added, removed ones deleted).
// Lives here (not in src/) because it shells out to the validator.
import { execFileSync } from 'node:child_process';
import { cpSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { NEW_CONCEPT, exportFiles, newDraft, newEditDraft, removedFiles } from '../src/community/draft.ts';
import { formatEntity, readConceptSources } from './lib/concept-files.mjs';

const confirmed = readConceptSources('content/concepts').graph;
const at = new Date('2026-10-15T12:00:00Z');

const draft = {
  ...newDraft(() => 0.5, at),
  label: 'Jeans scale',
  type: 'property',
  description: 'Sample: the length scale above which gravity overcomes pressure support.',
  domains: ['Cosmology'],
  generality: 7,
  importance: 5,
  relations: [
    { key: 'r1', source: NEW_CONCEPT, target: 'structure_formation', relationship: 'is a condition of', conditions: [] },
    { key: 'r2', source: 'zeldovich_approximation', target: NEW_CONCEPT, relationship: 'relates', conditions: [{ label: 'linear growth' }] },
  ],
};
const edit = {
  ...newEditDraft(confirmed.nodes.find((n) => n.id === 'vlasov_equation'), () => 0.75, at),
  generality: 6,
  removals: ['e62'],
  relations: [{ key: 'r1', source: NEW_CONCEPT, target: 'kinetic_theory', relationship: 'relates', conditions: [] }],
};
const ctx = { confirmed, drafts: [draft, edit], proposals: [] };

function validateWith(files, deletions = []) {
  const dir = mkdtempSync(join(tmpdir(), 'atlas-export-'));
  const target = join(dir, 'content/concepts');
  cpSync('content/concepts', target, { recursive: true });
  for (const f of files) writeFileSync(join(dir, f.path), f.content);
  for (const f of deletions) rmSync(join(dir, f));
  const out = execFileSync(process.execPath, ['scripts/validate-concepts.mjs'], {
    env: { ...process.env, CONCEPTS_DIR: target },
    encoding: 'utf8',
  });
  return { out, graph: readConceptSources(target), cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

describe('exported proposal files', () => {
  const cleanups = [];
  afterAll(() => cleanups.forEach((c) => c()));

  it('are formatted exactly like the content scripts format them', () => {
    for (const f of [...exportFiles(draft, ctx), ...exportFiles(edit, ctx)]) expect(f.content).toBe(formatEntity(JSON.parse(f.content)));
  });

  it('a new concept passes npm run validate when dropped into content/concepts/', () => {
    const run = validateWith(exportFiles(draft, ctx));
    cleanups.push(run.cleanup);
    expect(run.out).toContain(`✓ content/concepts valid — ${confirmed.nodes.length + 1} nodes`);
    expect(run.out).toContain(`${confirmed.edges.length + 2} edges`);
    expect(run.graph.problems).toEqual([]);
    expect(run.graph.graph.nodes.some((n) => n.label === 'Jeans scale')).toBe(true);
  });

  it('an edit passes too: the file replaced, a relation added, one deleted', () => {
    const run = validateWith(exportFiles(edit, ctx), removedFiles(edit));
    cleanups.push(run.cleanup);
    expect(run.out).toContain(`✓ content/concepts valid — ${confirmed.nodes.length} nodes`);
    expect(run.out).toContain(`${confirmed.edges.length} edges`);
    const vlasov = run.graph.graph.nodes.find((n) => n.id === 'vlasov_equation');
    expect(vlasov.generality).toBe(6);
    expect(run.graph.graph.edges.some((e) => e.id === 'e62')).toBe(false);
  });
});

describe('fluff', () => {
  it('can never be part of a strict prerequisite — no joke joins a learning path', () => {
    const joke = {
      path: 'content/concepts/edges/e_fluff_test.json',
      content: formatEntity({ id: 'e_fluff_test', source: 'sample_schrodingers_cat', target: 'bec', relationship: 'strict prerequisite for' }),
    };
    let failure = '';
    try {
      validateWith([joke]).cleanup();
    } catch (e) {
      failure = `${e.stdout ?? ''}${e.stderr ?? ''}`;
    }
    expect(failure).toContain(`a fluff node can't be part of a "strict prerequisite for" relation`);
  });
});
