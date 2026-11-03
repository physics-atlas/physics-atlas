import katex from 'katex';

// The symbols an equation is written with, read from KaTeX's parse of it, so
// the editor can offer them as the equation's variables: "Add the equation's
// symbols", suggestions in the symbol field, and a check of which are
// described. A symbol is a letter (Latin or Greek, \hbar, \ell), with what
// belongs to it — its indices (subscripts, and superscripts made only of
// letters: T_{\mu\nu}, x^\mu, but c for c^4), an accent (\vec{v}) or a font
// (\mathbf{q}). Operators (\partial, \nabla_\mu, \sin) and numbers aren't,
// nor e under a power (the exponential) or \pi. Each
// comes back written one way (\vec v → \vec{v}), so two spellings of the
// same symbol are recognised as one.
//
// KaTeX's parser (__parse) isn't part of its documented API: the tests pin
// what it returns, so a KaTeX update that changes it shows up there.

type Node = { type: string; text?: string; label?: string; font?: string; [key: string]: unknown };

/** Capital Greek and the like: KaTeX calls them textord, but they name quantities. */
const NAMED = new Set([
  '\\Gamma', '\\Delta', '\\Theta', '\\Lambda', '\\Xi', '\\Pi', '\\Sigma', '\\Upsilon', '\\Phi', '\\Psi', '\\Omega',
  '\\hbar', '\\ell',
]);
/** Letters that are constants of mathematics, not variables to describe. */
const NOT_VARIABLES = new Set(['\\pi']);

const isNode = (x: unknown): x is Node => Boolean(x) && typeof x === 'object' && typeof (x as Node).type === 'string';

/** The node written back as LaTeX, one way: what two spellings of a symbol are compared by. */
function write(n: unknown): string {
  if (Array.isArray(n)) return n.map(write).join('');
  if (!isNode(n)) return '';
  switch (n.type) {
    case 'mathord':
    case 'textord':
    case 'atom':
      return (n.text ?? '') + (/^\\[a-zA-Z]+$/.test(n.text ?? '') ? ' ' : '');
    case 'ordgroup':
      return `{${write(n.body).trim()}}`;
    case 'op':
      return `${typeof n.name === 'string' ? n.name : ''} `;
    case 'supsub':
      return `${write(n.base).trim()}${n.sub ? `_{${unbrace(write(n.sub))}}` : ''}${n.sup ? `^{${unbrace(write(n.sup))}}` : ''}`;
    case 'accent':
      return `${n.label}{${unbrace(write(n.base))}}`;
    case 'font':
      return `\\${n.font}{${unbrace(write(n.body))}}`;
    default:
      return write(n.body);
  }
}
const unbrace = (s: string) => s.trim().replace(/^\{([\s\S]*)\}$/, '$1').trim();

/** A letter-like leaf that names a quantity. */
const isLetter = (n: Node) =>
  (n.type === 'mathord' && !NOT_VARIABLES.has(n.text ?? '')) || (n.type === 'textord' && NAMED.has(n.text ?? ''));

/** A symbol on its own: a letter, or a letter under an accent or in a font. */
function isSymbol(n: unknown): boolean {
  if (!isNode(n)) return false;
  if (isLetter(n)) return true;
  if (n.type === 'accent') return isSymbol(n.base);
  if (n.type === 'font') return (Array.isArray(n.body) ? n.body : [n.body]).every((x) => isSymbol(x) || (isNode(x) && x.type === 'ordgroup' && (x.body as unknown[]).every(isSymbol)));
  if (n.type === 'ordgroup') return Array.isArray(n.body) && n.body.length === 1 && isSymbol(n.body[0]);
  return false;
}

/** A superscript that's an index — only letters (x^\mu, x^{\mu\nu}) or a prime — not a power (c^4, e^{-\lambda t}). */
function isIndex(sup: unknown): boolean {
  const parts = isNode(sup) && sup.type === 'ordgroup' && Array.isArray(sup.body) ? sup.body : [sup];
  return parts.length > 0 && parts.every((p) => isSymbol(p) || (isNode(p) && p.type === 'textord' && p.text === '\\prime'));
}

function collect(n: unknown, out: string[]) {
  if (Array.isArray(n)) {
    n.forEach((x) => collect(x, out));
    return;
  }
  if (!isNode(n)) return;
  if (n.type === 'supsub') {
    const power = n.sup !== undefined && !isIndex(n.sup);
    if (isSymbol(n.base)) {
      // e to a power is the exponential, not a variable.
      const exponential = power && isNode(n.base) && n.base.type === 'mathord' && n.base.text === 'e' && !n.sub;
      if (!exponential) out.push(write({ ...n, sup: power ? undefined : n.sup }).trim());
    } else collect(n.base, out); // an operator's index (\nabla_\mu) isn't a symbol of its own
    // A power's own symbols (e^{-\lambda t}) are symbols of the equation too.
    if (power) collect(n.sup, out);
    return;
  }
  if (n.type === 'ordgroup') {
    collect(n.body, out);
    return;
  }
  if (isSymbol(n)) {
    out.push(write(n).trim());
    return;
  }
  for (const [key, value] of Object.entries(n)) if (key !== 'loc' && typeof value === 'object') collect(value, out);
}

/** The equation's symbols, each once, in the order they first appear ([] when it doesn't parse). */
export function equationSymbols(tex: string): string[] {
  if (!tex.trim()) return [];
  let tree: unknown;
  try {
    tree = (katex as unknown as { __parse: (t: string, o: object) => unknown }).__parse(tex, { displayMode: true, throwOnError: true });
  } catch {
    return [];
  }
  const out: string[] = [];
  collect(tree, out);
  // "\mu \nu" → "\mu\nu": a space after a command only where a letter follows.
  return [...new Set(out.map((s) => s.replace(/(\\[a-zA-Z]+) (?![a-zA-Z])/g, '$1')))];
}

/**
 * One symbol as it's compared: "\vec v" and "\vec{v}" are the same, and a
 * symbol written with what it depends on — "\psi(x,t)" — is that symbol
 * (null when it isn't one symbol).
 */
export function symbolKey(tex: string): string | null {
  const found = equationSymbols(tex);
  if (found.length === 1) return found[0];
  const bare = tex.trim().replace(/\s*(\\left\s*)?\((?:[^()]|\([^()]*\))*(\\right\s*)?\)\s*$/, '');
  if (bare !== tex.trim()) {
    const head = equationSymbols(bare);
    if (head.length === 1) return head[0];
  }
  return null;
}
