// The concept graph's source of truth: one JSON file per node and per edge
// under content/concepts/, so every entity has its own git history (blame)
// and parallel proposals never touch the same file. Compiled into
// src/data/concepts.json (generated, not committed) by compile-concepts.mjs.
//
//   content/concepts/graph.json        { "version": 1 }
//   content/concepts/nodes/<id>.json   one node, "id" must equal the file name
//   content/concepts/edges/<id>.json   one edge, likewise
//
// Output order is by id (natural order: e2 before e10), so it never depends
// on which proposal landed first.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export const NODES_DIR = 'nodes';
export const EDGES_DIR = 'edges';
export const GRAPH_FILE = 'graph.json';

const byId = (a, b) => a.id.localeCompare(b.id, 'en', { numeric: true });

/** The canonical text of an entity file: 2-space JSON, LF, trailing newline. */
export function formatEntity(entity) {
  return JSON.stringify(entity, null, 2) + '\n';
}

function readJson(path, problems) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (e) {
    problems.push(`${path}: cannot read/parse — ${e.message}`);
    return null;
  }
}

function readEntities(dir, kind, problems) {
  let names;
  try {
    names = readdirSync(dir).filter((f) => f.endsWith('.json'));
  } catch {
    problems.push(`${dir}: missing ${kind} folder`);
    return [];
  }
  const entities = [];
  for (const name of names) {
    const path = join(dir, name);
    const entity = readJson(path, problems);
    if (!entity) continue;
    const expected = name.slice(0, -'.json'.length);
    if (entity.id !== expected)
      problems.push(`${path}: "id" is "${entity.id}" but the file is named "${name}" — they must match`);
    entities.push(entity);
  }
  return entities.sort(byId);
}

/**
 * Reads content/concepts/ into the graph the app loads. `problems` are
 * file-level errors (unreadable JSON, id ≠ file name); the graph-level rules
 * stay in validate-concepts.mjs.
 */
export function readConceptSources(dir) {
  const problems = [];
  const meta = readJson(join(dir, GRAPH_FILE), problems) ?? {};
  const graph = {
    ...meta,
    nodes: readEntities(join(dir, NODES_DIR), 'nodes', problems),
    edges: readEntities(join(dir, EDGES_DIR), 'edges', problems),
  };
  return { graph, problems };
}

/** Files whose text isn't canonical — they work, but diffs stay cleanest when formatted. */
export function unformattedFiles(dir) {
  const out = [];
  for (const sub of [NODES_DIR, EDGES_DIR]) {
    let names = [];
    try {
      names = readdirSync(join(dir, sub)).filter((f) => f.endsWith('.json'));
    } catch {
      continue;
    }
    for (const name of names) {
      const path = join(dir, sub, name);
      const text = readFileSync(path, 'utf8').replace(/\r\n/g, '\n');
      try {
        if (formatEntity(JSON.parse(text)) !== text) out.push(path);
      } catch {
        // unreadable files are reported by readConceptSources
      }
    }
  }
  return out;
}
