import { describe, expect, it } from 'vitest';
import { TYPE_COLORS, TYPE_GROUPS, TYPE_ORDER } from './typeColors';

// The page surfaces (App.css --page) a node fill must stand out from.
const SURFACES = ['#070b14', '#f3f5fa'];

const luminance = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a: string, b: string) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

describe('type colours', () => {
  it('clear 3:1 against both page surfaces (WCAG 1.4.11)', () => {
    for (const type of TYPE_ORDER)
      for (const surface of SURFACES) expect(contrast(TYPE_COLORS[type], surface), `${type} on ${surface}`).toBeGreaterThanOrEqual(3);
  });
  it('are all different, and every type is in exactly one legend group', () => {
    expect(new Set(Object.values(TYPE_COLORS)).size).toBe(TYPE_ORDER.length);
    expect(TYPE_GROUPS.flatMap((g) => g.types).sort()).toEqual([...TYPE_ORDER].sort());
  });
});
