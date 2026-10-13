import type { GraphNode, NodeType } from '../data/types';
import type { ConceptIndex } from './concepts';

export interface CardSection {
  heading: string;
  /** Neighbour types listed here — linked in either direction, any relation. */
  types: NodeType[];
  /** Also list matches one hop further, through a neighbour of these types. */
  via?: NodeType[];
}

const PHYSICS: NodeType[] = [
  'physical_system',
  'property',
  'phenomenon',
  'model_regime',
  'conditions',
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
    { heading: 'Exhibits', types: ['phenomenon'] },
    { heading: 'Conditions', types: ['conditions'] },
    { heading: 'Properties', types: ['property'] },
    { heading: 'Described by', types: ['model_regime', 'equation', 'formalism'] },
  ],
  property: [
    { heading: 'Property of', types: ['physical_system'] },
    { heading: 'Appears in', types: ['equation', 'formalism', 'method'] },
  ],
  phenomenon: [
    { heading: 'Applies under', types: ['conditions'], via: ['physical_system', 'model_regime'] },
    { heading: 'Seen in', types: ['physical_system'] },
    { heading: 'Explained by', types: ['model_regime', 'equation', 'property'] },
  ],
  model_regime: [
    { heading: 'Valid under', types: ['conditions'] },
    { heading: 'Explains', types: ['phenomenon'] },
    { heading: 'Applies to', types: ['physical_system'] },
    { heading: 'Uses', types: ['formalism'] },
    { heading: 'Expressed by', types: ['equation'] },
    { heading: 'Tested by', types: ['experiment'] },
  ],
  conditions: [
    { heading: 'Condition for', types: ['model_regime', 'physical_system', 'equation', 'formalism'] },
  ],
  formalism: [{ heading: 'Used in', types: ['model_regime', 'equation', 'method', 'formalism'] }],
  equation: [
    // "Linked", since the equation's own attrs.conditions list renders above
    { heading: 'Linked conditions', types: ['conditions'] },
    { heading: 'Describes', types: ['physical_system', 'phenomenon', 'model_regime'] },
    { heading: 'Quantities', types: ['property'] },
  ],
  method: [{ heading: 'Used with', types: ['equation', 'formalism', 'physical_system', 'property'] }],
  experiment: [
    { heading: 'Tests', types: ['model_regime', 'equation'] },
    { heading: 'Evidence for', types: ['phenomenon', 'physical_system'] },
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

/** Physics concepts get a "Learning goals" section (content still TBD). */
export const HAS_LEARNING_GOALS = new Set<NodeType>(PHYSICS);

export interface SectionItem {
  node: GraphNode;
  /** The neighbour this match was reached through, for `via` sections */
  via?: GraphNode;
}

function neighbours(id: string, index: ConceptIndex): GraphNode[] {
  const ids = new Set<string>();
  for (const e of index.outgoing.get(id) ?? []) ids.add(e.target);
  for (const e of index.incoming.get(id) ?? []) ids.add(e.source);
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
