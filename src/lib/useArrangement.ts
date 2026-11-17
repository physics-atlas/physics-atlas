import { useCallback, useState } from 'react';
import type { Arrangement } from '../components/GraphView';

const KEY = 'physics-atlas-arrangement-v1';

function stored(): Arrangement {
  try {
    return window.localStorage.getItem(KEY) === 'even' ? 'even' : 'clustered';
  } catch {
    return 'clustered';
  }
}

/** Which arrangement of the map this visitor last chose (Decision 47) — remembered in this browser only. */
export function useArrangement(): [Arrangement, (a: Arrangement) => void] {
  const [arrangement, setArrangement] = useState<Arrangement>(stored);
  const choose = useCallback((a: Arrangement) => {
    setArrangement(a);
    try {
      window.localStorage.setItem(KEY, a);
    } catch {
      // Storage blocked: the choice lasts for this visit.
    }
  }, []);
  return [arrangement, choose];
}
