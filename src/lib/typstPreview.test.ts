import { describe, expect, it } from 'vitest';
import { previewBlocks, previewInline, typstPreviewTex } from './typstPreview';

describe('typstPreviewTex', () => {
  it('turns Typst maths into LaTeX for the preview', () => {
    expect(typstPreviewTex('(8 pi G)/c^4')).toBe('\\frac{8 \\pi G}{c^4}');
  });
});

describe('the page preview', () => {
  it('reads headings, paragraphs, lists, display maths and blocks', () => {
    const blocks = previewBlocks(
      '= Sample\n\nSample: a paragraph\ngoing on.\n\n- one\n- two\n\n$ x^2 $\n\n#definition(title: "Sample")[Inside *bold*.]',
    );
    expect(blocks.map((b) => b.kind)).toEqual(['heading', 'para', 'list', 'math', 'block']);
    const block = blocks[4] as { kind: 'block'; name: string; title?: string; body: { kind: string }[] };
    expect(block).toMatchObject({ name: 'definition', title: 'Sample' });
    expect(block.body.map((b) => b.kind)).toEqual(['para']);
  });
  it('reads bold, emphasis, code, maths and links in a sentence', () => {
    expect(previewInline('a *b* _c_ `d` $e$ #concept("x")[f]').map((p) => p.kind)).toEqual([
      'text', 'strong', 'text', 'em', 'text', 'code', 'text', 'math', 'text', 'link',
    ]);
  });
});
