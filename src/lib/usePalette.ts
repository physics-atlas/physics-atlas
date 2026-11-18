import { useEffect, useState } from 'react';

/** The warm accent beside the blue (Decision 48): terracotta, or one of two
 *  alternates kept side by side for comparison. Only the --terra* tokens change. */
export type Palette = 'terracotta' | 'forest' | 'creme';

export const PALETTES: { value: Palette; label: string }[] = [
  { value: 'terracotta', label: 'Terracotta' },
  { value: 'forest', label: 'Forest green' },
  { value: 'creme', label: 'Creme' },
];

const STORAGE_KEY = 'physics-atlas-palette';

const isPalette = (v: string | null): v is Palette => PALETTES.some((p) => p.value === v);

export function usePalette(): { palette: Palette; setPalette: (p: Palette) => void } {
  const [palette, setPalette] = useState<Palette>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return isPalette(saved) ? saved : 'terracotta';
    } catch {
      return 'terracotta';
    }
  });

  useEffect(() => {
    document.documentElement.dataset.palette = palette;
    try {
      localStorage.setItem(STORAGE_KEY, palette);
    } catch {
      // private mode / quota — the choice just won't persist
    }
  }, [palette]);

  return { palette, setPalette };
}
