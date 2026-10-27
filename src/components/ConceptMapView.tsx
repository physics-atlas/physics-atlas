import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { NODE_TYPE_LABELS } from '../data/types';
import type { ConceptGraph, GraphEdge, GraphNode } from '../data/types';
import {
  NEW_CONCEPT,
  draftProposal,
  draftRef,
  draftShape,
  hasContent,
  mapId,
  newDraft,
  newEditDraft,
  proposalTitle,
  pullRequestText,
} from '../community/draft';
import type { DraftContext, DraftShape } from '../community/draft';
import { badgeText, mergedGraph, overlayFor, proposalByNode, proposalsAbout } from '../community/proposals';
import { FixtureStore } from '../community/store';
import { GitHubStore, fetchMe, loginHref, logout, signInProblemOnLoad, signInProblemText, submitProposal } from '../community/api';
import type { Me, SignInProblem, SubmitResult } from '../community/api';
import type { Proposal } from '../community/types';
import { useDrafts } from '../community/useDraft';
import { similarLabels } from '../graph/conflicts';
import { buildConceptIndex, conceptPathFor, neighborsOf, splitFluff } from '../graph/concepts';
import type { ConceptIndex, ConceptMap } from '../graph/concepts';
import { TYPE_COLORS, TYPE_ORDER } from '../graph/typeColors';
import type { Progress } from '../lib/useProgress';
import ConceptCard, { CONCEPT_CARD_TITLE_ID, EDGE_CARD_TITLE_ID } from './ConceptCard';
import GraphView from './GraphView';
import type { DraftOverlay } from './GraphView';
import Legend from './Legend';
import RelationSentence from './RelationSentence';
import type { SearchEntry } from './SearchBox';
import TypeBadge from './TypeBadge';
import { isPlainClick, pageHref } from '../lib/pageLinks';

// The proposal card brings KaTeX — load both only when a proposal is opened.
const ProposalCard = lazy(() => import('./ProposalCard'));
const DraftEditor = lazy(() => import('./DraftEditor'));
// KaTeX is large: the typeset equation loads when an equation's card first opens.
const EquationView = lazy(() => import('./EquationView'));
const FormulaView = lazy(() => import('./EquationView').then((m) => ({ default: m.FormulaView })));
// A relation's card typesets its description and derivation: loaded on demand too.
const EdgeCard = lazy(() => import('./EdgeCard'));

const NO_PROPOSALS: Proposal[] = [];
const NO_NEAR = { ids: [] as string[], byHand: false, ghost: '' };
const NO_SHAPES: DraftShape[] = [];
/** How many concepts the editor offers as connections at a time. */
const OFFERED = 4;
const PROGRESS_PREFIX = 'concept:';
const byLabel = (a: { label: string }, b: { label: string }) => a.label.localeCompare(b.label);
// Overlay sizes (px) the sub-view fit keeps clear: .concept-side with a goal
// path open on the left, the map card on the right, the type legend along the
// bottom — mirrored in App.css.
const PATH_PANEL_INSET = 304;
/** The map guide's id — its button, in the header, controls it. */
export const MAP_HINT_ID = 'map-hint';
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
  /** Fun mode: lonely concepts speak up, and fluff concepts appear. */
  fun?: boolean;
  /** The map guide is shown (its button is in the header) */
  hintOpen?: boolean;
  onFunChange?: (on: boolean) => void;
  /** Open a concept's atlas page */
  onOpenPage?: (id: string) => void;
  /** Open a relation's atlas page */
  onOpenRelationPage?: (id: string) => void;
}

export default function ConceptMapView({
  graph: fullGraph,
  progress,
  goalId,
  onGoalChange,
  selectedId,
  onSelect,
  onFocus,
  focus,
  theme,
  community = false,
  fun = false,
  onFunChange,
  hintOpen = false,
  onOpenPage,
  onOpenRelationPage,
}: ConceptMapViewProps) {
  // Fluff is fun mode only. The map always lays out `base` and draws the
  // fluff as a layer on top; everything this view lists, searches and checks
  // against uses `graph` — the base, plus the fluff while fun mode is on.
  const { base, fluff } = useMemo(() => splitFluff(fullGraph), [fullGraph]);
  const graph = fun ? fullGraph : base;
  const index = useMemo(() => buildConceptIndex(graph), [graph]);
  const path = useMemo(() => (goalId ? conceptPathFor(goalId, index) : null), [goalId, index]);

  // Proposed layer (community preview). Proposals come from a store — sample
  // fixtures for now — and are drawn over the confirmed graph, never mixed in.
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [showConfirmed, setShowConfirmed] = useState(true);
  const [showProposed, setShowProposed] = useState(true);
  // Phase 3: proposals come from GitHub (open pull requests) when the
  // community backend is set up, and from the sample fixtures otherwise —
  // `npm run dev`, or a deploy before set-up.
  const [me, setMe] = useState<Me | null>(null);
  const [backendChecked, setBackendChecked] = useState(false);
  const [listTick, setListTick] = useState(0);
  const [loadError, setLoadError] = useState('');
  const [lastSubmitted, setLastSubmitted] = useState<{ number: number; url: string; title: string } | null>(null);
  const [signInProblem, setSignInProblem] = useState<SignInProblem | null>(signInProblemOnLoad);
  useEffect(() => {
    if (!community) return;
    let alive = true;
    void fetchMe().then((m) => {
      if (!alive) return;
      setMe(m);
      setBackendChecked(true);
    });
    return () => {
      alive = false;
    };
  }, [community]);
  const live = Boolean(me?.configured);
  useEffect(() => {
    if (!community || !backendChecked) return;
    let alive = true;
    const store = live ? new GitHubStore() : new FixtureStore(graph);
    const load = () =>
      store
        .list()
        .then((list) => {
          if (!alive) return;
          setProposals(list);
          setLoadError('');
        })
        .catch((e: Error) => alive && setLoadError(e.message));
    void load();
    // A proposal someone else just submitted shows within a minute.
    const timer = live ? window.setInterval(load, 45_000) : 0;
    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, [community, backendChecked, live, graph, listTick]);
  const signOut = async () => {
    await logout();
    setMe(await fetchMe());
  };
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

  // The proposal editor (community preview): drafts kept in this browser, one
  // proposal each. The map shows each new concept as a ghost the proposer can
  // drag, and previews an edit on the confirmed concept itself.
  const drafts = useDrafts();
  const [editorOpen, setEditorOpen] = useState(false);
  const drafting = community && editorOpen && drafts.drafts.length > 0;
  const draft = drafting ? (drafts.drafts.find((d) => d.suffix === drafts.active) ?? drafts.drafts[0]) : null;
  const [near, setNear] = useState(NO_NEAR);
  const [draftStatus, setDraftStatus] = useState('');
  const [draftRecall, setDraftRecall] = useState(0);
  const draftCtx: DraftContext = useMemo(
    () => ({ confirmed: graph, drafts: drafts.drafts, proposals: activeProposals }),
    [graph, drafts.drafts, activeProposals],
  );
  const shapes = useMemo(
    () => (drafting ? drafts.drafts.map((d) => draftShape(d, draftCtx)) : NO_SHAPES),
    [drafting, drafts.drafts, draftCtx],
  );
  const own = draft ? mapId(draft) : '';
  // Everything a draft can name, by its id on the map: confirmed concepts,
  // other people's proposals, and the drafts (ghosts, and edits as previewed).
  const byMapId: ConceptMap = useMemo(
    () =>
      new Map([
        ...mergedIndex.byId,
        ...shapes.flatMap((s) => [
          ...(s.ghost ? [[s.ghost.id, s.ghost] as const] : []),
          ...(s.subject && s.subjectId ? [[s.subjectId, s.subject] as const] : []),
        ]),
      ]),
    [mergedIndex, shapes],
  );
  const editOf = draft?.editOf;
  const connectable = useCallback(
    (id: string) => byMapId.has(id) && id !== own && id !== editOf,
    [byMapId, own, editOf],
  );
  const onDraftNear = useCallback(
    (ids: string[], byHand: boolean, ghost: string) => {
      // Dragging a ghost is working on it: its draft becomes the one the editor shows.
      const dragged = drafts.drafts.find((d) => draftRef(d.suffix) === ghost);
      if (byHand && dragged && dragged.suffix !== drafts.active) drafts.setActive(dragged.suffix);
      setNear((prev) =>
        prev.byHand === byHand && prev.ghost === ghost && prev.ids.join() === ids.join() ? prev : { ids, byHand, ghost },
      );
    },
    [drafts],
  );
  const draftLabel = draft?.label ?? '';
  const similar = useMemo(() => {
    if (!draft) return [];
    const others = [
      ...graph.nodes.filter((n) => n.id !== draft.editOf),
      ...activeProposals.flatMap((p) => p.nodes),
      ...shapes.flatMap((s) => (s.ghost && s.key !== draft.suffix ? [s.ghost] : [])),
    ];
    return similarLabels(draftLabel, others);
  }, [draft, draftLabel, graph, activeProposals, shapes]);
  const connectedKey = draft
    ? [
        ...new Set([
          ...draft.relations.flatMap((r) => [r.source, r.target]),
          ...(draft.editOf ? neighborsOf(draft.editOf, index) : []),
        ]),
      ]
        .filter((id) => id !== NEW_CONCEPT && id !== draft.editOf)
        .sort()
        .join(' ')
    : '';
  const nearHere = near.ghost === own ? near : NO_NEAR;
  const suggestions = useMemo(() => {
    const connected = new Set(connectedKey ? connectedKey.split(' ') : []);
    // Dragging a ghost offers what it's dragged next to. Until then (and
    // always for an edit), suggestions come from the graph around what's
    // already connected — the same help without a pointer.
    const fromConnections = !nearHere.byHand && connected.size > 0;
    const pool = fromConnections
      ? [...connected].flatMap((id) => (mergedIndex.byId.has(id) ? neighborsOf(id, mergedIndex) : []))
      : nearHere.byHand
        ? nearHere.ids
        : [];
    const ids = [...new Set(pool)].filter((id) => !connected.has(id) && connectable(id)).slice(0, OFFERED);
    return { ids, from: fromConnections ? ('connections' as const) : ('map' as const) };
  }, [connectedKey, nearHere, mergedIndex, connectable]);
  const draftOverlay: DraftOverlay | null = useMemo(
    () =>
      drafting
        ? { drafts: shapes, activeKey: draft?.suffix ?? null, nearIds: suggestions.ids, conflictIds: similar.map((m) => m.node.id) }
        : null,
    [drafting, shapes, draft?.suffix, suggestions.ids, similar],
  );
  // The search offers confirmed concepts, other people's proposals and the other drafts.
  const searchEntries: SearchEntry[] = useMemo(() => {
    const entry = (ref: string, n: GraphNode, context: string) => ({ ref, title: n.label, context, color: TYPE_COLORS[n.type] });
    return [
      ...graph.nodes.map((n) => entry(n.id, n, NODE_TYPE_LABELS[n.type])),
      ...activeProposals.flatMap((p) => p.nodes.map((n) => entry(n.id, n, `proposed · ${NODE_TYPE_LABELS[n.type]}`))),
      ...shapes.flatMap((s) => (s.ghost && s.key !== draft?.suffix ? [entry(s.ghost.id, s.ghost, 'your draft')] : [])),
    ]
      .filter((e) => e.ref !== draft?.editOf)
      .sort((a, b) => a.title.localeCompare(b.title));
  }, [graph, activeProposals, shapes, draft?.suffix, draft?.editOf]);
  const connect = (ref: string) => {
    if (!draft || !connectable(ref)) return;
    const label = byMapId.get(ref)?.label ?? ref;
    drafts.update(draft.suffix, (d) => ({
      ...d,
      relations: [
        ...d.relations,
        { key: `r${Date.now().toString(36)}${d.relations.length}`, source: NEW_CONCEPT, target: ref, relationship: 'relates' },
      ],
    }));
    setDraftStatus(
      index.byId.has(ref)
        ? `Connected to ${label} — choose the relation under Connections.`
        : `Connected to ${label}, which isn't accepted yet: this proposal now depends on it, and the relation is dropped if it's rejected.`,
    );
  };
  // While drafting, clicking a concept on the map connects it instead of opening its card.
  const selectOnMap = (id: string | null) => {
    if (!draft || id === null) return onSelect(id);
    if (id === own)
      setDraftStatus(draft.editOf ? 'That’s the concept you’re editing.' : 'That’s your draft — drag it to where it seems to fit.');
    else if (connectable(id)) connect(id);
    else setDraftStatus('That can’t be connected.');
  };
  const editorButtonRef = useRef<HTMLButtonElement>(null);
  const openEditor = () => {
    if (drafts.drafts.length === 0) drafts.add(newDraft());
    setEditorOpen(true);
    setNear(NO_NEAR);
    setDraftStatus('');
    onSelect(null);
  };
  const addConceptDraft = () => {
    drafts.add(newDraft());
    setNear(NO_NEAR);
    setDraftStatus('Started another concept. Each one is exported, and later submitted, on its own.');
  };
  const proposeEdit = (node: GraphNode) => {
    const existing = drafts.drafts.find((d) => d.editOf === node.id);
    if (existing) drafts.setActive(existing.suffix);
    else drafts.add(newEditDraft(node));
    setEditorOpen(true);
    setNear(NO_NEAR);
    setDraftStatus(existing ? `You were already editing ${node.label}.` : `Editing ${node.label}: the form is filled in from it.`);
    // Keep the concept being edited in view (highlighted, not opened — the editor has the panel).
    onFocus(node.id);
  };
  const switchDraft = (suffix: string) => {
    drafts.setActive(suffix);
    setNear(NO_NEAR);
    setDraftStatus('');
  };
  // Closing leaves no card behind: a concept shown from the editor was a look, not a pick.
  const closeEditor = () => {
    setEditorOpen(false);
    onSelect(null);
  };
  const discardDraft = () => {
    if (!draft) return;
    const name = proposalTitle(draft);
    const removed = drafts.discard(draft.suffix);
    setNear(NO_NEAR);
    setDraftStatus(
      `Discarded “${name}”.${removed ? ` Removed ${removed} relation${removed === 1 ? '' : 's'} from your other drafts that pointed at it.` : ''}`,
    );
    if (drafts.drafts.length <= 1) closeEditor();
  };
  // Submit: one pull request, opened by the Physics Atlas app on the signed-in
  // proposer's behalf. The draft then lives on as an open proposal.
  const submitDraft = async (): Promise<SubmitResult> => {
    if (!draft || !me?.user) return { ok: false, error: 'Sign in with GitHub first.' };
    const signed = { ...draft, author: me.user.name || me.user.login };
    const result = await submitProposal(draftProposal(signed, draftCtx), pullRequestText(signed, draftCtx));
    if (result.ok) {
      setLastSubmitted({ number: result.number, url: result.url, title: proposalTitle(draft) });
      setNear(NO_NEAR);
      setDraftStatus(`Submitted “${proposalTitle(draft)}” as pull request #${result.number}.`);
      drafts.submitted(draft.suffix);
      setListTick((t) => t + 1);
    }
    return result;
  };

  const selected = selectedId ? index.byId.get(selectedId) : undefined;
  // A relation's card: opened by clicking its line, or "Details" in a concept's
  // relation list. Picking a concept closes it, and the other way round.
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  useEffect(() => {
    if (selectedId) setSelectedEdgeId(null);
  }, [selectedId]);
  const edgeById = useMemo(
    () =>
      new Map<string, { edge: GraphEdge; proposal?: string }>([
        ...graph.edges.map((edge) => [edge.id, { edge }] as const),
        ...activeProposals.flatMap((p) => p.edges.map((edge) => [edge.id, { edge, proposal: p.title }] as const)),
      ]),
    [graph.edges, activeProposals],
  );
  const selectedEdge = !drafting && selectedEdgeId ? edgeById.get(selectedEdgeId) : undefined;
  const selectEdge = (id: string | null) => {
    if (drafting) return;
    if (id) onSelect(null);
    setSelectedEdgeId(id);
  };
  // An edit proposal has no concept of its own: its card opens from the
  // confirmed concept's "Open proposals" list, for as long as that's selected.
  const [openProposal, setOpenProposal] = useState<{ id: string; on: string } | null>(null);
  const listedProposal =
    openProposal && openProposal.on === selectedId ? activeProposals.find((p) => p.id === openProposal.id) : undefined;
  const selectedProposal = listedProposal ?? (selectedId ? byProposedNode.get(selectedId) : undefined);
  const proposedNode = listedProposal
    ? (listedProposal.edits?.[0] ?? listedProposal.nodes[0])
    : selectedProposal && selectedId
      ? mergedIndex.byId.get(selectedId)
      : undefined;
  const cardOpen = Boolean(selected || proposedNode);
  // Open proposals about the selected confirmed concept.
  const proposalsHere = useMemo(
    () => (selected && showProposed ? proposalsAbout(selected.id, activeProposals, graph.edges) : []),
    [selected, activeProposals, showProposed, graph.edges],
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
  const edgeEnds = useMemo(
    () => (selectedEdge ? new Set([selectedEdge.edge.source, selectedEdge.edge.target]) : null),
    [selectedEdge],
  );
  const fitIds = edgeEnds ?? path?.highlight ?? neighbors;
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
  const edgeCardRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!selectedEdgeId) return;
    const active = document.activeElement;
    if (active instanceof HTMLElement && !edgeCardRef.current?.contains(active) && active !== document.body)
      returnFocusRef.current = active;
    edgeCardRef.current?.focus({ preventScroll: true });
  }, [selectedEdgeId]);
  const closeEdgeCard = () => {
    setSelectedEdgeId(null);
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
          {community && (
            <CommunityAccount
              checked={backendChecked}
              me={me}
              loadError={loadError}
              lastSubmitted={lastSubmitted}
              onSignOut={signOut}
              signInProblem={signInProblem}
              onDismissProblem={() => setSignInProblem(null)}
            />
          )}
          {community && !drafting && (
            <button ref={editorButtonRef} type="button" className="concept-propose" onClick={openEditor}>
              <span aria-hidden>＋ </span>
              {drafts.drafts.some(hasContent)
                ? `Continue your drafts (${drafts.drafts.length})`
                : 'Propose a concept'}
            </button>
          )}
          <details className="concept-index">
            <summary className="concept-index-summary">All concepts as a list</summary>
            {overlay && showProposed && (
              <div className="concept-index-group concept-index-proposals">
                <h3 className="block-heading">
                  Proposed — not yet confirmed
                  <span className="rel-count">{overlay.nodes.length + overlay.edits.length}</span>
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
                  {overlay.edits.map(({ id, badge, proposalId }) => {
                    const n = index.byId.get(id);
                    return (
                      n && (
                        <li key={proposalId}>
                          <button
                            className="concept-index-item"
                            onClick={() => {
                              onFocus(id);
                              setOpenProposal({ id: proposalId, on: id });
                            }}
                          >
                            <TypeBadge type={n.type} />
                            <span>
                              {n.label}
                              <span className="concept-path-type">{badge}</span>
                            </span>
                          </button>
                        </li>
                      )
                    );
                  })}
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

        {/* The map guide; its button is in the header (App.tsx). */}
        <p className="map-hint" id={MAP_HINT_ID} hidden={!hintOpen}>
          Colour = kind of concept, size = how general it is — zoom in to reveal less
          important concepts. Each line names its relation — hover one to highlight the two
          concepts it joins, click it to read how they connect. Click a concept to see its direct
          connections — <span className="ink-pre">silver</span> leads into it,{' '}
          <span className="ink-post">gold</span> leads out of it. Click a type in the legend to see what
          it means.
        </p>

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
                update={(change) => drafts.update(draft.suffix, change)}
                ctx={draftCtx}
                index={index}
                byMapId={byMapId}
                onSwitch={switchDraft}
                onAddConcept={addConceptDraft}
                similar={similar}
                suggestions={suggestions}
                searchEntries={searchEntries}
                fun={fun}
                onConnect={connect}
                onRecall={() => {
                  setDraftRecall((n) => n + 1);
                  setDraftStatus('Moved the draft to the middle of the map view.');
                }}
                onShow={onFocus}
                onClose={closeEditor}
                onDiscard={discardDraft}
                status={draftStatus}
                submission={
                  live && me
                    ? {
                        user: me.user,
                        invited: me.invited,
                        loginHref: loginHref(`${window.location.pathname}${window.location.search}`),
                        onSubmit: submitDraft,
                      }
                    : null
                }
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
                {listedProposal && selected && (
                  <button type="button" className="draft-link proposal-back" onClick={() => setOpenProposal(null)}>
                    ← Back to {selected.label}
                  </button>
                )}
                <ProposalCard
                  proposal={selectedProposal}
                  node={proposedNode}
                  byId={mergedIndex.byId}
                  confirmed={graph}
                  proposals={activeProposals}
                  onPick={onFocus}
                />
              </Suspense>
            )}
            {selected && !listedProposal && (
            <>
            <ConceptCard node={selected} index={index} onPick={onFocus}>
              {selected.type === 'equation' && (
                <Suspense
                  fallback={
                    <div className="rel-block concept-equation">
                      <p className="concept-equation-formula concept-equation-source">{selected.attrs.equation}</p>
                    </div>
                  }
                >
                  <EquationView attrs={selected.attrs} />
                </Suspense>
              )}

              {selected.type === 'formalism' && (
                <Suspense fallback={<p className="concept-empty">Loading the formulas…</p>}>
                  <FormulaView formulas={selected.attrs.formulas ?? []} />
                </Suspense>
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
                  onDetails={selectEdge}
                />
              )}
              {incoming.length > 0 && (
                <RelationGroup
                  heading="Into this concept"
                  edges={incoming}
                  selfId={selected.id}
                  index={index}
                  onPick={onFocus}
                  onDetails={selectEdge}
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
                      <button
                        className="concept-relation-link"
                        onClick={() =>
                          p.nodes.length > 0 ? onFocus(p.nodes[0].id) : setOpenProposal({ id: p.id, on: selected.id })
                        }
                      >
                        {p.title}
                      </button>{' '}
                      <span className="concept-via">{badgeText(p)}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {(selected.type !== 'fluff' || community) && (
              <div className="map-card-cta">
                {/* Every confirmed concept has a page (fluff is fun mode only). */}
                {selected.type !== 'fluff' && onOpenPage && (
                  <a
                    className="map-card-page"
                    href={pageHref(selected.id)}
                    onClick={(e) => {
                      if (!isPlainClick(e)) return;
                      e.preventDefault();
                      onOpenPage(selected.id);
                    }}
                  >
                    Open its page<span className="visually-hidden">: {selected.label}</span>
                    <span aria-hidden> →</span>
                  </a>
                )}
                {/* Fluff never joins a learning path (the validator keeps it out). */}
                {selected.id !== goalId && selected.type !== 'fluff' && (
                  <button className="map-card-goal" onClick={() => onGoalChange(selected.id)}>
                    ★ Show path to this
                  </button>
                )}
                {community && selected.type !== 'resource' && (
                  <button type="button" className="draft-button map-card-edit" onClick={() => proposeEdit(selected)}>
                    <span aria-hidden>✎ </span>Propose an edit
                  </button>
                )}
              </div>
            )}
            </>
            )}

            <button className="map-card-close" onClick={closeCard} aria-label="Close concept card">
              ×
            </button>
          </aside>
        )}

        {selectedEdge && !cardOpen && (
          <aside
            className="map-card concept-map-card"
            key={selectedEdgeId}
            ref={edgeCardRef}
            tabIndex={-1}
            aria-labelledby={EDGE_CARD_TITLE_ID}
            onKeyDown={(e) => e.key === 'Escape' && closeEdgeCard()}
          >
            <Suspense fallback={<p className="concept-empty">Loading the relation…</p>}>
              <EdgeCard
                edge={selectedEdge.edge}
                byId={mergedIndex.byId}
                onPick={onFocus}
                proposedIn={selectedEdge.proposal}
                onOpenPage={selectedEdge.proposal ? undefined : onOpenRelationPage}
              />
            </Suspense>
            <button className="map-card-close" onClick={closeEdgeCard} aria-label="Close relation card">
              ×
            </button>
          </aside>
        )}

        {/* Canvas, map controls and legend come last in the DOM so keyboard
            users reach the concept list, path and card first; CSS keeps the
            canvas underneath. */}
        <GraphView
          concepts={base}
          fluff={fun ? fluff : null}
          fun={fun}
          selectedId={selectedId}
          highlightIds={highlightIds}
          doneIds={doneIds}
          directionalSelect={!goal}
          focus={focus}
          onSelect={selectOnMap}
          selectedEdgeId={selectedEdge ? selectedEdgeId : null}
          onSelectEdge={selectEdge}
          theme={theme}
          label={`Concept map, ${graph.nodes.length} concepts${
            overlay ? ` and ${overlay.nodes.length} proposed` : ''
          }${drafting ? ', plus your draft' : ''}. Drawn visually; to reach every concept by keyboard, use the search box or the "All concepts as a list" panel.`}
          goalId={goal ? goal.id : null}
          fitIds={fitIds}
          fitInsets={{
            left: goal ? PATH_PANEL_INSET : 0,
            right: cardOpen || drafting || selectedEdge ? cardInset() : 0,
            bottom: LEGEND_INSET,
          }}
          overlay={overlay}
          layers={{ confirmed: showConfirmed, overlay: showProposed }}
          draft={draftOverlay}
          onDraftNear={onDraftNear}
          draftRecall={draftRecall}
          extraControls={
            <>
              {community && (
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
              )}
              <button
                type="button"
                className="graph-control graph-control-text"
                aria-pressed={fun}
                onClick={() => onFunChange?.(!fun)}
                title="A playful view: concepts without relations speak up, and fluff concepts appear"
              >
                Fun mode
              </button>
            </>
          }
        />
        <p className="visually-hidden" role="status" aria-live="polite">
          {fun
            ? 'Fun mode on: concepts without relations say so in a speech bubble after the map, and fluff concepts appear.'
            : ''}
        </p>
        <Legend statuses={Boolean(overlay) || drafting} draft={drafting} fun={fun} />
      </div>
    </div>
  );
}

/**
 * Where the community view's proposals come from, and who's signed in. Signing
 * in is only needed to submit — browsing, drafting and exporting don't.
 */
function CommunityAccount({
  checked,
  me,
  loadError,
  lastSubmitted,
  onSignOut,
  signInProblem,
  onDismissProblem,
}: {
  checked: boolean;
  me: Me | null;
  loadError: string;
  lastSubmitted: { number: number; url: string; title: string } | null;
  onSignOut: () => void;
  /** Why the last sign-in didn't complete, until dismissed */
  signInProblem: SignInProblem | null;
  onDismissProblem: () => void;
}) {
  if (!checked) return null;
  const here = `${window.location.pathname}${window.location.search}`;
  return (
    <section className="community-account" aria-label="Community account">
      {signInProblem && (
        <div className="draft-warning" role="alert">
          <p>
            <span aria-hidden>⚠ </span>
            <strong>Not signed in.</strong> {signInProblemText(signInProblem)}
          </p>
          <button type="button" className="draft-link" onClick={onDismissProblem}>
            Dismiss
          </button>
        </div>
      )}
      {!me?.configured ? (
        <p className="community-account-note">
          Showing <strong>sample</strong> proposals — this site isn't connected to GitHub yet. You can still draft and
          export.
        </p>
      ) : me.user ? (
        <>
          <p className="community-account-who">
            {me.user.avatar && <img className="community-avatar" src={me.user.avatar} alt="" width={24} height={24} />}
            <span>
              Signed in as <strong>{me.user.name}</strong> <span className="concept-via">@{me.user.login}</span>
            </span>
          </p>
          {!me.invited && (
            <p className="community-account-note">
              You're not on the invite list yet, so you can't submit. You can still draft and export — ask a curator
              to add <strong>@{me.user.login}</strong>.
            </p>
          )}
          <button type="button" className="draft-link" onClick={onSignOut}>
            Sign out
          </button>
        </>
      ) : (
        <>
          <a className="draft-button community-signin" href={loginHref(here)}>
            Sign in with GitHub
          </a>
          <p className="community-account-note">
            Only needed to submit a proposal. Physics Atlas reads your public GitHub profile — nothing else.
          </p>
          <p className="community-account-note">
            If GitHub shows a 404 page instead of asking you to authorise Physics Atlas, its GitHub App isn't open to
            your account yet — tell the curators.
          </p>
        </>
      )}
      {me?.configured && <p className="community-account-note">Proposals: open pull requests on GitHub.</p>}
      <p className="visually-hidden" role="status" aria-live="polite">
        {loadError || (lastSubmitted ? `Submitted as pull request ${lastSubmitted.number}.` : '')}
      </p>
      {loadError && <p className="draft-warning">{loadError}</p>}
      {lastSubmitted && (
        <p className="community-account-note">
          Submitted “{lastSubmitted.title}”:{' '}
          <a className="concept-resource-link" href={lastSubmitted.url} target="_blank" rel="noreferrer">
            pull request #{lastSubmitted.number} ↗
          </a>
        </p>
      )}
    </section>
  );
}

function RelationGroup({
  heading,
  edges,
  selfId,
  index,
  onPick,
  onDetails,
}: {
  heading: string;
  edges: GraphEdge[];
  selfId: string;
  index: ConceptIndex;
  onPick: (id: string) => void;
  /** Opens the relation's card */
  onDetails: (edgeId: string) => void;
}) {
  return (
    <>
      <p className="concept-relations-heading">{heading}</p>
      <ul className="concept-relations">
        {edges.map((e) => (
          <li key={e.id}>
            <RelationSentence edge={e} byId={index.byId} selfId={selfId} onPick={onPick} />{' '}
            <button type="button" className="draft-link concept-relation-details" onClick={() => onDetails(e.id)}>
              Details<span className="visually-hidden"> of this relation</span>
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}
