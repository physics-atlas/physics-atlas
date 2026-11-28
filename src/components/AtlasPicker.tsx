import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { concepts } from '../data/loadConcepts';
import { NODE_TYPE_LABELS } from '../data/types';
import { TYPE_COLORS } from '../graph/typeColors';
import { defaultChoice, pickChanges } from '../maps/pick';
import type { ConceptGraph } from '../data/types';
import type { MapChange } from '../maps/items';
import type { PickChoice, PickReport } from '../maps/pick';
import SearchBox from './SearchBox';

// Adding several atlas concepts to a personal map at once (Decision 58). The atlas
// is shown beneath; clicking a concept picks it or puts it back, and so does this
// panel's search and list. A pick no relation connects to the map is marked as it's
// picked, with what would connect it; before saving, each such pick is added with
// the concepts that connect it, added unconnected, or left out.

interface AtlasPickerProps {
  title: string;
  /** The map as it is (its own concepts and the atlas's it uses) */
  map: ConceptGraph;
  picked: string[];
  report: PickReport;
  /** What the last click or pick did, in words */
  news: string;
  onPick: (id: string) => void;
  onCancel: () => void;
  /** Saves; resolves to an error in words, or null when saved */
  onConfirm: (changes: MapChange[]) => Promise<{ error: string; problems?: string[] } | null>;
}

const labelOf = (id: string) => concepts.nodes.find((n) => n.id === id)?.label ?? id;
// Learning goals are sentences: their full stop goes, so a list of them reads.
const listed = (ids: string[]) => ids.map((id) => labelOf(id).replace(/\.$/, '')).join('; ');

export default function AtlasPicker({ title, map, picked, report, news, onPick, onCancel, onConfirm }: AtlasPickerProps) {
  const [reviewing, setReviewing] = useState(false);
  const [choices, setChoices] = useState<Record<string, PickChoice>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ error: string; problems?: string[] } | null>(null);
  const ids = { picked: useId(), intro: useId() };
  // Each step starts at its heading, so a screen reader hears where it is.
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => headingRef.current?.focus(), [reviewing]);
  const inMap = useMemo(() => new Set(map.nodes.map((n) => n.id)), [map]);
  const offered = useMemo(
    () =>
      concepts.nodes
        .filter((n) => n.type !== 'fluff' && !inMap.has(n.id) && !picked.includes(n.id))
        .map((n) => ({ ref: n.id, title: n.label, context: NODE_TYPE_LABELS[n.type], color: TYPE_COLORS[n.type] }))
        .sort((a, b) => a.title.localeCompare(b.title)),
    [inMap, picked],
  );
  const changes = useMemo(() => pickChanges(map, picked, report, choices), [map, picked, report, choices]);
  const alone = new Set(report.unconnected);
  const choiceOf = (id: string) => choices[id] ?? defaultChoice(report, id);

  if (reviewing) {
    const added = changes.map((c) => c.id);
    const extra = added.filter((id) => !picked.includes(id));
    return (
      <section className="map-panel pick-panel" aria-labelledby={ids.intro}>
        <h2 className="map-panel-heading" id={ids.intro} tabIndex={-1} ref={headingRef}>
          Add to “{title}”
        </h2>
        {report.unconnected.length > 0 ? (
          <p className="map-panel-note">
            {report.unconnected.length === 1 ? 'One concept you picked isn’t' : `${report.unconnected.length} concepts you picked aren’t`}{' '}
            connected to your map by any relation: on the map {report.unconnected.length === 1 ? 'it' : 'they'} would stand
            alone. Choose for each:
          </p>
        ) : (
          <p className="map-panel-note">Everything you picked is connected to your map.</p>
        )}
        {report.unconnected.map((id) => {
          const linking = report.linking.get(id) ?? [];
          const name = `pick-${id}`;
          const option = (value: PickChoice, text: string) => (
            <label className="pick-choice">
              <input
                type="radio"
                name={name}
                value={value}
                checked={choiceOf(id) === value}
                onChange={() => setChoices((c) => ({ ...c, [id]: value }))}
              />{' '}
              {text}
            </label>
          );
          return (
            <fieldset key={id} className="pick-fieldset">
              <legend>{labelOf(id)}</legend>
              {linking.length > 0 &&
                option('link', linking.length === 1 ? `Add it with the concept that connects it: ${listed(linking)}` : `Add it with the concepts that connect it: ${listed(linking)}`)}
              {option('alone', linking.length ? 'Add it unconnected' : 'Add it unconnected (no short way to connect it on the atlas)')}
              {option('leave', 'Leave it out')}
            </fieldset>
          );
        })}
        <p className="map-panel-note">
          {added.length === 0
            ? 'Nothing to add.'
            : `Adds ${added.length === 1 ? 'one concept' : `${added.length} concepts`}: ${listed(added)}.`}
          {extra.length > 0 && ` Of these you didn’t pick ${listed(extra)}: ${extra.length === 1 ? 'it connects' : 'they connect'} the others.`}{' '}
          The atlas’s relations between them come along.
        </p>
        {error && (
          <div className="draft-warning" role="alert">
            <p className="map-panel-note">{error.error}</p>
            {error.problems && error.problems.length > 0 && (
              <ul className="map-panel-problems">
                {error.problems.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            )}
          </div>
        )}
        <div className="map-panel-row">
          <button
            type="button"
            className="draft-button draft-button-primary"
            disabled={busy || added.length === 0}
            onClick={async () => {
              setBusy(true);
              setError(null);
              const r = await onConfirm(changes);
              setBusy(false);
              if (r) setError(r);
            }}
          >
            {added.length === 1 ? 'Add one concept' : `Add ${added.length} concepts`}
          </button>
          <button type="button" className="draft-button" disabled={busy} onClick={() => setReviewing(false)}>
            Back to picking
          </button>
          <button type="button" className="draft-button" disabled={busy} onClick={onCancel}>
            Cancel
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="map-panel pick-panel" aria-labelledby={ids.intro}>
      <h2 className="map-panel-heading" id={ids.intro} tabIndex={-1} ref={headingRef}>
        Add several from the atlas to “{title}”
      </h2>
      <p className="map-panel-note">
        The atlas is below. Click a concept to pick it, and again to put it back, or pick by name here. Your map’s concepts
        say <strong>In your map</strong>. A pick that says <strong>not connected</strong> (dashed outline) has no relation
        to your map; the concepts that would connect it say <strong>Would connect</strong>.
      </p>
      <p className="draft-status" role="status">
        {news}
      </p>
      <div className="map-panel-columns">
        <div className="map-panel-part">
          <SearchBox entries={offered} label="Pick a concept by name" placeholder="Pick a concept by name…" onPick={onPick} />
          <div className="map-panel-row">
            <button
              type="button"
              className="draft-button draft-button-primary"
              disabled={picked.length === 0}
              onClick={() => {
                setError(null);
                setReviewing(true);
              }}
            >
              Review and add ({picked.length})
            </button>
            <button type="button" className="draft-button" onClick={onCancel}>
              Cancel
            </button>
          </div>
        </div>
        <div className="map-panel-part">
          <h3 className="map-panel-heading" id={ids.picked}>
            Picked ({picked.length})
          </h3>
          {picked.length === 0 ? (
            <p className="map-panel-note">Nothing yet.</p>
          ) : (
            <ul className="map-panel-list" aria-labelledby={ids.picked}>
              {picked.map((id) => (
                <li key={id}>
                  <span>
                    {labelOf(id)}
                    {alone.has(id) && <span className="map-panel-role"> (not connected)</span>}
                  </span>
                  <button
                    type="button"
                    className="draft-button map-panel-remove"
                    aria-label={`Put back ${labelOf(id)}`}
                    onClick={() => onPick(id)}
                  >
                    Put back
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}
