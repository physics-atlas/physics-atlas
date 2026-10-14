import { Fragment } from 'react';
import type { GraphEdge } from '../data/types';
import { sentenceParts } from '../graph/concepts';
import type { ConceptMap } from '../graph/concepts';

/** An edge read as a sentence; the other concepts are buttons, `selfId` is bold. */
export default function RelationSentence({
  edge,
  byId,
  selfId,
  onPick,
  withConditions = true,
}: {
  edge: GraphEdge;
  byId: ConceptMap;
  selfId: string;
  onPick: (id: string) => void;
  withConditions?: boolean;
}) {
  return (
    <>
      {sentenceParts(edge, byId, withConditions).map((part, i) =>
        typeof part === 'string' ? (
          <Fragment key={i}>{part}</Fragment>
        ) : part.id === selfId ? (
          <strong key={i}>{part.label}</strong>
        ) : (
          <button key={i} className="concept-relation-link" onClick={() => onPick(part.id)}>
            {part.label}
          </button>
        ),
      )}
    </>
  );
}
