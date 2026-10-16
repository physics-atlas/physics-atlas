// The small Markdown subset proposal claims are written in (Decision 18:
// Markdown + LaTeX, diff-friendly, no rich-text editor):
//   blank line = new paragraph · **bold** · *italic* · `code`
//   $inline math$ · a paragraph that is exactly $$display math$$ · \$ = a dollar sign
// Parsing is pure and separate from rendering (RichText.tsx), so it's tested
// without a browser and never produces HTML itself.

export type Inline =
  | { kind: 'text'; value: string }
  | { kind: 'strong'; value: string }
  | { kind: 'em'; value: string }
  | { kind: 'code'; value: string }
  | { kind: 'math'; value: string };

export type Block = { kind: 'paragraph'; inlines: Inline[] } | { kind: 'math'; tex: string };

const TOKEN = /\\\$|\$\$([^$]+)\$\$|\$([^$\n]+)\$|\*\*([^*]+)\*\*|\*([^*\n]+)\*|`([^`\n]+)`/g;

export function parseInline(text: string): Inline[] {
  const out: Inline[] = [];
  const pushText = (value: string) => {
    if (!value) return;
    const last = out[out.length - 1];
    if (last?.kind === 'text') last.value += value;
    else out.push({ kind: 'text', value });
  };
  let at = 0;
  for (const m of text.matchAll(TOKEN)) {
    pushText(text.slice(at, m.index));
    at = m.index + m[0].length;
    if (m[0] === '\\$') pushText('$');
    else if (m[1] !== undefined) out.push({ kind: 'math', value: m[1].trim() });
    else if (m[2] !== undefined) out.push({ kind: 'math', value: m[2].trim() });
    else if (m[3] !== undefined) out.push({ kind: 'strong', value: m[3] });
    else if (m[4] !== undefined) out.push({ kind: 'em', value: m[4] });
    else if (m[5] !== undefined) out.push({ kind: 'code', value: m[5] });
  }
  pushText(text.slice(at));
  return out;
}

export function parseRichText(source: string): Block[] {
  return source
    .replace(/\r\n/g, '\n')
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block): Block => {
      const display = block.match(/^\$\$([\s\S]+)\$\$$/);
      if (display) return { kind: 'math', tex: display[1].trim() };
      // A single line break inside a paragraph reads as a space, as in Markdown.
      return { kind: 'paragraph', inlines: parseInline(block.replace(/\s*\n\s*/g, ' ')) };
    });
}
