import { mkdtempSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { formatEntity, readConceptSources, unformattedFiles } from './concept-files.mjs';

const REAL_SOURCE = join(dirname(fileURLToPath(import.meta.url)), '../../content/concepts');

const dirs = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

/** A throwaway content/concepts folder: { 'nodes/a.json': {...} | 'raw text' } */
function fixture(files, meta = { version: 1 }) {
  const dir = mkdtempSync(join(tmpdir(), 'concepts-'));
  dirs.push(dir);
  mkdirSync(join(dir, 'nodes'));
  mkdirSync(join(dir, 'edges'));
  if (meta) writeFileSync(join(dir, 'graph.json'), formatEntity(meta));
  for (const [path, content] of Object.entries(files))
    writeFileSync(join(dir, path), typeof content === 'string' ? content : formatEntity(content));
  return dir;
}

const node = (id) => ({ id, type: 'property', label: id, attrs: { description: id } });
const edge = (id) => ({ id, source: 'a', target: 'b', relationship: 'relates' });

describe('readConceptSources', () => {
  it('assembles graph.json, nodes and edges into the app graph', () => {
    const dir = fixture({ 'nodes/a.json': node('a'), 'nodes/b.json': node('b'), 'edges/e1.json': edge('e1') });
    const { graph, problems } = readConceptSources(dir);
    expect(problems).toEqual([]);
    expect(graph).toEqual({ version: 1, nodes: [node('a'), node('b')], edges: [edge('e1')] });
  });

  it('orders by id, numerically, whatever order the files were written in', () => {
    const dir = fixture({
      'edges/e10.json': edge('e10'),
      'edges/e2.json': edge('e2'),
      'edges/e1.json': edge('e1'),
      'nodes/zeta.json': node('zeta'),
      'nodes/alpha.json': node('alpha'),
    });
    const { graph } = readConceptSources(dir);
    expect(graph.edges.map((e) => e.id)).toEqual(['e1', 'e2', 'e10']);
    expect(graph.nodes.map((n) => n.id)).toEqual(['alpha', 'zeta']);
  });

  it('reports a file whose id does not match its name', () => {
    const dir = fixture({ 'nodes/a.json': node('b') });
    const { problems } = readConceptSources(dir);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(/a\.json: "id" is "b" but the file is named "a\.json"/);
  });

  it('reports unparseable JSON with its path and skips the file', () => {
    const dir = fixture({ 'nodes/a.json': node('a'), 'nodes/broken.json': '{ "id": ' });
    const { graph, problems } = readConceptSources(dir);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(/broken\.json: cannot read\/parse/);
    expect(graph.nodes.map((n) => n.id)).toEqual(['a']);
  });

  it('reports a missing graph.json or entity folder', () => {
    const dir = fixture({}, null);
    rmSync(join(dir, 'edges'), { recursive: true });
    const { problems } = readConceptSources(dir);
    expect(problems.some((p) => p.includes('graph.json'))).toBe(true);
    expect(problems.some((p) => p.includes('missing edges folder'))).toBe(true);
  });

  it('ignores files that are not JSON', () => {
    const dir = fixture({ 'nodes/a.json': node('a'), 'nodes/README.md': '# notes' });
    expect(readConceptSources(dir).problems).toEqual([]);
  });
});

describe('formatting', () => {
  it('formatEntity is 2-space JSON with a trailing newline', () => {
    expect(formatEntity({ id: 'a', n: [1] })).toBe('{\n  "id": "a",\n  "n": [\n    1\n  ]\n}\n');
  });

  it('flags hand-formatted files but accepts CRLF line endings', () => {
    const dir = fixture({
      'nodes/tidy.json': node('tidy'),
      'nodes/crlf.json': formatEntity(node('crlf')).replace(/\n/g, '\r\n'),
      'nodes/messy.json': JSON.stringify(node('messy')),
    });
    const flagged = unformattedFiles(dir).map((p) => p.split(/[\\/]/).pop());
    expect(flagged).toEqual(['messy.json']);
  });
});

describe('the real content/concepts', () => {
  const { graph, problems } = readConceptSources(REAL_SOURCE);

  it('reads without problems', () => {
    expect(problems).toEqual([]);
  });

  it('has exactly one entity per file', () => {
    const count = (sub) => readdirSync(join(REAL_SOURCE, sub)).filter((f) => f.endsWith('.json')).length;
    expect(graph.nodes).toHaveLength(count('nodes'));
    expect(graph.edges).toHaveLength(count('edges'));
  });

  it('is canonically formatted, so diffs stay one change per line', () => {
    expect(unformattedFiles(REAL_SOURCE)).toEqual([]);
  });

  it('only connects concepts that exist', () => {
    const ids = new Set(graph.nodes.map((n) => n.id));
    const dangling = graph.edges.filter((e) => !ids.has(e.source) || !ids.has(e.target)).map((e) => e.id);
    expect(dangling).toEqual([]);
  });
});
