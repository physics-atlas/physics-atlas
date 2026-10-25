import { useId, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { CONCEPT_DOMAINS, EDGE_SENTENCE_TEMPLATES, NODE_TYPE_DEFINITIONS, NODE_TYPE_LABELS } from '../data/types';
import type { EdgeType, EquationVariable, GraphEdge, NodeType } from '../data/types';
import {
  EVIDENCE_LABELS,
  PROPOSABLE_TYPES,
  draftDependencies,
  draftProblems,
  draftShape,
  exportFiles,
  isDraftRef,
  mapId,
  proposalFile,
  proposalId,
  proposalTitle,
  pullRequestText,
  removedFiles,
} from '../community/draft';
import type { Draft, DraftContext, DraftField, DraftRelation, DraftRepresentation, ExportFile } from '../community/draft';
import type { Evidence, EvidenceKind } from '../community/types';
import type { SignedInUser, SubmitResult } from '../community/api';
import { edgeConflicts } from '../graph/conflicts';
import type { EdgeConflict, LabelMatch } from '../graph/conflicts';
import { GENERALITY_MAX, IMPORTANCE_MAX, normalizeRelationship, sentenceParts } from '../graph/concepts';
import type { ConceptIndex, ConceptMap } from '../graph/concepts';
import { FUN_TYPES } from '../graph/typeColors';
import { CONCEPT_CARD_TITLE_ID } from './ConceptCard';
import RelationPicker from './RelationPicker';
import RelationSentence from './RelationSentence';
import RichText, { MathText } from './RichText';
import SearchBox from './SearchBox';
import type { SearchEntry } from './SearchBox';
import TypeBadge from './TypeBadge';

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
    loginHref: string;
    onSubmit: () => Promise<SubmitResult>;
  } | null;
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
  const url = URL.createObjectURL(new Blob([file.content], { type: 'application/json' }));
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
}: DraftEditorProps) {
  const uid = useId();
  const fieldId = (f: DraftField | string) => `${uid}-${f}`;
  const [note, setNote] = useState('');
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [pairFrom, setPairFrom] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<{ error: string; problems?: string[] } | null>(null);
  const exportRef = useRef<HTMLElement>(null);

  const shape = useMemo(() => draftShape(draft, ctx), [draft, ctx]);
  const own = mapId(draft);
  const byId = byMapId;
  const problems = useMemo(() => draftProblems(draft, ctx), [draft, ctx]);
  // What it can assume: confirmed concepts, not itself, not ones already listed.
  const assumableEntries = useMemo(() => {
    const confirmed = new Set(ctx.confirmed.nodes.map((n) => n.id));
    return searchEntries.filter((e) => confirmed.has(e.ref) && e.ref !== draft.editOf && !draft.assumes.includes(e.ref));
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
  const send = async () => {
    if (!submission) return;
    setSending(true);
    setSendError(null);
    const result = await submission.onSubmit();
    setSending(false);
    if (!result.ok) {
      setSendError({ error: result.error, problems: result.problems });
      setNote(`Not submitted: ${result.error}`);
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
      relations: [...d.relations, { key, source: pairFrom, target, relationship: 'relates' }],
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
  const files = problems.length ? [] : exportFiles(draft, ctx);
  const deletions = problems.length ? [] : removedFiles(draft);
  const prText = problems.length ? '' : pullRequestText(draft, ctx);
  const bundle = problems.length ? null : proposalFile(draft, ctx);

  return (
    <div className="draft-editor">
      <p className="proposal-status proposal-status-draft">Draft · not submitted · saved in this browser</p>
      <nav className="draft-switcher" aria-label="Your drafts">
        <p className="draft-label">Your drafts — each one is its own proposal</p>
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
        {original ? `Propose an edit: ${original.label}` : 'Propose a concept'}
      </h2>
      {original ? (
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
              {definition ? ` — ${definition.definition}` : ' — not defined yet.'}
            </p>
            {definition && definition.examples.length > 0 && (
              <p className="draft-hint">Examples: {definition.examples.join(', ')}</p>
            )}
          </div>
        )}

      </section>

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
                return (
                  <li key={e.id} className={removing ? 'draft-removing' : undefined}>
                    <span className="draft-sentence">
                      <RelationSentence edge={e} byId={byId} selfId={own} onPick={onShow} />
                    </span>
                    {removing && <span className="concept-via"> — removal proposed</span>}{' '}
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
                      Propose removing
                    </button>
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
                <Field id={fieldId(`rel-${r.key}`)} label="Relation">
                  <RelationPicker
                    id={fieldId(`rel-${r.key}`)}
                    value={type}
                    types={RELATION_TYPES}
                    from={from}
                    to={to}
                    onChange={(t) => setRelation(r.key, (x) => ({ ...x, relationship: t }))}
                  />
                </Field>
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
                    <div className="draft-preview" aria-label="Preview">
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
                    <div className="draft-preview" aria-label="Preview">
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

      <section className="rel-block draft-section" aria-labelledby={fieldId('h-details')}>
        <h3 className="block-heading" id={fieldId('h-details')}>
          Details
        </h3>
        <Field id={fieldId('description')} label="Description" hint="A sentence or two in plain words.">
          <textarea
            id={fieldId('description')}
            className="draft-input"
            rows={3}
            value={draft.description}
            onChange={(e) => set('description', e.target.value)}
            aria-describedby={fieldId('description-hint')}
          />
        </Field>

        {draft.type === 'equation' && <EquationFields draft={draft} update={update} fieldId={fieldId} />}
        {draft.type === 'formalism' && <FormulaFields draft={draft} update={update} fieldId={fieldId} />}

        <fieldset className="draft-assumes">
          <legend className="draft-label">
            Assumes <span className="draft-optional">optional</span>
          </legend>
          <p className="draft-hint" id={fieldId('assumes-hint')}>
            Concepts this one takes for granted — a limit, an approximation, a property. No line is drawn; they're
            listed on its card, and highlighted when it's selected.
          </p>
          {draft.assumes.length > 0 && (
            <ul className="draft-assumes-list">
              {draft.assumes.map((id) => {
                const n = ctx.confirmed.nodes.find((x) => x.id === id);
                return (
                  <li key={id}>
                    {n && <TypeBadge type={n.type} />}
                    <span>{n?.label ?? id}</span>
                    <button
                      type="button"
                      className="draft-link"
                      onClick={() => update((d) => ({ ...d, assumes: d.assumes.filter((x) => x !== id) }))}
                    >
                      Remove<span className="visually-hidden"> {n?.label ?? id}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          <div id={fieldId('assumes')} tabIndex={-1}>
            <SearchBox
              entries={assumableEntries}
              onPick={(id) => update((d) => ({ ...d, assumes: d.assumes.includes(id) ? d.assumes : [...d.assumes, id] }))}
              placeholder="Add a concept it assumes…"
              label="Add a concept it assumes"
            />
          </div>
        </fieldset>

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

      <section className="rel-block draft-section" aria-labelledby={fieldId('h-claim')}>
        <h3 className="block-heading" id={fieldId('h-claim')}>
          The claim
        </h3>
        <Field
          id={fieldId('claim')}
          label="What reviewers vote on"
          hint="Without a claim, reviewers vote on the concept and its connections as written. Markdown: **bold**, *italic*; maths in $…$, or $$…$$ on its own line."
          optional
        >
          <textarea
            id={fieldId('claim')}
            className="draft-input"
            rows={5}
            value={draft.claim}
            onChange={(e) => set('claim', e.target.value)}
            aria-describedby={fieldId('claim-hint')}
          />
        </Field>
        {draft.claim.trim() && (
          <div className="draft-preview proposal-claim">
            <p className="draft-label">Preview</p>
            <RichText source={draft.claim} />
          </div>
        )}
      </section>

      <section className="rel-block draft-section" aria-labelledby={fieldId('h-evidence')}>
        <h3 className="block-heading" id={fieldId('h-evidence')}>
          Evidence <span className="rel-count">{draft.evidence.length}</span>
        </h3>
        <ol className="draft-evidence">
          {draft.evidence.map((e, i) => (
            <li key={i} className="draft-relation">
              <Field id={fieldId(`kind-${i}`)} label={`Evidence ${i + 1}: kind`}>
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
                <div className="draft-preview" aria-label="Preview">
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
                  Remove evidence {i + 1}
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
          Add evidence
        </button>
      </section>

      <section className="rel-block draft-section" aria-labelledby={fieldId('h-author')}>
        <h3 className="block-heading" id={fieldId('h-author')}>
          About you
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
                    <div className="draft-row-actions">
                      <button
                        type="button"
                        className="draft-button draft-button-primary"
                        onClick={() => void send()}
                        disabled={sending}
                        aria-disabled={sending}
                      >
                        {sending ? 'Submitting…' : 'Submit as a pull request'}
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
                <p className="draft-hint">Or do it by hand:</p>
              </div>
            )}
            <p>
              {submission ? 'Download' : 'Ready. Download'} the files and put them into <code>content/concepts/</code>
              {draft.editOf ? ' (the concept’s file replaces the old one)' : ''}
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
              {bundle && (
                <button
                  type="button"
                  className="draft-button"
                  onClick={() => {
                    download(bundle);
                    setNote('Downloading the proposal file.');
                  }}
                >
                  Download as one proposal file
                </button>
              )}
            </div>
            <details className="draft-files">
              <summary>Show the files</summary>
              {[...files, ...(bundle ? [bundle] : [])].map((f) => (
                <div key={f.path}>
                  <p className="draft-label">{f.path}</p>
                  <pre className="draft-code">{f.content}</pre>
                </div>
              ))}
              <p className="draft-label">Pull-request text</p>
              <pre className="draft-code">{prText}</pre>
            </details>
          </>
        )}
      </section>

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
        <div className="draft-preview" aria-label="Preview">
          <MathText tex={value} display />
        </div>
      )}
    </>
  );
}

/**
 * A formula's variables: one row each, symbol (LaTeX, previewed) and what it
 * stands for. `focusId` goes on the first input — or on "Add a variable" while
 * there are none — so a problem in the list can be jumped to.
 */
function VariableRows({
  variables,
  onChange,
  idBase,
  focusId,
  title,
}: {
  variables: EquationVariable[];
  onChange: (vs: EquationVariable[]) => void;
  idBase: string;
  focusId: string;
  title: string;
}) {
  const setRow = (i: number, change: Partial<EquationVariable>) =>
    onChange(variables.map((v, j) => (j === i ? { ...v, ...change } : v)));
  return (
    <fieldset className="draft-variables">
      <legend className="draft-label">
        {title} <span className="draft-optional">optional</span>
      </legend>
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
                  placeholder="G_{\mu\nu}"
                  onChange={(e) => setRow(i, { symbol: e.target.value })}
                  autoComplete="off"
                  spellCheck={false}
                />
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
          <VariableRows
            title="Its variables"
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
        onClick={() => update((d) => ({ ...d, formulas: [...d.formulas, { name: '', equation: '', variables: [] }] }))}
      >
        Add a formula
      </button>
    </fieldset>
  );
}

/** An equation's main form and its variables, then any other representations, each with its own. */
function EquationFields({
  draft,
  update,
  fieldId,
}: {
  draft: Draft;
  update: (change: (d: Draft) => Draft) => void;
  fieldId: (name: string) => string;
}) {
  const setRep = (i: number, change: Partial<DraftRepresentation>) =>
    update((d) => ({ ...d, representations: d.representations.map((r, j) => (j === i ? { ...r, ...change } : r)) }));
  return (
    <>
      <Field id={fieldId('equation')} label="Equation (LaTeX)">
        <LatexInput
          id={fieldId('equation')}
          value={draft.equation}
          onChange={(equation) => update((d) => ({ ...d, equation }))}
        />
      </Field>
      <VariableRows
        title="Its variables"
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
              <LatexInput id={fieldId(`representation-eq-${i}`)} value={r.equation} onChange={(equation) => setRep(i, { equation })} />
            </Field>
            <VariableRows
              title="Its variables"
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
            update((d) => ({ ...d, representations: [...d.representations, { name: '', equation: '', variables: [] }] }))
          }
        >
          Add a representation
        </button>
      </fieldset>
    </>
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
