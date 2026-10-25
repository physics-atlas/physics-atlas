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
import type { ConceptIndex } from '../graph/concepts';
import RelationSentence from './RelationSentence';
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

export default function ConceptCard({ node, index, onPick, children }: ConceptCardProps) {
  const description = 'description' in node.attrs ? node.attrs.description : undefined;
  const domain = 'domain' in node.attrs ? node.attrs.domain : undefined;
  const conditionSection = CONDITION_SECTIONS[node.type];
  const conditions = conditionSection ? conditionItems(node.id, conditionSection, index) : [];
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
            {conditions.length > 0 && <span className="rel-count">{conditions.length}</span>}
          </h3>
          {conditions.length === 0 ? (
            <p className="concept-empty">None linked yet.</p>
          ) : (
            <ul className="concept-condition-list">
              {conditions.map(({ condition, edge, via }) => (
                <li key={`${edge.id}:${condition.label}`}>
                  <strong className="concept-condition-label">{condition.label}</strong>
                  {condition.description && (
                    <span className="concept-condition-description">{condition.description}</span>
                  )}
                  <span className="concept-condition-edge">
                    Assumed in:{' '}
                    <RelationSentence
                      edge={edge}
                      byId={index.byId}
                      selfId={node.id}
                      onPick={onPick}
                      withConditions={false}
                    />
                    {via && <span className="concept-via">via {via.label}</span>}
                  </span>
                </li>
              ))}
            </ul>
          )}
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
