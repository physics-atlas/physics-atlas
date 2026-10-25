import vocab from './conceptVocabulary.json';

/**
 * The concept graph (`src/data/concepts.json`, compiled from content/concepts/**):
 * concept-level nodes with 16 types and typed, directional edges that read as
 * sentences. See docs/AUTHORING.md and docs/DESIGN-DECISIONS.md Decision 12.
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
  /** LaTeX, like the equation: `G_{\mu\nu}` */
  symbol: string;
  meaning: string;
}

/**
 * Another way of writing the same equation — a component form, a weak-field
 * limit — with the variables as they're named there.
 */
export interface EquationRepresentation {
  /** What this form is called: "Linearized weak-field approximation" */
  name: string;
  /** LaTeX; left out while only the name is known */
  equation?: string;
  variables?: EquationVariable[];
}

export interface EquationAttrs {
  description: string;
  /** The main form, in LaTeX */
  equation: string;
  /** The main form's variables */
  variables: EquationVariable[];
  conditions: string[];
  representations: EquationRepresentation[];
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
   * 1 (minor detail) – 10 (landmark): how far out the node stays visible when
   * zooming out, and the size of its name
   */
  importance?: number;
  /** 1 (most specific) – 10 (most general): the size of the node's circle */
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
