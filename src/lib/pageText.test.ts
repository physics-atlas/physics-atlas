import { describe, expect, it } from 'vitest';
import { pageLinkTargets, pageMaths, parsePage, parsePageInline } from './pageText';

describe('parsePage', () => {
  it('reads headings, paragraphs, lists and display maths', () => {
    const { blocks, problems } = parsePage(
      ['## Sample heading', '', 'A sample', 'paragraph with $x$.', '', '- one', '- two', '  still two', '', '1. first', '', '$$', 'E = mc^2', '$$'].join('\n'),
    );
    expect(problems).toEqual([]);
    expect(blocks.map((b) => b.kind)).toEqual(['heading', 'paragraph', 'list', 'list', 'math']);
    expect(blocks[1]).toEqual({
      kind: 'paragraph',
      inlines: [
        { kind: 'text', value: 'A sample paragraph with ' },
        { kind: 'math', value: 'x' },
        { kind: 'text', value: '.' },
      ],
    });
    expect(blocks[2]).toMatchObject({ ordered: false, items: [[{ value: 'one' }], [{ value: 'two still two' }]] });
    expect(blocks[3]).toMatchObject({ ordered: true });
    expect(blocks[4]).toEqual({ kind: 'math', tex: 'E = mc^2' });
  });

  it('numbers the blocks that are numbered, in order, and keeps their titles', () => {
    const { blocks, problems } = parsePage(
      ['::: objectives', 'Sample.', ':::', '::: definition Sample title', 'Sample.', ':::', '::: proof', 'Sample.', ':::', '::: example', '- a', ':::'].join('\n'),
    );
    expect(problems).toEqual([]);
    expect(blocks.map((b) => (b.kind === 'box' ? [b.box, b.number ?? null, b.title ?? null] : b.kind))).toEqual([
      ['objectives', null, null],
      ['definition', 1, 'Sample title'],
      ['proof', null, null],
      ['example', 2, null],
    ]);
  });

  it("says what won't show as meant, with the line", () => {
    const problems = (s: string) => parsePage(s).problems;
    expect(problems('# Title')).toEqual([expect.stringMatching(/^line 1: .*start with "##"/)]);
    expect(problems('::: definition\nSample.')).toEqual([expect.stringMatching(/^line 1: .*never closed/)]);
    expect(problems('Sample.\n:::')).toEqual([expect.stringMatching(/^line 2: .*none is open/)]);
    expect(problems('::: lemma\n::: proof\n:::')).toEqual([expect.stringMatching(/^line 2: blocks don't go inside blocks/)]);
    expect(problems('::: theorm\n:::')[0]).toMatch(/"theorm" isn't a block/);
    expect(problems('$$ x')).toEqual([expect.stringMatching(/never closes/)]);
    expect(problems('[bad](javascript:alert(1))')).toEqual([expect.stringMatching(/starts with https/)]);
    // LaTeX written without its dollars shows as text: said, with the command.
    expect(problems('Sample:\n\\mathbf{v} = \\begin{pmatrix} 1 \\end{pmatrix}')).toEqual([expect.stringMatching(/"\\mathbf" is LaTeX outside maths/)]);
    expect(problems('Sample $\\mathbf{v}$, `\\frac` and a price of \\$5.\n\n$$\n\\mathbf{v}\n$$')).toEqual([]);
  });
});

describe('links', () => {
  it('reads links to concepts, relations and the web — nothing else becomes a link', () => {
    expect(parsePageInline('See [[sample_a]], [[sample_b|the $b$ one]], [[relation:e1|this]] and [x](https://example.org).')).toEqual([
      { kind: 'text', value: 'See ' },
      { kind: 'link', to: { concept: 'sample_a' }, text: '' },
      { kind: 'text', value: ', ' },
      { kind: 'link', to: { concept: 'sample_b' }, text: 'the $b$ one' },
      { kind: 'text', value: ', ' },
      { kind: 'link', to: { relation: 'e1' }, text: 'this' },
      { kind: 'text', value: ' and ' },
      { kind: 'link', to: { url: 'https://example.org' }, text: 'x' },
      { kind: 'text', value: '.' },
    ]);
    expect(parsePageInline('[x](data:text/html,hi)')).toEqual([{ kind: 'text', value: 'x' }]);
  });

  it('collects what a page links to and the maths it typesets, inside blocks too', () => {
    const { blocks } = parsePage('Sample [[a]] $y$.\n\n::: remark\n- [[relation:e2]]\n\n$$z$$\n:::');
    expect(pageLinkTargets(blocks)).toEqual([{ concept: 'a' }, { relation: 'e2' }]);
    expect(pageMaths(blocks)).toEqual([
      { tex: 'y', display: false },
      { tex: 'z', display: true },
    ]);
  });
});
