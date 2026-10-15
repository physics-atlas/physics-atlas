#!/usr/bin/env node
// Validates the concept graph from its source files, content/concepts/**
// (one file per node and edge, see scripts/lib/concept-files.mjs): file names
// match ids, schema shape, unique snake_case ids, node type/attrs shape per
// conceptVocabulary.json, domains from the controlled vocabulary, resolvable
// edges, and acyclicity of "strict prerequisite for" edges. Also surfaces the
// data-quality issues from docs/physics-atlas-migration-brief.md §3 as
// warnings (never auto-fixed): casing variants, open `review` items, orphan
// nodes/learning goals, and example-domain resource links.
// normalizeRelationship mirrors src/graph/concepts.ts — keep in sync.
// Run via `npm run validate`.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative, sep } from 'node:path';
import { findCycle } from './lib/find-cycle.mjs';
import { readConceptSources, unformattedFiles } from './lib/concept-files.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE_DIR = join(ROOT, 'content/concepts');
const VOCAB_PATH = join(ROOT, 'src/data/conceptVocabulary.json');

const SNAKE = /^[a-z0-9]+(_[a-z0-9]+)*$/;
const STRICT_PREREQ = 'strict prerequisite for';
const EXAMPLE_DOMAIN = /^https?:\/\/([^/]*\.)?example\.(com|org|net)(\/|$)/i;

const errors = [];
const warn = [];

const { graph: data, problems } = readConceptSources(SOURCE_DIR);
errors.push(...problems.map((p) => p.replaceAll(ROOT + sep, '')));
for (const path of unformattedFiles(SOURCE_DIR))
  warn.push(`${relative(ROOT, path)}: not in canonical formatting (2-space JSON) — it works, but diffs read best formatted`);

let vocab;
try {
  vocab = JSON.parse(readFileSync(VOCAB_PATH, 'utf8'));
} catch (e) {
  console.error(`✗ Cannot read/parse ${VOCAB_PATH}: ${e.message}`);
  process.exit(1);
}

const NODE_TYPES = Object.keys(vocab.nodeTypes ?? {});
const EDGE_TEMPLATES = vocab.edgeTemplates ?? {};
const MEDIA_TYPES = vocab.mediaTypes ?? [];
const EPISTEMIC_STATUSES = vocab.epistemicStatuses ?? [];
const DOMAINS = vocab.domains ?? [];

// Mirrors domainsOf() in src/graph/concepts.ts — keep in sync.
const domainsOf = (domain) => domain.split(' / ').map((d) => d.trim());
if (!Array.isArray(DOMAINS) || DOMAINS.some((d) => typeof d !== 'string' || !d.trim() || d.includes('/')))
  errors.push('conceptVocabulary.json "domains" must be a list of non-empty names without "/"');
else if (new Set(DOMAINS).size !== DOMAINS.length) errors.push('conceptVocabulary.json "domains" lists a domain twice');

const TYPE_DEFINITIONS = vocab.nodeTypeDefinitions ?? {};
for (const [type, def] of Object.entries(TYPE_DEFINITIONS)) {
  const where = `conceptVocabulary.json nodeTypeDefinitions.${type}`;
  if (!NODE_TYPES.includes(type)) errors.push(`${where}: "${type}" is not a node type in nodeTypes`);
  for (const key of ['term', 'definition'])
    if (typeof def?.[key] !== 'string' || !def[key].trim()) errors.push(`${where}: "${key}" must be a non-empty string`);
  for (const key of ['examples', 'distinctions'])
    if (!Array.isArray(def?.[key]) || def[key].some((v) => typeof v !== 'string'))
      errors.push(`${where}: "${key}" must be an array of strings`);
}
for (const type of NODE_TYPES)
  if (!(type in TYPE_DEFINITIONS))
    warn.push(`node type "${type}" has no entry in nodeTypeDefinitions — the legend says "not defined yet"`);

function normalizeRelationship(raw) {
  const key = String(raw).trim().replace(/\s+/g, ' ').toLowerCase();
  return key in EDGE_TEMPLATES ? key : null;
}

if (!Array.isArray(data.nodes)) {
  console.error('✗ Top-level "nodes" must be an array');
  process.exit(1);
}
if (!Array.isArray(data.edges)) {
  console.error('✗ Top-level "edges" must be an array');
  process.exit(1);
}
if (typeof data.version !== 'number') errors.push('top-level "version" must be a number');

const ALLOWED_ATTRS = {
  equation: ['description', 'equation', 'variables', 'conditions', 'representations', 'domain'],
  learning_goal: ['description'],
  resource: ['link', 'mediaType', 'estimatedMinutes', 'rating', 'reviewCount'],
};
const DEFAULT_ALLOWED_ATTRS = ['description', 'domain'];

function allowedAttrsFor(type) {
  return ALLOWED_ATTRS[type] ?? DEFAULT_ALLOWED_ATTRS;
}

function checkStringArray(where, key, value) {
  if (!Array.isArray(value) || value.some((v) => typeof v !== 'string'))
    errors.push(`${where}: attrs.${key} must be an array of strings`);
}

function checkNodeAttrs(where, node) {
  const attrs = node.attrs;
  if (!attrs || typeof attrs !== 'object' || Array.isArray(attrs)) {
    errors.push(`${where}: "attrs" must be an object`);
    return;
  }
  for (const key of Object.keys(attrs)) {
    if (!allowedAttrsFor(node.type).includes(key))
      warn.push(`${where}: unknown attrs key "${key}" for type "${node.type}"`);
  }

  if (node.type === 'resource') {
    if (typeof attrs.link !== 'string' || !/^https?:\/\//.test(attrs.link))
      errors.push(`${where}: attrs.link must be an http(s) url`);
    else if (EXAMPLE_DOMAIN.test(attrs.link))
      warn.push(`${where}: attrs.link "${attrs.link}" points at a reserved example domain`);
    if (typeof attrs.mediaType !== 'string' || !attrs.mediaType)
      errors.push(`${where}: missing "attrs.mediaType"`);
    else if (!MEDIA_TYPES.includes(attrs.mediaType))
      warn.push(`${where}: unknown mediaType "${attrs.mediaType}" — add it to conceptVocabulary.json if this is a new kind`);
    if (typeof attrs.estimatedMinutes !== 'number' || !Number.isFinite(attrs.estimatedMinutes))
      errors.push(`${where}: attrs.estimatedMinutes must be a number`);
    if (typeof attrs.rating !== 'number' || attrs.rating < 0 || attrs.rating > 5)
      errors.push(`${where}: attrs.rating must be a number in [0, 5]`);
    if (!Number.isInteger(attrs.reviewCount))
      errors.push(`${where}: attrs.reviewCount must be an integer`);
    return;
  }

  if (typeof attrs.description !== 'string' || !attrs.description.trim())
    errors.push(`${where}: attrs.description is required`);
  if (attrs.domain !== undefined && typeof attrs.domain !== 'string')
    errors.push(`${where}: attrs.domain must be a string`);
  else if (attrs.domain !== undefined)
    for (const d of domainsOf(attrs.domain))
      if (!DOMAINS.includes(d))
        errors.push(`${where}: unknown domain "${d}" — use one from conceptVocabulary.json "domains" (several: "A / B"), or add it there first`);

  if (node.type === 'equation') {
    if (typeof attrs.equation !== 'string' || !attrs.equation.trim())
      errors.push(`${where}: attrs.equation is required`);
    if (!Array.isArray(attrs.variables) || attrs.variables.some((v) => !v || typeof v.symbol !== 'string' || typeof v.meaning !== 'string'))
      errors.push(`${where}: attrs.variables must be an array of {symbol, meaning}`);
    checkStringArray(where, 'conditions', attrs.conditions);
    checkStringArray(where, 'representations', attrs.representations);
  }
}

const ids = new Set();
const byId = new Map();
for (const n of data.nodes) {
  const where = `node "${n.id ?? n.label ?? '<unnamed>'}"`;
  if (!n.id || typeof n.id !== 'string') errors.push(`${where}: missing string "id"`);
  else if (!SNAKE.test(n.id)) errors.push(`${where}: id must be snake_case`);
  else if (ids.has(n.id)) errors.push(`${where}: duplicate id`);
  else {
    ids.add(n.id);
    byId.set(n.id, n);
  }

  if (!n.label || typeof n.label !== 'string') errors.push(`${where}: missing "label"`);
  if (!n.type || typeof n.type !== 'string' || !NODE_TYPES.includes(n.type))
    errors.push(`${where}: type "${n.type}" not one of ${NODE_TYPES.join(', ')}`);
  else checkNodeAttrs(where, n);

  if (n.importance !== undefined && (!Number.isInteger(n.importance) || n.importance < 1 || n.importance > 5))
    errors.push(`${where}: importance must be an integer 1–5`);
  if (n.generality !== undefined && (!Number.isInteger(n.generality) || n.generality < 1 || n.generality > 5))
    errors.push(`${where}: generality must be an integer 1–5`);
  if (n.epistemicStatus !== undefined) {
    if (typeof n.epistemicStatus !== 'string' || !n.epistemicStatus.trim())
      errors.push(`${where}: epistemicStatus must be a non-empty string (delete the field if unknown)`);
    else if (!EPISTEMIC_STATUSES.includes(n.epistemicStatus))
      warn.push(`${where}: unknown epistemicStatus "${n.epistemicStatus}" — add it to conceptVocabulary.json if this is a new status`);
  }
  if (n.review !== undefined) warn.push(`${where}: open review — ${n.review}`);
}

const edgeIds = new Set();
const degree = new Map([...ids].map((id) => [id, 0]));
const casingByType = new Map();
const tripleSeen = new Set();
const strictPrereqsByNode = new Map([...ids].map((id) => [id, []]));

for (const e of data.edges) {
  const where = `edge "${e.id ?? '<unnamed>'}"`;
  if (!e.id || typeof e.id !== 'string') errors.push(`${where}: missing string "id"`);
  else if (edgeIds.has(e.id)) errors.push(`${where}: duplicate id`);
  else edgeIds.add(e.id);

  const sourceOk = typeof e.source === 'string' && ids.has(e.source);
  const targetOk = typeof e.target === 'string' && ids.has(e.target);
  if (!sourceOk) errors.push(`${where}: unknown source "${e.source}"`);
  if (!targetOk) errors.push(`${where}: unknown target "${e.target}"`);
  if (sourceOk && targetOk && e.source === e.target) errors.push(`${where}: self-loop (source === target)`);

  if (typeof e.relationship !== 'string' || !e.relationship.trim()) {
    errors.push(`${where}: missing "relationship"`);
  } else {
    const type = normalizeRelationship(e.relationship);
    if (!type) {
      errors.push(`${where}: unknown edge type "${e.relationship}" — add it to conceptVocabulary.json first`);
    } else {
      if (sourceOk) degree.set(e.source, degree.get(e.source) + 1);
      if (targetOk) degree.set(e.target, degree.get(e.target) + 1);

      const variants = casingByType.get(type) ?? new Map();
      variants.set(e.relationship, (variants.get(e.relationship) ?? 0) + 1);
      casingByType.set(type, variants);

      if (sourceOk && targetOk) {
        const triple = `${e.source}\u0000${e.target}\u0000${type}`;
        if (tripleSeen.has(triple)) warn.push(`${where}: duplicate (source, target, type) — "${e.source}" → "${e.target}" as "${type}" already exists`);
        else tripleSeen.add(triple);

        if (type === STRICT_PREREQ) strictPrereqsByNode.get(e.target)?.push(e.source);
      }
    }
  }

  if (e.conditions !== undefined) {
    if (!Array.isArray(e.conditions) || e.conditions.length === 0)
      errors.push(`${where}: conditions must be a non-empty array (delete the field if there are none)`);
    else
      e.conditions.forEach((c, i) => {
        if (!c || typeof c.label !== 'string' || !c.label.trim())
          errors.push(`${where}: conditions[${i}].label must be a non-empty string`);
        if (c?.description !== undefined && typeof c.description !== 'string')
          errors.push(`${where}: conditions[${i}].description must be a string`);
      });
  }
  if (e.review !== undefined) warn.push(`${where}: open review — ${e.review}`);
}

for (const [type, variants] of casingByType) {
  if (variants.size > 1) {
    const list = [...variants].map(([raw, count]) => `"${raw}" (${count}×)`).join(', ');
    warn.push(`relationship "${type}" authored in multiple casings: ${list} — same edge type once normalized`);
  }
}

for (const id of ids) {
  if (degree.get(id) === 0) warn.push(`node "${id}" has no edges`);
}
for (const n of data.nodes) {
  if (n.type === 'learning_goal' && ids.has(n.id) && (strictPrereqsByNode.get(n.id) ?? []).length === 0)
    warn.push(`learning goal "${n.id}" has no incoming strict prerequisite`);
}

if (errors.length === 0) {
  const stuck = findCycle(strictPrereqsByNode);
  if (stuck.length) errors.push(`cycle among "strict prerequisite for" edges involving: ${stuck.join(', ')}`);
}

const noImportance = data.nodes.filter((n) => n.importance === undefined).length;
if (noImportance)
  warn.push(`${noImportance} of ${data.nodes.length} nodes have no importance yet — size and zoom visibility fall back to generality, then connection count`);
const noStatus = data.nodes.filter((n) => n.epistemicStatus === undefined).length;
warn.push(`${noStatus} of ${data.nodes.length} nodes have no epistemicStatus yet — the card shows "To-do"`);

for (const w of warn) console.log(`⚠ ${w}`);
if (errors.length) {
  for (const e of errors) console.error(`✗ ${e}`);
  console.error(`\n${errors.length} error(s) in concepts.json`);
  process.exit(1);
}

const usedNodeTypes = new Set(data.nodes.map((n) => n.type)).size;
const usedEdgeTypes = casingByType.size;
console.log(
  `✓ content/concepts valid — ${data.nodes.length} nodes (${usedNodeTypes} types), ${data.edges.length} edges (${usedEdgeTypes} types), strict prerequisites acyclic`,
);
