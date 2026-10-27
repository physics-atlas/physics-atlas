import { describe, expect, it } from 'vitest';
import { figureProblems, figureSlug, sniffImage, uploadProblem } from './figures';

/** The first bytes of a PNG, then nothing: enough to be told apart. */
const PNG = btoa(String.fromCharCode(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0));

describe('figureProblems', () => {
  const ok = { file: 'sample_concept/sample-plot.png', alt: 'Sample: a rising line.', credit: 'Sample, CC BY 4.0' };
  it('takes described, credited pictures in the concept’s folder', () => {
    expect(figureProblems([ok], 'sample_concept')).toEqual([]);
    expect(figureProblems(undefined, 'sample_concept')).toEqual([]);
  });
  it('asks for the description and the credit, and keeps pictures in their concept’s folder', () => {
    const problems = figureProblems([{ ...ok, file: 'other_concept/x.png', alt: ' ', credit: '' }], 'sample_concept');
    expect(problems).toHaveLength(3);
    expect(figureProblems([{ ...ok, file: 'sample_concept/x.svg' }], 'sample_concept')[0]).toMatch(/\.png/);
    expect(figureProblems([ok, ok], 'sample_concept')).toEqual([expect.stringMatching(/listed twice/)]);
  });
});

describe('pictures sent with a proposal', () => {
  it('names a file after what it was called', () => {
    expect(figureSlug('My Sample Plot (2).PNG')).toBe('my-sample-plot-2');
    expect(figureSlug('.png')).toBe('picture');
  });
  it('trusts the bytes, not the name', () => {
    expect(sniffImage(Uint8Array.from(atob(PNG), (c) => c.charCodeAt(0)))).toBe('png');
    const allowed = new Set(['content/media/sample_concept/a.png', 'content/media/sample_concept/a.jpg']);
    expect(uploadProblem({ path: 'content/media/sample_concept/a.png', data: PNG }, allowed)).toBeNull();
    expect(uploadProblem({ path: 'content/media/sample_concept/a.jpg', data: PNG }, allowed)).toMatch(/kind of picture/);
    expect(uploadProblem({ path: 'src/App.tsx', data: PNG }, allowed)).toMatch(/isn't a picture of the proposal/);
  });
});
