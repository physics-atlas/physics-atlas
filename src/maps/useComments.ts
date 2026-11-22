import { useCallback, useEffect, useRef, useState } from 'react';
import { listComments } from './api';
import type { MapComment } from './comments';

// A saved map's comments (Phase 3), kept fresh while it's open: asked for again
// every half minute while the tab is visible. What someone else wrote since the
// last check is handed on (`arrived`), so the map can announce it.
//
// "New since your last visit" is kept in this browser only — when the person
// last closed the comments or left the map — never on the server.

const POLL_MS = 30_000;
const seenKey = (mapId: string) => `physics-atlas-comments-seen-v1:${mapId}`;

function readSeen(mapId: string): string | null {
  try {
    return localStorage.getItem(seenKey(mapId));
  } catch {
    return null;
  }
}

function markSeen(mapId: string): void {
  try {
    localStorage.setItem(seenKey(mapId), new Date().toISOString());
  } catch {
    // No storage (private window): every visit starts with nothing marked new.
  }
}

export interface MapComments {
  comments: MapComment[] | null;
  error: string;
  /** When the person last looked: what others wrote after it is "new" */
  seen: string | null;
  /** Others' comments the last check brought, with a counter so the same batch is announced once */
  arrived: { comments: MapComment[]; tick: number };
  /** After a change the server answered with the whole list */
  replace: (comments: MapComment[]) => void;
  /** Everything so far counts as seen (the comments were closed) */
  markRead: () => void;
}

export function useComments(mapId: string | null, me: string | null): MapComments {
  const [comments, setComments] = useState<MapComment[] | null>(null);
  const [error, setError] = useState('');
  const [seen, setSeen] = useState<string | null>(null);
  const [arrived, setArrived] = useState<{ comments: MapComment[]; tick: number }>({ comments: [], tick: 0 });
  const known = useRef<Set<string> | null>(null);

  const take = useCallback(
    (list: MapComment[], announce: boolean) => {
      const before = known.current;
      known.current = new Set(list.map((c) => c.id));
      setComments(list);
      if (!announce || !before || !me) return;
      const fresh = list.filter((c) => !before.has(c.id) && c.author?.toLowerCase() !== me.toLowerCase());
      if (fresh.length) setArrived((a) => ({ comments: fresh, tick: a.tick + 1 }));
    },
    [me],
  );

  useEffect(() => {
    setComments(null);
    setError('');
    known.current = null;
    if (!mapId || !me) return;
    setSeen(readSeen(mapId));
    let live = true;
    const check = async () => {
      if (document.visibilityState === 'hidden') return;
      const r = await listComments(mapId);
      if (!live) return;
      if (r.ok) {
        setError('');
        take(r.value.comments, true);
      } else setError(r.error);
    };
    void check();
    const timer = window.setInterval(check, POLL_MS);
    const leave = () => markSeen(mapId);
    window.addEventListener('pagehide', leave);
    return () => {
      live = false;
      window.clearInterval(timer);
      window.removeEventListener('pagehide', leave);
      markSeen(mapId);
    };
  }, [mapId, me, take]);

  const replace = useCallback((list: MapComment[]) => take(list, false), [take]);
  const markRead = useCallback(() => {
    if (!mapId) return;
    markSeen(mapId);
    setSeen(new Date().toISOString());
  }, [mapId]);
  return { comments, error, seen, arrived, replace, markRead };
}
