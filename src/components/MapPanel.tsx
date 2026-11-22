import { useId, useMemo, useState } from 'react';
import { concepts } from '../data/loadConcepts';
import { NODE_TYPE_LABELS } from '../data/types';
import { TYPE_COLORS } from '../graph/typeColors';
import { ROLE_LABELS, addMember, canEdit, removeMember, removeRefChanges, saveMap } from '../maps/api';
import type { MapResult, MapRole, SavedMap } from '../maps/api';
import type { MapChange } from '../maps/items';
import SearchBox from './SearchBox';

// A saved personal map's own panel (Decision 50, Phase 2), under its bar: what
// it holds from the atlas — add and remove — its title, and who works on it.
// Every change is saved at once, against the revision the map was opened at:
// someone else's newer save of the same thing is shown, never overwritten.

interface MapPanelProps {
  saved: SavedMap;
  /** The signed-in person's GitHub username */
  login: string;
  onSaved: (saved: SavedMap) => void;
  /** The person left the map */
  onLeft: () => void;
  /** Centres the map on a concept */
  onShow: (id: string) => void;
}

const GRANTABLE: MapRole[] = ['editor', 'commenter', 'viewer'];

export default function MapPanel({ saved, login, onSaved, onLeft, onShow }: MapPanelProps) {
  const { map, role, members } = saved;
  const [status, setStatus] = useState('');
  const [problems, setProblems] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [title, setTitle] = useState(map.title);
  const [newMember, setNewMember] = useState('');
  const [newRole, setNewRole] = useState<MapRole>('editor');
  const ids = { title: useId(), member: useId(), role: useId(), refs: useId(), members: useId() };
  const editable = canEdit(role);

  const inMap = useMemo(() => new Set([...map.refs, ...map.nodes.map((n) => n.id)]), [map]);
  const offered = useMemo(
    () =>
      concepts.nodes
        .filter((n) => !inMap.has(n.id))
        .map((n) => ({ ref: n.id, title: n.label, context: NODE_TYPE_LABELS[n.type], color: TYPE_COLORS[n.type] }))
        .sort((a, b) => a.title.localeCompare(b.title)),
    [inMap],
  );
  const refs = useMemo(
    () =>
      map.refs
        .map((id) => concepts.nodes.find((n) => n.id === id))
        .filter((n) => n !== undefined)
        .sort((a, b) => a.label.localeCompare(b.label)),
    [map.refs],
  );
  const labelOf = (id: string) => concepts.nodes.find((n) => n.id === id)?.label ?? id;

  async function run(action: () => Promise<MapResult<SavedMap | undefined>>, done: string) {
    setBusy(true);
    setProblems([]);
    const r = await action();
    setBusy(false);
    if (r.ok) {
      if (r.value) onSaved(r.value);
      setStatus(done);
      return true;
    }
    if (r.current) {
      onSaved(r.current);
      setTitle(r.current.map.title);
    }
    setStatus(r.error);
    setProblems(r.problems ?? []);
    return false;
  }
  const save = (changes: MapChange[], done: string, meta: { title?: string } = {}) =>
    run(() => saveMap(map.id, saved.revision, changes, meta), done);

  return (
    <section className="map-panel" aria-label="This map's contents and members">
      <p className="draft-status" role="status">
        {status}
      </p>
      {problems.length > 0 && (
        <ul className="draft-warning map-panel-problems">
          {problems.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      )}
      <div className="map-panel-columns">
        {editable && (
          <div className="map-panel-part">
            <h2 className="map-panel-heading">Contents</h2>
            <form
              className="map-panel-row"
              onSubmit={(e) => {
                e.preventDefault();
                if (title.trim() && title.trim() !== map.title) void save([], 'Renamed the map.', { title: title.trim() });
              }}
            >
              <label htmlFor={ids.title}>Title</label>
              <input id={ids.title} className="draft-input" value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} />
              <button type="submit" className="draft-button" disabled={busy || !title.trim() || title.trim() === map.title}>
                Rename
              </button>
            </form>
            <SearchBox
              entries={offered}
              label="Add a concept from the atlas"
              placeholder="Add a concept from the atlas…"
              onPick={(id) => void save([{ kind: 'ref', id, body: {} }], `Added ${labelOf(id)} to the map.`).then((ok) => ok && onShow(id))}
            />
          </div>
        )}
        <div className="map-panel-part">
          <h2 className="map-panel-heading" id={ids.refs}>
            From the atlas ({refs.length})
          </h2>
          <ul className="map-panel-list" aria-labelledby={ids.refs}>
            {refs.map((n) => (
              <li key={n.id}>
                <button type="button" className="draft-link" onClick={() => onShow(n.id)}>
                  {n.label}
                </button>
                {editable && (
                  <button
                    type="button"
                    className="draft-button map-panel-remove"
                    disabled={busy}
                    aria-label={`Remove ${n.label} from the map`}
                    onClick={() => void save(removeRefChanges(map, n.id), `Removed ${n.label} from the map. It stays on the atlas.`)}
                  >
                    Remove
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
        <div className="map-panel-part">
          <h2 className="map-panel-heading" id={ids.members}>
            Members
          </h2>
          <ul className="map-panel-list" aria-labelledby={ids.members}>
            {members.map((m) => (
              <li key={m.login}>
                <span>
                  @{m.login} <span className="map-panel-role">— {ROLE_LABELS[m.role]}</span>
                </span>
                {m.role !== 'owner' && (role === 'owner' || m.login.toLowerCase() === login.toLowerCase()) && (
                  <button
                    type="button"
                    className="draft-button map-panel-remove"
                    disabled={busy}
                    aria-label={m.login.toLowerCase() === login.toLowerCase() ? undefined : `Remove @${m.login} from the map`}
                    onClick={async () => {
                      const self = m.login.toLowerCase() === login.toLowerCase();
                      if (
                        self &&
                        !window.confirm(
                          `Leave “${map.title}”? You will no longer be a member of this shared map: it disappears from My maps and you can't open it. To rejoin, the owner has to invite you again.`,
                        )
                      )
                        return;
                      const ok = await run(() => removeMember(map.id, m.login), `Removed @${m.login}.`);
                      if (ok && self) onLeft();
                    }}
                  >
                    {m.login.toLowerCase() === login.toLowerCase() ? 'Leave shared map' : 'Remove'}
                  </button>
                )}
              </li>
            ))}
          </ul>
          {role === 'owner' && (
            <form
              className="map-panel-row"
              onSubmit={async (e) => {
                e.preventDefault();
                const who = newMember.trim().replace(/^@/, '');
                if (!who) return;
                if (await run(() => addMember(map.id, who, newRole), `Added @${who} as ${ROLE_LABELS[newRole].toLowerCase()}.`)) setNewMember('');
              }}
            >
              <label htmlFor={ids.member}>GitHub username</label>
              <input
                id={ids.member}
                className="draft-input"
                value={newMember}
                autoComplete="off"
                spellCheck={false}
                onChange={(e) => setNewMember(e.target.value)}
              />
              <label htmlFor={ids.role}>as</label>
              <select id={ids.role} className="draft-input" value={newRole} onChange={(e) => setNewRole(e.target.value as MapRole)}>
                {GRANTABLE.map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABELS[r]}
                  </option>
                ))}
              </select>
              <button type="submit" className="draft-button" disabled={busy || !newMember.trim()}>
                Add
              </button>
            </form>
          )}
          <p className="map-panel-note">
            Editors change the map and comment; commenters read it and comment; viewers only read it and don’t see the
            comments. Everyone listed sees the usernames here.
          </p>
        </div>
      </div>
    </section>
  );
}
