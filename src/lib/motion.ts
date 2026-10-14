import { useCallback, useEffect, useState } from 'react';

// One motion switch for the whole app: the OS "reduce motion" setting, or the
// in-app toggle (WCAG 2.2.2 — the backdrop animates indefinitely, so it must
// be stoppable). The toggle writes `data-motion` on <html>, which App.css and
// every JS animation (canvas backdrops, graph glides) read.

const STORAGE_KEY = 'physics-atlas-motion';

const systemReduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * True when animations should be skipped — call at animation time, not once.
 * The in-app choice wins; it starts from the OS setting.
 */
export function reducedMotion(): boolean {
  const choice = document.documentElement.dataset.motion;
  return choice === 'reduce' || (choice !== 'full' && systemReduced());
}

export function useMotion(): { reduced: boolean; toggle: () => void } {
  const [reduced, setReduced] = useState<boolean>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored === 'reduce') return true;
      if (stored === 'full') return false;
    } catch {
      // storage blocked — fall back to the system setting
    }
    return systemReduced();
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
