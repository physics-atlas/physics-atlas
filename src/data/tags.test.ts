import { describe, expect, it } from 'vitest';
import { draftNode, draftProblems, newEditDraft, parseDraft } from '../community/draft';
import { nodeChanges } from '../community/proposals';
import { concepts } from './loadConcepts';
import { TAG_LAYERS, cleanTags, tagProblems, tagSuggestions } from './tags';
import type { GraphNode } from './types';

const sample = (tags: GraphNode['tags']): GraphNode =>
  ({ id: 'sample_x', label: 'Sample', type: 'property', attrs: { description: 'Sample.' }, ...(tags ? { tags } : {}) }) as GraphNode;

describe('concept tags, in two layers', () => {
  it('start from the vocabulary’s words, as in the layers’ table', () => {
    expect(TAG_LAYERS.map((l) => [l.key, l.suggested.length])).toEqual([
      ['semantic', 9],
      ['representation', 11],
    ]);
  });

  it('suggest a tag once some concept carries it, each word once whatever its capitals', () => {
    const before = tagSuggestions('semantic', []);
    expect(before).toContain('Kinematic');
    const after = tagSuggestions('semantic', [sample({ semantic: ['Relativistic', 'kinematic'] })]);
    expect(after).toContain('Relativistic');
    expect(after.filter((t) => t.toLowerCase() === 'kinematic')).toEqual(['Kinematic']);
    expect(tagSuggestions('representation', [sample({ semantic: ['Relativistic'] })])).not.toContain('Relativistic');
  });

  it('are free words, trimmed, each once, a few per layer', () => {
    expect(tagProblems({ semantic: ['Kinematic', 'Sample new tag'], representation: ['Vector'] })).toEqual([]);
    expect(tagProblems(undefined)).toEqual([]);
    expect(tagProblems({ semantic: [' Kinematic'] })).toHaveLength(1);
    expect(tagProblems({ semantic: ['Kinematic', 'kinematic'] })).toHaveLength(1);
    expect(tagProblems({ colour: ['Blue'] })).toHaveLength(1);
    expect(tagProblems({ semantic: 'Kinematic' })).toHaveLength(1);
    expect(cleanTags({ semantic: [' Kinematic ', 'kinematic', ''], representation: [] })).toEqual({ semantic: ['Kinematic'] });
    expect(cleanTags({ semantic: [], representation: [] })).toBeUndefined();
  });

  it('go through the editor: filled in from the concept, written back, shown as a change', () => {
    const node = { ...concepts.nodes.find((n) => n.type === 'property')!, tags: { semantic: ['Kinematic'] } } as GraphNode;
    const graph = { ...concepts, nodes: concepts.nodes.map((n) => (n.id === node.id ? node : n)) };
    const d = newEditDraft(node);
    expect(d.tags).toEqual({ semantic: ['Kinematic'], representation: [] });
    const edited = { ...d, tags: { semantic: ['Kinematic', 'Conserved'], representation: ['Vector'] } };
    const after = draftNode(edited, graph);
    expect(after.tags).toEqual({ semantic: ['Kinematic', 'Conserved'], representation: ['Vector'] });
    expect(nodeChanges(node, after).map((c) => c.field)).toEqual(['Role in physics', 'Represented as']);
    expect(draftProblems(edited, { confirmed: graph, drafts: [edited], proposals: [] })).toEqual([]);
    expect(draftNode({ ...d, tags: { semantic: [], representation: [] } }, graph).tags).toBeUndefined();
  });

  it('are empty in a draft kept from before they existed', () => {
    const { tags: _t, ...old } = newEditDraft(sample(undefined));
    void _t;
    expect(parseDraft(JSON.parse(JSON.stringify(old)))?.tags).toEqual({ semantic: [], representation: [] });
  });
});
