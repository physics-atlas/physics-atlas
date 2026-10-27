// A relation type the vocabulary doesn't have yet, proposed with the relation
// that needs it ("Other…" in the editor's relation picker). It travels in the
// same pull request: the proposal lists it with its category
// (Proposal.relationTypes) and the pull request adds it to
// conceptVocabulary.json — a sentence template and a place in its category,
// since every type has to fit one (Decision 37). Pure: shared by the editor,
// the proposal checks and the backend.
import type { ProposedRelationType } from './types';

/** The relation picker's "Other…" choice: not a type, a request for one. */
export const OTHER_RELATION = '(other)';

/** How a new relation reads between two concepts: lower-case words, e.g. "is a limit of". */
const PHRASE = /^[a-z][a-z' -]{0,46}[a-z]$/;

/** The phrase as the vocabulary keys it: trimmed, single spaces, lower case. */
export const relationPhrase = (raw: string) => raw.trim().replace(/\s+/g, ' ').toLowerCase();

/** What's wrong with a proposed relation type (empty: it can be added). */
export function relationTypeProblems(t: ProposedRelationType, known: Iterable<string>, categories: string[]): string[] {
  const out: string[] = [];
  const phrase = relationPhrase(t.type ?? '');
  if (!phrase) out.push('Write the new relation as it reads between the two concepts, e.g. "is a limit of".');
  else if (!PHRASE.test(phrase)) out.push(`"${t.type}": use lower-case words only (letters, spaces, hyphens), up to 48 characters.`);
  else if ([...known].includes(phrase)) out.push(`"${phrase}" is already a relation — choose it from the list.`);
  if (!categories.includes(t.category)) out.push(`Choose which kind of relation "${phrase || 'the new one'}" is.`);
  return out;
}

/**
 * conceptVocabulary.json with the new types added: each one's sentence
 * template ("{s} is a limit of {t}.") at the top of edgeTemplates, and the
 * type at the end of its category's list. The file's own layout is kept —
 * the lines are inserted, not the file rewritten — so the pull request shows
 * just the additions; if the layout isn't the expected one, the file is
 * written out whole instead.
 */
export function withRelationTypes(vocabulary: string, types: ProposedRelationType[]): string {
  if (!types.length) return vocabulary;
  const eol = vocabulary.includes('\r\n') ? '\r\n' : '\n';
  let text = vocabulary.replace(/\r\n/g, '\n');
  const parsed = JSON.parse(text) as {
    edgeTemplates: Record<string, string>;
    relationCategories: { key: string; types: string[] }[];
  };
  const fresh = types.filter((t) => !(t.type in parsed.edgeTemplates));
  const wanted = JSON.parse(text) as typeof parsed;
  wanted.edgeTemplates = { ...Object.fromEntries(fresh.map((t) => [t.type, `{s} ${t.type} {t}.`])), ...wanted.edgeTemplates };
  for (const t of fresh) wanted.relationCategories.find((c) => c.key === t.category)?.types.push(t.type);

  const templates = '"edgeTemplates": {\n';
  const at = text.indexOf(templates);
  let ok = at >= 0;
  if (ok) {
    const lines = fresh.map((t) => `    ${JSON.stringify(t.type)}: ${JSON.stringify(`{s} ${t.type} {t}.`)},\n`).join('');
    text = text.slice(0, at + templates.length) + lines + text.slice(at + templates.length);
    for (const t of fresh) {
      const line = new RegExp(`^(.*"key": ${JSON.stringify(t.category).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}.*"types": \\[[^\\]]*)\\]`, 'm');
      if (!line.test(text)) ok = false;
      else text = text.replace(line, (_, head: string) => `${head}, ${JSON.stringify(t.type)}]`);
    }
  }
  // The insertion must say exactly what the whole file would.
  try {
    if (ok && JSON.stringify(JSON.parse(text)) === JSON.stringify(wanted)) return text.replace(/\n/g, eol);
  } catch {
    // fall through to writing it whole
  }
  return (JSON.stringify(wanted, null, 2) + '\n').replace(/\n/g, eol);
}
