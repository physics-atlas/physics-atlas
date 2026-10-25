import { typst2tex } from 'tex2typst';

/**
 * Typst math as LaTeX, for a preview typeset by KaTeX (null if it can't be
 * converted). Close, not exact: what's published is compiled by Typst itself.
 */
export function typstPreviewTex(source: string): string | null {
  try {
    return typst2tex(source);
  } catch {
    return null;
  }
}

// The editor's preview of a page: a reading of the Typst authors usually
// write — headings (=), paragraphs, lists (- and +), *bold*, _emphasis_,
// `code`, $maths$, the atlas blocks (#definition[…] …) and links
// (#concept("id")[…], #link("…")[…]). Approximate on purpose: the page as
// published is compiled by Typst (scripts/compile-pages.mjs).

export type PreviewInline =
  | { kind: 'text' | 'strong' | 'em' | 'code'; value: string }
  | { kind: 'math'; source: string }
  | { kind: 'link'; text: string };

export type PreviewBlock =
  | { kind: 'heading'; level: number; inline: PreviewInline[] }
  | { kind: 'para'; inline: PreviewInline[] }
  | { kind: 'list'; ordered: boolean; items: PreviewInline[][] }
  | { kind: 'math'; source: string }
  | { kind: 'block'; name: string; title?: string; body: PreviewBlock[] };

/** The blocks the atlas preamble defines (scripts/lib/atlas-preamble.typ). */
export const PREVIEW_BLOCKS: Record<string, string> = {
  definition: 'Definition',
  theorem: 'Theorem',
  lemma: 'Lemma',
  example: 'Example',
  remark: 'Remark',
  checkpoint: 'Checkpoint',
  objectives: 'Objectives',
  proof: 'Proof',
};

/** The index of the bracket that closes the one at `open`, or -1. */
function closing(s: string, open: number): number {
  let depth = 0;
  for (let i = open; i < s.length; i++) {
    if (s[i] === '\\') i++;
    else if (s[i] === '[') depth++;
    else if (s[i] === ']' && --depth === 0) return i;
  }
  return -1;
}

export function previewInline(s: string): PreviewInline[] {
  const out: PreviewInline[] = [];
  let text = '';
  const flush = () => {
    if (text) out.push({ kind: 'text', value: text });
    text = '';
  };
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    const link = /^#(concept|relation|link)\("[^"]*"\)\[/.exec(s.slice(i));
    if (link) {
      const open = i + link[0].length - 1, close = closing(s, open);
      if (close > 0) {
        flush();
        out.push({ kind: 'link', text: s.slice(open + 1, close) });
        i = close;
        continue;
      }
    }
    const pair = { '*': 'strong', _: 'em', '`': 'code', $: 'math' } as const;
    if (c in pair) {
      const end = s.indexOf(c, i + 1);
      if (end > i + 1) {
        flush();
        const value = s.slice(i + 1, end);
        const kind = pair[c as keyof typeof pair];
        out.push(kind === 'math' ? { kind: 'math', source: value.trim() } : { kind, value });
        i = end;
        continue;
      }
    }
    text += c === '\\' && i + 1 < s.length ? s[++i] : c;
  }
  flush();
  return out;
}

export function previewBlocks(source: string): PreviewBlock[] {
  const out: PreviewBlock[] = [];
  const s = source.replace(/\r\n/g, '\n');
  let para: string[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;
  const endPara = () => {
    const text = para.join(' ').trim();
    para = [];
    if (!text) return;
    const display = /^\$\s([\s\S]*)\s\$$/.exec(text);
    out.push(display ? { kind: 'math', source: display[1].trim() } : { kind: 'para', inline: previewInline(text) });
  };
  const endList = () => {
    if (list) out.push({ kind: 'list', ordered: list.ordered, items: list.items.map(previewInline) });
    list = null;
  };
  let i = 0;
  while (i < s.length) {
    const lineEnd = s.indexOf('\n', i) < 0 ? s.length : s.indexOf('\n', i);
    const line = s.slice(i, lineEnd);
    const block = /^\s*#([a-z]+)(\(([^)]*)\))?\[/.exec(s.slice(i));
    if (block && block[1] in PREVIEW_BLOCKS) {
      const open = i + block[0].length - 1, close = closing(s, open);
      if (close > 0) {
        endPara();
        endList();
        const title = /title:\s*"([^"]*)"/.exec(block[3] ?? '')?.[1];
        out.push({ kind: 'block', name: block[1], ...(title ? { title } : {}), body: previewBlocks(s.slice(open + 1, close)) });
        i = close + 1;
        continue;
      }
    }
    const heading = /^(=+)\s+(.*)$/.exec(line);
    const item = /^\s*([-+])\s+(.*)$/.exec(line);
    if (heading) {
      endPara();
      endList();
      out.push({ kind: 'heading', level: heading[1].length, inline: previewInline(heading[2]) });
    } else if (item) {
      endPara();
      const ordered = item[1] === '+';
      if (list && list.ordered !== ordered) endList();
      list ??= { ordered, items: [] };
      list.items.push(item[2]);
    } else if (!line.trim()) {
      endPara();
      endList();
    } else {
      endList();
      para.push(line.trim());
    }
    i = lineEnd + 1;
  }
  endPara();
  endList();
  return out;
}
