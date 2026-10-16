import { useCallback, useState } from 'react';
import { newDraft, parseDraft } from './draft';
import type { Draft } from './draft';

const STORAGE_KEY = 'physics-atlas-proposal-draft-v1';

function load(): Draft | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? parseDraft(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

function persist(draft: Draft | null) {
  try {
    if (draft) localStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // private mode / quota — the draft just won't survive a reload
  }
}

export interface DraftStore {
  draft: Draft | null;
  /** Starts a draft unless one is already in progress. */
  start: () => void;
  update: (change: (d: Draft) => Draft) => void;
  discard: () => void;
}

/** The one proposal being written, kept in this browser between visits (the useProgress pattern). */
export function useDraft(): DraftStore {
  const [draft, setDraft] = useState<Draft | null>(load);

  const start = useCallback(() => {
    setDraft((d) => {
      if (d) return d;
      const next = newDraft();
      persist(next);
      return next;
    });
  }, []);

  const update = useCallback((change: (d: Draft) => Draft) => {
    setDraft((d) => {
      if (!d) return d;
      const next = change(d);
      persist(next);
      return next;
    });
  }, []);

  const discard = useCallback(() => {
    persist(null);
    setDraft(null);
  }, []);

  return { draft, start, update, discard };
}
