// The new pictures in drafts, kept in this browser between visits. A picture
// is far larger than the rest of a draft — too large for localStorage, which
// holds a few MB for the whole site — so drafts are stored there without them
// (useDrafts) and the pictures here, in IndexedDB, under "<draft suffix>/<figure key>".
// Every call fails quietly to "nothing kept": a private window or blocked
// storage loses the pictures on reload, not the page.

const DB = 'physics-atlas-drafts';
const STORE = 'pictures';

let opening: Promise<IDBDatabase | null> | null = null;

function db(): Promise<IDBDatabase | null> {
  opening ??= new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return opening;
}

/** Every kept picture: key → data: URL. */
export async function loadPictures(): Promise<Map<string, string>> {
  const d = await db();
  if (!d) return new Map();
  return new Promise((resolve) => {
    try {
      const out = new Map<string, string>();
      const req = d.transaction(STORE).objectStore(STORE).openCursor();
      req.onsuccess = () => {
        const cursor = req.result;
        if (!cursor) return resolve(out);
        if (typeof cursor.value === 'string') out.set(String(cursor.key), cursor.value);
        cursor.continue();
      };
      req.onerror = () => resolve(out);
    } catch {
      resolve(new Map());
    }
  });
}

/** Writes what changed since `before`, and forgets pictures no longer in `now`. */
export async function savePictures(now: Map<string, string>, before: Map<string, string>): Promise<void> {
  const d = await db();
  if (!d) return;
  try {
    const store = d.transaction(STORE, 'readwrite').objectStore(STORE);
    for (const [key, data] of now) if (before.get(key) !== data) store.put(data, key);
    for (const key of before.keys()) if (!now.has(key)) store.delete(key);
  } catch {
    // not kept: the pictures stay for this visit
  }
}
