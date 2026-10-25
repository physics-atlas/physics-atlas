import type { GraphEdge } from '../data/types';
import { normalizeRelationship } from '../graph/concepts';
import type { ConceptMap } from '../graph/concepts';
import { EDGE_CARD_TITLE_ID } from './ConceptCard';
import RelationSentence from './RelationSentence';
import RichText from './RichText';
import TypeBadge from './TypeBadge';

/**
 * A relation's card, opened by clicking its line (or "Details" in a concept's
 * relation list): its type, the two concepts it connects, and how — in words
 * and as a derivation (Markdown + LaTeX). Loaded on demand, like the other
 * cards that typeset maths.
 */
export default function EdgeCard({
  edge,
  byId,
  onPick,
  proposedIn,
}: {
  edge: GraphEdge;
  byId: ConceptMap;
  /** Focus a concept (select + glide) */
  onPick: (id: string) => void;
  /** The proposal it belongs to, when it isn't confirmed yet */
  proposedIn?: string;
}) {
  const type = normalizeRelationship(edge.relationship) ?? edge.relationship.trim();
  const ends = [
    { role: 'From', node: byId.get(edge.source), id: edge.source },
    { role: 'To', node: byId.get(edge.target), id: edge.target },
  ];
  return (
    <>
      <h2 className="map-card-title" id={EDGE_CARD_TITLE_ID}>
        {type}
      </h2>
      <p className="map-card-category">Relation{proposedIn ? ' · proposed' : ''}</p>
      <p className="edge-card-sentence">
        <RelationSentence edge={edge} byId={byId} selfId="" onPick={onPick} />
      </p>
      {proposedIn && (
        <p className="concept-empty">
          Part of the proposal “{proposedIn}” — not accepted yet.
        </p>
      )}

      <section className="rel-block">
        <h3 className="block-heading">Connects</h3>
        <ul className="concept-section-list">
          {ends.map(({ role, node, id }) => (
            <li key={role}>
              <span className="edge-card-role">{role}</span>
              {node && <TypeBadge type={node.type} />}
              <button className="concept-relation-link" onClick={() => onPick(id)}>
                {node?.label ?? id}
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section className="rel-block">
        <h3 className="block-heading">How they connect</h3>
        {edge.description ? <RichText source={edge.description} /> : <p className="concept-empty">Not described yet.</p>}
      </section>

      <section className="rel-block">
        <h3 className="block-heading">Derivation</h3>
        {edge.derivation ? <RichText source={edge.derivation} /> : <p className="concept-empty">No derivation yet.</p>}
      </section>

      {edge.review && (
        <section className="rel-block">
          <h3 className="block-heading">Open question</h3>
          <p className="topic-description">{edge.review}</p>
        </section>
      )}
    </>
  );
}
