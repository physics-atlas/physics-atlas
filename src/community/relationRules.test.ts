import { describe, expect, it } from 'vitest';
import { fittingRelation, relationRule, relationRuleProblem } from './relationRules';

describe('relation rules', () => {
  it('leaves other pairs free', () => {
    expect(relationRule('property', 'equation')).toBeNull();
    expect(relationRuleProblem('relates', 'property', 'equation')).toBeNull();
  });

  it('connects a resource only with "helps understand", from the resource', () => {
    expect(relationRule('resource', 'property')?.types).toEqual(['helps understand']);
    expect(relationRule('learning_goal', 'resource')?.types).toEqual(['helps understand']);
    expect(relationRuleProblem('helps understand', 'resource', 'learning_goal')).toBeNull();
    expect(relationRuleProblem('relates', 'resource', 'property')).toMatch(/helps understand/);
    expect(relationRuleProblem('helps understand', 'property', 'resource')).toMatch(/Swap/);
  });

  it('orders two learning goals with the prerequisite relations or "helps understand"', () => {
    for (const t of ['is a prerequisite for', 'strict prerequisite for', 'helps understand'])
      expect(relationRuleProblem(t, 'learning_goal', 'learning_goal')).toBeNull();
    expect(relationRuleProblem('is a learning goal of', 'learning_goal', 'learning_goal')).not.toBeNull();
  });

  it('connects a goal to a concept with "is a learning goal of", from the goal', () => {
    expect(relationRuleProblem('is a learning goal of', 'learning_goal', 'method')).toBeNull();
    expect(relationRuleProblem('strict prerequisite for', 'method', 'learning_goal')).not.toBeNull();
    expect(relationRuleProblem('is a learning goal of', 'method', 'learning_goal')).toMatch(/Swap/);
  });

  it('starts a new relation that fits, the right way round', () => {
    expect(fittingRelation('a', 'property', 'b', 'equation')).toEqual({ source: 'a', target: 'b', relationship: 'relates' });
    expect(fittingRelation('a', 'property', 'g', 'learning_goal')).toEqual({ source: 'g', target: 'a', relationship: 'is a learning goal of' });
    expect(fittingRelation('a', 'property', 'r', 'resource')).toEqual({ source: 'r', target: 'a', relationship: 'helps understand' });
    expect(fittingRelation('g', 'learning_goal', 'h', 'learning_goal').relationship).toBe('is a prerequisite for');
  });
});
