import vocab from './conceptVocabulary.json';
import type { ConceptTags, GraphNode, TagLayer } from './types';

// A concept's tags, in two layers beside its kind (the first layer): what role it
// plays in physics, and how it's represented. A concept may carry several of each.
// The words are free: the vocabulary's own are suggested first, then every tag
// some concept already carries — so a new one joins the suggestions once a concept
// with it is on the map. Mirrored in scripts/validate-concepts.mjs — keep in sync.

export const TAG_LAYERS: { key: TagLayer; title: string; question: string; suggested: string[] }[] = (
  ['semantic', 'representation'] as const
).map((key) => ({ key, ...vocab.tagLayers[key] }));

// Long enough to qualify a tag: "Conserved quantity (under appropriate conditions)".
export const TAG_LIMITS = { length: 80, perLayer: 12 };

/** A tag as stored: trimmed, inner spaces single. */
export const cleanTag = (tag: string): string => tag.trim().replace(/\s+/g, ' ');

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

/** What's wrong with a concept's tags, in words — empty when they're fine. */
export function tagProblems(tags: unknown): string[] {
  if (tags === undefined) return [];
  if (!tags || typeof tags !== 'object' || Array.isArray(tags)) return ['tags must be { "semantic": [...], "representation": [...] }'];
  const out: string[] = [];
  for (const [layer, list] of Object.entries(tags)) {
    if (layer !== 'semantic' && layer !== 'representation') {
      out.push(`tags: unknown layer "${layer}" (semantic, representation)`);
      continue;
    }
    if (!Array.isArray(list) || list.some((t) => typeof t !== 'string')) {
      out.push(`tags.${layer} must be a list of words`);
      continue;
    }
    if (list.length > TAG_LIMITS.perLayer) out.push(`tags.${layer}: at most ${TAG_LIMITS.perLayer}`);
    for (const t of list as string[]) {
      if (!cleanTag(t) || cleanTag(t) !== t) out.push(`tags.${layer}: "${t}" must be trimmed, not empty`);
      if (t.length > TAG_LIMITS.length) out.push(`tags.${layer}: "${t}" is longer than ${TAG_LIMITS.length} characters`);
    }
    if (new Set((list as string[]).map((t) => t.toLowerCase())).size !== list.length) out.push(`tags.${layer} lists a tag twice`);
  }
  return out;
}

export const tagsOf = (n: GraphNode, layer: TagLayer): string[] => n.tags?.[layer] ?? [];

/**
 * The tags to suggest for a layer: the vocabulary's, then those concepts carry
 * (as they first appear), each once whatever its capitals, alphabetical.
 */
export function tagSuggestions(layer: TagLayer, nodes: Iterable<GraphNode>): string[] {
  const out: string[] = [];
  const add = (t: string) => {
    const c = cleanTag(t);
    if (c && !out.some((x) => same(x, c))) out.push(c);
  };
  for (const t of TAG_LAYERS.find((l) => l.key === layer)!.suggested) add(t);
  for (const n of nodes) for (const t of tagsOf(n, layer)) add(t);
  return out.sort((a, b) => a.localeCompare(b));
}

/** The tags as a concept carries them: only layers with any, or none at all. */
export function cleanTags(tags: { semantic: string[]; representation: string[] }): ConceptTags | undefined {
  const out: ConceptTags = {};
  for (const layer of ['semantic', 'representation'] as const) {
    const list: string[] = [];
    for (const t of tags[layer].map(cleanTag)) if (t && !list.some((x) => same(x, t))) list.push(t);
    if (list.length) out[layer] = list;
  }
  return Object.keys(out).length ? out : undefined;
}
