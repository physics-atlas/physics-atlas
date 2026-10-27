import { useState } from 'react';
import { TYPE_GROUPS } from '../graph/typeColors';
import { NODE_TYPE_DEFINITIONS, NODE_TYPE_LABELS } from '../data/types';
import type { NodeType } from '../data/types';
import TypeBadge from './TypeBadge';

const DEFINITION_ID = 'type-definition';
const BODY_ID = 'legend-body';
const SHOWN_KEY = 'physics-atlas-legend-shown-v1';

/**
 * Whether the legend starts unfolded: as the reader last left it, else
 * folded on a phone-sized screen (where it would cover the map) and unfolded
 * on a larger one.
 */
function initiallyShown(): boolean {
  try {
    const kept = window.localStorage.getItem(SHOWN_KEY);
    if (kept === 'shown' || kept === 'folded') return kept === 'shown';
  } catch {
    // no storage (private window, blocked): fall back to the screen size
  }
  return !window.matchMedia?.('(max-width: 720px)').matches;
}

/** Outline swatches matching the canvas: solid, dashed (proposed), double (contested). */
const STATUSES = [
  { key: 'confirmed', label: 'Confirmed' },
  { key: 'proposed', label: 'Proposed — dashed outline' },
  { key: 'contested', label: '⚑ Contested — double outline' },
  { key: 'draft', label: 'Your draft — dashed, glowing' },
] as const;

/**
 * Concept-type legend: each type is a button that opens what the type means.
 * It folds away to one "Legend" button, so on a small screen it needn't cover the map.
 */
function TypeLegend({ statuses, draft, fun }: { statuses: boolean; draft: boolean; fun: boolean }) {
  const [open, setOpen] = useState<NodeType | null>(null);
  const [shown, setShown] = useState(initiallyShown);
  const def = open ? NODE_TYPE_DEFINITIONS[open] : undefined;
  const toggle = () => {
    const next = !shown;
    setShown(next);
    if (!next) setOpen(null);
    try {
      window.localStorage.setItem(SHOWN_KEY, next ? 'shown' : 'folded');
    } catch {
      // not kept: the legend still folds for this visit
    }
  };

  return (
    <div
      className={`legend legend-type${shown ? '' : ' legend-folded'}`}
      role="group"
      aria-label="Legend: concept types. Choose a type to read what it means."
      // Escape closes the definition while focus is in the legend — scoped, so
      // it doesn't also close the concept card.
      onKeyDown={(e) => e.key === 'Escape' && setOpen(null)}
    >
      {shown && open && (
        <section
          id={DEFINITION_ID}
          className="type-definition"
          aria-labelledby={`${DEFINITION_ID}-title`}
          aria-live="polite"
        >
          <h2 className="type-definition-title" id={`${DEFINITION_ID}-title`}>
            <TypeBadge type={open} />
            {NODE_TYPE_LABELS[open]}
          </h2>
          {def ? (
            <>
              {def.term !== NODE_TYPE_LABELS[open] && (
                <p className="type-definition-term">Ontology term: {def.term}</p>
              )}
              <p className="type-definition-text">{def.definition}</p>
              {def.examples.length > 0 && (
                <>
                  <h3 className="block-heading">Examples</h3>
                  <p className="type-definition-examples">{def.examples.join(' · ')}</p>
                </>
              )}
              {def.distinctions.length > 0 && (
                <>
                  <h3 className="block-heading">Not to be confused with</h3>
                  <ul className="type-definition-distinctions">
                    {def.distinctions.map((d) => (
                      <li key={d}>{d}</li>
                    ))}
                  </ul>
                </>
              )}
            </>
          ) : (
            <p className="concept-empty">This type has no agreed definition yet.</p>
          )}
          <button className="map-card-close" onClick={() => setOpen(null)} aria-label="Close definition">
            ×
          </button>
        </section>
      )}
      <button type="button" className="legend-toggle" aria-expanded={shown} aria-controls={BODY_ID} onClick={toggle}>
        <span className="legend-toggle-mark" aria-hidden>
          {shown ? '▾' : '▸'}
        </span>
        Legend
      </button>
      <div className="legend-body" id={BODY_ID} hidden={!shown}>
        {TYPE_GROUPS.filter((group) => fun || group.key !== 'fun').map((group) => (
          <div key={group.key} className="legend-type-group" role="group" aria-labelledby={`legend-group-${group.key}`}>
            <span className="legend-type-group-name" id={`legend-group-${group.key}`}>
              {group.label}
            </span>
            <span className="legend-type-group-entries">
              {group.types.map((type) => (
                <button
                  key={type}
                  type="button"
                  className={`legend-entry legend-type-button ${open === type ? 'legend-type-button-active' : ''}`}
                  aria-expanded={open === type}
                  aria-controls={open === type ? DEFINITION_ID : undefined}
                  title={`What is a ${NODE_TYPE_LABELS[type].toLowerCase()}?`}
                  onClick={() => setOpen(open === type ? null : type)}
                >
                  <TypeBadge type={type} />
                  {NODE_TYPE_LABELS[type]}
                </button>
              ))}
            </span>
          </div>
        ))}
        <span className="legend-entry legend-size-note">larger circle = more general · zoom in for less important concepts</span>
        {statuses && (
          <span className="legend-statuses">
            {STATUSES.filter((s) => draft || s.key !== 'draft').map((s) => (
              <span key={s.key} className="legend-entry">
                <span className={`status-swatch status-swatch-${s.key}`} aria-hidden />
                {s.label}
              </span>
            ))}
          </span>
        )}
        <p className="legend-disclaimer">
          This categorization does not claim to be exhaustive or fundamental — we welcome discussion and contribution
          on this framework.
        </p>
      </div>
    </div>
  );
}

export default function Legend({
  statuses = false,
  draft = false,
  fun = false,
}: {
  /** Also explain the proposal outlines (community preview) */
  statuses?: boolean;
  /** Also explain the draft's outline (while the proposal editor is open) */
  draft?: boolean;
  /** Also list the Fun group (fun mode) */
  fun?: boolean;
}) {
  return <TypeLegend statuses={statuses} draft={draft} fun={fun} />;
}
