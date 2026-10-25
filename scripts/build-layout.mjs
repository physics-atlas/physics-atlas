#!/usr/bin/env node
// Works out the concept map's layout once, at build time, and writes it to
// src/data/conceptLayout.json — the app ships it, so no visitor's browser
// has to search for a layout (src/graph/conceptLayout.ts). Generated, not
// committed, like concepts.json. The file is reused while both the graph's
// layout key and the layout code are unchanged, so only a change to either
// costs the search (under a minute).
// Run via `npm run build:content`, after compile-concepts.mjs.
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { runnerImport } from 'vite';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'src/data/conceptLayout.json');
// Everything the layout is computed by: a change to any of them re-runs the search.
const CODE = [
  'src/graph/conceptLayout.ts',
  'src/graph/layoutOptimize.ts',
  'src/graph/concepts.ts',
  'src/graph/glyphWidths.json',
  'src/data/loadConcepts.ts',
];

const code = createHash('sha256');
for (const file of CODE) code.update(readFileSync(join(ROOT, file)));
const codeHash = code.digest('hex').slice(0, 16);

const load = async (file) => (await runnerImport(join(ROOT, file), { root: ROOT, configFile: false, logLevel: 'error' })).module;
const layout = await load('src/graph/conceptLayout.ts');
const concepts = await load('src/graph/concepts.ts');
// The graph exactly as the app loads it, so the keys match.
const { concepts: graph } = await load('src/data/loadConcepts.ts');
// The map lays out the confirmed, serious graph; fun mode's fluff is placed around it.
const input = layout.conceptLayoutInput(concepts.splitFluff(graph).base);

if (existsSync(OUT)) {
  const stored = JSON.parse(readFileSync(OUT, 'utf8'));
  if (stored.key === input.key && stored.code === codeHash) {
    console.log('✓ concept layout unchanged → src/data/conceptLayout.json');
    process.exit(0);
  }
}
const started = Date.now();
const round = (pos) => Object.fromEntries(Object.entries(pos).map(([id, p]) => [id, { x: Math.round(10 * p.x) / 10, y: Math.round(10 * p.y) / 10 }]));
const components = layout.searchConceptLayout(input).map(round);
writeFileSync(OUT, JSON.stringify({ key: input.key, code: codeHash, components }) + '\n');
console.log(`✓ laid out ${input.components.length} groups in ${((Date.now() - started) / 1000).toFixed(1)} s → src/data/conceptLayout.json`);
