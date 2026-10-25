#!/usr/bin/env node
// Compiles the atlas pages and the equations written in Typst, after
// compile-concepts.mjs. A page is a folder content/pages/<concept-id>/ with one
// Typst file per depth: depth-1.typ, depth-2.typ, … — as many as its authors
// write, unnamed, each going further. Each depth compiles to HTML (MathML for
// the maths) with its blocks numbered within the page's section. Writes
// (generated, not committed):
//   src/data/pages/<concept-id>.json   { depths: [{ source, html }] }, loaded with the page
//   src/data/pageIndex.json            { <concept-id>: number of depths }
//   src/data/typstMath.json            { "display:<typst>" | "inline:<typst>": "<math>…</math>" }
// Any problem stops the build, listed like compile-concepts.mjs lists its own.
// Run via `npm run build:content`.
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { runnerImport } from 'vite';
import { compileMath, compilePage, mathKey, typstMathOf } from './lib/typst.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PAGES = join(ROOT, 'content/pages');
const OUT_DIR = join(ROOT, 'src/data/pages');
const DEPTH_FILE = /^depth-([1-9][0-9]*)\.typ$/;

const load = async (file) => (await runnerImport(join(ROOT, file), { root: ROOT, configFile: false, logLevel: 'error' })).module;
const { concepts: graph } = await load('src/data/loadConcepts.ts');
const { buildConceptIndex, splitFluff } = await load('src/graph/concepts.ts');
const { buildContents } = await load('src/graph/contents.ts');
const contents = buildContents(buildConceptIndex(splitFluff(graph).base));

const problems = [];
const index = {};
rmSync(OUT_DIR, { recursive: true, force: true });
mkdirSync(OUT_DIR, { recursive: true });

if (existsSync(PAGES))
  for (const id of readdirSync(PAGES).sort()) {
    const dir = join(PAGES, id);
    if (!statSync(dir).isDirectory()) continue;
    const where = `content/pages/${id}`;
    const entry = contents.byId.get(id);
    if (!entry) {
      problems.push(`${where}: "${id}" isn't a concept with a page (a confirmed concept, not fluff)`);
      continue;
    }
    const files = readdirSync(dir);
    for (const f of files) if (!DEPTH_FILE.test(f)) problems.push(`${where}/${f}: a page holds only depth-1.typ, depth-2.typ, …`);
    const depths = files
      .map((f) => Number(f.match(DEPTH_FILE)?.[1]))
      .filter(Boolean)
      .sort((a, b) => a - b);
    if (depths.some((d, i) => d !== i + 1)) {
      problems.push(`${where}: depths must run 1, 2, 3… without gaps (found ${depths.join(', ')})`);
      continue;
    }
    const compiled = [];
    for (const d of depths) {
      const source = readFileSync(join(dir, `depth-${d}.typ`), 'utf8').replace(/\r\n/g, '\n');
      if (!source.trim()) {
        problems.push(`${where}/depth-${d}.typ: is empty — delete it, or write the depth`);
        continue;
      }
      const result = compilePage(source, entry.number);
      if (result.problems) for (const p of result.problems) problems.push(`${where}/depth-${d}.typ: ${p}`);
      else compiled.push({ source, html: result.html });
    }
    if (compiled.length === depths.length && depths.length) {
      writeFileSync(join(OUT_DIR, `${id}.json`), JSON.stringify({ depths: compiled }) + '\n');
      index[id] = depths.length;
    }
  }

// Equations written in Typst (attrs.notation "typst"), each compiled once.
const math = {};
for (const node of graph.nodes)
  for (const [source, display] of typstMathOf(node)) {
    const key = mathKey(source, display);
    if (key in math) continue;
    const result = compileMath(source, display);
    if (result.problems) for (const p of result.problems) problems.push(`node "${node.id}": the Typst "${source}" — ${p}`);
    else math[key] = result.math;
  }

if (problems.length) {
  for (const p of problems) console.error(`✗ ${p}`);
  console.error(`\n${problems.length} problem(s) in the pages or Typst equations — nothing compiled`);
  process.exit(1);
}
writeFileSync(join(ROOT, 'src/data/pageIndex.json'), JSON.stringify(index, null, 2) + '\n');
writeFileSync(join(ROOT, 'src/data/typstMath.json'), JSON.stringify(math) + '\n');
const depthCount = Object.values(index).reduce((s, n) => s + n, 0);
console.log(
  `✓ compiled ${Object.keys(index).length} page(s) (${depthCount} depth(s)), ${Object.keys(math).length} Typst equation(s) → src/data/pages/`,
);
