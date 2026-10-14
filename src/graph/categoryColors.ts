import type { Topic, TopicCategory } from '../data/types';

// Validated categorical palette (dataviz six-checks, dark surface #070b14,
// light surface #f3f5fa): all four ≥3:1 on both surfaces (field 5.78/3.12,
// method 5.34/3.38, math-concept 5.41/3.34, uncategorized 5.38/3.35). Worst
// adjacent CVD pair (Machado matrices, ΔE76 in Lab) is Protanopie
// field/method at 14.4 — every node also carries a visible label, so color
// never encodes alone. The neutral is a mid grey (#7a86a0, a node fill —
// not text), not a darker one: it must stay clearly brighter than the 0.16
// opacity of the `dimmed` state, or "not yet categorized" would read as
// "disabled".
export const CATEGORY_COLORS: Record<TopicCategory | 'uncategorized', string> = {
  field: '#199e70',
  method: '#e2574c',
  'math-concept': '#3987e5',
  uncategorized: '#7a86a0',
};

export const CATEGORY_LABELS: Record<TopicCategory | 'uncategorized', string> = {
  'math-concept': 'Mathematical concept',
  method: 'Method & formalism',
  field: 'Field (physics domain)',
  uncategorized: 'Not yet categorized',
};

export const CATEGORY_ORDER: (TopicCategory | 'uncategorized')[] = [
  'math-concept',
  'method',
  'field',
  'uncategorized',
];

/** A topic's category, falling back to the neutral render state when Sophie
 *  hasn't classified it yet. The one place that fallback rule lives. */
export const categoryOf = (t: Pick<Topic, 'category'>): TopicCategory | 'uncategorized' =>
  t.category ?? 'uncategorized';
