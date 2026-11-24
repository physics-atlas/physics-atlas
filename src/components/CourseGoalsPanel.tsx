import { useId, useMemo, useState } from 'react';
import type { GraphNode } from '../data/types';
import type { Progress } from '../lib/useProgress';
import { saveMap } from '../maps/api';
import type { SavedMap } from '../maps/api';
import type { MapChange } from '../maps/items';
import { COURSE_GOAL_LIMITS, completedKey, courseGoalTopics } from '../maps/map';
import type { CourseGoal, ResolvedMap } from '../maps/map';

// A personal map's course goals (Decision 50): what the course sets out to reach,
// each a named set of the map's learning goals (its topic-level goals). Shown
// under the map bar in both the map and its pages; picking a learning goal goes
// to it in the view that's open. Editors make, rename, order and fill them.

interface CourseGoalsPanelProps {
  resolved: ResolvedMap;
  saved: SavedMap;
  editable: boolean;
  /** Where picking a learning goal takes you: centred on the map, or its page */
  view: 'map' | 'pages';
  onPick: (id: string) => void;
  onSaved: (saved: SavedMap) => void;
  /** Which learning goals this person has completed, in their browser only. Students tick them; owners and editors don't (editable). */
  progress: Progress;
}

const newGoalId = () => `goal_${Date.now().toString(36)}${Math.floor(Math.random() * 36 ** 4).toString(36)}`;

export default function CourseGoalsPanel({ resolved, saved, editable, view, onPick, onSaved, progress }: CourseGoalsPanelProps) {
  const done = (id: string) => progress.isDone(completedKey(resolved.map.id, id));
  const toggle = (id: string) => progress.toggle(completedKey(resolved.map.id, id));
  const goals = useMemo(() => resolved.map.courseGoals ?? [], [resolved]);
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState('');
  const ids = { name: useId(), all: useId() };
  const learningGoals = useMemo(
    () => resolved.graph.nodes.filter((n) => n.type === 'learning_goal').sort((a, b) => a.label.localeCompare(b.label)),
    [resolved],
  );
  const inGoals = useMemo(() => {
    const out = new Map<string, string[]>();
    for (const g of goals) for (const id of g.goals) out.set(id, [...(out.get(id) ?? []), g.name]);
    return out;
  }, [goals]);

  async function save(changes: MapChange[], done: string): Promise<boolean> {
    setBusy(true);
    const r = await saveMap(saved.map.id, saved.revision, changes);
    setBusy(false);
    if (r.ok) {
      onSaved(r.value);
      setStatus(done);
      return true;
    }
    if (r.current) onSaved(r.current);
    setStatus([r.error, ...(r.problems ?? [])].join(' '));
    return false;
  }
  const put = (g: CourseGoal): MapChange => ({ kind: 'goal', id: g.id, body: g });
  const move = (i: number, by: -1 | 1) => {
    const other = goals[i + by];
    if (!other) return;
    const g = goals[i];
    // Positions are swapped; equal ones (made at once) get distinct ones first.
    const [a, b] = g.position === other.position ? [i + by, i] : [other.position, g.position];
    void save([put({ ...g, position: a }), put({ ...other, position: b })], `Moved “${g.name}” ${by < 0 ? 'up' : 'down'}.`);
  };
  const pickHint = view === 'map' ? 'Picking a learning goal centres it on the map.' : 'Picking a learning goal opens its page.';

  return (
    <section className="map-panel goals-panel" aria-label="Course goals">
      <p className="draft-status" role="status">
        {status}
      </p>
      <div className="map-panel-columns">
        <div className="map-panel-part goals-main">
          <h2 className="map-panel-heading">Course goals ({goals.length})</h2>
          <p className="map-panel-note">
            What the course sets out to reach. Each is a set of the map’s learning goals. {pickHint}
            {!editable && ' Tick the ones you’ve completed: that’s kept in this browser only, never sent anywhere.'}
          </p>
          {goals.length === 0 && <p>{editable ? 'No course goals yet. Make the first one below.' : 'No course goals yet.'}</p>}
          <ol className="goals-list">
            {goals.map((g, i) => (
              <CourseGoalItem
                key={g.id}
                goal={g}
                resolved={resolved}
                learningGoals={learningGoals}
                editable={editable}
                busy={busy}
                first={i === 0}
                last={i === goals.length - 1}
                onPick={onPick}
                done={done}
                onToggle={toggle}
                onMove={(by) => move(i, by)}
                onSave={(next, done) => save([put(next)], done)}
                onDelete={() => {
                  if (window.confirm(`Delete the course goal “${g.name}”? Its learning goals stay on the map.`))
                    void save([{ kind: 'goal', id: g.id, body: null }], `Deleted the course goal “${g.name}”.`);
                }}
              />
            ))}
          </ol>
          {editable && (
            <form
              className="map-panel-row"
              onSubmit={async (e) => {
                e.preventDefault();
                const n = name.trim();
                if (!n) return;
                const position = goals.reduce((m, g) => Math.max(m, g.position), 0) + 1;
                if (await save([put({ id: newGoalId(), name: n, goals: [], position })], `Made the course goal “${n}”. Add its learning goals.`))
                  setName('');
              }}
            >
              <label htmlFor={ids.name}>New course goal</label>
              <input
                id={ids.name}
                className="draft-input"
                value={name}
                maxLength={COURSE_GOAL_LIMITS.name}
                onChange={(e) => setName(e.target.value)}
              />
              <button type="submit" className="draft-button" disabled={busy || !name.trim()}>
                Make it
              </button>
            </form>
          )}
        </div>
        <div className="map-panel-part">
          <h2 className="map-panel-heading" id={ids.all}>
            All learning goals on this map ({learningGoals.length}
            {learningGoals.length && !editable ? `, ${learningGoals.filter((n) => done(n.id)).length} completed` : ''})
          </h2>
          {learningGoals.length === 0 ? (
            <p className="map-panel-note">
              This map has no learning goals yet.{editable ? ' Add one with “Add a concept to this map”, as the kind “Learning goal”.' : ''}
            </p>
          ) : (
            <ul className="map-panel-list goals-all" aria-labelledby={ids.all}>
              {learningGoals.map((n) => (
                <li key={n.id}>
                  {!editable && <Completed label={n.label} checked={done(n.id)} onChange={() => toggle(n.id)} />}
                  <button type="button" className="draft-link" onClick={() => onPick(n.id)}>
                    {n.label}
                  </button>
                  <span className="map-panel-role">
                    {inGoals.has(n.id) ? `in ${inGoals.get(n.id)!.join(', ')}` : 'not in a course goal'}
                    {resolved.refIds.has(n.id) ? ' · from the atlas' : ''}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}

/** A learning goal's "completed" tick, labelled in words; its accessible name carries the goal's name. */
function Completed({ label, checked, onChange }: { label: string; checked: boolean; onChange: () => void }) {
  return (
    <label className="goals-done">
      <input type="checkbox" checked={checked} onChange={onChange} aria-label={`Completed: ${label}`} />
      <span aria-hidden>Completed</span>
    </label>
  );
}

interface CourseGoalItemProps {
  goal: CourseGoal;
  resolved: ResolvedMap;
  learningGoals: GraphNode[];
  editable: boolean;
  busy: boolean;
  first: boolean;
  last: boolean;
  onPick: (id: string) => void;
  done: (id: string) => boolean;
  onToggle: (id: string) => void;
  onMove: (by: -1 | 1) => void;
  onSave: (next: CourseGoal, done: string) => Promise<boolean>;
  onDelete: () => void;
}

function CourseGoalItem({ goal, resolved, learningGoals, editable, busy, first, last, onPick, done, onToggle, onMove, onSave, onDelete }: CourseGoalItemProps) {
  const { topics, lost } = useMemo(() => courseGoalTopics(goal, resolved.graph), [goal, resolved]);
  const [renaming, setRenaming] = useState(false);
  const [title, setTitle] = useState(goal.name);
  const [adding, setAdding] = useState('');
  const ids = { heading: useId(), name: useId(), add: useId() };
  const offered = learningGoals.filter((n) => !goal.goals.includes(n.id));

  return (
    <li className="goals-item">
      <article aria-labelledby={ids.heading}>
        <h3 className="goals-name" id={ids.heading}>
          {goal.name}{' '}
          <span className="map-panel-role">
            ({topics.length === 1 ? '1 learning goal' : `${topics.length} learning goals`}
            {topics.length > 0 && !editable && `, ${topics.filter((n) => done(n.id)).length} completed`})
          </span>
        </h3>
        {topics.length > 0 ? (
          <ol className="goals-topics">
            {topics.map((n) => (
              <li key={n.id}>
                {!editable && <Completed label={n.label} checked={done(n.id)} onChange={() => onToggle(n.id)} />}
                <button type="button" className="draft-link" onClick={() => onPick(n.id)}>
                  {n.label}
                </button>
                {editable && (
                  <button
                    type="button"
                    className="draft-button map-panel-remove"
                    disabled={busy}
                    aria-label={`Take ${n.label} out of ${goal.name}`}
                    onClick={() =>
                      void onSave({ ...goal, goals: goal.goals.filter((x) => x !== n.id) }, `Took ${n.label} out of “${goal.name}”. It stays on the map.`)
                    }
                  >
                    Take out
                  </button>
                )}
              </li>
            ))}
          </ol>
        ) : (
          <p className="map-panel-note">No learning goals in it yet.</p>
        )}
        {lost.length > 0 && (
          <p className="map-panel-note">
            {lost.length === 1 ? 'One of its learning goals is' : `${lost.length} of its learning goals are`} no longer on the map.
            {editable && (
              <>
                {' '}
                <button
                  type="button"
                  className="draft-link"
                  disabled={busy}
                  onClick={() => void onSave({ ...goal, goals: goal.goals.filter((x) => !lost.includes(x)) }, `Tidied “${goal.name}”.`)}
                >
                  Tidy up
                </button>
              </>
            )}
          </p>
        )}
        {editable && (
          <div className="goals-edit">
            {offered.length > 0 && (
              <form
                className="map-panel-row"
                onSubmit={async (e) => {
                  e.preventDefault();
                  const n = learningGoals.find((x) => x.id === adding);
                  if (!n) return;
                  if (await onSave({ ...goal, goals: [...goal.goals, n.id] }, `Added ${n.label} to “${goal.name}”.`)) setAdding('');
                }}
              >
                <label htmlFor={ids.add}>Add a learning goal</label>
                <select id={ids.add} className="draft-input" value={adding} onChange={(e) => setAdding(e.target.value)}>
                  <option value="">Choose…</option>
                  {offered.map((n) => (
                    <option key={n.id} value={n.id}>
                      {n.label}
                    </option>
                  ))}
                </select>
                <button type="submit" className="draft-button" disabled={busy || !adding}>
                  Add
                </button>
              </form>
            )}
            {renaming ? (
              <form
                className="map-panel-row"
                onSubmit={async (e) => {
                  e.preventDefault();
                  const n = title.trim();
                  if (n && n !== goal.name && (await onSave({ ...goal, name: n }, `Renamed the course goal to “${n}”.`))) setRenaming(false);
                }}
              >
                <label htmlFor={ids.name}>Name</label>
                <input
                  id={ids.name}
                  className="draft-input"
                  value={title}
                  maxLength={COURSE_GOAL_LIMITS.name}
                  onChange={(e) => setTitle(e.target.value)}
                  autoFocus
                />
                <button type="submit" className="draft-button" disabled={busy || !title.trim() || title.trim() === goal.name}>
                  Rename
                </button>
                <button type="button" className="draft-button" onClick={() => (setRenaming(false), setTitle(goal.name))}>
                  Cancel
                </button>
              </form>
            ) : (
              <div className="map-panel-row">
                <button type="button" className="draft-button map-panel-remove" onClick={() => setRenaming(true)} aria-label={`Rename ${goal.name}`}>
                  Rename
                </button>
                <button type="button" className="draft-button map-panel-remove" disabled={busy || first} onClick={() => onMove(-1)} aria-label={`Move ${goal.name} up`}>
                  Move up
                </button>
                <button type="button" className="draft-button map-panel-remove" disabled={busy || last} onClick={() => onMove(1)} aria-label={`Move ${goal.name} down`}>
                  Move down
                </button>
                <button type="button" className="draft-button map-panel-remove" disabled={busy} onClick={onDelete} aria-label={`Delete ${goal.name}`}>
                  Delete
                </button>
              </div>
            )}
          </div>
        )}
      </article>
    </li>
  );
}
