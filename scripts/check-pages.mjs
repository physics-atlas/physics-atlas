#!/usr/bin/env node
// Checks the atlas pages, after compile-concepts.mjs. A page is a folder
// content/pages/<concept-id>/ with one Markdown + LaTeX file per depth:
// depth-1.md, depth-2.md, … — as many as its authors write, unnamed, each
// going further (the format: src/lib/pageText.ts, docs/AUTHORING.md). The
// site loads the files as they are (src/data/pageSources.ts); this stops the
// build on one that wouldn't show as written: a folder that isn't a concept's
// page, a gap in the depths, an empty or very long depth, a block left open,
// a link to a concept or relation that isn't on the map, maths KaTeX can't
// typeset. Run via `npm run build:content`.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import katex from 'katex';
import { runnerImport } from 'vite';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PAGES = join(ROOT, 'content/pages');
const DEPTH_FILE = /^depth-([1-9][0-9]*)\.md$/;
const PAGE_MAX = 100_000;

const load = async (file) => (await runnerImport(join(ROOT, file), { root: ROOT, configFile: false, logLevel: 'error' })).module;
const { concepts: graph } = await load('src/data/loadConcepts.ts');
const { buildConceptIndex, splitFluff } = await load('src/graph/concepts.ts');
const { buildContents } = await load('src/graph/contents.ts');
const { pageLinkTargets, pageMaths, parsePage } = await load('src/lib/pageText.ts');
const { base } = splitFluff(graph);
const contents = buildContents(buildConceptIndex(base));
const edgeIds = new Set(base.edges.map((e) => e.id));

const problems = [];
let pages = 0;
let depthCount = 0;

if (existsSync(PAGES))
  for (const id of readdirSync(PAGES).sort()) {
    const dir = join(PAGES, id);
    if (!statSync(dir).isDirectory()) continue;
    const where = `content/pages/${id}`;
    if (!contents.byId.has(id)) {
      problems.push(`${where}: "${id}" isn't a concept with a page (a confirmed concept, not fluff)`);
      continue;
    }
    const files = readdirSync(dir);
    for (const f of files) if (!DEPTH_FILE.test(f)) problems.push(`${where}/${f}: a page holds only depth-1.md, depth-2.md, …`);
    const depths = files
      .map((f) => Number(f.match(DEPTH_FILE)?.[1]))
      .filter(Boolean)
      .sort((a, b) => a - b);
    if (depths.some((d, i) => d !== i + 1)) {
      problems.push(`${where}: depths must run 1, 2, 3… without gaps (found ${depths.join(', ')})`);
      continue;
    }
    for (const d of depths) {
      const file = `${where}/depth-${d}.md`;
      const source = readFileSync(join(dir, `depth-${d}.md`), 'utf8');
      if (!source.trim()) {
        problems.push(`${file}: is empty — delete it, or write the depth`);
        continue;
      }
      if (source.length > PAGE_MAX) problems.push(`${file}: is very long — split it, or keep it under ${PAGE_MAX / 1000}k characters`);
      const page = parsePage(source);
      for (const p of page.problems) problems.push(`${file}: ${p}`);
      for (const to of pageLinkTargets(page.blocks)) {
        if ('concept' in to && !contents.byId.has(to.concept)) problems.push(`${file}: links to "${to.concept}", which isn't a concept on the map`);
        if ('relation' in to && !edgeIds.has(to.relation)) problems.push(`${file}: links to the relation "${to.relation}", which isn't on the map`);
      }
      for (const { tex, display } of pageMaths(page.blocks))
        try {
          katex.renderToString(tex, { displayMode: display, throwOnError: true });
        } catch (e) {
          problems.push(`${file}: "${tex}" isn't LaTeX KaTeX can typeset (${String(e.message).replace(/^KaTeX parse error: /, '')})`);
        }
    }
    pages++;
    depthCount += depths.length;
  }

if (problems.length) {
  for (const p of problems) console.error(`✗ ${p}`);
  console.error(`\n${problems.length} problem(s) in the atlas pages`);
  process.exit(1);
}
console.log(`✓ checked ${pages} page(s) (${depthCount} depth(s)) in content/pages/`);
