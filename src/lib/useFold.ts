import { useCallback, useState } from 'react';

// A panel over the map that folds to its button (the legend, the community
// account): folded at first on a phone-sized screen, where it would cover
// the map, unfolded on a larger one — then as the reader last left it. The
// choice is a per-browser convenience; without storage it's just not kept.

const PHONE = '(max-width: 720px)';

function initiallyShown(key: string): boolean {
  try {
    const kept = window.localStorage.getItem(key);
    if (kept === 'shown' || kept === 'folded') return kept === 'shown';
  } catch {
    // no storage (private window, blocked): fall back to the screen size
  }
  return !window.matchMedia?.(PHONE).matches;
}

/** Whether the panel is unfolded, and a way to set it (kept under `key`). */
export function useFold(key: string): [boolean, (shown: boolean) => void] {
  const [shown, setShown] = useState(() => initiallyShown(key));
  const set = useCallback(
    (next: boolean) => {
      setShown(next);
      try {
        window.localStorage.setItem(key, next ? 'shown' : 'folded');
      } catch {
        // not kept: it still folds for this visit
      }
    },
    [key],
  );
  return [shown, set];
}
