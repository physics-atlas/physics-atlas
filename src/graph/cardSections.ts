import type { EdgeCondition, GraphEdge, GraphNode, NodeType } from '../data/types';
import type { ConceptIndex } from './concepts';

export interface CardSection {
  heading: string;
  /** Neighbour types listed here — linked in either direction, any relation. */
  types: NodeType[];
  /** Also list matches one hop further, through a neighbour of these types. */
  via?: NodeType[];
}

/** Lists the assumptions on a concept's relations (edge `conditions`). */
export interface ConditionSection {
  heading: string;
  /** Also list the conditions on the relations of neighbours of these types. */
  via?: NodeType[];
}

const PHYSICS: NodeType[] = [
  'physical_system',
  'property',
  'phenomenon',
  'process',
  'model_regime',
  'theory',
  'formalism',
  'equation',
  'method',
  'experiment',
];

/**
 * What a concept's card shows beyond its description, per node type — after
 * Sophie: "for a phenomenon, the conditions it applies under, and the
 * learning goals attached to it". Edge directions in the data are mixed, so
 * sections match by neighbour type, not by relation.
 */
export const CARD_SECTIONS: Record<NodeType, CardSection[]> = {
  physical_system: [
    { heading: 'Exhibits', types: ['phenomenon', 'process'] },
    { heading: 'Properties', types: ['property'] },
    { heading: 'Described by', types: ['model_regime', 'theory', 'equation', 'formalism'] },
  ],
  property: [
    { heading: 'Property of', types: ['physical_system', 'process'] },
    { heading: 'Appears in', types: ['equation', 'formalism', 'method'] },
  ],
  phenomenon: [
    { heading: 'Seen in', types: ['physical_system'] },
    { heading: 'Explained by', types: ['model_regime', 'theory', 'equation', 'property'] },
  ],
  process: [
    { heading: 'Happens in', types: ['physical_system'] },
    { heading: 'Involves', types: ['property', 'phenomenon'] },
    { heading: 'Described by', types: ['model_regime', 'theory', 'equation'] },
  ],
  model_regime: [
    { heading: 'Explains', types: ['phenomenon', 'process'] },
    { heading: 'Applies to', types: ['physical_system'] },
    { heading: 'Part of', types: ['theory'] },
    { heading: 'Uses', types: ['formalism'] },
    { heading: 'Expressed by', types: ['equation'] },
    { heading: 'Tested by', types: ['experiment'] },
  ],
  theory: [
    { heading: 'Organises', types: ['model_regime', 'equation'] },
    { heading: 'Explains', types: ['phenomenon', 'process'] },
    { heading: 'Uses', types: ['formalism'] },
    { heading: 'Tested by', types: ['experiment', 'finding'] },
  ],
  formalism: [{ heading: 'Used in', types: ['model_regime', 'theory', 'equation', 'method', 'formalism'] }],
  equation: [
    { heading: 'Describes', types: ['physical_system', 'phenomenon', 'process', 'model_regime'] },
    { heading: 'Quantities', types: ['property'] },
  ],
  method: [{ heading: 'Used with', types: ['equation', 'formalism', 'physical_system', 'property', 'dataset'] }],
  experiment: [
    { heading: 'Tests', types: ['model_regime', 'theory', 'equation', 'claim'] },
    { heading: 'Evidence for', types: ['phenomenon', 'physical_system'] },
    { heading: 'Produced', types: ['dataset', 'finding'] },
  ],
  dataset: [
    { heading: 'Recorded by', types: ['experiment', 'method'] },
    { heading: 'Supports', types: ['finding', 'claim'] },
  ],
  claim: [
    { heading: 'About', types: PHYSICS },
    { heading: 'Evidence', types: ['finding', 'dataset', 'experiment'] },
  ],
  finding: [
    { heading: 'Obtained from', types: ['experiment', 'dataset', 'method'] },
    { heading: 'Bears on', types: ['claim', 'model_regime', 'theory'] },
  ],
  learning_goal: [
    { heading: 'Concerns', types: PHYSICS },
    { heading: 'Requires', types: ['learning_goal'] },
    { heading: 'Supported by', types: ['resource'] },
    { heading: 'Addresses', types: ['misconception'] },
  ],
  resource: [{ heading: 'Supports', types: ['learning_goal', ...PHYSICS] }],
  misconception: [
    { heading: 'Addressed by', types: ['learning_goal'] },
    { heading: 'About', types: PHYSICS },
  ],
};

/** Shown first on the card — what the concept's relations assume. */
export const CONDITION_SECTIONS: Partial<Record<NodeType, ConditionSection>> = {
  physical_system: { heading: 'Conditions' },
  phenomenon: { heading: 'Applies under', via: ['physical_system', 'model_regime'] },
  process: { heading: 'Occurs under', via: ['physical_system'] },
  model_regime: { heading: 'Valid under' },
  theory: { heading: 'Valid under' },
  // "Linked", since the equation's own attrs.conditions list renders above
  equation: { heading: 'Linked conditions' },
};

/** Physics concepts get a "Learning goals" section (content still TBD). */
export const HAS_LEARNING_GOALS = new Set<NodeType>(PHYSICS);

export interface SectionItem {
  node: GraphNode;
  /** The neighbour this match was reached through, for `via` sections */
  via?: GraphNode;
}

export interface ConditionItem {
  condition: EdgeCondition;
  /** The relation that holds under this condition */
  edge: GraphEdge;
  /** The neighbour whose relation this is, for `via` sections */
  via?: GraphNode;
}

const incident = (id: string, index: ConceptIndex): GraphEdge[] => [
  ...(index.outgoing.get(id) ?? []),
  ...(index.incoming.get(id) ?? []),
];

function neighbours(id: string, index: ConceptIndex): GraphNode[] {
  const ids = new Set(incident(id, index).flatMap((e) => [e.source, e.target]));
  ids.delete(id);
  return [...ids].map((n) => index.byId.get(n)).filter((n): n is GraphNode => Boolean(n));
}

/** Direct matches first, then one-hop `via` matches not already listed. */
export function sectionItems(id: string, section: CardSection, index: ConceptIndex): SectionItem[] {
  const direct = neighbours(id, index);
  const items: SectionItem[] = direct
    .filter((n) => section.types.includes(n.type))
    .map((node) => ({ node }));
  if (!section.via) return items;
  const seen = new Set([id, ...items.map((i) => i.node.id)]);
  for (const hop of direct.filter((n) => section.via!.includes(n.type))) {
    for (const node of neighbours(hop.id, index)) {
      if (seen.has(node.id) || !section.types.includes(node.type)) continue;
      seen.add(node.id);
      items.push({ node, via: hop });
    }
  }
  return items;
}

/** Conditions on the concept's own relations, then on its `via` neighbours' relations. */
export function conditionItems(id: string, section: ConditionSection, index: ConceptIndex): ConditionItem[] {
  const own = incident(id, index);
  const items: ConditionItem[] = own.flatMap((edge) =>
    (edge.conditions ?? []).map((condition) => ({ condition, edge })),
  );
  if (!section.via) return items;
  const seen = new Set(own.map((e) => e.id));
  for (const hop of neighbours(id, index).filter((n) => section.via!.includes(n.type))) {
    for (const edge of incident(hop.id, index)) {
      if (seen.has(edge.id)) continue;
      seen.add(edge.id);
      for (const condition of edge.conditions ?? []) items.push({ condition, edge, via: hop });
    }
  }
  return items;
}
