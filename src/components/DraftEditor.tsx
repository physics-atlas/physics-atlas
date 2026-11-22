import { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { CONCEPT_DOMAINS, EDGE_SENTENCE_TEMPLATES, NODE_TYPE_DEFINITIONS, NODE_TYPE_LABELS, RELATION_CATEGORIES } from '../data/types';
import type { EdgeType, EquationVariable, GraphEdge, GraphNode, NodeType } from '../data/types';
import { figureUrl } from '../data/media';
import vocabularyText from '../data/conceptVocabulary.json?raw';
import { FIGURE_MAX_SIDE, FIGURE_TYPES, MAX_FIGURES } from '../community/figures';
import { OTHER_RELATION } from '../community/relationTypes';
import { prepareImage } from '../lib/prepareImage';
import {
  EVIDENCE_LABELS,
  MEDIA_TYPES,
  PROPOSABLE_TYPES,
  draftDependencies,
  draftProblems,
  draftShape,
  exportFiles,
  isDraftRef,
  mapId,
  proposalId,
  proposalTitle,
  pullRequestText,
  removedFiles,
} from '../community/draft';
import type {
  Draft,
  DraftAssumption,
  DraftFigure,
  DraftContext,
  DraftField,
  DraftRelation,
  DraftRepresentation,
  ExportFile,
} from '../community/draft';
import type { Evidence, EvidenceKind } from '../community/types';
import type { SignedInUser, SubmitResult } from '../community/api';
import { edgeConflicts } from '../graph/conflicts';
import type { EdgeConflict, LabelMatch } from '../graph/conflicts';
import { GENERALITY_MAX, IMPORTANCE_MAX, normalizeRelationship, sentenceParts } from '../graph/concepts';
import type { ConceptIndex, ConceptMap } from '../graph/concepts';
import { FUN_TYPES } from '../graph/typeColors';
import { CONCEPT_CARD_TITLE_ID } from './ConceptCard';
import RelationPicker from './RelationPicker';
import { fittingRelation, relationRule } from '../community/relationRules';
import RelationSentence from './RelationSentence';
import RichText, { MathText } from './RichText';
import SearchBox from './SearchBox';
import type { SearchEntry } from './SearchBox';
import TypeBadge from './TypeBadge';
import { pageMathProblems } from '../lib/pageMaths';
import { equationSymbols, symbolKey } from '../lib/equationSymbols';

interface DraftEditorProps {
  /** The draft the form shows */
  draft: Draft;
  update: (change: (d: Draft) => Draft) => void;
  /** The confirmed graph, every draft, and other people's open proposals */
  ctx: DraftContext;
  index: ConceptIndex;
  /** Everything a draft can name, by its id on the map: confirmed, proposed, drafts */
  byMapId: ConceptMap;
  onSwitch: (suffix: string) => void;
  /** Starts another new-concept draft */
  onAddConcept: () => void;
  /** Existing concepts named like the draft */
  similar: LabelMatch[];
  /** Concepts offered as connections, and whether they're the ones nearest the ghost on the map */
  suggestions: { ids: string[]; from: 'map' | 'connections' };
  searchEntries: SearchEntry[];
  /** Fun mode: the Fluff type is on offer too */
  fun?: boolean;
  /** Adds a relation from the draft's concept to another one */
  onConnect: (id: string) => void;
  /** Moves the ghost into the middle of the map view */
  onRecall: () => void;
  /** Shows an existing concept on the map */
  onShow: (id: string) => void;
  onClose: () => void;
  onDiscard: () => void;
  /** What just happened on the map, for the live region ("Connected to …") */
  status: string;
  /** Submitting as a pull request (Phase 3) — null where the site isn't connected to GitHub */
  submission: {
    user: SignedInUser | null;
    invited: boolean;
    /** May publish directly: the pull request is merged at once (Decision 43) */
    canPublish: boolean;
    loginHref: string;
    onSubmit: (publish: boolean) => Promise<SubmitResult>;
  } | null;
  /** Opens a concept's atlas page with its page editor (Decision 49) */
  onEditPage?: (conceptId: string) => void;
  /**
   * Inside a personal map (Decision 50, Phase 2): the draft is saved into the map
   * instead of proposed to the atlas — no review, no evidence, no files.
   */
  mapSave?: MapSave;
}

export interface MapSave {
  /** Relations the map holds itself: the only ones an edit may remove (the atlas's come with its concepts) */
  removable: Set<string>;
  onSave: () => Promise<{ ok: true } | { ok: false; error: string; problems?: string[] }>;
}

const RELATION_TYPES = Object.keys(EDGE_SENTENCE_TEMPLATES) as EdgeType[];
const EVIDENCE_KINDS = Object.keys(EVIDENCE_LABELS) as EvidenceKind[];
const EVIDENCE_PLACEHOLDERS: Record<EvidenceKind, string> = {
  arxiv: '2101.01234',
  doi: '10.1103/PhysRevD.…',
  url: 'https://…',
  equation: 'E = mc^2',
};

const plain = (e: GraphEdge, byId: ConceptMap) =>
  sentenceParts(e, byId)
    .map((part) => (typeof part === 'string' ? part : part.label))
    .join('');

function conflictText(c: EdgeConflict, byId: ConceptMap): string {
  switch (c.kind) {
    case 'self':
      return "A concept can't relate to itself.";
    case 'duplicate':
      return c.source.in === 'draft'
        ? 'You already added this relation above.'
        : c.source.in === 'proposal'
          ? `The open proposal “${c.source.title}” already adds this relation.`
          : 'This relation is already on the map.';
    case 'reversed':
      return `${c.source.in === 'proposal' ? `The open proposal “${c.source.title}” says` : 'The map already says'} the opposite: “${plain(c.existing, byId)}”`;
    case 'cycle':
      return `Strict prerequisites would go round in a loop: ${[...c.path, c.path[0]]
        .map((id) => byId.get(id)?.label ?? id)
        .join(' → ')}.`;
  }
}

function download(file: ExportFile) {
  const body =
    file.encoding === 'base64' ? Uint8Array.from(atob(file.content), (c) => c.charCodeAt(0)) : file.content;
  const url = URL.createObjectURL(new Blob([body], { type: file.encoding === 'base64' ? 'application/octet-stream' : 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = file.path.slice(file.path.lastIndexOf('/') + 1);
  a.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * The proposal editor's form: everything the canvas does (connect, see what's
 * nearby, spot a duplicate) also works from here by keyboard. Loaded lazily
 * with KaTeX, only in community mode.
 */
export default function DraftEditor({
  draft,
  update,
  ctx,
  index,
  byMapId,
  onSwitch,
  onAddConcept,
  similar,
  suggestions,
  searchEntries,
  fun = false,
  onConnect,
  onRecall,
  onShow,
  onClose,
  onDiscard,
  status,
  submission,
  onEditPage,
  mapSave,
}: DraftEditorProps) {
  const uid = useId();
  const fieldId = (f: DraftField | string) => `${uid}-${f}`;
  const [note, setNote] = useState('');
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [pairFrom, setPairFrom] = useState<string | null>(null);
  /** What is being sent: a pull request for review, or one merged at once */
  const [sending, setSending] = useState<'review' | 'publish' | null>(null);
  const [sendError, setSendError] = useState<{ error: string; problems?: string[] } | null>(null);
  const exportRef = useRef<HTMLElement>(null);

  const shape = useMemo(() => draftShape(draft, ctx), [draft, ctx]);
  const own = mapId(draft);
  const byId = byMapId;
  // The draft's own checks, and — with KaTeX, which only this editor loads —
  // whether each page depth's maths typesets, as the build will check.
  const problems = useMemo(
    () => [
      ...draftProblems(draft, ctx),
      ...(draft.page ?? []).flatMap((source, index) =>
        pageMathProblems(source).map((message) => ({ field: 'page' as const, index, message: `Depth ${index + 1}: ${message}` })),
      ),
    ],
    [draft, ctx],
  );
  // What an assumption can point to: confirmed concepts, not itself, not ones already pointed to.
  const confirmedEntries = useMemo(() => {
    const confirmed = new Set(ctx.confirmed.nodes.map((n) => n.id));
    return searchEntries.filter((e) => confirmed.has(e.ref));
  }, [searchEntries, ctx.confirmed]);
  const assumableEntries = useMemo(() => {
    const confirmed = new Set(ctx.confirmed.nodes.map((n) => n.id));
    const linked = new Set(draft.assumes.flatMap((a) => (a.concept ? [a.concept] : [])));
    return searchEntries.filter((e) => confirmed.has(e.ref) && e.ref !== draft.editOf && !linked.has(e.ref));
  }, [searchEntries, ctx.confirmed, draft.editOf, draft.assumes]);
  const deps = useMemo(() => draftDependencies(draft, ctx), [draft, ctx]);
  // What this draft's relations are checked against: other proposals, and your other drafts.
  const otherRelations = useMemo(
    () => [
      ...ctx.proposals.flatMap((p) => p.edges.map((edge) => ({ edge, title: p.title }))),
      ...ctx.drafts
        .filter((d) => d.suffix !== draft.suffix)
        .flatMap((d) => draftShape(d, ctx).edges.map((edge) => ({ edge, title: `your draft “${proposalTitle(d)}”` }))),
    ],
    [ctx, draft.suffix],
  );
  // A relation the edit removes no longer counts as being on the map.
  const keptEdges = useMemo(
    () => ctx.confirmed.edges.filter((e) => !draft.removals.includes(e.id)),
    [ctx.confirmed.edges, draft.removals],
  );
  const original = draft.editOf ? index.byId.get(draft.editOf) : undefined;
  const existing = draft.editOf
    ? [...(index.outgoing.get(draft.editOf) ?? []), ...(index.incoming.get(draft.editOf) ?? [])]
    : [];
  const name = (shape.ghost ?? shape.subject)?.label ?? draft.label;
  const definition = draft.type ? NODE_TYPE_DEFINITIONS[draft.type] : undefined;
  const offered = suggestions.ids.filter((id) => byId.has(id)).slice(0, 4);
  /** The open proposal or draft a not-yet-accepted concept belongs to. */
  const pendingTitle = (id: string) =>
    isDraftRef(id)
      ? proposalTitle(ctx.drafts.find((d) => `@draft:${d.suffix}` === id) ?? draft)
      : ctx.proposals.find((p) => p.nodes.some((n) => n.id === id))?.title;
  // Drafts this one depends on that aren't submitted yet: they go first.
  const unsubmitted = deps.filter((x) => ctx.drafts.some((d) => d.suffix !== draft.suffix && proposalId(d) === x.id));
  const send = async (publish: boolean) => {
    if (!submission) return;
    setSending(publish ? 'publish' : 'review');
    setSendError(null);
    const result = await submission.onSubmit(publish);
    setSending(null);
    if (!result.ok) {
      setSendError({ error: result.error, problems: result.problems });
      setNote(`Not submitted: ${result.error}`);
    }
  };
  const [saving, setSaving] = useState(false);
  const saveToMap = async () => {
    if (!mapSave) return;
    setSaving(true);
    setSendError(null);
    const result = await mapSave.onSave();
    setSaving(false);
    if (!result.ok) {
      setSendError({ error: result.error, problems: result.problems });
      setNote(`Not saved: ${result.error}`);
    }
  };
  const dependents = ctx.drafts.filter((d) =>
    d.relations.some((r) => r.source === `@draft:${draft.suffix}` || r.target === `@draft:${draft.suffix}`),
  ).length;

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => update((d) => ({ ...d, [key]: value }));
  const setRelation = (key: string, change: (r: DraftRelation) => DraftRelation) =>
    update((d) => ({ ...d, relations: d.relations.map((r) => (r.key === key ? change(r) : r)) }));
  const setEvidence = (i: number, change: Partial<Evidence>) =>
    update((d) => ({ ...d, evidence: d.evidence.map((e, j) => (j === i ? { ...e, ...change } : e)) }));
  const addPair = (target: string) => {
    if (!pairFrom) return;
    const key = `r${Date.now().toString(36)}`;
    update((d) => ({
      ...d,
      relations: [...d.relations, { key, ...fittingRelation(pairFrom, byId.get(pairFrom)?.type, target, byId.get(target)?.type) }],
    }));
    setPairFrom(null);
    setNote(`Added a relation between ${byId.get(pairFrom)?.label} and ${byId.get(target)?.label}.`);
  };
  const focusField = (field: DraftField, i?: number) =>
    document.getElementById(fieldId(i === undefined ? field : `${field}-${i}`))?.focus();
  const copy = async (text: string, what: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setNote(`Copied the ${what}.`);
    } catch {
      setNote(`Couldn't copy — select the ${what} under “Show the files” instead.`);
    }
  };
  const files = problems.length ? [] : exportFiles(draft, ctx, vocabularyText);
  const deletions = problems.length ? [] : removedFiles(draft, ctx.confirmed);
  const prText = problems.length ? '' : pullRequestText(draft, ctx);

  return (
    <div className="draft-editor">
      <p className="proposal-status proposal-status-draft">
        {mapSave ? 'Draft · not on the map yet · kept in this browser' : 'Draft · not submitted · saved in this browser'}
      </p>
      <nav className="draft-switcher" aria-label="Your drafts">
        <p className="draft-label">{mapSave ? 'Your drafts for this map — each one is saved on its own' : 'Your drafts — each one is its own proposal'}</p>
        <ul className="draft-switcher-list">
          {ctx.drafts.map((d) => {
            const current = d.suffix === draft.suffix;
            return (
              <li key={d.suffix}>
                <button
                  type="button"
                  className="draft-chip"
                  aria-current={current ? 'true' : undefined}
                  onClick={() => onSwitch(d.suffix)}
                >
                  {d.editOf ? '✎ ' : ''}
                  {d.label.trim() || 'New concept'}
                  {current && <span className="draft-chip-note"> · open</span>}
                </button>
              </li>
            );
          })}
          <li>
            <button type="button" className="draft-chip draft-chip-add" onClick={onAddConcept}>
              <span aria-hidden>＋ </span>Another concept
            </button>
          </li>
        </ul>
      </nav>
      <h2 className="map-card-title" id={CONCEPT_CARD_TITLE_ID}>
        {mapSave ? (original ? `Edit: ${original.label}` : 'New concept for this map') : original ? `Propose an edit: ${original.label}` : 'Propose a concept'}
      </h2>
      {mapSave ? (
        <p className="draft-intro">
          {original
            ? 'The form is filled in from the concept. Change what should change, add relations, or remove ones that are wrong; the concept on the map previews your edit. Saving changes it for everyone on the map.'
            : 'Drag the dashed concept on the map to see where it fits — the concepts nearest it are offered as connections, and clicking any concept on the map connects it. Everything can also be done with this form alone. Where you put it is only a sketch. Saving adds it to the map for everyone on it.'}
        </p>
      ) : original ? (
        <p className="draft-intro">
          The form is filled in from the concept. Change what should change, add relations, or propose removing ones
          that are wrong; the concept on the map previews your edit. It's one proposal, reviewed on its own.
        </p>
      ) : (
        <p className="draft-intro">
          Drag the dashed concept on the map to see where it fits — the concepts nearest it are offered as
          connections, and clicking any concept on the map connects it. Everything can also be done with this form
          alone. Where you put it on the map is only a sketch: it isn't saved with the proposal. You can start several
          concepts and connect them to each other; each one is still its own proposal.
        </p>
      )}
      <p className="draft-status" role="status" aria-live="polite">
        {note || status}
      </p>

      <section className="rel-block draft-section" aria-labelledby={fieldId('h-concept')}>
        <h3 className="block-heading" id={fieldId('h-concept')}>
          The concept
        </h3>
        <Field id={fieldId('label')} label="Name">
          <input
            id={fieldId('label')}
            className="draft-input"
            value={draft.label}
            onChange={(e) => set('label', e.target.value)}
            autoComplete="off"
            aria-describedby={similar.length ? fieldId('similar') : undefined}
          />
        </Field>
        <div aria-live="polite">
          {similar.length > 0 && (
            <div className="draft-warning" id={fieldId('similar')}>
              <p>
                <span aria-hidden>≈ </span>Already on the map with a similar name — did you mean one of these?
              </p>
              <ul className="draft-similar">
                {similar.map((m) => (
                  <li key={m.node.id}>
                    <TypeBadge type={m.node.type} />
                    <strong>{m.node.label}</strong>{' '}
                    <span className="concept-via">
                      {m.reason}
                      {index.byId.has(m.node.id) ? '' : isDraftRef(m.node.id) ? ' · your draft' : ' · an open proposal'}
                    </span>{' '}
                    <button type="button" className="draft-link" onClick={() => onShow(m.node.id)}>
                      Show on map
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <Field id={fieldId('type')} label="Kind of concept">
          <select
            id={fieldId('type')}
            className="draft-input"
            value={draft.type}
            onChange={(e) => set('type', e.target.value as NodeType | '')}
            aria-describedby={definition ? fieldId('definition') : undefined}
          >
            <option value="">Choose…</option>
            {PROPOSABLE_TYPES.filter((t) => fun || !FUN_TYPES.includes(t) || t === draft.type).map((t) => (
              <option key={t} value={t}>
                {NODE_TYPE_LABELS[t]}
              </option>
            ))}
          </select>
        </Field>
        {draft.type && (
          <div className="draft-definition" id={fieldId('definition')}>
            <TypeBadge type={draft.type} />
            <p>
              <strong>{definition?.term ?? NODE_TYPE_LABELS[draft.type]}</strong>
              {definition ? ` — ${definition.plain ?? definition.definition}` : ' — not defined yet.'}
            </p>
            {definition?.plain && <p className="draft-hint">{definition.definition}</p>}
            {definition && definition.examples.length > 0 && (
              <p className="draft-hint">Examples: {definition.examples.join(', ')}</p>
            )}
          </div>
        )}

        <Field
          id={fieldId('description')}
          label="Description"
          hint={draft.type === 'resource' ? 'What it covers, and who it suits — a sentence or two.' : 'A sentence or two in plain words.'}
        >
          <textarea
            id={fieldId('description')}
            className="draft-input"
            rows={3}
            value={draft.description}
            onChange={(e) => set('description', e.target.value)}
            aria-describedby={fieldId('description-hint')}
          />
        </Field>

        {draft.type === 'equation' && <EquationFields part="required" draft={draft} update={update} fieldId={fieldId} />}
        {draft.type === 'resource' && <ResourceFields part="required" draft={draft} update={update} fieldId={fieldId} />}

      </section>

      {/* The kind's optional details stay beside its required fields (Decision 52). */}
      {(draft.type === 'equation' || draft.type === 'formalism' || draft.type === 'resource') && (
        <section className="rel-block draft-section" aria-labelledby={fieldId('h-more')}>
        <h3 className="block-heading" id={fieldId('h-more')}>
          {draft.type === 'equation' ? 'The equation in detail' : draft.type === 'formalism' ? 'Formulas' : 'Accessibility'} <span className="draft-optional">optional</span>
        </h3>
        {draft.type === 'equation' && <EquationFields part="optional" draft={draft} update={update} fieldId={fieldId} />}
        {draft.type === 'formalism' && <FormulaFields draft={draft} update={update} fieldId={fieldId} />}
        {draft.type === 'resource' && <ResourceFields part="optional" draft={draft} update={update} fieldId={fieldId} />}
      </section>
      )}

      <section className="rel-block draft-section" aria-labelledby={fieldId('h-relations')}>
        <h3 className="block-heading" id={fieldId('relations')} tabIndex={-1}>
          <span id={fieldId('h-relations')}>Connections</span>
          <span className="rel-count">{draft.relations.length}</span>
        </h3>

        {!draft.editOf && (
          <div className="draft-row-actions">
            <button type="button" className="draft-button" onClick={onRecall}>
              Bring the draft into view
            </button>
          </div>
        )}

        {draft.editOf && existing.length > 0 && (
          <div className="draft-existing">
            <p className="draft-label">Its relations now</p>
            <ul className="draft-existing-list">
              {existing.map((e) => {
                const removing = draft.removals.includes(e.id);
                const fixed = mapSave && !mapSave.removable.has(e.id);
                return (
                  <li key={e.id} className={removing ? 'draft-removing' : undefined}>
                    <span className="draft-sentence">
                      <RelationSentence edge={e} byId={byId} selfId={own} onPick={onShow} />
                    </span>
                    {removing && <span className="concept-via"> — {mapSave ? 'to be removed' : 'removal proposed'}</span>}{' '}
                    {fixed ? (
                      <span className="concept-via">· from the atlas</span>
                    ) : (
                    <button
                      type="button"
                      className="draft-button"
                      aria-pressed={removing}
                      onClick={() =>
                        update((d) => ({
                          ...d,
                          removals: removing ? d.removals.filter((x) => x !== e.id) : [...d.removals, e.id],
                        }))
                      }
                    >
                      {mapSave ? 'Remove' : 'Propose removing'}
                    </button>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {offered.length > 0 && (
          <div className="draft-suggestions">
            <p className="draft-label">
              {suggestions.from === 'map' ? 'Nearest on the map' : 'Near what you connected'}
            </p>
            <ul className="draft-suggestion-list">
              {offered.map((id) => {
                const n = byId.get(id)!;
                const pending = !index.byId.has(id);
                return (
                  <li key={id}>
                    <button type="button" className="draft-suggestion" onClick={() => onConnect(id)}>
                      <span aria-hidden>＋ </span>
                      <TypeBadge type={n.type} />
                      Connect to {n.label}
                      {pending && <span className="draft-chip-note"> (not accepted yet)</span>}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        <div className="draft-search">
          <SearchBox
            entries={searchEntries}
            onPick={onConnect}
            placeholder="Find a concept to connect…"
            label={`Connect ${name} to a concept`}
          />
        </div>

        {draft.relations.length === 0 && (
          <p className="concept-empty">{draft.editOf ? 'No new relations.' : 'No connections yet.'}</p>
        )}
        <ol className="draft-relations">
          {draft.relations.map((r, i) => {
            const edge = shape.edges.find((e) => e.id === `${own}|${draft.suffix}_e${i + 1}`);
            if (!edge)
              return (
                <li key={r.key} className="draft-relation">
                  <p className="draft-warning">
                    <span aria-hidden>⚠ </span>This relation pointed at a concept that's no longer proposed.
                  </p>
                  <div className="draft-row-actions">
                    <button
                      type="button"
                      className="draft-button"
                      onClick={() => update((d) => ({ ...d, relations: d.relations.filter((x) => x.key !== r.key) }))}
                    >
                      Remove
                    </button>
                  </div>
                </li>
              );
            const conflicts = edgeConflicts(edge, {
              confirmed: keptEdges,
              draft: shape.edges.filter((e) => Number(e.id.slice(e.id.lastIndexOf('_e') + 2)) <= i),
              proposals: otherRelations,
            });
            const from = byId.get(edge.source)?.label ?? edge.source;
            const to = byId.get(edge.target)?.label ?? edge.target;
            const type = normalizeRelationship(r.relationship) ?? 'relates';
            const kindOf = (x: string) => (x === own ? draft.type : byId.get(x)?.type);
            const rule = relationRule(kindOf(edge.source), kindOf(edge.target));
            const waitingOn = [edge.source, edge.target]
              .filter((x) => x !== own && !index.byId.has(x))
              .map(pendingTitle)
              .filter(Boolean);
            return (
              <li key={r.key} className="draft-relation">
                <p className="draft-sentence">
                  <RelationSentence edge={edge} byId={byId} selfId={own} onPick={onShow} />
                </p>
                {waitingOn.length > 0 && (
                  <p className="draft-hint">
                    Depends on “{waitingOn.join('”, “')}”, which isn't accepted yet. If it's rejected, this relation is
                    dropped.
                  </p>
                )}
                <Field id={fieldId(`relations-${i}`)} label="Relation" hint={rule?.why}>
                  <RelationPicker
                    id={fieldId(`relations-${i}`)}
                    value={r.newCategory !== undefined ? OTHER_RELATION : type}
                    types={rule ? rule.types : RELATION_TYPES}
                    allowOther={!rule}
                    describedBy={rule ? fieldId(`relations-${i}-hint`) : undefined}
                    from={from}
                    to={to}
                    onChange={(t) =>
                      setRelation(r.key, (x) =>
                        t === OTHER_RELATION
                          ? { ...x, relationship: '', newCategory: '' }
                          : { ...x, relationship: t, newCategory: undefined },
                      )
                    }
                  />
                </Field>
                {r.newCategory !== undefined && (
                  <div className="draft-new-type">
                    <Field
                      id={fieldId(`rel-${r.key}-new`)}
                      label="The new relation"
                      hint={`How it reads between the two — “${from} … ${to}” — in lower case, e.g. “is a limit of”. It's proposed with this relation and joins the list once accepted.`}
                    >
                      <input
                        id={fieldId(`rel-${r.key}-new`)}
                        className="draft-input"
                        value={r.relationship}
                        onChange={(e) => setRelation(r.key, (x) => ({ ...x, relationship: e.target.value }))}
                        aria-describedby={fieldId(`rel-${r.key}-new-hint`)}
                        autoComplete="off"
                      />
                    </Field>
                    <Field
                      id={fieldId(`rel-${r.key}-kind`)}
                      label="Which kind of relation it is"
                      hint="Every relation belongs to one of these broader kinds; they group the filters and the relations on a page."
                    >
                      <select
                        id={fieldId(`rel-${r.key}-kind`)}
                        className="draft-input"
                        value={r.newCategory}
                        onChange={(e) => setRelation(r.key, (x) => ({ ...x, newCategory: e.target.value }))}
                        aria-describedby={fieldId(`rel-${r.key}-kind-hint`)}
                      >
                        <option value="">Choose…</option>
                        {RELATION_CATEGORIES.map((c) => (
                          <option key={c.key} value={c.key}>
                            {c.label} — {c.description}
                          </option>
                        ))}
                      </select>
                    </Field>
                  </div>
                )}
                {[edge.source, edge.target].some((x) => kindOf(x) === 'learning_goal') && (
                  <fieldset className="draft-variables">
                    <legend className="draft-label">
                      For this goal <span className="draft-optional">optional</span>
                    </legend>
                    <p className="draft-hint" id={fieldId(`rel-${r.key}-goal-hint`)}>
                      How central the learning goal is for the concept at the other end (importance), and how broad it is
                      there (generality), 1–10. A goal linked to two concepts can rate differently for each; its card
                      lists goals by importance.
                    </p>
                    {(['importance', 'generality'] as const).map((key) => (
                      <Field key={key} id={fieldId(`rel-${r.key}-${key}`)} label={key === 'importance' ? 'Importance, 1–10' : 'Generality, 1–10'}>
                        <input
                          id={fieldId(`rel-${r.key}-${key}`)}
                          className="draft-input draft-number"
                          type="number"
                          inputMode="numeric"
                          min={1}
                          max={10}
                          step={1}
                          value={r[key] ?? ''}
                          onChange={(e) =>
                            setRelation(r.key, (x) => ({ ...x, [key]: e.target.value === '' ? undefined : Number(e.target.value) }))
                          }
                          aria-describedby={fieldId(`rel-${r.key}-goal-hint`)}
                        />
                      </Field>
                    ))}
                  </fieldset>
                )}
                <details className="draft-relation-more" open={Boolean(r.assumes?.length)}>
                  <summary>Under the assumption of… — when the relation holds only then (optional)</summary>
                  <AssumptionRows
                    rows={r.assumes ?? []}
                    onChange={(assumes) => setRelation(r.key, (x) => ({ ...x, assumes }))}
                    idBase={fieldId(`rel-${r.key}-assumes`)}
                    legend="Under the assumption of"
                    hint={`What has to hold for “${from}” and “${to}” to be related this way — a limit, an approximation, a regime. It's about this relation only: what a concept always takes for granted goes in its own Assumes.`}
                    placeholder="Small velocities (v ≪ c)"
                    addLabel="Add an assumption"
                    searchLabel="Add a concept on the map it holds under"
                    concepts={ctx.confirmed.nodes}
                    entries={confirmedEntries}
                  />
                </details>
                <details className="draft-relation-more" open={Boolean(r.description || r.derivation)}>
                  <summary>How they connect — a description and a derivation (optional)</summary>
                  <Field
                    id={fieldId(`reldesc-${r.key}`)}
                    label="How they connect"
                    hint="A few sentences, shown on the relation's card. Markdown and $LaTeX$."
                    optional
                  >
                    <textarea
                      id={fieldId(`reldesc-${r.key}`)}
                      className="draft-input"
                      rows={3}
                      value={r.description ?? ''}
                      onChange={(e) => setRelation(r.key, (x) => ({ ...x, description: e.target.value }))}
                      aria-describedby={fieldId(`reldesc-${r.key}-hint`)}
                    />
                  </Field>
                  {r.description?.trim() && (
                    <div className="draft-preview" role="group" aria-label="Preview">
                      <RichText source={r.description} />
                    </div>
                  )}
                  <Field
                    id={fieldId(`relderiv-${r.key}`)}
                    label="Derivation"
                    hint="How one follows from the other, step by step. Markdown, $inline$ and $$display$$ LaTeX."
                    optional
                  >
                    <textarea
                      id={fieldId(`relderiv-${r.key}`)}
                      className="draft-input draft-mono"
                      rows={5}
                      value={r.derivation ?? ''}
                      onChange={(e) => setRelation(r.key, (x) => ({ ...x, derivation: e.target.value }))}
                      aria-describedby={fieldId(`relderiv-${r.key}-hint`)}
                      spellCheck={false}
                    />
                  </Field>
                  {r.derivation?.trim() && (
                    <div className="draft-preview" role="group" aria-label="Preview">
                      <RichText source={r.derivation} />
                    </div>
                  )}
                </details>
                <div className="draft-row-actions">
                  <button
                    type="button"
                    className="draft-button"
                    onClick={() => setRelation(r.key, (x) => ({ ...x, source: x.target, target: x.source }))}
                  >
                    Swap direction
                  </button>
                  <button
                    type="button"
                    className="draft-button"
                    onClick={() => {
                      update((d) => ({ ...d, relations: d.relations.filter((x) => x.key !== r.key) }));
                      setNote(`Removed the relation between ${from} and ${to}.`);
                    }}
                  >
                    Remove
                  </button>
                </div>
                {conflicts.map((c, k) => (
                  <p key={k} className="draft-warning">
                    <span aria-hidden>⚠ </span>
                    {conflictText(c, byId)}
                  </p>
                ))}
              </li>
            );
          })}
        </ol>

        <details className="draft-pair">
          <summary>Add a relation between two concepts already on the map</summary>
          {pairFrom ? (
            <>
              <p>
                From <strong>{byId.get(pairFrom)?.label}</strong>{' '}
                <button type="button" className="draft-link" onClick={() => setPairFrom(null)}>
                  Change
                </button>
              </p>
              <SearchBox entries={searchEntries} onPick={addPair} placeholder="…to which concept?" label="Relation to" />
            </>
          ) : (
            <SearchBox entries={searchEntries} onPick={setPairFrom} placeholder="From which concept?" label="Relation from" />
          )}
        </details>
      </section>

      <section className="rel-block draft-section" aria-labelledby={fieldId('h-scale')}>
        <h3 className="block-heading" id={fieldId('h-scale')}>
          Field and scale <span className="draft-optional">optional</span>
        </h3>
        {/* A resource has no field of physics of its own: what it helps understand does. */}
        {draft.type !== 'resource' && (
          <fieldset className="draft-domains">
            <legend className="draft-label">
              Field <span className="draft-optional">optional</span>
            </legend>
            {CONCEPT_DOMAINS.map((domain) => (
              <label key={domain} className="draft-check">
                <input
                  type="checkbox"
                  checked={draft.domains.includes(domain)}
                  onChange={(e) =>
                    set(
                      'domains',
                      e.target.checked
                        ? CONCEPT_DOMAINS.filter((d) => d === domain || draft.domains.includes(d))
                        : draft.domains.filter((d) => d !== domain),
                    )
                  }
                />
                {domain}
              </label>
            ))}
          </fieldset>
        )}

        <Field
          id={fieldId('generality')}
          label={`Generality, 1–${GENERALITY_MAX}`}
          hint={`How broad the idea is: 1 is very specific, ${GENERALITY_MAX} very general. On the map it sets the size of the circle, from small (1) to 40 times larger (${GENERALITY_MAX}) — watch your draft grow or shrink.`}
          optional
        >
          <input
            id={fieldId('generality')}
            className="draft-input draft-number"
            type="number"
            inputMode="numeric"
            min={1}
            max={GENERALITY_MAX}
            step={1}
            value={draft.generality ?? ''}
            onChange={(e) => set('generality', e.target.value === '' ? undefined : Number(e.target.value))}
            aria-describedby={fieldId('generality-hint')}
          />
        </Field>
        <Field
          id={fieldId('importance')}
          label={`Importance, 1–${IMPORTANCE_MAX}`}
          hint={`How much of a landmark it is. On the map it sets how close you have to zoom before it appears: ${IMPORTANCE_MAX} always shows, 8 shows on the whole map, and each step lower needs about a 1.5× closer look, so 1 only appears when you're right next to it.`}
          optional
        >
          <input
            id={fieldId('importance')}
            className="draft-input draft-number"
            type="number"
            inputMode="numeric"
            min={1}
            max={IMPORTANCE_MAX}
            step={1}
            value={draft.importance ?? ''}
            onChange={(e) => set('importance', e.target.value === '' ? undefined : Number(e.target.value))}
            aria-describedby={fieldId('importance-hint')}
          />
        </Field>
        <p className="draft-hint">Leave either empty and the curator sets it.</p>
      </section>

      <section className="rel-block draft-section" aria-labelledby={fieldId('h-assumes')}>
        <h3 className="block-heading" id={fieldId('h-assumes')}>
          What it assumes <span className="draft-optional">optional</span>
        </h3>
        <AssumptionFields
          draft={draft}
          update={update}
          fieldId={fieldId}
          concepts={ctx.confirmed.nodes}
          entries={assumableEntries}
        />
      </section>

      {!mapSave && (
        <section className="rel-block draft-section" aria-labelledby={fieldId('h-figures')}>
          <h3 className="block-heading" id={fieldId('h-figures')}>
            Pictures <span className="draft-optional">optional</span>
          </h3>
          <FigureFields draft={draft} update={update} fieldId={fieldId} />
        </section>
      )}

      <section className="rel-block draft-section" aria-labelledby={fieldId('h-page')}>
        <h3 className="block-heading" id={fieldId('h-page')}>
          Its page <span className="draft-optional">optional</span>
        </h3>
        <PageNote draft={draft} onEditPage={onEditPage} inMap={Boolean(mapSave)} />
      </section>

      {mapSave ? (
        <section className="rel-block draft-section" aria-labelledby={fieldId('h-save')}>
          <h3 className="block-heading" id={fieldId('h-save')}>
            Check and save
          </h3>
          {problems.length > 0 ? (
            <>
              <p>Before it can be saved:</p>
              <ul className="draft-problems">
                {problems.map((p, i) => (
                  <li key={i}>
                    {p.field === 'other' ? (
                      p.message
                    ) : (
                      <button type="button" className="draft-link" onClick={() => focusField(p.field, p.index)}>
                        {p.message}
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </>
          ) : deps.length > 0 ? (
            <p>
              Save {deps.map((x) => `“${x.title}”`).join(', ')} first: this one is connected to {deps.length === 1 ? 'it' : 'them'}.
            </p>
          ) : (
            <>
              <p>Ready. Saving puts it on the map for everyone on it; the map’s history records who saved it.</p>
              <div className="draft-row-actions">
                <button
                  type="button"
                  className="draft-button draft-button-primary"
                  onClick={() => void saveToMap()}
                  disabled={saving}
                  aria-disabled={saving}
                >
                  {saving ? 'Saving…' : original ? 'Save the changes' : 'Save to the map'}
                </button>
              </div>
            </>
          )}
          {sendError && (
            <div className="draft-warning" role="alert">
              <p>
                <span aria-hidden>⚠ </span>
                {sendError.error}
              </p>
              {sendError.problems && (
                <ul className="draft-problems">
                  {sendError.problems.map((p) => (
                    <li key={p}>{p}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </section>
      ) : (
      <>
      <section className="rel-block draft-section" aria-labelledby={fieldId('h-evidence')}>
        <h3 className="block-heading" id={fieldId('h-evidence')}>
          Source/Evidence <span className="rel-count">{draft.evidence.length}</span>{' '}
          <span className="draft-optional">optional</span>
        </h3>
        <ol className="draft-evidence">
          {draft.evidence.map((e, i) => (
            <li key={i} className="draft-relation">
              <Field id={fieldId(`kind-${i}`)} label={`Source ${i + 1}: kind`}>
                <select
                  id={fieldId(`kind-${i}`)}
                  className="draft-input"
                  value={e.kind}
                  onChange={(ev) => setEvidence(i, { kind: ev.target.value as EvidenceKind })}
                >
                  {EVIDENCE_KINDS.map((k) => (
                    <option key={k} value={k}>
                      {EVIDENCE_LABELS[k]}
                    </option>
                  ))}
                </select>
              </Field>
              <Field id={fieldId(`evidence-${i}`)} label={EVIDENCE_LABELS[e.kind]}>
                <input
                  id={fieldId(`evidence-${i}`)}
                  className={`draft-input ${e.kind === 'equation' ? 'draft-mono' : ''}`}
                  value={e.ref}
                  placeholder={EVIDENCE_PLACEHOLDERS[e.kind]}
                  onChange={(ev) => setEvidence(i, { ref: ev.target.value })}
                  autoComplete="off"
                  spellCheck={false}
                />
              </Field>
              {e.kind === 'equation' && e.ref.trim() && (
                <div className="draft-preview" role="group" aria-label="Preview">
                  <MathText tex={e.ref} display />
                </div>
              )}
              <Field id={fieldId(`note-${i}`)} label="Note" optional>
                <input
                  id={fieldId(`note-${i}`)}
                  className="draft-input"
                  value={e.note ?? ''}
                  onChange={(ev) => setEvidence(i, { note: ev.target.value })}
                />
              </Field>
              <div className="draft-row-actions">
                <button
                  type="button"
                  className="draft-button"
                  onClick={() => update((d) => ({ ...d, evidence: d.evidence.filter((_, j) => j !== i) }))}
                >
                  Remove source {i + 1}
                </button>
              </div>
            </li>
          ))}
        </ol>
        <button
          type="button"
          className="draft-button"
          onClick={() => update((d) => ({ ...d, evidence: [...d.evidence, { kind: 'arxiv', ref: '' }] }))}
        >
          Add a source or evidence
        </button>
      </section>

      <section className="rel-block draft-section" aria-labelledby={fieldId('h-author')}>
        <h3 className="block-heading" id={fieldId('h-author')}>
          About you <span className="draft-optional">optional</span>
        </h3>
        <Field id={fieldId('author')} label="Your name" hint="Shown with the proposal. Sign-in replaces this later." optional>
          <input
            id={fieldId('author')}
            className="draft-input"
            value={draft.author}
            onChange={(e) => set('author', e.target.value)}
            autoComplete="name"
            aria-describedby={fieldId('author-hint')}
          />
        </Field>
      </section>

      <section className="rel-block draft-section" ref={exportRef} aria-labelledby={fieldId('h-export')}>
        <h3 className="block-heading" id={fieldId('h-export')}>
          Check and export
        </h3>
        {deps.length > 0 && (
          <div className="draft-deps">
            <p>
              This proposal depends on {deps.length === 1 ? 'another proposal' : `${deps.length} other proposals`}:
            </p>
            <ul>
              {deps.map((x) => (
                <li key={x.id}>{x.title}</li>
              ))}
            </ul>
            <p className="draft-hint">
              Export and submit those too: they have to be accepted first. If one is rejected, the relations pointing
              at it are dropped from this proposal, and the rest of it stands.
            </p>
          </div>
        )}
        {problems.length > 0 ? (
          <>
            <p>Before it can be exported:</p>
            <ul className="draft-problems">
              {problems.map((p, i) => (
                <li key={i}>
                  {p.field === 'other' ? (
                    p.message
                  ) : (
                    <button type="button" className="draft-link" onClick={() => focusField(p.field, p.index)}>
                      {p.message}
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </>
        ) : (
          <>
            {submission && (
              <div className="draft-submit">
                {!submission.user ? (
                  <p>
                    Ready to submit.{' '}
                    <a className="draft-button draft-button-primary" href={submission.loginHref}>
                      Sign in with GitHub to submit
                    </a>
                  </p>
                ) : !submission.invited ? (
                  <p>
                    Ready — but <strong>@{submission.user.login}</strong> isn't on the invite list yet, so it can't be
                    submitted from here. Download the files below instead, or ask a curator to invite you.
                  </p>
                ) : unsubmitted.length > 0 ? (
                  <p>
                    Submit {unsubmitted.map((x) => `“${x.title}”`).join(', ')} first: this proposal depends on{' '}
                    {unsubmitted.length === 1 ? 'it' : 'them'}.
                  </p>
                ) : (
                  <>
                    <p>
                      Ready. Submitting opens a pull request for reviewers, as <strong>@{submission.user.login}</strong>
                      ; the draft then shows on the map as a proposal for everyone.
                    </p>
                    {submission.canPublish &&
                      (deps.length ? (
                        <p className="draft-hint">
                          It depends on open proposals, so it can't be published directly until they are merged.
                        </p>
                      ) : (
                        <p className="draft-hint">
                          You may also <strong>publish it now</strong>: the pull request is opened and merged at once,
                          and the map shows it after the site's next build, in a few minutes. The checks run after it's
                          merged; it can be reverted from its pull request.
                        </p>
                      ))}
                    <div className="draft-row-actions">
                      <button
                        type="button"
                        className="draft-button draft-button-primary"
                        onClick={() => void send(false)}
                        disabled={sending !== null}
                        aria-disabled={sending !== null}
                      >
                        {sending === 'review' ? 'Submitting…' : 'Submit as a pull request'}
                      </button>
                      {submission.canPublish && deps.length === 0 && (
                        <button
                          type="button"
                          className="draft-button"
                          onClick={() => void send(true)}
                          disabled={sending !== null}
                          aria-disabled={sending !== null}
                        >
                          {sending === 'publish' ? 'Publishing…' : 'Publish now'}
                        </button>
                      )}
                    </div>
                  </>
                )}
                {sendError && (
                  <div className="draft-warning" role="alert">
                    <p>
                      <span aria-hidden>⚠ </span>
                      {sendError.error}
                    </p>
                    {sendError.problems && (
                      <ul className="draft-problems">
                        {sendError.problems.map((p) => (
                          <li key={p}>{p}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
                <p className="draft-hint">Or do it by hand:</p>
              </div>
            )}
            <p>
              {submission ? 'Download' : 'Ready. Download'} the files and put each where its path says (most into{' '}
              <code>content/concepts/</code>)
              {draft.editOf ? '; the concept’s file replaces the old one' : ''}
              {deletions.length ? ', delete the files listed below' : ''}, run <code>npm run validate</code>, and open a
              pull request with the text below as its description.
            </p>
            {deletions.length > 0 && (
              <ul className="draft-deletions">
                {deletions.map((p) => (
                  <li key={p}>
                    Delete <code>{p}</code>
                  </li>
                ))}
              </ul>
            )}
            <div className="draft-row-actions">
              <button
                type="button"
                className="draft-button draft-button-primary"
                onClick={() => {
                  files.forEach((f, i) => window.setTimeout(() => download(f), i * 200));
                  setNote(`Downloading ${files.length} files.`);
                }}
              >
                Download the files ({files.length})
              </button>
              <button type="button" className="draft-button" onClick={() => void copy(prText, 'pull-request text')}>
                Copy pull-request text
              </button>
            </div>
            <details className="draft-files">
              <summary>Show the files</summary>
              {files.map((f) => (
                <div key={f.path}>
                  <p className="draft-label">{f.path}</p>
                  {f.encoding === 'base64' ? (
                    <p className="draft-hint">A picture ({Math.round((f.content.length * 0.75) / 1000)} kB).</p>
                  ) : (
                    <pre className="draft-code">{f.content}</pre>
                  )}
                </div>
              ))}
              <p className="draft-label">Pull-request text</p>
              <pre className="draft-code">{prText}</pre>
            </details>
          </>
        )}
      </section>
      </>
      )}

      <div className="map-card-cta draft-footer">
        <button type="button" className="draft-button" onClick={onClose}>
          Close — keep the drafts
        </button>
        {confirmDiscard ? (
          <span className="draft-confirm" role="group" aria-label="Discard this draft?">
            Discard “{proposalTitle(draft)}”?
            {dependents > 0 &&
              ` ${dependents === 1 ? 'One of your other drafts points' : `${dependents} of your other drafts point`} at it; those relations will be removed.`}{' '}
            <button type="button" className="draft-button draft-button-danger" onClick={onDiscard}>
              Discard
            </button>
            <button type="button" className="draft-button" onClick={() => setConfirmDiscard(false)}>
              Keep it
            </button>
          </span>
        ) : (
          <button type="button" className="draft-button" onClick={() => setConfirmDiscard(true)}>
            Discard this draft…
          </button>
        )}
      </div>
    </div>
  );
}

/** A formula input with its typeset preview underneath. */
function LatexInput({ id, value, onChange, placeholder }: { id: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <>
      <input
        id={id}
        className="draft-input draft-mono"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        autoComplete="off"
        spellCheck={false}
      />
      {value.trim() && (
        <div className="draft-preview" role="group" aria-label="Preview">
          <MathText tex={value} display />
        </div>
      )}
    </>
  );
}

/**
 * A formula's variables: one row each, symbol (LaTeX, previewed) and what it
 * stands for. `focusId` goes on the first input — or on "Add a variable" while
 * there are none — so a problem in the list can be jumped to. The symbols of
 * `equation` (lib/equationSymbols.ts) are offered: all at once ("Add the
 * equation's symbols"), as suggestions in each symbol field, and in a check of
 * which are described and which aren't in the equation.
 */
function VariableRows({
  variables,
  onChange,
  idBase,
  focusId,
  title,
  equation,
}: {
  variables: EquationVariable[];
  onChange: (vs: EquationVariable[]) => void;
  idBase: string;
  focusId: string;
  title: string;
  /** The formula these are the variables of (LaTeX) */
  equation: string;
}) {
  const setRow = (i: number, change: Partial<EquationVariable>) =>
    onChange(variables.map((v, j) => (j === i ? { ...v, ...change } : v)));
  const symbols = useMemo(() => equationSymbols(equation), [equation]);
  const described = new Set(variables.flatMap((v) => symbolKey(v.symbol) ?? []));
  const missing = symbols.filter((s) => !described.has(s));
  const listId = `${idBase}-symbols`;
  /** A row's symbol isn't one of the equation's (only said once the equation has symbols). */
  const elsewhere = (v: EquationVariable) => {
    if (!symbols.length || !v.symbol.trim()) return false;
    const key = symbolKey(v.symbol);
    return key === null || !symbols.includes(key);
  };
  return (
    <fieldset className="draft-variables">
      <legend className="draft-label">
        {title} <span className="draft-optional">optional</span>
      </legend>
      {missing.length > 0 && (
        <div className="draft-symbols" id={`${idBase}-missing`}>
          <p className="draft-hint">
            {variables.length ? 'In the equation, not described yet:' : 'The equation’s symbols:'}{' '}
            {missing.map((s, k) => (
              <span key={s}>
                {k > 0 && ', '}
                <MathText tex={s} />
              </span>
            ))}
          </p>
          <button
            type="button"
            className="draft-button"
            onClick={() => onChange([...variables.filter((v) => v.symbol.trim() || v.meaning.trim()), ...missing.map((symbol) => ({ symbol, meaning: '' }))])}
          >
            {missing.length === 1 ? 'Add it as a variable' : `Add these ${missing.length} as variables`}
          </button>
        </div>
      )}
      <datalist id={listId}>
        {missing.map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>
      {variables.length > 0 && (
        <ol className="draft-variable-list">
          {variables.map((v, i) => (
            <li key={i} className="draft-variable">
              <div className="draft-variable-field">
                <label className="draft-variable-label" htmlFor={i === 0 ? focusId : `${idBase}-${i}-symbol`}>
                  Symbol {i + 1} (LaTeX)
                </label>
                <input
                  id={i === 0 ? focusId : `${idBase}-${i}-symbol`}
                  className="draft-input draft-mono"
                  value={v.symbol}
                  placeholder={symbols[0] ?? 'G_{\\mu\\nu}'}
                  onChange={(e) => setRow(i, { symbol: e.target.value })}
                  list={missing.length ? listId : undefined}
                  autoComplete="off"
                  spellCheck={false}
                  aria-describedby={elsewhere(v) ? `${idBase}-${i}-elsewhere` : undefined}
                />
                {elsewhere(v) && (
                  <p className="draft-hint draft-variable-elsewhere" id={`${idBase}-${i}-elsewhere`}>
                    <span aria-hidden>⚠ </span>Not in the equation above.
                  </p>
                )}
              </div>
              <span className="draft-variable-preview" aria-hidden>
                {v.symbol.trim() && <MathText tex={v.symbol} />}
              </span>
              <div className="draft-variable-field draft-variable-meaning">
                <label className="draft-variable-label" htmlFor={`${idBase}-${i}-meaning`}>
                  Stands for
                </label>
                <input
                  id={`${idBase}-${i}-meaning`}
                  className="draft-input"
                  value={v.meaning}
                  placeholder="Einstein tensor (spacetime curvature)"
                  onChange={(e) => setRow(i, { meaning: e.target.value })}
                />
              </div>
              <div className="draft-variable-field draft-variable-meaning draft-variable-plain">
                <label className="draft-variable-label" htmlFor={`${idBase}-${i}-plain`}>
                  In plain words <span className="draft-optional">optional</span>
                </label>
                <input
                  id={`${idBase}-${i}-plain`}
                  className="draft-input"
                  value={v.plain ?? ''}
                  placeholder="How much spacetime bends at that point"
                  onChange={(e) => setRow(i, { plain: e.target.value })}
                />
              </div>
              <button
                type="button"
                className="draft-link draft-variable-remove"
                onClick={() => onChange(variables.filter((_, j) => j !== i))}
              >
                Remove<span className="visually-hidden"> symbol {i + 1}</span>
              </button>
            </li>
          ))}
        </ol>
      )}
      <button
        type="button"
        className="draft-button"
        id={variables.length ? undefined : focusId}
        onClick={() => onChange([...variables, { symbol: '', meaning: '' }])}
      >
        Add a variable
      </button>
    </fieldset>
  );
}

/**
 * A concept's page is written on its atlas page, not here (Decision 49): every
 * concept has one from the start, built from its card. This says where to
 * write it, and what of it this draft already carries (drafts from before).
 */
function PageNote({ draft, onEditPage, inMap = false }: { draft: Draft; onEditPage?: (conceptId: string) => void; inMap?: boolean }) {
  const written = (draft.page ?? []).filter((x) => x.trim()).length;
  return (
    <div className="draft-page-note">
      {written > 0 && (
        <p>
          This draft carries {written === 1 ? 'one depth' : `${written} depths`} of the concept's page, {inMap ? 'saved' : 'proposed'} with it.
        </p>
      )}
      {draft.editOf ? (
        <p>
          The concept's page — its definition, equation and connections, from the card — is there already. Write more of
          it on the page itself.{' '}
          {onEditPage && (
            <button type="button" className="draft-button" onClick={() => onEditPage(draft.editOf!)}>
              Edit its page
            </button>
          )}
        </p>
      ) : (
        <p>
          Every concept gets a page{inMap ? " in the map's pages" : ' in the atlas pages'}, built from this card. Once the concept is on the map, more of its
          page can be written there, with <strong>Edit this page</strong>.
        </p>
      )}
    </div>
  );
}

/**
 * Assumptions, one row each: a name, more detail if it helps, and — optionally
 * — the concept on the map it is. What a concept assumes, and what one of its
 * relations holds under, are both written this way.
 */
function AssumptionRows({
  rows,
  onChange,
  idBase,
  legend,
  hint,
  placeholder,
  addLabel,
  searchLabel,
  concepts,
  entries,
}: {
  rows: DraftAssumption[];
  onChange: (rows: DraftAssumption[]) => void;
  /** The ids: `${idBase}-${i}` for each row's name, `idBase` on "Add" while there are none */
  idBase: string;
  legend: string;
  hint: string;
  placeholder: string;
  addLabel: string;
  searchLabel: string;
  concepts: GraphNode[];
  entries: SearchEntry[];
}) {
  const setRow = (i: number, change: Partial<DraftAssumption>) => onChange(rows.map((x, j) => (j === i ? { ...x, ...change } : x)));
  const linkedIds = new Set(rows.flatMap((a) => (a.concept ? [a.concept] : [])));
  return (
    <fieldset className="draft-assumes">
      <legend className="draft-label">
        {legend} <span className="draft-optional">optional</span>
      </legend>
      <p className="draft-hint" id={`${idBase}-hint`}>
        {hint}
      </p>
      {rows.map((row, i) => {
        const linked = row.concept ? concepts.find((n) => n.id === row.concept) : undefined;
        return (
          <div key={i} className="draft-relation draft-assumption">
            <Field id={`${idBase}-${i}`} label={`Assumption ${i + 1}`} optional={Boolean(row.concept)}>
              <input
                id={`${idBase}-${i}`}
                className="draft-input"
                value={row.label}
                placeholder={linked?.label ?? placeholder}
                onChange={(e) => setRow(i, { label: e.target.value })}
              />
            </Field>
            <Field id={`${idBase}-detail-${i}`} label="In more detail" optional>
              <textarea
                id={`${idBase}-detail-${i}`}
                className="draft-input draft-textarea"
                rows={2}
                value={row.description}
                onChange={(e) => setRow(i, { description: e.target.value })}
              />
            </Field>
            {row.concept && (
              <p className="draft-assumption-link">
                Points to {linked && <TypeBadge type={linked.type} />}
                <strong>{linked?.label ?? row.concept}</strong>{' '}
                <button type="button" className="draft-link" onClick={() => setRow(i, { concept: undefined })}>
                  Unlink<span className="visually-hidden"> {linked?.label ?? row.concept}</span>
                </button>
              </p>
            )}
            <div className="draft-row-actions">
              <button type="button" className="draft-button" onClick={() => onChange(rows.filter((_, j) => j !== i))}>
                Remove assumption {i + 1}
              </button>
            </div>
          </div>
        );
      })}
      <button
        type="button"
        className="draft-button"
        id={rows.length ? undefined : idBase}
        onClick={() => onChange([...rows, { label: '', description: '' }])}
      >
        {addLabel}
      </button>
      <SearchBox
        entries={entries.filter((e) => !linkedIds.has(e.ref))}
        onPick={(id) => onChange([...rows, { label: '', description: '', concept: id }])}
        placeholder={`Or ${searchLabel.charAt(0).toLowerCase()}${searchLabel.slice(1)}…`}
        label={searchLabel}
      />
    </fieldset>
  );
}

/** What the concept itself takes for granted. */
function AssumptionFields({
  draft,
  update,
  fieldId,
  concepts,
  entries,
}: {
  draft: Draft;
  update: (change: (d: Draft) => Draft) => void;
  fieldId: (name: string) => string;
  concepts: GraphNode[];
  entries: SearchEntry[];
}) {
  return (
    <AssumptionRows
      rows={draft.assumes}
      onChange={(assumes) => update((d) => ({ ...d, assumes }))}
      idBase={fieldId('assumes')}
      legend="Assumes"
      hint="What this concept takes for granted — a limit, an approximation, a condition. Name each in a few words, with more detail if it helps. No line is drawn; they're listed on its card. One can also point to a concept on the map, which is then highlighted when this concept is selected. When only one of its relations holds under a condition, say it on that relation instead (under Connections)."
      placeholder="Weak gravitational field"
      addLabel="Add an assumption"
      searchLabel="Add a concept on the map it assumes"
      concepts={concepts}
      entries={entries}
    />
  );
}

/**
 * Pictures of the concept, on its card and page: each described for people
 * who can't see it, and credited. A new one is made ready in the browser
 * (lib/prepareImage.ts) and kept with the draft until it's proposed.
 */
function FigureFields({
  draft,
  update,
  fieldId,
}: {
  draft: Draft;
  update: (change: (d: Draft) => Draft) => void;
  fieldId: (name: string) => string;
}) {
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  // Describing a new picture comes next: focus goes there once its row is drawn.
  const [describe, setDescribe] = useState<number | null>(null);
  useEffect(() => {
    if (describe === null || describe >= draft.figures.length) return;
    document.getElementById(fieldId(`figures-${describe}`))?.focus();
    setDescribe(null);
  }, [describe, draft.figures.length, fieldId]);
  const setRow = (i: number, change: Partial<DraftFigure>) =>
    update((d) => ({ ...d, figures: d.figures.map((x, j) => (j === i ? { ...x, ...change } : x)) }));
  const add = async (file: File) => {
    setBusy(true);
    setProblem('');
    const ready = await prepareImage(file);
    setBusy(false);
    if ('problem' in ready) {
      setProblem(ready.problem);
      return;
    }
    setDescribe(draft.figures.length);
    update((d) => ({
      ...d,
      figures: [...d.figures, { key: `f${Date.now().toString(36)}`, data: ready.data, name: file.name, alt: '', caption: '', credit: '' }],
    }));
  };
  return (
    <fieldset className="draft-figures">
      <legend className="draft-label">
        Pictures <span className="draft-optional">optional</span>
      </legend>
      <p className="draft-hint" id={fieldId('figures-hint')}>
        Up to {MAX_FIGURES} PNG, JPEG, WebP or GIF pictures, shown on its card and page. Large ones are made smaller (to{' '}
        {FIGURE_MAX_SIDE} px). Each needs a description for people who can't see it, and where it's from with its
        licence: add only pictures that may be shared.
      </p>
      {draft.figures.map((f, i) => {
        const src = f.data ?? (f.file ? figureUrl(f.file) : undefined);
        return (
          <div key={f.key} className="draft-relation draft-figure">
            {src ? (
              <img className="draft-figure-preview" src={src} alt="" />
            ) : (
              <p className="concept-empty">
                {f.file ? 'Not on the site yet (it comes with an open proposal).' : "This picture isn't in this browser any more — remove it and add it again."}
              </p>
            )}
            <Field
              id={fieldId(`figures-${i}`)}
              label={`Picture ${i + 1}: what it shows`}
              hint="Read out in its place: what someone who can't see it needs to know from it."
            >
              <textarea
                id={fieldId(`figures-${i}`)}
                className="draft-input draft-textarea"
                rows={2}
                value={f.alt}
                onChange={(e) => setRow(i, { alt: e.target.value })}
                aria-describedby={fieldId(`figures-${i}-hint`)}
              />
            </Field>
            <Field id={fieldId(`figure-caption-${i}`)} label="Caption" hint="Shown under it. Markdown and $LaTeX$." optional>
              <input
                id={fieldId(`figure-caption-${i}`)}
                className="draft-input"
                value={f.caption}
                onChange={(e) => setRow(i, { caption: e.target.value })}
                aria-describedby={fieldId(`figure-caption-${i}-hint`)}
              />
            </Field>
            <Field
              id={fieldId(`figure-credit-${i}`)}
              label="Where it's from, and its licence"
              hint="E.g. “Own work, CC BY 4.0” or “NASA, public domain”."
            >
              <input
                id={fieldId(`figure-credit-${i}`)}
                className="draft-input"
                value={f.credit}
                onChange={(e) => setRow(i, { credit: e.target.value })}
                aria-describedby={fieldId(`figure-credit-${i}-hint`)}
              />
            </Field>
            <div className="draft-row-actions">
              <button
                type="button"
                className="draft-button"
                onClick={() => update((d) => ({ ...d, figures: d.figures.filter((_, j) => j !== i) }))}
              >
                Remove picture {i + 1}
              </button>
            </div>
          </div>
        );
      })}
      {draft.figures.length < MAX_FIGURES && (
        <>
          <button
            type="button"
            className="draft-button"
            id={fieldId('figures')}
            onClick={() => fileRef.current?.click()}
            disabled={busy}
            aria-describedby={fieldId('figures-hint')}
          >
            {busy ? 'Preparing the picture…' : 'Add a picture…'}
          </button>
          <input
            ref={fileRef}
            type="file"
            className="visually-hidden"
            accept={Object.values(FIGURE_TYPES).join(',')}
            tabIndex={-1}
            aria-hidden
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (file) void add(file);
            }}
          />
        </>
      )}
      {problem && (
        <p className="draft-warning" role="alert">
          <span aria-hidden>⚠ </span>
          {problem}
        </p>
      )}
    </fieldset>
  );
}

/**
 * An educational resource: where it is, what kind it is, and how long it
 * takes. Connect it with "helps understand" to what it teaches — that's how
 * it joins a learning path.
 */
function ResourceFields({
  part,
  draft,
  update,
  fieldId,
}: {
  part: 'required' | 'optional';
  draft: Draft;
  update: (change: (d: Draft) => Draft) => void;
  fieldId: (name: string) => string;
}) {
  if (part === 'optional')
    return (
      <Field
        id={fieldId('accessibility')}
        label="Accessibility"
        hint="Who it works for and who it doesn't: keyboard or other input, zoom, captions or a transcript, screen readers, colour. Markdown."
      >
        <textarea
          id={fieldId('accessibility')}
          className="draft-input"
          rows={4}
          value={draft.accessibility}
          placeholder={'- Works with the keyboard\n- Captions, no transcript'}
          onChange={(e) => update((d) => ({ ...d, accessibility: e.target.value }))}
          aria-describedby={fieldId('accessibility-hint')}
        />
      </Field>
    );
  return (
    <>
      <Field id={fieldId('link')} label="Link" hint="Where to find it: a web address starting with https://.">
        <input
          id={fieldId('link')}
          className="draft-input"
          type="url"
          inputMode="url"
          value={draft.link}
          placeholder="https://"
          onChange={(e) => update((d) => ({ ...d, link: e.target.value }))}
          aria-describedby={fieldId('link-hint')}
          autoComplete="off"
        />
      </Field>
      <Field id={fieldId('mediaType')} label="Kind of resource">
        <select
          id={fieldId('mediaType')}
          className="draft-input"
          value={draft.mediaType}
          onChange={(e) => update((d) => ({ ...d, mediaType: e.target.value }))}
        >
          <option value="">Choose…</option>
          {MEDIA_TYPES.map((m) => (
            <option key={m} value={m}>
              {MEDIA_TYPE_NAMES[m] ?? m}
            </option>
          ))}
        </select>
      </Field>
      {draft.mediaType === 'other' && (
        <Field id={fieldId('mediaTypeOther')} label="Which kind" hint="In a word or two: a podcast, a board game, a worksheet…">
          <input
            id={fieldId('mediaTypeOther')}
            className="draft-input"
            value={draft.mediaTypeOther}
            onChange={(e) => update((d) => ({ ...d, mediaTypeOther: e.target.value }))}
            aria-describedby={fieldId('mediaTypeOther-hint')}
            autoComplete="off"
          />
        </Field>
      )}
      <fieldset className="draft-variables">
        <legend className="draft-label">How long it takes</legend>
        <p className="draft-hint">
          Roughly, for a first time through — as you'd say it: “20 min”, “20–30 min”, “about 1 h”. Give at least one.
        </p>
        {(
          [
            ['estimatedTime', 'Time to work through it', '20–30 min'],
            ['readingTime', 'Reading time', '15 min'],
            ['listeningTime', 'Listening time', '45 min'],
          ] as const
        ).map(([key, label, placeholder]) => (
          <Field key={key} id={fieldId(key === 'estimatedTime' ? 'time' : key)} label={label} optional>
            <input
              id={fieldId(key === 'estimatedTime' ? 'time' : key)}
              className="draft-input"
              value={draft[key]}
              placeholder={placeholder}
              onChange={(e) => update((d) => ({ ...d, [key]: e.target.value }))}
              autoComplete="off"
            />
          </Field>
        ))}
      </fieldset>
      <p className="draft-hint">
        Connect it under Connections with <strong>helps understand</strong> to the concepts it teaches: that's how it
        appears on their learning paths.
      </p>
    </>
  );
}

/** How a kind of resource reads in the editor (conceptVocabulary.json "mediaTypes"). */
const MEDIA_TYPE_NAMES: Record<string, string> = { text: 'Text', video: 'Video', quiz: 'Quiz', other: 'Other' };

/** A mathematical formalism's formulas: how it works, each typeset, named and with its variables. */
function FormulaFields({
  draft,
  update,
  fieldId,
}: {
  draft: Draft;
  update: (change: (d: Draft) => Draft) => void;
  fieldId: (name: string) => string;
}) {
  const setFormula = (i: number, change: Partial<DraftRepresentation>) =>
    update((d) => ({ ...d, formulas: d.formulas.map((f, j) => (j === i ? { ...f, ...change } : f)) }));
  return (
    <fieldset className="draft-representations">
      <legend className="draft-label">
        Formulas <span className="draft-optional">optional</span>
      </legend>
      <p className="draft-hint">
        Formulas and equations that show how the formalism works — a definition, a rule, a worked identity — each with
        its variables.
      </p>
      {draft.formulas.map((f, i) => (
        <div key={i} className="draft-relation draft-representation">
          <Field id={fieldId(`formulas-${i}`)} label={`Formula ${i + 1} (LaTeX)`}>
            <LatexInput
              id={fieldId(`formulas-${i}`)}
              value={f.equation}
              placeholder="\vec v = \sum_i v^i \, \hat e_i"
              onChange={(equation) => setFormula(i, { equation })}
            />
          </Field>
          <Field id={fieldId(`formula-name-${i}`)} label="What it shows" optional>
            <input
              id={fieldId(`formula-name-${i}`)}
              className="draft-input"
              value={f.name}
              placeholder="A vector in a basis"
              onChange={(e) => setFormula(i, { name: e.target.value })}
            />
          </Field>
          <PlainWords
            id={fieldId(`formula-plain-${i}`)}
            value={f.plain}
            onChange={(plain) => setFormula(i, { plain })}
          />
          <VariableRows
            title="Its variables"
            equation={f.equation}
            variables={f.variables}
            onChange={(variables) => setFormula(i, { variables })}
            idBase={fieldId(`formula-${i}-var`)}
            focusId={fieldId(`formula-${i}-variables`)}
          />
          <div className="draft-row-actions">
            <button
              type="button"
              className="draft-button"
              onClick={() => update((d) => ({ ...d, formulas: d.formulas.filter((_, j) => j !== i) }))}
            >
              Remove formula {i + 1}
            </button>
          </div>
        </div>
      ))}
      <button
        type="button"
        className="draft-button"
        id={draft.formulas.length ? undefined : fieldId('formulas')}
        onClick={() => update((d) => ({ ...d, formulas: [...d.formulas, { name: '', equation: '', plain: '', variables: [] }] }))}
      >
        Add a formula
      </button>
    </fieldset>
  );
}

/**
 * An equation: its main form (required, with the concept), then — further down,
 * optional — it in plain words, its variables, and other representations.
 */
function EquationFields({
  part,
  draft,
  update,
  fieldId,
}: {
  part: 'required' | 'optional';
  draft: Draft;
  update: (change: (d: Draft) => Draft) => void;
  fieldId: (name: string) => string;
}) {
  const setRep = (i: number, change: Partial<DraftRepresentation>) =>
    update((d) => ({ ...d, representations: d.representations.map((r, j) => (j === i ? { ...r, ...change } : r)) }));
  if (part === 'required')
    return (
      <Field id={fieldId('equation')} label="Equation (LaTeX)">
        <LatexInput
          id={fieldId('equation')}
          value={draft.equation}
          onChange={(equation) => update((d) => ({ ...d, equation }))}
        />
      </Field>
    );
  return (
    <>
      <PlainWords
        id={fieldId('equation-plain')}
        value={draft.equationPlain}
        placeholder="How matter and energy curve spacetime, and how that curvature tells matter how to move."
        onChange={(equationPlain) => update((d) => ({ ...d, equationPlain }))}
      />
      <VariableRows
        title="Its variables"
        equation={draft.equation}
        variables={draft.variables}
        onChange={(variables) => update((d) => ({ ...d, variables }))}
        idBase={fieldId('var')}
        focusId={fieldId('variables')}
      />

      <fieldset className="draft-representations">
        <legend className="draft-label">
          Other representations <span className="draft-optional">optional</span>
        </legend>
        <p className="draft-hint">
          Other ways of writing the same equation — a component form, a limit — each with its variables as they're named
          there. A name alone is fine while the formula is still to come.
        </p>
        {draft.representations.map((r, i) => (
          <div key={i} className="draft-relation draft-representation">
            <Field id={fieldId(`representations-${i}`)} label={`Representation ${i + 1}: name`}>
              <input
                id={fieldId(`representations-${i}`)}
                className="draft-input"
                value={r.name}
                placeholder="Linearized weak-field approximation"
                onChange={(e) => setRep(i, { name: e.target.value })}
              />
            </Field>
            <Field id={fieldId(`representation-eq-${i}`)} label="Equation (LaTeX)" optional>
              <LatexInput
                id={fieldId(`representation-eq-${i}`)}
                value={r.equation}
                onChange={(equation) => setRep(i, { equation })}
              />
            </Field>
            <PlainWords id={fieldId(`representation-plain-${i}`)} value={r.plain} onChange={(plain) => setRep(i, { plain })} />
            <VariableRows
              title="Its variables"
              equation={r.equation}
              variables={r.variables}
              onChange={(variables) => setRep(i, { variables })}
              idBase={fieldId(`rep-${i}-var`)}
              focusId={fieldId(`rep-${i}-variables`)}
            />
            <div className="draft-row-actions">
              <button
                type="button"
                className="draft-button"
                onClick={() => update((d) => ({ ...d, representations: d.representations.filter((_, j) => j !== i) }))}
              >
                Remove representation {i + 1}
              </button>
            </div>
          </div>
        ))}
        <button
          type="button"
          className="draft-button"
          onClick={() =>
            update((d) => ({ ...d, representations: [...d.representations, { name: '', equation: '', plain: '', variables: [] }] }))
          }
        >
          Add a representation
        </button>
      </fieldset>
    </>
  );
}

/** An equation, representation or formula in plain words — no symbols. */
function PlainWords({
  id,
  value,
  onChange,
  placeholder,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <Field id={id} label="In plain words" hint="What it says without symbols, for someone new to it. Markdown." optional>
      <textarea
        id={id}
        className="draft-input"
        rows={2}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        aria-describedby={`${id}-hint`}
      />
    </Field>
  );
}

function Field({
  id,
  label,
  hint,
  optional = false,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  optional?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="draft-field">
      <label className="draft-label" htmlFor={id}>
        {label}
        {optional && <span className="draft-optional"> optional</span>}
      </label>
      {hint && (
        <p className="draft-hint" id={`${id}-hint`}>
          {hint}
        </p>
      )}
      {children}
    </div>
  );
}
