// Typst → HTML (with MathML equations) for the atlas pages and for equations
// written in Typst. Typst 0.15's HTML export, through typst.ts's Node
// compiler. Compiles in a sandbox: the workspace is content/pages, so a page
// can't read any other file. The output is checked for anything that doesn't
// belong in a page (scripts, frames, forms, event handlers, unsafe links) —
// the site sanitizes it again when it shows it (src/lib/typstHtml.ts).
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');
const { NodeCompiler } = createRequire(import.meta.url)('@myriaddreamin/typst-ts-node-compiler');

export const PREAMBLE = readFileSync(join(HERE, 'atlas-preamble.typ'), 'utf8');

let compiler = null;
const typst = () => (compiler ??= NodeCompiler.create({ workspace: join(ROOT, 'content', 'pages') }));

/** Elements a page may contain, beyond MathML; anything else is refused. */
const UNSAFE_TAG = /<\s*(script|style|iframe|frame|object|embed|link|meta|base|form|input|button|textarea|select|svg|img|video|audio|source|template)\b/i;
const EVENT_ATTR = /\son[a-z]+\s*=/i;
const LINK = /\s(href|src)\s*=\s*"([^"]*)"/gi;
const SAFE_LINK = /^(https?:\/\/|mailto:|\?mode=page&(amp;)?(concept|relation)=|#)/i;

/** What's wrong with compiled HTML, if anything. */
export function htmlProblems(html) {
  const out = [];
  const tag = html.match(UNSAFE_TAG);
  if (tag) out.push(`<${tag[1]}> isn't allowed in a page`);
  if (EVENT_ATTR.test(html)) out.push('event handlers (on…=) aren\'t allowed in a page');
  for (const [, attr, url] of html.matchAll(LINK))
    if (!SAFE_LINK.test(url)) out.push(`the link ${attr}="${url}" isn't allowed — use https://, mailto:, #concept() or #relation()`);
  return out;
}

/** The compiler's errors, in its words (warnings are left out). */
function errorsOf(result) {
  const e = result.takeError() ?? result.takeDiagnostics();
  // severity 1 is an error, 2 a warning
  return (e?.shortDiagnostics ?? [])
    .filter((d) => d.severity !== 2)
    .map((d) => String(d.message ?? d).replace(/\s+/g, ' '));
}

/** The <body> of a compiled document, without the wrapper. */
const bodyOf = (html) => {
  const a = html.indexOf('<body>'), b = html.lastIndexOf('</body>');
  return (a >= 0 && b > a ? html.slice(a + 6, b) : html).trim();
};

/**
 * One depth of a page: the author's Typst, under the preamble, compiled to
 * HTML. `section` numbers its blocks ("3.1" → Definition 3.1.1).
 */
export function compilePage(source, section) {
  const result = typst().tryHtml({ mainFileContent: `${PREAMBLE}\n${source}`, inputs: { section } });
  const errors = errorsOf(result);
  if (errors.length || !result.result) return { problems: errors.length ? errors : ["it doesn't compile"] };
  const html = bodyOf(result.result.html());
  const problems = htmlProblems(html);
  return problems.length ? { problems } : { html };
}

/** One equation or symbol in Typst math, to MathML. Display: a block equation; else inline. */
export function compileMath(source, display) {
  const text = display ? `$ ${source} $` : `$${source}$`;
  const result = typst().tryHtml({ mainFileContent: text });
  const errors = errorsOf(result);
  if (errors.length || !result.result) return { problems: errors.length ? errors : ["it doesn't compile"] };
  const math = bodyOf(result.result.html()).match(/<math[\s\S]*<\/math>/)?.[0];
  if (!math) return { problems: ['not an equation'] };
  const problems = htmlProblems(math);
  return problems.length ? { problems } : { math };
}

/** Every Typst math string of a node written in Typst: [source, display] pairs. */
export function typstMathOf(node) {
  const a = node.attrs ?? {};
  if (a.notation !== 'typst') return [];
  const out = [];
  const vars = (vs) => (vs ?? []).forEach((v) => v?.symbol && out.push([v.symbol, false]));
  if (a.equation) out.push([a.equation, true]);
  vars(a.variables);
  for (const r of a.representations ?? []) {
    if (typeof r === 'string') out.push([r, true]);
    else {
      if (r.equation) out.push([r.equation, true]);
      vars(r.variables);
    }
  }
  for (const f of a.formulas ?? []) {
    if (f.equation) out.push([f.equation, true]);
    vars(f.variables);
  }
  return out;
}

/** The key a compiled equation is stored under (src/data/typstMath.json). */
export const mathKey = (source, display) => `${display ? 'display' : 'inline'}:${source}`;
