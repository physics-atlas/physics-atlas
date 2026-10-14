import { useEffect, useMemo, useRef } from 'react';
import { NODE_TYPE_LABELS } from '../data/types';
import type { ConceptGraph, GraphEdge } from '../data/types';
import { buildConceptIndex, conceptPathFor, neighborsOf } from '../graph/concepts';
import type { ConceptIndex } from '../graph/concepts';
import { TYPE_ORDER } from '../graph/typeColors';
import type { Progress } from '../lib/useProgress';
import ConceptCard, { CONCEPT_CARD_TITLE_ID } from './ConceptCard';
import GraphView from './GraphView';
import Legend from './Legend';
import RelationSentence from './RelationSentence';
import TypeBadge from './TypeBadge';

const PROGRESS_PREFIX = 'concept:';
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
}: ConceptMapViewProps) {
  const index = useMemo(() => buildConceptIndex(graph), [graph]);
  const path = useMemo(() => (goalId ? conceptPathFor(goalId, index) : null), [goalId, index]);
  const selected = selectedId ? index.byId.get(selectedId) : undefined;
  const neighbors = useMemo(
    () => (selected ? new Set(neighborsOf(selected.id, index)) : null),
    [selected, index],
  );
  // A goal path owns the highlight; otherwise a click shows the concept's
  // direct connections (GraphView's directional select colours them).
  const highlightIds = path?.highlight ?? null;
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
    if (!selectedId) return;
    const active = document.activeElement;
    if (active instanceof HTMLElement && !cardRef.current?.contains(active) && active !== document.body)
      returnFocusRef.current = active;
    cardRef.current?.focus({ preventScroll: true });
  }, [selectedId]);
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
        nodes: graph.nodes.filter((n) => n.type === type),
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
          <details className="concept-index">
            <summary className="concept-index-summary">All concepts as a list</summary>
            {byType.map(({ type, nodes }) => (
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

        {!selected && !goal && (
          <p className="map-hint">
            Colour = kind of concept, size = how important it is — zoom in to reveal finer
            detail. Each line names its relation —
            hover one to highlight the two concepts it joins. Click a concept to see its direct
            connections — <span className="ink-pre">silver</span> leads into it,{' '}
            <span className="ink-post">gold</span> leads out of it. Click a type in the legend to see what
            it means.
          </p>
        )}

        {selected && (
          <aside
            className="map-card concept-map-card"
            key={selected.id}
            ref={cardRef}
            tabIndex={-1}
            aria-labelledby={CONCEPT_CARD_TITLE_ID}
            onKeyDown={(e) => e.key === 'Escape' && closeCard()}
          >
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

            {selected.id !== goalId && (
              <div className="map-card-cta">
                <button className="map-card-goal" onClick={() => onGoalChange(selected.id)}>
                  ★ Show path to this
                </button>
              </div>
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
          onSelect={onSelect}
          large
          theme={theme}
          label={`Concept map, ${graph.nodes.length} concepts. Drawn visually; to reach every concept by keyboard, use the search box or the "All concepts as a list" panel.`}
          goalId={goal ? goal.id : null}
          fitIds={fitIds}
          fitInsets={{
            left: goal ? PATH_PANEL_INSET : 0,
            right: selected ? cardInset() : 0,
            bottom: LEGEND_INSET,
          }}
        />
        <Legend variant="type" />
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
