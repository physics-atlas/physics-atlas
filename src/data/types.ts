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

/**
 * Broader kinds of relation — every relation type is in exactly one (the
 * validator checks), so a new type has to fit one of them. Groups the
 * relation filters, and the relations on a page.
 */
export interface RelationCategory {
  key: string;
  label: string;
  description: string;
  types: string[];
}
export const RELATION_CATEGORIES: RelationCategory[] = vocab.relationCategories;
const CATEGORY_OF = new Map(RELATION_CATEGORIES.flatMap((c) => c.types.map((t) => [t, c] as const)));
/** The category of a (normalised) relation type; association for anything unknown. */
export const relationCategory = (type: string): RelationCategory =>
  CATEGORY_OF.get(type) ?? RELATION_CATEGORIES.find((c) => c.key === 'association')!;

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

/** A formula that shows how a mathematical formalism works — typeset on its card. */
export interface Formula {
  /** What it shows: "A vector in a basis" */
  name?: string;
  /** LaTeX */
  equation: string;
  variables?: EquationVariable[];
}

export interface FormalismAttrs extends ConceptAttrs {
  /** Formulas and equations that show how the formalism works, each with its variables */
  formulas?: Formula[];
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
  /**
   * What this concept takes for granted ("Zel'dovich approximation assumes a
   * linear potential"). Not a relation: no line is drawn; the card lists them.
   */
  assumes?: Assumption[];
}

/**
 * One thing a concept assumes — a limit, a regime, a condition — written out
 * on the concept itself. It may also point to a concept on the map; only
 * then is it highlighted there and listed on that concept as "Assumed by".
 */
export interface Assumption {
  /** In a few words, e.g. "Linear potential"; may be left out when `concept` names it */
  label?: string;
  /** What exactly is assumed, in more detail */
  description?: string;
  /** The concept this assumption is, when the map has one */
  concept?: string;
}

export type GraphNode =
  | (GraphNodeBase & {
      type: Exclude<NodeType, 'equation' | 'formalism' | 'learning_goal' | 'resource'>;
      attrs: ConceptAttrs;
    })
  | (GraphNodeBase & { type: 'equation'; attrs: EquationAttrs })
  | (GraphNodeBase & { type: 'formalism'; attrs: FormalismAttrs })
  | (GraphNodeBase & { type: 'learning_goal'; attrs: LearningGoalAttrs })
  | (GraphNodeBase & { type: 'resource'; attrs: ResourceAttrs });

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  /** Verbatim as authored; the resolved EdgeType comes from normalizeRelationship() */
  relationship: string;
  /** How the two concepts connect, in a few sentences (Markdown + LaTeX) — on the relation's card */
  description?: string;
  /** A derivation of one from the other (Markdown + LaTeX, `$$…$$` for display maths) */
  derivation?: string;
  /** An open question for Sophie — cleared by deleting the field */
  review?: string;
}

export interface ConceptGraph {
  version: number;
  nodes: GraphNode[];
  edges: GraphEdge[];
}
