import { describe, expect, it } from 'vitest';
import vocabulary from '../data/conceptVocabulary.json?raw';
import { relationPhrase, relationTypeProblems, withRelationTypes } from './relationTypes';

const categories = ['derivation', 'association'];

describe('relationTypeProblems', () => {
  it('takes a new phrase in a category', () => {
    expect(relationTypeProblems({ type: 'is a sample limit of', category: 'derivation' }, ['relates'], categories)).toEqual([]);
    expect(relationPhrase('  Is a   Sample limit of ')).toBe('is a sample limit of');
  });
  it('says what is missing or already there', () => {
    expect(relationTypeProblems({ type: '', category: '' }, [], categories)).toHaveLength(2);
    expect(relationTypeProblems({ type: 'relates', category: 'association' }, ['relates'], categories)[0]).toMatch(/already a relation/);
    expect(relationTypeProblems({ type: 'is <b>bold</b>', category: 'association' }, [], categories)[0]).toMatch(/lower-case words/);
  });
});

describe('withRelationTypes', () => {
  it('adds the template and the category entry as two inserted lines, keeping the file as it is', () => {
    const out = withRelationTypes(vocabulary, [{ type: 'is a sample limit of', category: 'derivation' }]);
    const parsed = JSON.parse(out);
    expect(parsed.edgeTemplates['is a sample limit of']).toBe('{s} is a sample limit of {t}.');
    expect(parsed.relationCategories.find((c: { key: string }) => c.key === 'derivation').types.at(-1)).toBe('is a sample limit of');
    // Only those two lines differ.
    const before = vocabulary.replace(/\r\n/g, '\n').split('\n');
    const after = out.replace(/\r\n/g, '\n').split('\n');
    expect(after.length).toBe(before.length + 1);
    expect(after.filter((l) => !before.includes(l))).toHaveLength(2);
  });
  it('leaves the file alone when nothing is new', () => {
    expect(withRelationTypes(vocabulary, [])).toBe(vocabulary);
  });
});
