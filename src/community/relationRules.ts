// Which relations a pair of kinds may have. Most pairs take any relation; three
// don't (Decision 52):
//   - an educational resource only "helps understand" what it teaches;
//   - two learning goals are ordered: one is a prerequisite, or a strict one,
//     for the other, or helps understand it;
//   - a learning goal and any other concept: the goal "is a learning goal of" it.
// The direction is part of the rule where the sentence needs it: the resource,
// or the goal, comes first. Pure: shared by the editor, the proposal checks and
// the backend; scripts/validate-concepts.mjs mirrors it for the content.
import type { EdgeType, NodeType } from '../data/types';

export interface RelationRule {
  /** The only relations the pair may have */
  types: EdgeType[];
  /** The kind that has to be the relation's source, when the sentence reads only one way */
  sourceKind?: NodeType;
  /** Why, in words a proposer can act on */
  why: string;
}

/** The rule for a relation between these two kinds, or null when any relation fits. */
export function relationRule(source: NodeType | '' | undefined, target: NodeType | '' | undefined): RelationRule | null {
  const ends = [source, target];
  if (ends.includes('resource'))
    return {
      types: ['helps understand'],
      sourceKind: 'resource',
      why: 'An educational resource is connected with “helps understand”, from the resource to what it teaches.',
    };
  if (source === 'learning_goal' && target === 'learning_goal')
    return {
      types: ['is a prerequisite for', 'strict prerequisite for', 'helps understand'],
      why: 'Two learning goals are connected with “is a prerequisite for”, “is a strict prerequisite for” or “helps understand”.',
    };
  if (ends.includes('learning_goal'))
    return {
      types: ['is a learning goal of'],
      sourceKind: 'learning_goal',
      why: 'A learning goal is connected to a concept with “is a learning goal of”, from the goal to the concept.',
    };
  return null;
}

/** What's wrong with this relation between these kinds (null: it fits). */
export function relationRuleProblem(
  type: string,
  source: NodeType | '' | undefined,
  target: NodeType | '' | undefined,
): string | null {
  const rule = relationRule(source, target);
  if (!rule) return null;
  if (!(rule.types as string[]).includes(type)) return rule.why;
  if (rule.sourceKind && source !== rule.sourceKind && target === rule.sourceKind) return `${rule.why} Swap its direction.`;
  return null;
}

/**
 * A new relation from `from` to `to`, made to fit the rule: its first allowed
 * type, and the ends swapped when the rule reads the other way. Without a rule,
 * "relates" — a start the proposer then picks the real relation for.
 */
export function fittingRelation<T>(
  from: T,
  fromKind: NodeType | '' | undefined,
  to: T,
  toKind: NodeType | '' | undefined,
): { source: T; target: T; relationship: EdgeType } {
  const rule = relationRule(fromKind, toKind);
  if (!rule) return { source: from, target: to, relationship: 'relates' };
  const swap = rule.sourceKind !== undefined && fromKind !== rule.sourceKind && toKind === rule.sourceKind;
  return { source: swap ? to : from, target: swap ? from : to, relationship: rule.types[0] };
}
