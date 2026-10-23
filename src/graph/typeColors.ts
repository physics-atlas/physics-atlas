import { NODE_TYPE_LABELS } from '../data/types';
import type { NodeType } from '../data/types';

// Validated 16-type palette, one hue family per legend group (TYPE_GROUPS):
// Knowledge cool (green → teal → blue, OKLCH hue 132–258), Research violet →
// pink (275–350), Learning warm (red → amber, 28–70). Each colour is the
// in-gamut OKLCH colour at its hue and lightness (0.51–0.63, alternating so
// neighbours in a family differ in lightness too) with 92% of the maximum
// chroma. All clear 3:1 on both surfaces (dark #070b14 / light #f3f5fa), the
// tightest being experiment 3.18 dark and phenomenon 3.19 light. Closest
// pairs (CIEDE2000, normal vision): theory/formalism 10.9 within a family,
// finding/formalism 18.3 across families. Sixteen hues in one lightness band
// cannot all be CVD-safe pairwise (e.g. dataset/model_regime 2.2 under
// deuteranopia) — every node carries a visible text label, the legend names
// every type and the card states the type in text; shape-per-type is the
// pathway (Decision 13).
export const TYPE_COLORS: Record<NodeType, string> = {
  physical_system: '#22984c',
  property: '#1b7e61',
  phenomenon: '#24998f',
  process: '#1d8089',
  model_regime: '#2494b3',
  theory: '#1a73a5',
  formalism: '#1f7bf5',
  equation: '#4b7817',
  method: '#b51d79',
  experiment: '#9c1fc3',
  dataset: '#d426bf',
  claim: '#995cf6',
  finding: '#4b45f3',
  learning_goal: '#e82724',
  resource: '#b97a20',
  misconception: '#a34d16',
};

export const TYPE_ORDER = Object.keys(NODE_TYPE_LABELS) as NodeType[];

const LEARNING_TYPES: NodeType[] = ['learning_goal', 'resource', 'misconception'];
const RESEARCH_TYPES: NodeType[] = ['claim', 'finding', 'experiment', 'dataset', 'method'];

/**
 * The legend's three families of types, each drawn in its own hue family
 * (TYPE_COLORS). Knowledge takes every other type, so a new vocabulary type
 * lands there — give it a green-to-blue colour.
 */
export const TYPE_GROUPS: { key: string; label: string; types: NodeType[] }[] = [
  { key: 'learning', label: 'Learning', types: LEARNING_TYPES },
  { key: 'research', label: 'Research', types: RESEARCH_TYPES },
  {
    key: 'knowledge',
    label: 'Knowledge',
    types: TYPE_ORDER.filter((t) => !LEARNING_TYPES.includes(t) && !RESEARCH_TYPES.includes(t)),
  },
];
