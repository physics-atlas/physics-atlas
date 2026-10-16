import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { NODE_TYPE_LABELS } from '../data/types';
import type { ConceptGraph, GraphEdge } from '../data/types';
import { NEW_CONCEPT, draftLayer, hasContent } from '../community/draft';
import { mergedGraph, overlayFor, proposalByNode, badgeText } from '../community/proposals';
import { FixtureStore } from '../community/store';
import type { Proposal } from '../community/types';
import { useDraft } from '../community/useDraft';
import { similarLabels } from '../graph/conflicts';
import { buildConceptIndex, conceptPathFor, neighborsOf } from '../graph/concepts';
import type { ConceptIndex } from '../graph/concepts';
import { TYPE_COLORS, TYPE_ORDER } from '../graph/typeColors';
import type { Progress } from '../lib/useProgress';
import ConceptCard, { CONCEPT_CARD_TITLE_ID } from './ConceptCard';
import GraphView from './GraphView';
import type { DraftOverlay } from './GraphView';
import Legend from './Legend';
import RelationSentence from './RelationSentence';
import type { SearchEntry } from './SearchBox';
import TypeBadge from './TypeBadge';

// The proposal card brings KaTeX — load both only when a proposal is opened.
const ProposalCard = lazy(() => import('./ProposalCard'));
const DraftEditor = lazy(() => import('./DraftEditor'));

const NO_PROPOSALS: Proposal[] = [];
const NO_NEAR = { ids: [] as string[], byHand: false };
/** How many concepts the editor offers as connections at a time. */
const OFFERED = 4;
const PROGRESS_PREFIX = 'concept:';
const byLabel = (a: { label: string }, b: { label: string }) => a.label.localeCompare(b.label);
// Overlay sizes (px) the sub-view fit keeps clear: .concept-side with a goal
// path open on the left, the map card on the right, the type legend along the
// bottom — mirrored in App.css.
const PATH_PANEL_INSET = 304;
const LEGEND_INSET = 110;
const CARD_MIN_WIDTH = 380;
const CARD_MARGIN = 16;

/** The card's on-screen footprint: at least half the screen wide (.concept-map-card). */
const cardInset = () => {
  const w = window.innerWidth;
  return Math.min(Math.max(w / 2, CARD_MIN_WIDTH), w - 2 * CARD_MARGIN) + 2 * CARD_MARGIN;
};

interface ConceptMapViewProps {
  graph: ConceptGraph;
  progress: Progress;
  goalId: string | null;
  onGoalChange: (id: string | null) => void;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  /** Select + animate-center a node */
  onFocus: (id: string) => void;
  focus?: { id: string | null; tick: number };
  theme?: 'dark' | 'light';
  /** Community-review preview (`?community=1`): the proposed layer and its toggles. */
  community?: boolean;
}

export default function ConceptMapView({
  graph,
  progress,
  goalId,
  onGoalChange,
  selectedId,
  onSelect,
  onFocus,
  focus,
  theme,
  community = false,
}: ConceptMapViewProps) {
  const index = useMemo(() => buildConceptIndex(graph), [graph]);
  const path = useMemo(() => (goalId ? conceptPathFor(goalId, index) : null), [goalId, index]);

  // Proposed layer (community preview). Proposals come from a store — sample
  // fixtures for now — and are drawn over the confirmed graph, never mixed in.
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [showConfirmed, setShowConfirmed] = useState(true);
  const [showProposed, setShowProposed] = useState(true);
  useEffect(() => {
    if (!community) return;
    let alive = true;
    void new FixtureStore(graph).list().then((list) => alive && setProposals(list));
    return () => {
      alive = false;
    };
  }, [community, graph]);
  const activeProposals = community ? proposals : NO_PROPOSALS;
  const overlay = useMemo(
    () => (activeProposals.length ? overlayFor(activeProposals) : null),
    [activeProposals],
  );
  const byProposedNode = useMemo(() => proposalByNode(activeProposals), [activeProposals]);
  // Confirmed + proposed, for neighbourhoods and sentences that cross the two.
  const mergedIndex = useMemo(
    () => (activeProposals.length ? buildConceptIndex(mergedGraph(graph, activeProposals)) : index),
    [activeProposals, graph, index],
  );

  // The proposal editor (community preview): one draft, kept in this browser.
  // The map shows it as a ghost the proposer can drag to see where it fits.
  const drafts = useDraft();
  const [editorOpen, setEditorOpen] = useState(false);
  const draft = community && editorOpen ? drafts.draft : null;
  const drafting = draft !== null;
  const [near, setNear] = useState(NO_NEAR);
  const [draftStatus, setDraftStatus] = useState('');
  const [draftRecall, setDraftRecall] = useState(0);
  const onDraftNear = useCallback(
    (ids: string[], byHand: boolean) =>
      setNear((prev) => (prev.byHand === byHand && prev.ids.join() === ids.join() ? prev : { ids, byHand })),
    [],
  );
  const draftShape = useMemo(() => (draft ? draftLayer(draft) : null), [draft]);
  const draftLabel = draft?.label ?? '';
  const similar = useMemo(
    () => (drafting ? similarLabels(draftLabel, [...graph.nodes, ...activeProposals.flatMap((p) => p.nodes)]) : []),
    [drafting, draftLabel, graph, activeProposals],
  );
  const connectedKey = draft
    ? [...new Set(draft.relations.flatMap((r) => [r.source, r.target]))]
        .filter((id) => id !== NEW_CONCEPT)
        .sort()
        .join(' ')
    : '';
  const suggestions = useMemo(() => {
    const connected = new Set(connectedKey ? connectedKey.split(' ') : []);
    // Dragging the ghost offers what it's dragged next to. Until then,
    // suggestions come from the graph around what's already connected — the
    // same help without a pointer — and there are none before either.
    const fromConnections = !near.byHand && connected.size > 0;
    const pool = fromConnections
      ? [...connected].flatMap((id) => neighborsOf(id, index))
      : near.byHand
        ? near.ids
        : [];
    const ids = [...new Set(pool)].filter((id) => !connected.has(id) && index.byId.has(id)).slice(0, OFFERED);
    return { ids, from: fromConnections ? ('connections' as const) : ('map' as const) };
  }, [connectedKey, near, index]);
  const draftOverlay: DraftOverlay | null = useMemo(
    () => draftShape && { ...draftShape, nearIds: suggestions.ids, conflictIds: similar.map((m) => m.node.id) },
    [draftShape, suggestions.ids, similar],
  );
  const searchEntries: SearchEntry[] = useMemo(
    () =>
      graph.nodes
        .map((n) => ({ ref: n.id, title: n.label, context: NODE_TYPE_LABELS[n.type], color: TYPE_COLORS[n.type] }))
        .sort((a, b) => a.title.localeCompare(b.title)),
    [graph],
  );
  const connect = (id: string) => {
    const n = index.byId.get(id);
    if (!n) return;
    drafts.update((d) => ({
      ...d,
      relations: [
        ...d.relations,
        { key: `r${Date.now().toString(36)}${d.relations.length}`, source: NEW_CONCEPT, target: id, relationship: 'relates', conditions: [] },
      ],
    }));
    setDraftStatus(`Connected to ${n.label} — choose the relation under Connections.`);
  };
  // While drafting, clicking a concept on the map connects it instead of opening its card.
  const selectOnMap = (id: string | null) => {
    if (!drafting || id === null) return onSelect(id);
    if (id === NEW_CONCEPT) setDraftStatus('That’s your draft — drag it to where it seems to fit.');
    else if (index.byId.has(id)) connect(id);
    else setDraftStatus('A proposal can only connect to confirmed concepts.');
  };
  const editorButtonRef = useRef<HTMLButtonElement>(null);
  const openEditor = () => {
    drafts.start();
    setEditorOpen(true);
    setNear(NO_NEAR);
    setDraftStatus('');
    onSelect(null);
  };
  // Closing leaves no card behind: a concept shown from the editor was a look, not a pick.
  const closeEditor = () => {
    setEditorOpen(false);
    onSelect(null);
  };
  const discardDraft = () => {
    drafts.discard();
    closeEditor();
  };

  const selected = selectedId ? index.byId.get(selectedId) : undefined;
  const selectedProposal = selectedId ? byProposedNode.get(selectedId) : undefined;
  const proposedNode = selectedProposal && selectedId ? mergedIndex.byId.get(selectedId) : undefined;
  const cardOpen = Boolean(selected || proposedNode);
  // Open proposals that attach to the selected confirmed concept.
  const proposalsHere = useMemo(
    () =>
      selected && showProposed
        ? activeProposals.filter((p) => p.edges.some((e) => e.source === selected.id || e.target === selected.id))
        : [],
    [selected, activeProposals, showProposed],
  );
  // A goal path owns the highlight; otherwise a click shows the concept's
  // direct connections (GraphView's directional select colours them).
  const highlightIds = path?.highlight ?? null;
  // The view frames the selection with every connection, shown or not, so
  // toggling a layer doesn't move the camera.
  const neighbors = useMemo(
    () => (selectedId && cardOpen ? new Set(neighborsOf(selectedId, mergedIndex)) : null),
    [selectedId, cardOpen, mergedIndex],
  );
  const fitIds = path?.highlight ?? neighbors;
  // Concept progress shares the topic store; the prefix keeps the id spaces apart.
  const doneIds = useMemo(
    () =>
      new Set(
        [...progress.done]
          .filter((k) => k.startsWith(PROGRESS_PREFIX))
          .map((k) => k.slice(PROGRESS_PREFIX.length)),
      ),
    [progress.done],
  );
  const goal = path && goalId ? index.byId.get(goalId) : undefined;

  // The card behaves like a non-modal panel: opening it moves focus in (so a
  // keyboard or screen-reader user lands on what they picked), Escape or ×
  // closes it and returns focus to where they came from.
  const cardRef = useRef<HTMLElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    // While drafting, "Show on map" selects a concept but focus stays in the editor.
    if (!selectedId || drafting) return;
    const active = document.activeElement;
    if (active instanceof HTMLElement && !cardRef.current?.contains(active) && active !== document.body)
      returnFocusRef.current = active;
    cardRef.current?.focus({ preventScroll: true });
  }, [selectedId, drafting]);
  // The editor moves focus in when it opens and back to its button when it closes.
  const wasDrafting = useRef(false);
  useEffect(() => {
    if (drafting && !wasDrafting.current) cardRef.current?.focus({ preventScroll: true });
    if (!drafting && wasDrafting.current) editorButtonRef.current?.focus({ preventScroll: true });
    wasDrafting.current = drafting;
  }, [drafting]);
  const closeCard = () => {
    onSelect(null);
    returnFocusRef.current?.focus({ preventScroll: true });
    returnFocusRef.current = null;
  };
  const learnedCount = path ? path.order.filter((id) => doneIds.has(id)).length : 0;

  const byType = useMemo(
    () =>
      TYPE_ORDER.map((type) => ({
        type,
        nodes: graph.nodes.filter((n) => n.type === type).sort(byLabel),
      })).filter((g) => g.nodes.length > 0),
    [graph],
  );

  const outgoing = selected ? (index.outgoing.get(selected.id) ?? []) : [];
  const incoming = selected ? (index.incoming.get(selected.id) ?? []) : [];
  const reviews = selected
    ? [selected.review, ...outgoing.map((e) => e.review), ...incoming.map((e) => e.review)].filter(
        (r): r is string => Boolean(r),
      )
    : [];

  return (
    <div className="view map-view concept-map-view">
      <div className="graph-pane">
        {goal && path && (
          <div className="goal-bar" role="status" aria-live="polite">
            <span className="goal-bar-title">★ Goal: {goal.label}</span>
            <span className="goal-bar-count">
              {path.order.length} step{path.order.length === 1 ? '' : 's'} on this path
            </span>
            <button className="goal-bar-clear" onClick={() => onGoalChange(null)}>
              Clear
            </button>
          </div>
        )}

        <div className="concept-side">
          {community && !drafting && (
            <button ref={editorButtonRef} type="button" className="concept-propose" onClick={openEditor}>
              <span aria-hidden>＋ </span>
              {drafts.draft && hasContent(drafts.draft) ? 'Continue your proposal' : 'Propose a concept'}
            </button>
          )}
          <details className="concept-index">
            <summary className="concept-index-summary">All concepts as a list</summary>
            {overlay && showProposed && (
              <div className="concept-index-group concept-index-proposals">
                <h3 className="block-heading">
                  Proposed — not yet confirmed
                  <span className="rel-count">{overlay.nodes.length}</span>
                </h3>
                <ul className="concept-index-list">
                  {overlay.nodes.map(({ node, badge }) => (
                    <li key={node.id}>
                      <button
                        className={`concept-index-item ${node.id === selectedId ? 'concept-index-item-active' : ''}`}
                        onClick={() => onFocus(node.id)}
                      >
                        <TypeBadge type={node.type} />
                        <span>
                          {node.label}
                          <span className="concept-path-type">{badge}</span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {showConfirmed && byType.map(({ type, nodes }) => (
              <div key={type} className="concept-index-group">
                <h3 className="block-heading">
                  <TypeBadge type={type} />
                  {NODE_TYPE_LABELS[type]}
                  <span className="rel-count">{nodes.length}</span>
                </h3>
                <ul className="concept-index-list">
                  {nodes.map((n) => (
                    <li key={n.id}>
                      <button
                        className={`concept-index-item ${n.id === selectedId ? 'concept-index-item-active' : ''}`}
                        onClick={() => onFocus(n.id)}
                      >
                        {n.label}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </details>

          {goal && path && (
            <section className="concept-path" aria-labelledby="concept-path-title">
              <h2 className="concept-path-title" id="concept-path-title">
                Path to this goal
                <span className="rel-count">
                  {learnedCount} of {path.order.length} learned
                </span>
              </h2>
              <ol className="concept-path-steps">
                {path.order.map((id) => {
                  const n = index.byId.get(id)!;
                  const resources = path.resourcesByStep.get(id) ?? [];
                  return (
                    <li
                      key={id}
                      className={`concept-path-step ${doneIds.has(id) ? 'concept-path-step-done' : ''}`}
                    >
                      <button
                        className={`concept-path-label ${id === selectedId ? 'concept-index-item-active' : ''}`}
                        onClick={() => onFocus(id)}
                      >
                        <TypeBadge type={n.type} />
                        <span>
                          {n.label}
                          <span className="concept-path-type">{NODE_TYPE_LABELS[n.type]}</span>
                        </span>
                      </button>
                      <label className="learned-toggle">
                        <input
                          type="checkbox"
                          checked={doneIds.has(id)}
                          onChange={() => progress.toggle(PROGRESS_PREFIX + id)}
                          aria-label={`Learned: ${n.label}`}
                        />
                        Learned
                      </label>
                      {resources.length > 0 && (
                        <ul className="concept-path-resources">
                          {resources.map((r) => (
                            <li key={r.id}>
                              <a
                                className="concept-resource-link"
                                href={r.attrs.link}
                                target="_blank"
                                rel="noreferrer"
                              >
                                {r.label} ↗
                              </a>
                              <span className="concept-resource-meta">
                                {r.attrs.mediaType} · {r.attrs.estimatedMinutes} min
                              </span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </li>
                  );
                })}
              </ol>
              {path.order.length === 1 && (
                <p className="concept-empty">No prerequisites are linked to this goal yet.</p>
              )}
            </section>
          )}
        </div>

        {!cardOpen && !drafting && !goal && (
          <p className="map-hint">
            Colour = kind of concept, size = how important it is — zoom in to reveal finer
            detail. Each line names its relation —
            hover one to highlight the two concepts it joins. Click a concept to see its direct
            connections — <span className="ink-pre">silver</span> leads into it,{' '}
            <span className="ink-post">gold</span> leads out of it. Click a type in the legend to see what
            it means.
          </p>
        )}

        {drafting && draft && (
          <aside
            className="map-card concept-map-card draft-card"
            key="draft"
            ref={cardRef}
            tabIndex={-1}
            aria-labelledby={CONCEPT_CARD_TITLE_ID}
          >
            <Suspense fallback={<p className="concept-empty">Loading the editor…</p>}>
              <DraftEditor
                draft={draft}
                update={drafts.update}
                confirmed={graph}
                index={index}
                proposals={activeProposals}
                similar={similar}
                suggestions={suggestions}
                searchEntries={searchEntries}
                onConnect={connect}
                onRecall={() => {
                  setDraftRecall((n) => n + 1);
                  setDraftStatus('Moved the draft to the middle of the map view.');
                }}
                onShow={onFocus}
                onClose={closeEditor}
                onDiscard={discardDraft}
                status={draftStatus}
              />
            </Suspense>
            <button className="map-card-close" onClick={closeEditor} aria-label="Close the proposal editor (the draft is kept)">
              ×
            </button>
          </aside>
        )}

        {cardOpen && !drafting && (
          <aside
            className="map-card concept-map-card"
            key={selectedId}
            ref={cardRef}
            tabIndex={-1}
            aria-labelledby={CONCEPT_CARD_TITLE_ID}
            onKeyDown={(e) => e.key === 'Escape' && closeCard()}
          >
            {selectedProposal && proposedNode && (
              <Suspense fallback={<p className="concept-empty">Loading the proposal…</p>}>
                <ProposalCard
                  proposal={selectedProposal}
                  node={proposedNode}
                  byId={mergedIndex.byId}
                  onPick={onFocus}
                />
              </Suspense>
            )}
            {selected && (
            <>
            <ConceptCard node={selected} index={index} onPick={onFocus}>
              {selected.type === 'equation' && (
                <div className="rel-block concept-equation">
                  <p className="concept-equation-formula">{selected.attrs.equation}</p>
                  {selected.attrs.variables.length > 0 && (
                    <>
                      <h3 className="block-heading">Variables</h3>
                      <dl className="concept-variables">
                        {selected.attrs.variables.map((v) => (
                          <div key={v.symbol} className="concept-variable">
                            <dt>{v.symbol}</dt>
                            <dd>{v.meaning}</dd>
                          </div>
                        ))}
                      </dl>
                    </>
                  )}
                  {selected.attrs.conditions.length > 0 && (
                    <>
                      <h3 className="block-heading">Conditions</h3>
                      <ul className="concept-list">
                        {selected.attrs.conditions.map((c) => (
                          <li key={c}>{c}</li>
                        ))}
                      </ul>
                    </>
                  )}
                  {selected.attrs.representations.length > 0 && (
                    <>
                      <h3 className="block-heading">Representations</h3>
                      <ul className="concept-list">
                        {selected.attrs.representations.map((r) => (
                          <li key={r}>{r}</li>
                        ))}
                      </ul>
                    </>
                  )}
                </div>
              )}

              {selected.type === 'resource' && (
                <div className="rel-block">
                  <a
                    className="concept-resource-link"
                    href={selected.attrs.link}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Open resource ↗
                  </a>
                  <p className="concept-resource-meta">
                    {selected.attrs.mediaType} · {selected.attrs.estimatedMinutes} min
                  </p>
                </div>
              )}
            </ConceptCard>

            <details className="rel-block concept-all-relations">
              <summary className="block-heading">
                All relations
                <span className="rel-count">{outgoing.length + incoming.length}</span>
              </summary>
              {outgoing.length === 0 && incoming.length === 0 && (
                <p className="concept-empty">No relations yet.</p>
              )}
              {outgoing.length > 0 && (
                <RelationGroup
                  heading="From this concept"
                  edges={outgoing}
                  selfId={selected.id}
                  index={index}
                  onPick={onFocus}
                />
              )}
              {incoming.length > 0 && (
                <RelationGroup
                  heading="Into this concept"
                  edges={incoming}
                  selfId={selected.id}
                  index={index}
                  onPick={onFocus}
                />
              )}
            </details>

            {reviews.length > 0 && (
              <div className="concept-review">
                <p className="concept-review-title">Open question for the author</p>
                {[...new Set(reviews)].map((r) => (
                  <p key={r}>{r}</p>
                ))}
              </div>
            )}

            {proposalsHere.length > 0 && (
              <section className="rel-block concept-proposals-here">
                <h3 className="block-heading">
                  Open proposals about this concept
                  <span className="rel-count">{proposalsHere.length}</span>
                </h3>
                <ul className="concept-relations">
                  {proposalsHere.map((p) => (
                    <li key={p.id}>
                      {p.nodes.length > 0 ? (
                        <button className="concept-relation-link" onClick={() => onFocus(p.nodes[0].id)}>
                          {p.title}
                        </button>
                      ) : (
                        p.title
                      )}{' '}
                      <span className="concept-via">{badgeText(p)}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {selected.id !== goalId && (
              <div className="map-card-cta">
                <button className="map-card-goal" onClick={() => onGoalChange(selected.id)}>
                  ★ Show path to this
                </button>
              </div>
            )}
            </>
            )}

            <button className="map-card-close" onClick={closeCard} aria-label="Close concept card">
              ×
            </button>
          </aside>
        )}

        {/* Canvas, map controls and legend come last in the DOM so keyboard
            users reach the concept list, path and card first; CSS keeps the
            canvas underneath. */}
        <GraphView
          concepts={graph}
          selectedId={selectedId}
          highlightIds={highlightIds}
          doneIds={doneIds}
          directionalSelect={!goal}
          focus={focus}
          onSelect={selectOnMap}
          large
          theme={theme}
          label={`Concept map, ${graph.nodes.length} concepts${
            overlay ? ` and ${overlay.nodes.length} proposed` : ''
          }${drafting ? ', plus your draft' : ''}. Drawn visually; to reach every concept by keyboard, use the search box or the "All concepts as a list" panel.`}
          goalId={goal ? goal.id : null}
          fitIds={fitIds}
          fitInsets={{
            left: goal ? PATH_PANEL_INSET : 0,
            right: cardOpen || drafting ? cardInset() : 0,
            bottom: LEGEND_INSET,
          }}
          overlay={overlay}
          layers={{ confirmed: showConfirmed, overlay: showProposed }}
          draft={draftOverlay}
          onDraftNear={onDraftNear}
          draftRecall={draftRecall}
          extraControls={
            community && (
              <>
                <button
                  type="button"
                  className="graph-control graph-control-text"
                  aria-pressed={showConfirmed}
                  onClick={() => setShowConfirmed((s) => !s)}
                  title="Show or hide the confirmed graph"
                >
                  Show confirmed
                </button>
                <button
                  type="button"
                  className="graph-control graph-control-text"
                  aria-pressed={showProposed}
                  onClick={() => setShowProposed((s) => !s)}
                  title="Show or hide proposals that aren't confirmed yet"
                >
                  Show proposed
                </button>
              </>
            )
          }
        />
        <Legend variant="type" statuses={Boolean(overlay) || drafting} draft={drafting} />
      </div>
    </div>
  );
}

function RelationGroup({
  heading,
  edges,
  selfId,
  index,
  onPick,
}: {
  heading: string;
  edges: GraphEdge[];
  selfId: string;
  index: ConceptIndex;
  onPick: (id: string) => void;
}) {
  return (
    <>
      <p className="concept-relations-heading">{heading}</p>
      <ul className="concept-relations">
        {edges.map((e) => (
          <li key={e.id}>
            <RelationSentence edge={e} byId={index.byId} selfId={selfId} onPick={onPick} />
          </li>
        ))}
      </ul>
    </>
  );
}
