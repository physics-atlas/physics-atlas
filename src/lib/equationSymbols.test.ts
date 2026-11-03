import { describe, expect, it } from 'vitest';
import { equationSymbols, symbolKey } from './equationSymbols';
import { pageMathProblems } from './pageMaths';

describe('equationSymbols', () => {
  it('finds the symbols with their indices, each once, in order', () => {
    expect(equationSymbols(String.raw`G_{\mu\nu} + \Lambda g_{\mu\nu} = \frac{8\pi G}{c^4} T_{\mu\nu}`)).toEqual([
      'G_{\\mu\\nu}',
      '\\Lambda',
      'g_{\\mu\\nu}',
      'G',
      'c',
      'T_{\\mu\\nu}',
    ]);
  });
  it('keeps index superscripts and drops powers; the exponential and operators are no symbols', () => {
    expect(equationSymbols(String.raw`\nabla_\mu T^{\mu\nu} = 0`)).toEqual(['T^{\\mu\\nu}']);
    expect(equationSymbols(String.raw`N(t) = N_0 e^{-\lambda t}`)).toEqual(['N', 't', 'N_{0}', '\\lambda']);
    expect(equationSymbols(String.raw`\frac{\partial f}{\partial t} + v \cdot \nabla_x f = 0`)).toEqual(['f', 't', 'v']);
  });
  it('keeps accents, fonts and operator names with their symbol', () => {
    expect(equationSymbols(String.raw`\dot{\vec x} = \mathbf{v} + K_{\max}`)).toEqual(['\\dot{\\vec{x}}', '\\mathbf{v}', 'K_{\\max}']);
  });
  it('gives nothing for LaTeX that does not parse', () => {
    expect(equationSymbols(String.raw`\frac{a`)).toEqual([]);
    expect(equationSymbols('')).toEqual([]);
  });
});

describe('symbolKey', () => {
  it('reads two spellings of one symbol as the same, and a symbol with its arguments as the symbol', () => {
    expect(symbolKey(String.raw`\vec v`)).toBe(symbolKey(String.raw`\vec{v}`));
    expect(symbolKey(String.raw`G_{\mu \nu}`)).toBe('G_{\\mu\\nu}');
    expect(symbolKey(String.raw`\psi(x,t)`)).toBe('\\psi');
    expect(symbolKey('a + b')).toBeNull();
  });
});

describe('pageMathProblems', () => {
  it('says when display-only LaTeX is written between single dollars, and how to fix it', () => {
    const [problem] = pageMathProblems('Sample:\n$\n\\begin{equation} x = 1 \\end{equation}\n$');
    expect(problem).toMatch(/only in display mode/);
    expect(problem).toMatch(/put it between \$\$ … \$\$/);
    expect(pageMathProblems('Sample:\n\n$$\n\\begin{equation} x = 1 \\end{equation}\n$$')).toEqual([]);
  });
});
