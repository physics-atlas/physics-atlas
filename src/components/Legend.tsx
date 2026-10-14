import { useState } from 'react';
import { CATEGORY_COLORS, CATEGORY_LABELS, CATEGORY_ORDER } from '../graph/categoryColors';
import { TYPE_ORDER } from '../graph/typeColors';
import { NODE_TYPE_DEFINITIONS, NODE_TYPE_LABELS } from '../data/types';
import type { NodeType } from '../data/types';
import TypeBadge from './TypeBadge';

const DEFINITION_ID = 'type-definition';

/** Concept-type legend: each type is a button that opens what the type means. */
function TypeLegend() {
  const [open, setOpen] = useState<NodeType | null>(null);
  const def = open ? NODE_TYPE_DEFINITIONS[open] : undefined;

  return (
    <div
      className="legend legend-type"
      role="group"
      aria-label="Legend: concept types. Choose a type to read what it means."
      // Escape closes the definition while focus is in the legend — scoped, so
      // it doesn't also close the concept card.
      onKeyDown={(e) => e.key === 'Escape' && setOpen(null)}
    >
      {open && (
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
      {TYPE_ORDER.map((type) => (
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
      <span className="legend-entry legend-size-note">larger circle = more important · zoom in for more</span>
    </div>
  );
}

export default function Legend({ variant = 'category' }: { variant?: 'category' | 'type' }) {
  if (variant === 'type') return <TypeLegend />;
  return (
    <div className="legend" role="group" aria-label="Legend: topic categories">
      {CATEGORY_ORDER.map((category) => (
        <span key={category} className="legend-entry">
          <span
            className="cat-dot"
            style={{ background: CATEGORY_COLORS[category], color: CATEGORY_COLORS[category] }}
            aria-hidden
          />
          {CATEGORY_LABELS[category]}
        </span>
      ))}
      <span className="legend-entry">
        <span className="legend-dash" aria-hidden />
        optional prerequisite
      </span>
    </div>
  );
}
