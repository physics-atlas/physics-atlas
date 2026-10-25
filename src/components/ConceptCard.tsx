import type { ReactNode } from 'react';
import { NODE_TYPE_LABELS } from '../data/types';
import type { GraphNode } from '../data/types';
import {
  CARD_SECTIONS,
  CONDITION_SECTIONS,
  HAS_LEARNING_GOALS,
  conditionItems,
  sectionItems,
} from '../graph/cardSections';
import { assumptionsOf } from '../graph/concepts';
import type { ConceptIndex } from '../graph/concepts';
import TypeBadge from './TypeBadge';

interface ConceptCardProps {
  node: GraphNode;
  index: ConceptIndex;
  /** Focus another concept (select + glide) */
  onPick: (id: string) => void;
  /** Type-specific details (equation, resource link) shown under the description */
  children?: ReactNode;
}

/**
 * A concept's card: short description, then the information its type calls
 * for (CARD_SECTIONS) — e.g. a phenomenon's conditions and learning goals.
 */
/** The card heading's id — the enclosing panel's accessible name. */
export const CONCEPT_CARD_TITLE_ID = 'concept-card-title';
/** The same for a relation's card (EdgeCard.tsx, loaded on demand — so it lives here). */
export const EDGE_CARD_TITLE_ID = 'edge-card-title';

export default function ConceptCard({ node, index, onPick, children }: ConceptCardProps) {
  const description = 'description' in node.attrs ? node.attrs.description : undefined;
  const domain = 'domain' in node.attrs ? node.attrs.domain : undefined;
  // What it assumes: under its type's own heading ("Applies under", through its
  // system for a phenomenon), else "Assumes" when there is anything.
  const ownSection = CONDITION_SECTIONS[node.type];
  const assumed = conditionItems(node.id, ownSection ?? { heading: 'Assumes' }, index);
  const conditionSection = ownSection ?? (assumed.length ? { heading: 'Assumes' } : undefined);
  const { assumedBy } = assumptionsOf(node.id, index);
  return (
    <>
      <h2 className="map-card-title" id={CONCEPT_CARD_TITLE_ID}>
        <TypeBadge type={node.type} />
        {node.label}
      </h2>
      <p className="map-card-category">
        {NODE_TYPE_LABELS[node.type]}
        {domain && ` · ${domain}`}
      </p>
      {description?.trim() ? (
        <p className="topic-description">{description}</p>
      ) : (
        <p className="topic-description">
          <Todo label="To-do" />
        </p>
      )}
      {/* Fluff makes no claim, so it has no epistemic status to settle. */}
      {node.type !== 'fluff' && (
        <p className="concept-status">
          Epistemic status:{' '}
          {node.epistemicStatus ? <strong>{node.epistemicStatus}</strong> : <Todo label="To-do" />}
        </p>
      )}

      {children}

      {conditionSection && (
        <section className="rel-block">
          <h3 className="block-heading">
            {conditionSection.heading}
            {assumed.length > 0 && <span className="rel-count">{assumed.length}</span>}
          </h3>
          {assumed.length === 0 ? (
            <p className="concept-empty">None linked yet.</p>
          ) : (
            <ConceptList items={assumed} onPick={onPick} />
          )}
        </section>
      )}

      {assumedBy.length > 0 && (
        <section className="rel-block">
          <h3 className="block-heading">
            Assumed by
            <span className="rel-count">{assumedBy.length}</span>
          </h3>
          <ConceptList items={assumedBy.map((n) => ({ node: n }))} onPick={onPick} />
        </section>
      )}

      {CARD_SECTIONS[node.type].map((section) => {
        const items = sectionItems(node.id, section, index);
        return (
          <section key={section.heading} className="rel-block">
            <h3 className="block-heading">
              {section.heading}
              {items.length > 0 && <span className="rel-count">{items.length}</span>}
            </h3>
            {items.length === 0 ? (
              <p className="concept-empty">None linked yet.</p>
            ) : (
              <ConceptList items={items} onPick={onPick} />
            )}
          </section>
        );
      })}

      {HAS_LEARNING_GOALS.has(node.type) && (
        <section className="rel-block">
          <h3 className="block-heading">Learning goals</h3>
          <p className="concept-empty">
            <Todo label="TBD" />
          </p>
        </section>
      )}
    </>
  );
}

function Todo({ label }: { label: string }) {
  return <span className="concept-todo">{label}</span>;
}

/** Linked concepts, each a button that shows it on the map, with how it was reached. */
function ConceptList({ items, onPick }: { items: { node: GraphNode; via?: GraphNode }[]; onPick: (id: string) => void }) {
  return (
    <ul className="concept-section-list">
      {items.map(({ node: item, via }) => (
        <li key={item.id}>
          <TypeBadge type={item.type} />
          <button className="concept-relation-link" onClick={() => onPick(item.id)}>
            {item.label}
          </button>
          {via && <span className="concept-via">via {via.label}</span>}
        </li>
      ))}
    </ul>
  );
}
