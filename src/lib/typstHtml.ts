// The HTML that Typst compiles a page or an equation to (scripts/compile-pages.mjs)
// is shown only through this: an allowlist of page elements and MathML, their
// harmless attributes, and links that stay on the site or go to http(s)/mailto.
// Anything else is dropped (scripts, styles, frames, forms, handlers) or, for
// an unknown element, replaced by its text. The build refuses such pages too;
// this is the second line.

const HTML_TAGS = new Set([
  'p', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li', 'strong', 'em', 'b', 'i', 'code', 'pre', 'blockquote',
  'a', 'section', 'div', 'span', 'br', 'hr', 'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'caption',
  'figure', 'figcaption', 'sub', 'sup', 'small', 'dl', 'dt', 'dd', 'cite', 'q', 'abbr', 'mark',
]);
const MATH_TAGS = new Set([
  'math', 'mi', 'mn', 'mo', 'ms', 'mtext', 'mspace', 'mrow', 'mfrac', 'msqrt', 'mroot', 'msub', 'msup',
  'msubsup', 'munder', 'mover', 'munderover', 'mtable', 'mtr', 'mtd', 'mstyle', 'mpadded', 'mphantom',
  'menclose', 'semantics', 'annotation', 'mmultiscripts', 'mprescripts', 'none',
]);
/** Dropped with everything inside them. */
const DROP_TAGS = new Set(['script', 'style', 'iframe', 'frame', 'object', 'embed', 'template', 'svg', 'form', 'noscript']);
const HTML_ATTRS = new Set(['class', 'colspan', 'rowspan', 'scope', 'start', 'reversed']);
const MATH_ATTRS = new Set([
  'display', 'mathvariant', 'stretchy', 'lspace', 'rspace', 'fence', 'separator', 'form', 'accent',
  'accentunder', 'movablelimits', 'largeop', 'symmetric', 'minsize', 'maxsize', 'columnalign', 'rowalign',
  'rowspacing', 'columnspacing', 'width', 'height', 'depth', 'voffset', 'linethickness', 'notation',
  'displaystyle', 'scriptlevel', 'encoding', 'class',
]);
const SAFE_LINK = /^(https?:\/\/|mailto:|\?mode=page&(concept|relation)=|#)/i;
const MATHML_NS = 'http://www.w3.org/1998/Math/MathML';

function clean(source: Node, into: Node, doc: Document, inMath: boolean) {
  for (const child of Array.from(source.childNodes)) {
    if (child.nodeType === Node.TEXT_NODE) {
      into.appendChild(doc.createTextNode(child.textContent ?? ''));
      continue;
    }
    if (child.nodeType !== Node.ELEMENT_NODE) continue;
    const el = child as Element;
    const tag = el.localName.toLowerCase();
    if (DROP_TAGS.has(tag)) continue;
    const math = inMath || tag === 'math';
    const allowed = math ? MATH_TAGS.has(tag) : HTML_TAGS.has(tag);
    if (!allowed) {
      // An unknown element gives way to what's inside it.
      clean(el, into, doc, math);
      continue;
    }
    const out = math ? doc.createElementNS(MATHML_NS, tag) : doc.createElement(tag);
    for (const { name, value } of Array.from(el.attributes)) {
      const n = name.toLowerCase();
      if (n === 'href' && tag === 'a') {
        if (SAFE_LINK.test(value.trim())) out.setAttribute('href', value.trim());
      } else if ((math ? MATH_ATTRS : HTML_ATTRS).has(n)) out.setAttribute(n, value);
    }
    if (tag === 'a' && /^https?:/i.test(out.getAttribute('href') ?? '')) out.setAttribute('rel', 'noopener noreferrer');
    clean(el, out, doc, math);
    // A display equation gets the box that scrolls it when it's wider than the column.
    if (tag === 'math' && el.getAttribute('display') === 'block') {
      const box = doc.createElement('div');
      box.className = 'atlas-math-block';
      box.appendChild(out);
      into.appendChild(box);
    } else into.appendChild(out);
  }
}

/** Compiled Typst HTML, made safe to put in the page. */
export function safeTypstHtml(html: string): string {
  const parsed = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');
  const doc = document.implementation.createHTMLDocument('');
  const box = doc.createElement('div');
  clean(parsed.body, box, doc, false);
  return box.innerHTML;
}
