import { useCallback, useEffect, useState } from 'react';
import { afterSubmission, parseDraft, withoutDraft } from './draft';
import type { Draft } from './draft';
import { loadPictures, savePictures } from './pictureStore';

const STORAGE_KEY = 'physics-atlas-proposal-drafts-v2';
/** Phase 2 kept a single draft here; it's moved into the list once. */
const OLD_KEY = 'physics-atlas-proposal-draft-v1';

interface Stored {
  drafts: Draft[];
  active: string | null;
}

function load(): Stored {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as { drafts?: unknown[]; active?: unknown };
      const drafts = (parsed.drafts ?? []).map(parseDraft).filter((d): d is Draft => d !== null);
      const active = drafts.some((d) => d.suffix === parsed.active) ? (parsed.active as string) : (drafts[0]?.suffix ?? null);
      return { drafts, active };
    }
    const old = localStorage.getItem(OLD_KEY);
    const draft = old ? parseDraft(JSON.parse(old)) : null;
    return draft ? { drafts: [draft], active: draft.suffix } : { drafts: [], active: null };
  } catch {
    return { drafts: [], active: null };
  }
}

/** Each new picture's data in the drafts, by "<suffix>/<figure key>". */
const picturesOf = (drafts: Draft[]) =>
  new Map(drafts.flatMap((d) => d.figures.flatMap((f) => (f.data ? [[`${d.suffix}/${f.key}`, f.data] as const] : []))));

/** The pictures as last written to IndexedDB; null until they've been read back (nothing is written before). */
let keptPictures: Map<string, string> | null = null;

function persist(next: Stored) {
  try {
    // The drafts without their new pictures' data: that's in IndexedDB (pictureStore.ts).
    const light = next.drafts.map((d) => ({ ...d, figures: d.figures.map(({ data: _data, ...f }) => (void _data, f)) }));
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...next, drafts: light }));
    localStorage.removeItem(OLD_KEY);
  } catch {
    // private mode / quota — drafts just won't survive a reload
  }
  if (keptPictures) {
    const now = picturesOf(next.drafts);
    void savePictures(now, keptPictures);
    keptPictures = now;
  }
}

export interface DraftStore {
  drafts: Draft[];
  /** The draft the editor shows (its suffix) */
  active: string | null;
  setActive: (suffix: string) => void;
  /** Adds a draft and makes it the active one. */
  add: (draft: Draft) => void;
  update: (suffix: string, change: (d: Draft) => Draft) => void;
  /** Removes a draft, and the relations other drafts had into it; returns how many relations went. */
  discard: (suffix: string) => number;
  /** A draft was submitted: it leaves, and other drafts now point at its proposed concept. */
  submitted: (suffix: string) => void;
}

/** The proposals being written, kept in this browser between visits (the useProgress pattern). */
export function useDrafts(): DraftStore {
  const [state, setState] = useState<Stored>(load);

  // The new pictures come back from IndexedDB a moment after the drafts.
  useEffect(() => {
    let live = true;
    void loadPictures().then((kept) => {
      if (!live) return;
      keptPictures = kept;
      setState((s) => ({
        ...s,
        drafts: s.drafts.map((d) => ({
          ...d,
          figures: d.figures.map((f) => (f.data || f.file ? f : { ...f, data: kept.get(`${d.suffix}/${f.key}`) })),
        })),
      }));
    });
    return () => {
      live = false;
    };
  }, []);

  const change = useCallback((f: (s: Stored) => Stored) => {
    setState((s) => {
      const next = f(s);
      persist(next);
      return next;
    });
  }, []);

  const setActive = useCallback((suffix: string) => change((s) => ({ ...s, active: suffix })), [change]);
  const add = useCallback((draft: Draft) => change((s) => ({ drafts: [...s.drafts, draft], active: draft.suffix })), [change]);
  const update = useCallback(
    (suffix: string, f: (d: Draft) => Draft) =>
      change((s) => ({ ...s, drafts: s.drafts.map((d) => (d.suffix === suffix ? f(d) : d)) })),
    [change],
  );
  const discard = useCallback(
    (suffix: string) => {
      const { drafts, removed } = withoutDraft(state.drafts, suffix);
      change((s) => ({ drafts, active: s.active === suffix ? (drafts.at(-1)?.suffix ?? null) : s.active }));
      return removed;
    },
    [change, state.drafts],
  );

  const submitted = useCallback(
    (suffix: string) =>
      change((s) => {
        const drafts = afterSubmission(s.drafts, suffix);
        return { drafts, active: s.active === suffix ? (drafts.at(-1)?.suffix ?? null) : s.active };
      }),
    [change],
  );

  return { drafts: state.drafts, active: state.active, setActive, add, update, discard, submitted };
}
