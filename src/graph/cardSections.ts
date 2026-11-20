import type { GraphEdge, GraphNode, NodeType, ResourceAttrs } from '../data/types';
import { assumptionsOf } from './concepts';
import type { AssumptionItem, ConceptIndex } from './concepts';

export interface CardSection {
  heading: string;
  /** Neighbour types listed here — linked in either direction, any relation. */
  types: NodeType[];
  /** Also list matches one hop further, through a neighbour of these types. */
  via?: NodeType[];
}

/** Lists what a concept assumes (its `assumes`) under a type-specific heading. */
export interface ConditionSection {
  heading: string;
  /** Also list what neighbours of these types assume — "applies under" through its system. */
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
  fluff: [{ heading: 'Pokes fun at', types: [...PHYSICS, 'claim', 'finding', 'dataset', 'learning_goal', 'misconception'] }],
};

/** Shown first on the card — what the concept assumes (types without an entry: "Assumes"). */
export const CONDITION_SECTIONS: Partial<Record<NodeType, ConditionSection>> = {
  physical_system: { heading: 'Conditions' },
  phenomenon: { heading: 'Applies under', via: ['physical_system', 'model_regime'] },
  process: { heading: 'Occurs under', via: ['physical_system'] },
  model_regime: { heading: 'Valid under' },
  theory: { heading: 'Valid under' },
  // "Assumes", since the equation's own attrs.conditions list renders above as "Conditions"
  equation: { heading: 'Assumes' },
};

/** Physics concepts get a "Learning goals" section (content still TBD). */
export const HAS_LEARNING_GOALS = new Set<NodeType>(PHYSICS);

export interface SectionItem {
  node: GraphNode;
  /** The neighbour this match was reached through, for `via` sections */
  via?: GraphNode;
}

export interface ConditionItem {
  /** What's assumed */
  assumption: AssumptionItem;
  /** The neighbour that assumes it, for `via` sections */
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

export interface GoalItem {
  node: GraphNode;
  /** The relation that links the goal here — it carries the goal's importance and generality for this concept */
  edge: GraphEdge;
}

/**
 * The learning goals linked to a concept, in either direction, by any
 * relation: the most important for it first (unrated last), then by name.
 */
export function learningGoalsOf(id: string, index: ConceptIndex): GoalItem[] {
  const seen = new Set<string>();
  const items: GoalItem[] = [];
  for (const edge of incident(id, index)) {
    const other = index.byId.get(edge.source === id ? edge.target : edge.source);
    if (other?.type !== 'learning_goal' || seen.has(other.id)) continue;
    seen.add(other.id);
    items.push({ node: other, edge });
  }
  return items.sort(
    (a, b) => (b.edge.importance ?? 0) - (a.edge.importance ?? 0) || a.node.label.localeCompare(b.node.label),
  );
}

/** "importance 7/10 · generality 3/10" — what a goal's relation rates it, or nothing. */
export function goalRating(edge: GraphEdge): string {
  return [
    edge.importance !== undefined && `importance ${edge.importance}/10`,
    edge.generality !== undefined && `generality ${edge.generality}/10`,
  ]
    .filter(Boolean)
    .join(' · ');
}

/** A resource's kind as it reads: its own words for an "other" kind ("podcast"), else the kind. */
export const resourceKindName = (a: Pick<ResourceAttrs, 'mediaType' | 'mediaTypeOther'>): string =>
  a.mediaType === 'other' && a.mediaTypeOther?.trim() ? a.mediaTypeOther.trim() : a.mediaType;

/** "Video · 20–30 min · reading: 15 min · listening: 1 h" — the times as written, free text. */
export function resourceMeta(a: ResourceAttrs): string {
  return [
    resourceKindName(a),
    a.estimatedTime,
    a.readingTime && `reading: ${a.readingTime}`,
    a.listeningTime && `listening: ${a.listeningTime}`,
  ]
    .filter(Boolean)
    .join(' · ');
}

/** What the concept assumes, then what its `via` neighbours assume. */
export function conditionItems(id: string, section: ConditionSection, index: ConceptIndex): ConditionItem[] {
  const items: ConditionItem[] = assumptionsOf(id, index).assumes.map((assumption) => ({ assumption }));
  if (!section.via) return items;
  // The same assumption reached twice (one concept, or the same words) is listed once.
  const key = (a: AssumptionItem) => (a.node ? `concept:${a.node.id}` : `text:${a.label.toLowerCase()}`);
  const seen = new Set(items.map((i) => key(i.assumption)));
  for (const hop of neighbours(id, index).filter((n) => section.via!.includes(n.type)))
    for (const assumption of assumptionsOf(hop.id, index).assumes) {
      if (seen.has(key(assumption)) || assumption.node?.id === id) continue;
      seen.add(key(assumption));
      items.push({ assumption, via: hop });
    }
  return items;
}
