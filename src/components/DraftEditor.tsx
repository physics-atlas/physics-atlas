import { useId, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { CONCEPT_DOMAINS, EDGE_SENTENCE_TEMPLATES, NODE_TYPE_DEFINITIONS, NODE_TYPE_LABELS } from '../data/types';
import type { ConceptGraph, EdgeType, GraphEdge, NodeType } from '../data/types';
import {
  EVIDENCE_LABELS,
  NEW_CONCEPT,
  PROPOSABLE_TYPES,
  draftLayer,
  draftProblems,
  exportFiles,
  proposalFile,
  pullRequestText,
} from '../community/draft';
import type { Draft, DraftField, DraftRelation, ExportFile } from '../community/draft';
import type { Evidence, EvidenceKind, Proposal } from '../community/types';
import { edgeConflicts } from '../graph/conflicts';
import type { EdgeConflict, LabelMatch } from '../graph/conflicts';
import { normalizeRelationship, sentenceParts } from '../graph/concepts';
import type { ConceptIndex, ConceptMap } from '../graph/concepts';
import { CONCEPT_CARD_TITLE_ID } from './ConceptCard';
import RelationSentence from './RelationSentence';
import RichText, { MathText } from './RichText';
import SearchBox from './SearchBox';
import type { SearchEntry } from './SearchBox';
import TypeBadge from './TypeBadge';

interface DraftEditorProps {
  draft: Draft;
  update: (change: (d: Draft) => Draft) => void;
  confirmed: ConceptGraph;
  index: ConceptIndex;
  /** Other open proposals — checked for relations this draft would repeat */
  proposals: Proposal[];
  /** Existing concepts named like the draft */
  similar: LabelMatch[];
  /** Concepts offered as connections, and whether they're the ones nearest the ghost on the map */
  suggestions: { ids: string[]; from: 'map' | 'connections' };
  searchEntries: SearchEntry[];
  /** Adds a relation from the new concept to a confirmed one */
  onConnect: (id: string) => void;
  /** Moves the ghost into the middle of the map view */
  onRecall: () => void;
  /** Shows an existing concept on the map */
  onShow: (id: string) => void;
  onClose: () => void;
  onDiscard: () => void;
  /** What just happened on the map, for the live region ("Connected to …") */
  status: string;
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
  sentenceParts(e, byId, false)
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
  confirmed,
  index,
  proposals,
  similar,
  suggestions,
  searchEntries,
  onConnect,
  onRecall,
  onShow,
  onClose,
  onDiscard,
  status,
}: DraftEditorProps) {
  const uid = useId();
  const fieldId = (f: DraftField | string) => `${uid}-${f}`;
  const [note, setNote] = useState('');
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [pairFrom, setPairFrom] = useState<string | null>(null);
  const exportRef = useRef<HTMLElement>(null);

  const layer = useMemo(() => draftLayer(draft), [draft]);
  const byId: ConceptMap = useMemo(() => new Map([...index.byId, [NEW_CONCEPT, layer.node]]), [index, layer.node]);
  const problems = useMemo(() => draftProblems(draft, confirmed), [draft, confirmed]);
  const otherRelations = useMemo(
    () => proposals.flatMap((p) => p.edges.map((edge) => ({ edge, title: p.title }))),
    [proposals],
  );
  const name = layer.node.label;
  const definition = draft.type ? NODE_TYPE_DEFINITIONS[draft.type] : undefined;
  const connected = new Set(draft.relations.flatMap((r) => [r.source, r.target]));
  const offered = suggestions.ids.filter((id) => !connected.has(id) && index.byId.has(id)).slice(0, 4);

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
      relations: [...d.relations, { key, source: pairFrom, target, relationship: 'relates', conditions: [] }],
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
  const files = problems.length ? [] : exportFiles(draft);
  const prText = problems.length ? '' : pullRequestText(draft, index.byId);
  const bundle = problems.length ? null : proposalFile(draft);

  return (
    <div className="draft-editor">
      <p className="proposal-status proposal-status-draft">Draft · not submitted · saved in this browser</p>
      <h2 className="map-card-title" id={CONCEPT_CARD_TITLE_ID}>
        Propose a concept
      </h2>
      <p className="draft-intro">
        Drag the dashed concept on the map to see where it fits — the concepts nearest it are offered as
        connections, and clicking any concept on the map connects it. Everything can also be done with this form
        alone. Where you put it on the map is only a sketch: it isn't saved with the proposal.
      </p>
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
                      {index.byId.has(m.node.id) ? '' : ' · an open proposal'}
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
            {PROPOSABLE_TYPES.map((t) => (
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

        <div className="draft-row-actions">
          <button type="button" className="draft-button" onClick={onRecall}>
            Bring the draft into view
          </button>
        </div>

        {offered.length > 0 && (
          <div className="draft-suggestions">
            <p className="draft-label">
              {suggestions.from === 'map' ? 'Nearest on the map' : 'Near what you connected'}
            </p>
            <ul className="draft-suggestion-list">
              {offered.map((id) => {
                const n = index.byId.get(id)!;
                return (
                  <li key={id}>
                    <button type="button" className="draft-suggestion" onClick={() => onConnect(id)}>
                      <span aria-hidden>＋ </span>
                      <TypeBadge type={n.type} />
                      Connect to {n.label}
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

        {draft.relations.length === 0 && <p className="concept-empty">No connections yet.</p>}
        <ol className="draft-relations">
          {draft.relations.map((r, i) => {
            const edge = layer.edges[i];
            const conflicts = edgeConflicts(edge, {
              confirmed: confirmed.edges,
              draft: layer.edges.slice(0, i),
              proposals: otherRelations,
            });
            const from = byId.get(r.source)?.label ?? r.source;
            const to = byId.get(r.target)?.label ?? r.target;
            const type = normalizeRelationship(r.relationship) ?? 'relates';
            return (
              <li key={r.key} className="draft-relation">
                <p className="draft-sentence">
                  <RelationSentence edge={edge} byId={byId} selfId={NEW_CONCEPT} onPick={onShow} />
                </p>
                <Field id={fieldId(`rel-${r.key}`)} label="Relation">
                  <select
                    id={fieldId(`rel-${r.key}`)}
                    className="draft-input"
                    value={type}
                    onChange={(e) => setRelation(r.key, (x) => ({ ...x, relationship: e.target.value }))}
                  >
                    {RELATION_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {EDGE_SENTENCE_TEMPLATES[t].replace('{s}', from).replace('{t}', to)}
                      </option>
                    ))}
                  </select>
                </Field>
                {r.conditions.map((c, j) => (
                  <div key={j} className="draft-condition">
                    <Field id={fieldId(`cond-${r.key}-${j}`)} label={`Assumption ${j + 1}`} hint="Reads “… under the assumption of …”">
                      <input
                        id={fieldId(`cond-${r.key}-${j}`)}
                        className="draft-input"
                        value={c.label}
                        placeholder="linear potential"
                        onChange={(e) =>
                          setRelation(r.key, (x) => ({
                            ...x,
                            conditions: x.conditions.map((y, k) => (k === j ? { ...y, label: e.target.value } : y)),
                          }))
                        }
                        aria-describedby={fieldId(`cond-${r.key}-${j}-hint`)}
                      />
                    </Field>
                    <button
                      type="button"
                      className="draft-link"
                      onClick={() =>
                        setRelation(r.key, (x) => ({ ...x, conditions: x.conditions.filter((_, k) => k !== j) }))
                      }
                    >
                      Remove assumption {j + 1}
                    </button>
                  </div>
                ))}
                <div className="draft-row-actions">
                  <button
                    type="button"
                    className="draft-button"
                    onClick={() =>
                      setRelation(r.key, (x) => ({ ...x, conditions: [...x.conditions, { label: '' }] }))
                    }
                  >
                    Add an assumption
                  </button>
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

        {draft.type === 'equation' && (
          <Field id={fieldId('equation')} label="Equation (LaTeX)">
            <input
              id={fieldId('equation')}
              className="draft-input draft-mono"
              value={draft.equation}
              onChange={(e) => set('equation', e.target.value)}
              autoComplete="off"
              spellCheck={false}
            />
            {draft.equation.trim() && (
              <div className="draft-preview" aria-label="Preview">
                <MathText tex={draft.equation} display />
              </div>
            )}
          </Field>
        )}

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
      </section>

      <section className="rel-block draft-section" aria-labelledby={fieldId('h-claim')}>
        <h3 className="block-heading" id={fieldId('h-claim')}>
          The claim
        </h3>
        <Field
          id={fieldId('claim')}
          label="What reviewers vote on"
          hint="Markdown: **bold**, *italic*; maths in $…$, or $$…$$ on its own line."
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
            <p>
              Ready. Download the files, put them into <code>content/concepts/</code>, run <code>npm run validate</code>,
              and open a pull request with the text below as its description.
            </p>
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
          Close — keep the draft
        </button>
        {confirmDiscard ? (
          <span className="draft-confirm" role="group" aria-label="Discard the draft?">
            Discard everything?{' '}
            <button type="button" className="draft-button draft-button-danger" onClick={onDiscard}>
              Discard
            </button>
            <button type="button" className="draft-button" onClick={() => setConfirmDiscard(false)}>
              Keep it
            </button>
          </span>
        ) : (
          <button type="button" className="draft-button" onClick={() => setConfirmDiscard(true)}>
            Discard the draft…
          </button>
        )}
      </div>
    </div>
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
