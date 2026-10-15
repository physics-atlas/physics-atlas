#!/usr/bin/env node
// Compiles content/concepts/{graph.json,nodes/*.json,edges/*.json} into
// src/data/concepts.json — the generated file the app imports. Never edit
// the generated file; edit the per-entity files (docs/AUTHORING.md).
// Run via `npm run build:content`.
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, sep } from 'node:path';
import { readConceptSources } from './lib/concept-files.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE = join(ROOT, 'content/concepts');
const OUT = join(ROOT, 'src/data/concepts.json');

const { graph, problems } = readConceptSources(SOURCE);
if (problems.length) {
  for (const p of problems) console.error(`✗ ${p.replaceAll(ROOT + sep, '')}`);
  console.error(`\n${problems.length} problem(s) in content/concepts — nothing compiled`);
  process.exit(1);
}
writeFileSync(OUT, JSON.stringify(graph, null, 2) + '\n');
console.log(`✓ compiled ${graph.nodes.length} concepts, ${graph.edges.length} relations → src/data/concepts.json`);
