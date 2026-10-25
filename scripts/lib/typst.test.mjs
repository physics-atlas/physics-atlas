import { describe, expect, it } from 'vitest';
import { compileMath, compilePage, htmlProblems, mathKey, typstMathOf } from './typst.mjs';

describe('compilePage', () => {
  it('compiles a depth to HTML with MathML, its blocks numbered within the section', () => {
    const { html, problems } = compilePage('= Sample\n\n#definition[Sample $x^2$.]\n\n#example[Sample.]', '3.1');
    expect(problems).toBeUndefined();
    expect(html).toContain('<h2>Sample</h2>');
    expect(html).toContain('Definition 3.1.1');
    expect(html).toContain('Example 3.1.2');
    expect(html).toMatch(/<math>[\s\S]*<msup>/);
  });
  it("reports Typst's own errors", () => {
    expect(compilePage('#nosuch[x]', '1').problems).toEqual(['unknown variable: nosuch']);
  });
  it("can't read files outside the pages", () => {
    expect(compilePage('#read("/../../package.json")', '1').problems?.[0]).toMatch(/escape the package root/);
  });
  it('refuses scripts and unsafe links', () => {
    expect(compilePage('#html.elem("script")[x]', '1').problems?.[0]).toMatch(/<script> isn't allowed/);
    expect(compilePage('#link("javascript:x")[y]', '1').problems?.[0]).toMatch(/isn't allowed/);
    expect(htmlProblems('<p onclick="x">a</p>')).toHaveLength(1);
    expect(htmlProblems('<a href="?mode=page&amp;concept=a">a</a> <a href="https://x.org">b</a>')).toEqual([]);
  });
});

describe('compileMath', () => {
  it('compiles a display or an inline equation to MathML', () => {
    expect(compileMath('E = m c^2', true).math).toMatch(/^<math display="block">/);
    expect(compileMath('rho', false).math).toMatch(/^<math>/);
  });
  it('collects the Typst maths of a node written in Typst, and only then', () => {
    const node = {
      attrs: { notation: 'typst', equation: 'F = m a', variables: [{ symbol: 'F', meaning: 'force' }], representations: [{ name: 'n', equation: 'p = m v' }] },
    };
    expect(typstMathOf(node)).toEqual([['F = m a', true], ['F', false], ['p = m v', true]]);
    expect(typstMathOf({ attrs: { equation: 'F = ma' } })).toEqual([]);
    expect(mathKey('F', false)).toBe('inline:F');
  });
});
