import vocab from './conceptVocabulary.json';

export type TopicCategory = 'field' | 'method' | 'math-concept';

export type ContentType = 'book' | 'video' | 'course' | 'notes' | 'article';

export interface ContentItem {
  type: ContentType;
  title: string;
  author?: string;
  /** Optional — books often have no canonical link */
  url?: string;
  /** Short guidance: why this resource, which chapters, etc. */
  note?: string;
}

/**
 * A single learning outcome ("can do X"). `needs` lists sibling outcome ids
 * (same topic/subtopic) that come first, or cross refs "topicId#outcomeId" /
 * "topicId/subId#outcomeId" — the fine, within-category prerequisite order.
 * Authored via content/*.md and compiled into generated-outcomes.json;
 * merged onto units at load.
 */
export interface Outcome {
  /** kebab-case, unique within its parent topic/subtopic */
  id: string;
  text: string;
  needs?: string[];
}

export interface Subtopic {
  /** kebab-case, unique within its parent topic */
  id: string;
  title: string;
  description?: string;
  /**
   * Unit refs: sibling shorthand "eigenvalues", full "linear-algebra/eigenvalues",
   * or a whole topic without subtopics "hs-math"
   */
  prerequisites: string[];
  /** Same ref forms; enrichment — not required to reach a goal */
  optionalPrerequisites?: string[];
  /** A learning goal's subgoals — its "can do X" checkbox breakdown */
  outcomes?: Outcome[];
  content?: ContentItem[];
}

export interface Skill {
  /** kebab-case, unique */
  id: string;
  title: string;
  description: string;
  content?: ContentItem[];
}

export interface Topic {
  /** kebab-case, unique across the file */
  id: string;
  title: string;
  /**
   * What kind of node this is — drives node color and the legend. Optional:
   * topics Sophie has not classified yet render in a neutral grey.
   */
  category?: TopicCategory;
  description: string;
  /** ids of topics that should be learned first (direct edges only) */
  prerequisites: string[];
  /** Topic ids; enrichment/context edges, drawn dashed on the map */
  optionalPrerequisites?: string[];
  /** A learning goal's subgoals — its "can do X" checkbox breakdown */
  outcomes?: Outcome[];
  /**
   * This topic is a sub-area of another (e.g. tangent-space is part of
   * differential-geometry). The parent's page lists this area's learning goals
   * grouped under it — the three-level shape: topic → area → learning goals.
   */
  partOf?: string;
  /** Show in the goal picker on the landing view */
  featured?: boolean;
  content: ContentItem[];
  /** Optional fine structure; topics without it act as one unit */
  subtopics?: Subtopic[];
}

export interface TopicGraph {
  version: number;
  domain: string;
  topics: Topic[];
  skills?: Skill[];
}

/**
 * Concept graph (pilot) — a second, independent dataset (`src/data/concepts.json`)
 * modeling concept-level nodes with 16 types and typed, directional edges that
 * read as sentences. Coexists with Topic/Subtopic above; see docs/AUTHORING.md
 * "Concept graph (pilot)" and docs/DESIGN-DECISIONS.md Decision 12.
 */
export const NODE_TYPE_LABELS = vocab.nodeTypes;
export type NodeType = keyof typeof NODE_TYPE_LABELS;

/** What a node type means — shown when a type is clicked in the legend. */
export interface NodeTypeDefinition {
  /** The ontology's name for the type, when it differs from the short label */
  term: string;
  definition: string;
  examples: string[];
  /** Easily-confused neighbouring types, spelled out */
  distinctions: string[];
}

/**
 * The controlled list of research domains a concept's `attrs.domain` may name
 * ("A / B" for several) — what routes proposals to the right stewards.
 */
export const CONCEPT_DOMAINS: string[] = vocab.domains;

/** Partial: a type without an agreed definition shows a "not defined yet" note. */
export const NODE_TYPE_DEFINITIONS: Partial<Record<NodeType, NodeTypeDefinition>> =
  vocab.nodeTypeDefinitions;

export const EDGE_SENTENCE_TEMPLATES = vocab.edgeTemplates;
export type EdgeType = keyof typeof EDGE_SENTENCE_TEMPLATES;

interface ConceptAttrs {
  description: string;
  domain?: string;
}

export interface EquationVariable {
  symbol: string;
  meaning: string;
}

export interface EquationAttrs {
  description: string;
  equation: string;
  variables: EquationVariable[];
  conditions: string[];
  representations: string[];
  domain?: string;
}

export interface LearningGoalAttrs {
  description: string;
}

export interface ResourceAttrs {
  link: string;
  mediaType: string;
  estimatedMinutes: number;
  rating: number;
  reviewCount: number;
}

interface GraphNodeBase {
  /** snake_case, unique, kept verbatim from Sophie's CSVs */
  id: string;
  label: string;
  /**
   * 1 (minor detail) – 5 (landmark); drives node size and how far out the
   * node stays visible when zooming out
   */
  importance?: number;
  /** 1 (most specific) – 5 (most general); the size fallback when importance is missing */
  generality?: number;
  /** How settled the concept is, e.g. "Candidate"; known values in conceptVocabulary.json */
  epistemicStatus?: string;
  /** An open question for Sophie — cleared by deleting the field */
  review?: string;
}

export type GraphNode =
  | (GraphNodeBase & {
      type: Exclude<NodeType, 'equation' | 'learning_goal' | 'resource'>;
      attrs: ConceptAttrs;
    })
  | (GraphNodeBase & { type: 'equation'; attrs: EquationAttrs })
  | (GraphNodeBase & { type: 'learning_goal'; attrs: LearningGoalAttrs })
  | (GraphNodeBase & { type: 'resource'; attrs: ResourceAttrs });

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  /** Verbatim as authored; the resolved EdgeType comes from normalizeRelationship() */
  relationship: string;
  /**
   * Assumptions the relation holds under — "Zel'dovich approximation
   * approximates Structure Formation under the assumption of linear potential".
   */
  conditions?: EdgeCondition[];
  /** An open question for Sophie — cleared by deleting the field */
  review?: string;
}

export interface EdgeCondition {
  /** Reads mid-sentence, so usually lower case: "linear potential" */
  label: string;
  description?: string;
}

export interface ConceptGraph {
  version: number;
  nodes: GraphNode[];
  edges: GraphEdge[];
}
