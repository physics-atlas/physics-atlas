import { useEffect, useId, useRef, useState } from 'react';
import { loginHref } from '../community/api';
import type { Me } from '../community/api';
import { ROLE_LABELS, createMap, listMaps } from '../maps/api';
import type { MapSummary } from '../maps/api';
import { isPlainClick, mapHref } from '../lib/pageLinks';

// "My maps" (Decision 50, Phase 2): the personal maps someone is a member of,
// and — for those marked "maps" in community/experts.json — a new one.

interface MapsViewProps {
  /** Who is signed in; null while unknown or without a backend */
  me: Me | null;
  onOpen: (id: string) => void;
}

export default function MapsView({ me, onOpen }: MapsViewProps) {
  const [maps, setMaps] = useState<MapSummary[] | null>(null);
  const [error, setError] = useState('');
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);
  const titleId = useId();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const signedIn = Boolean(me?.user);

  useEffect(() => {
    document.title = 'My maps — Physics Atlas';
    headingRef.current?.focus();
  }, []);
  useEffect(() => {
    if (!signedIn) return;
    let live = true;
    void listMaps().then((r) => {
      if (!live) return;
      if (r.ok) setMaps(r.value.maps);
      else setError(r.error);
    });
    return () => {
      live = false;
    };
  }, [signedIn]);

  return (
    <div className="feedback-view">
      <div className="feedback-panel maps-view">
        <h1 ref={headingRef} tabIndex={-1}>
          My maps
        </h1>
        <p>
          Personal maps are built on the atlas: they use its concepts as they are, and add their own. Only the people a map’s
          owner adds can open it.
        </p>
        {!me?.configured && <p className="draft-warning">Personal maps need the site’s backend, which isn’t running here.</p>}
        {me?.configured && !signedIn && (
          <p>
            <a className="draft-button community-signin" href={loginHref('/?mode=maps')}>
              Sign in with GitHub
            </a>{' '}
            to see the maps you’re a member of.
          </p>
        )}
        {error && (
          <p className="draft-warning" role="alert">
            {error}
          </p>
        )}
        {signedIn && maps === null && !error && <p>Loading your maps…</p>}
        {maps && maps.length === 0 && <p>You’re not a member of any map yet.</p>}
        {maps && maps.length > 0 && (
          <ul className="maps-list">
            {maps.map((m) => (
              <li key={m.id}>
                <a
                  href={mapHref(m.id)}
                  onClick={(e) => {
                    if (!isPlainClick(e)) return;
                    e.preventDefault();
                    onOpen(m.id);
                  }}
                >
                  {m.title}
                </a>{' '}
                <span className="map-panel-role">— {ROLE_LABELS[m.role]}</span>
              </li>
            ))}
          </ul>
        )}
        {me?.canMakeMaps && (
          <form
            className="map-panel-row"
            onSubmit={async (e) => {
              e.preventDefault();
              if (!title.trim()) return;
              setBusy(true);
              const r = await createMap(title.trim());
              setBusy(false);
              if (r.ok) onOpen(r.value.id);
              else setError(r.error);
            }}
          >
            <label htmlFor={titleId}>New map’s title</label>
            <input id={titleId} className="draft-input" value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} />
            <button type="submit" className="draft-button draft-button-primary" disabled={busy || !title.trim()}>
              Create
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
