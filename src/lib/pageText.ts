// What an atlas page is written in (content/pages/<concept-id>/depth-N.md):
// the Markdown + LaTeX of the cards and proposals (community/richText.ts),
// with what a page needs on top:
//   ## Heading · ### Subheading · #### Smaller (# is the page's own title)
//   - a list item · 1. a numbered item (an indented line continues the item)
//   $$display maths$$ as its own paragraph — it may span lines
//   [[concept_id]] · [[concept_id|words]] · [[relation:edge_id|words]] · [words](https://…)
//   ::: definition An optional title
//   …paragraphs, lists, maths…
//   :::
// The blocks are those of lecture notes: definition, theorem, lemma, example,
// remark and checkpoint are numbered on the page (Definition 3.1.2 on page
// 3.1); objectives and proof aren't. Pure: parsed here, rendered by
// components/pages/PageText.tsx, checked at build time by scripts/check-pages.mjs.
import { parseInline } from '../community/richText';
import type { Inline } from '../community/richText';

export type LinkTarget = { concept: string } | { relation: string } | { url: string };

export type PageInline = Inline | { kind: 'link'; to: LinkTarget; text: string };

export const BOX_KINDS = {
  definition: { label: 'Definition', numbered: true },
  theorem: { label: 'Theorem', numbered: true },
  lemma: { label: 'Lemma', numbered: true },
  example: { label: 'Example', numbered: true },
  remark: { label: 'Remark', numbered: true },
  checkpoint: { label: 'Checkpoint', numbered: true },
  objectives: { label: 'Objectives', numbered: false },
  proof: { label: 'Proof', numbered: false },
} as const;
export type BoxKind = keyof typeof BOX_KINDS;

export type PageBlock =
  | { kind: 'heading'; level: 2 | 3 | 4; inlines: PageInline[] }
  | { kind: 'paragraph'; inlines: PageInline[] }
  | { kind: 'math'; tex: string }
  | { kind: 'list'; ordered: boolean; items: PageInline[][] }
  /** number: its place among the page's numbered blocks (1, 2, …) */
  | { kind: 'box'; box: BoxKind; title?: string; number?: number; body: PageBlock[] };

export interface ParsedPage {
  blocks: PageBlock[];
  /** What won't show as meant, each with its line ("line 4: …") */
  problems: string[];
}

const LINK = /\[\[(?:(relation):)?([A-Za-z0-9_-]+)(?:\|([^\]\n]+))?\]\]|\[([^\]\n]+)\]\(([^)\s]+)\)/g;

/** One line of a page: the card's Markdown + LaTeX, and links. */
export function parsePageInline(text: string, problems: string[] = [], where = ''): PageInline[] {
  const out: PageInline[] = [];
  let at = 0;
  for (const m of text.matchAll(LINK)) {
    out.push(...parseInline(text.slice(at, m.index)));
    at = m.index + m[0].length;
    if (m[4] !== undefined) {
      // Only web links leave the atlas; anything else (javascript:, data:, a path) stays text.
      if (/^https?:\/\//.test(m[5])) out.push({ kind: 'link', to: { url: m[5] }, text: m[4] });
      else {
        problems.push(`${where}"${m[0]}" — a link outside the atlas starts with https://`);
        out.push(...parseInline(m[4]));
      }
    } else {
      const to = m[1] ? { relation: m[2] } : { concept: m[2] };
      out.push({ kind: 'link', to, text: m[3]?.trim() ?? '' });
    }
  }
  out.push(...parseInline(text.slice(at)));
  return out;
}

export function parsePage(source: string): ParsedPage {
  const problems: string[] = [];
  const lines = source.replace(/\r\n/g, '\n').split('\n');
  const top: PageBlock[] = [];
  let blocks = top;
  let box: { line: number } | null = null;
  let numbered = 0;
  let para: { line: number; text: string[] } | null = null;
  let list: { ordered: boolean; items: { line: number; text: string[] }[] } | null = null;
  const at = (line: number) => `line ${line + 1}: `;

  const endPara = () => {
    if (para) blocks.push({ kind: 'paragraph', inlines: parsePageInline(para.text.join(' '), problems, at(para.line)) });
    para = null;
  };
  const endList = () => {
    if (list)
      blocks.push({
        kind: 'list',
        ordered: list.ordered,
        items: list.items.map((item) => parsePageInline(item.text.join(' '), problems, at(item.line))),
      });
    list = null;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    const fence = /^:::\s*([A-Za-z]*)\s*(.*)$/.exec(trimmed);
    if (fence) {
      endPara();
      endList();
      const kind = fence[1].toLowerCase();
      if (!kind) {
        if (box) {
          blocks = top;
          box = null;
        } else problems.push(`${at(i)}":::" closes a block, but none is open`);
      } else if (!(kind in BOX_KINDS)) {
        problems.push(`${at(i)}"${fence[1]}" isn't a block — use one of ${Object.keys(BOX_KINDS).join(', ')}`);
      } else if (box) {
        problems.push(`${at(i)}blocks don't go inside blocks — close the one on line ${box.line + 1} with ":::" first`);
      } else {
        const kindKey = kind as BoxKind;
        const title = fence[2].trim();
        const body: PageBlock[] = [];
        top.push({
          kind: 'box',
          box: kindKey,
          ...(title ? { title } : {}),
          ...(BOX_KINDS[kindKey].numbered ? { number: ++numbered } : {}),
          body,
        });
        blocks = body;
        box = { line: i };
      }
      continue;
    }

    if (trimmed.startsWith('$$')) {
      endPara();
      endList();
      // Display maths runs until the next $$, across lines (and blank lines) if it has to.
      let text = trimmed.slice(2);
      let j = i;
      while (!text.includes('$$') && j + 1 < lines.length) text += '\n' + lines[++j];
      const close = text.indexOf('$$');
      if (close < 0) {
        problems.push(`${at(i)}"$$" opens display maths that never closes`);
        blocks.push({ kind: 'paragraph', inlines: parsePageInline(text) });
      } else {
        blocks.push({ kind: 'math', tex: text.slice(0, close).trim() });
        if (text.slice(close + 2).trim()) problems.push(`${at(j)}display maths stands alone — start a new paragraph after the closing "$$"`);
      }
      i = j;
      continue;
    }

    const heading = /^(#{1,6})\s+(.*)$/.exec(trimmed);
    if (heading && !/^\s/.test(line)) {
      endPara();
      endList();
      const level = heading[1].length;
      if (level === 1) problems.push(`${at(i)}"#" is the page's own title (the concept's name) — start with "##"`);
      if (level > 4) problems.push(`${at(i)}headings go down to "####"`);
      blocks.push({
        kind: 'heading',
        level: Math.min(Math.max(level, 2), 4) as 2 | 3 | 4,
        inlines: parsePageInline(heading[2], problems, at(i)),
      });
      continue;
    }

    const item = /^(-|\d+\.)\s+(.*)$/.exec(trimmed);
    if (item && !/^\s{2,}/.test(line)) {
      endPara();
      const ordered = item[1] !== '-';
      if (list && list.ordered !== ordered) endList();
      list ??= { ordered, items: [] };
      list.items.push({ line: i, text: [item[2]] });
      continue;
    }

    if (!trimmed) {
      endPara();
      endList();
      continue;
    }
    // An indented line goes on with the list item above it.
    if (list && /^\s/.test(line)) {
      list.items[list.items.length - 1].text.push(trimmed);
      continue;
    }
    endList();
    para ??= { line: i, text: [] };
    para.text.push(trimmed);
  }
  endPara();
  endList();
  if (box) problems.push(`${at(box.line)}this block is never closed — end it with a line ":::"`);
  return { blocks, problems };
}

/** Everything a page links to inside the atlas, to check that it exists. */
export function pageLinkTargets(blocks: PageBlock[]): ({ concept: string } | { relation: string })[] {
  const out: ({ concept: string } | { relation: string })[] = [];
  const inline = (list: PageInline[]) => {
    for (const x of list) if (x.kind === 'link' && !('url' in x.to)) out.push(x.to);
  };
  for (const b of blocks) {
    if (b.kind === 'heading' || b.kind === 'paragraph') inline(b.inlines);
    else if (b.kind === 'list') b.items.forEach(inline);
    else if (b.kind === 'box') out.push(...pageLinkTargets(b.body));
  }
  return out;
}

/** Every piece of maths on a page, to check that KaTeX typesets it. */
export function pageMaths(blocks: PageBlock[]): { tex: string; display: boolean }[] {
  const out: { tex: string; display: boolean }[] = [];
  const inline = (list: PageInline[]) => {
    for (const x of list) if (x.kind === 'math') out.push({ tex: x.value, display: false });
  };
  for (const b of blocks) {
    if (b.kind === 'math') out.push({ tex: b.tex, display: true });
    else if (b.kind === 'heading' || b.kind === 'paragraph') inline(b.inlines);
    else if (b.kind === 'list') b.items.forEach(inline);
    else if (b.kind === 'box') out.push(...pageMaths(b.body));
  }
  return out;
}
