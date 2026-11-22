import { describe, expect, it } from 'vitest';
import { concepts } from '../data/loadConcepts';
import { anchorInMap, anchorKey, anchorLabel, newSince, parseAnchor, threadsOf } from './comments';
import type { MapComment } from './comments';
import { resolveMap } from './map';

const resolved = resolveMap({ id: 'sample', title: 'Sample', nodes: [], edges: [], refs: ['velocity_7r85', 'four_velocity'] }, concepts);
const comment = (id: string, createdAt: string, extra: Partial<MapComment> = {}): MapComment => ({
  id,
  threadId: null,
  anchor: 'map',
  author: 'ada',
  body: 'Sample.',
  createdAt,
  editedAt: null,
  resolvedAt: null,
  resolvedBy: null,
  ...extra,
});

describe('comment anchors (Phase 3)', () => {
  it('read and write the four kinds, and nothing else', () => {
    for (const a of ['map', 'node:velocity_7r85', 'edge:e_1', 'page:four_velocity:2']) expect(anchorKey(parseAnchor(a)!)).toBe(a);
    for (const a of ['', 'maps', 'node:', 'page:x', 'page:x:0', 'page:x:100', 'other:x', 'node:a:b']) expect(parseAnchor(a)).toBeNull();
  });

  it('name only what the map has, in words', () => {
    const edge = resolved.graph.edges[0];
    expect(edge).toBeDefined();
    expect(anchorInMap(parseAnchor('node:velocity_7r85')!, resolved)).toBe(true);
    expect(anchorInMap(parseAnchor(`edge:${edge.id}`)!, resolved)).toBe(true);
    expect(anchorInMap(parseAnchor('node:force_q27c')!, resolved)).toBe(false);
    expect(anchorLabel(parseAnchor('page:velocity_7r85:2'), resolved)).toBe('Velocity — page, depth 2');
    expect(anchorLabel(parseAnchor(`edge:${edge.id}`), resolved)).toMatch(/Velocity|Four-velocity/);
    expect(anchorLabel(parseAnchor('node:force_q27c'), resolved)).toMatch(/no longer on the map/);
    expect(anchorLabel(parseAnchor('map'), resolved)).toBe('The whole map');
  });
});

describe('comment threads', () => {
  const list = [
    comment('a', '2026-01-01T10:00:00Z'),
    comment('b', '2026-01-02T10:00:00Z'),
    comment('a2', '2026-01-03T10:00:00Z', { threadId: 'a', author: 'Bob' }),
    comment('a1', '2026-01-01T11:00:00Z', { threadId: 'a', author: null }),
  ];

  it('gather replies in order, the latest activity first', () => {
    expect(threadsOf(list).map((t) => [t.first.id, t.replies.map((r) => r.id)])).toEqual([
      ['a', ['a1', 'a2']],
      ['b', []],
    ]);
  });

  it('mark as new only what someone else wrote since the last visit', () => {
    expect(newSince(list, null, 'ada')).toEqual([]);
    expect(newSince(list, '2026-01-01T12:00:00Z', 'ADA').map((c) => c.id)).toEqual(['a2']);
    expect(newSince(list, '2026-01-01T10:30:00Z', 'bob').map((c) => c.id)).toEqual(['b', 'a1']);
  });
});
