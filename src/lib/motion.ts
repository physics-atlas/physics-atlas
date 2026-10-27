import { useCallback, useEffect, useState } from 'react';

// One motion switch for the whole app: the in-app "Reduce motion" toggle
// (WCAG 2.2.2 — the backdrop animates indefinitely, so it must be stoppable;
// 2.3.3 — the map's glides can be turned off). Motion is on until a reader
// turns it off, whatever the OS setting (Decision 40); the choice is kept.
// The toggle writes `data-motion` on <html>, which App.css and every JS
// animation (the home galaxy, graph glides) read.

const STORAGE_KEY = 'physics-atlas-motion';

/** True when animations should be skipped — call at animation time, not once. */
export function reducedMotion(): boolean {
  return document.documentElement.dataset.motion === 'reduce';
}

export function useMotion(): { reduced: boolean; toggle: () => void } {
  const [reduced, setReduced] = useState<boolean>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored === 'reduce') return true;
      if (stored === 'full') return false;
    } catch {
      // storage blocked — motion stays on
    }
    return false;
  });

  useEffect(() => {
    document.documentElement.dataset.motion = reduced ? 'reduce' : 'full';
    try {
      localStorage.setItem(STORAGE_KEY, reduced ? 'reduce' : 'full');
    } catch {
      // the choice just won't persist
    }
  }, [reduced]);

  const toggle = useCallback(() => setReduced((r) => !r), []);
  return { reduced, toggle };
}
