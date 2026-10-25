import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import type { MouseEvent, ReactNode, RefObject } from 'react';
import { NODE_TYPE_LABELS } from '../data/types';
import type { ConceptGraph, GraphEdge, GraphNode, NodeType } from '../data/types';
import { buildConceptIndex, sentenceParts } from '../graph/concepts';
import type { ConceptIndex, ConceptMap } from '../graph/concepts';
import { CARD_SECTIONS, CONDITION_SECTIONS, conditionItems, sectionItems } from '../graph/cardSections';
import {
  buildContents,
  filterContents,
  neighbourGroups,
  pageNeighbours,
  relationTypes,
  trail,
  typeGroups,
} from '../graph/contents';
import type { Contents, PageFilter } from '../graph/contents';
import { TYPE_GROUPS } from '../graph/typeColors';
import { assumptionsOf } from '../graph/concepts';
import EquationView, { FormulaView } from './EquationView';
import RichText from './RichText';
import TypeBadge from './TypeBadge';
import { isPlainClick, pageHref } from '../lib/pageLinks';

// The atlas as pages, like a book of lecture notes: a contents sidebar, and a
// page per concept with everything the map knows about it, at length. Loaded
// on demand (it typesets maths). Every link is a real link — open it in a new
// tab, copy it — and moving between pages works like a page load for a
// screen reader: focus lands on the new page's heading, and its title changes.

export const PAGE_TITLE_ID = 'atlas-page-title';
const SIDEBAR_ID = 'atlas-sidebar';

type SidebarView = 'contents' | 'neighbours' | 'types';
const VIEWS: { key: SidebarView; label: string }[] = [
  { key: 'contents', label: 'Contents' },
  { key: 'neighbours', label: 'Neighbours' },
  { key: 'types', label: 'By kind' },
];
const VIEW_KEY = 'physics-atlas-page-sidebar-v1';

function storedView(): SidebarView {
  try {
    const v = localStorage.getItem(VIEW_KEY);
    return v === 'neighbours' || v === 'types' ? v : 'contents';
  } catch {
    return 'contents';
  }
}

interface PageViewProps {
  /** The confirmed, serious graph (no fluff) */
  graph: ConceptGraph;
  /** The page shown; null is the atlas's front page */
  pageId: string | null;
  onOpenPage: (id: string | null) => void;
  onShowOnMap: (id: string) => void;
  /** Changes when a navigation should move focus to the page's heading */
  focusTick: number;
}

export default function PageView({ graph, pageId, onOpenPage, onShowOnMap, focusTick }: PageViewProps) {
  const index = useMemo(() => buildConceptIndex(graph), [graph]);
  const contents = useMemo(() => buildContents(index), [index]);
  const allRelations = useMemo(() => relationTypes(graph.edges), [graph]);
  const [view, setView] = useState<SidebarView>(storedView);
  const [filter, setFilter] = useState<PageFilter>(() => ({
    types: new Set(graph.nodes.map((n) => n.type)),
    relations: new Set(allRelations),
    text: '',
  }));
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const node = pageId ? index.byId.get(pageId) : undefined;

  const chooseView = (v: SidebarView) => {
    setView(v);
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {
      // storage blocked — the choice lasts this visit
    }
  };

  // A link that navigates in place; with a modifier key (new tab, new window) it's left to the browser.
  const go = (id: string | null) => (e: MouseEvent<HTMLAnchorElement>) => {
    if (!isPlainClick(e)) return;
    e.preventDefault();
    setSidebarOpen(false);
    onOpenPage(id);
  };
  const link = (id: string, children: ReactNode, extra: Record<string, unknown> = {}) => (
    <a href={pageHref(id)} onClick={go(id)} {...extra}>
      {children}
    </a>
  );

  // Each page is a page to assistive tech: its own title, focus on its heading.
  const headingRef = useRef<HTMLHeadingElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const articleRef = useRef<HTMLElement>(null);
  useEffect(() => {
    document.title = `${node ? `${node.label} — ` : ''}Atlas pages — Physics Atlas`;
  }, [node]);
  useEffect(() => {
    articleRef.current?.scrollTo?.({ top: 0 });
    if (focusTick > 0) headingRef.current?.focus({ preventScroll: true });
  }, [focusTick, pageId]);

  return (
    <div className="atlas-pages">
      {/* The contents run to every concept: a second skip link goes past them to the page. */}
      <a
        className="skip-link"
        href={`#${PAGE_TITLE_ID}`}
        onClick={(e) => {
          e.preventDefault();
          headingRef.current?.focus();
        }}
      >
        Skip to the page
      </a>
      <button
        type="button"
        ref={toggleRef}
        className="atlas-contents-toggle draft-button"
        aria-expanded={sidebarOpen}
        aria-controls={SIDEBAR_ID}
        onClick={() => setSidebarOpen((o) => !o)}
      >
        {sidebarOpen ? 'Hide the contents' : 'Contents'}
      </button>
      <nav
        id={SIDEBAR_ID}
        className={`atlas-sidebar${sidebarOpen ? ' atlas-sidebar-open' : ''}`}
        aria-labelledby="atlas-sidebar-title"
        onKeyDown={(e) => {
          // On a phone the contents are a drawer: Escape folds it and returns to its button.
          if (e.key !== 'Escape' || !sidebarOpen) return;
          setSidebarOpen(false);
          toggleRef.current?.focus();
        }}
      >
        <h2 className="atlas-sidebar-title" id="atlas-sidebar-title">
          Atlas contents
        </h2>
        <Sidebar
          view={view}
          onView={chooseView}
          filter={filter}
          onFilter={setFilter}
          allRelations={allRelations}
          index={index}
          contents={contents}
          currentId={node?.id ?? null}
          link={link}
        />
      </nav>
      <article className="atlas-page" ref={articleRef} aria-labelledby={PAGE_TITLE_ID}>
        {node ? (
          <ConceptPage
            node={node}
            index={index}
            contents={contents}
            link={link}
            go={go}
            headingRef={headingRef}
            onShowOnMap={onShowOnMap}
          />
        ) : (
          <FrontPage
            index={index}
            contents={contents}
            link={link}
            headingRef={headingRef}
            missing={pageId}
          />
        )}
      </article>
    </div>
  );
}

type LinkFn = (id: string, children: ReactNode, extra?: Record<string, unknown>) => ReactNode;
type GoFn = (id: string | null) => (e: MouseEvent<HTMLAnchorElement>) => void;

/* ---------- the sidebar: contents, neighbours, by kind ---------- */

function Sidebar({
  view,
  onView,
  filter,
  onFilter,
  allRelations,
  index,
  contents,
  currentId,
  link,
}: {
  view: SidebarView;
  onView: (v: SidebarView) => void;
  filter: PageFilter;
  onFilter: (f: PageFilter) => void;
  allRelations: string[];
  index: ConceptIndex;
  contents: Contents;
  currentId: string | null;
  link: LinkFn;
}) {
  const presentTypes = useMemo(() => new Set([...index.byId.values()].map((n) => n.type)), [index]);
  const total = index.byId.size;
  const matching = [...index.byId.values()].filter(
    (n) => filter.types.has(n.type) && (!filter.text.trim() || n.label.toLowerCase().includes(filter.text.trim().toLowerCase())),
  ).length;
  const filtered = matching < total || filter.relations.size < allRelations.length;
  const toggleType = (t: NodeType) => {
    const types = new Set(filter.types);
    if (types.has(t)) types.delete(t);
    else types.add(t);
    onFilter({ ...filter, types });
  };
  const toggleRelation = (r: string) => {
    const relations = new Set(filter.relations);
    if (relations.has(r)) relations.delete(r);
    else relations.add(r);
    onFilter({ ...filter, relations });
  };
  const reset = () => onFilter({ types: new Set(presentTypes), relations: new Set(allRelations), text: '' });

  return (
    <>
      <fieldset className="atlas-views">
        <legend className="atlas-small-label">Show</legend>
        {VIEWS.map((v) => (
          <label key={v.key} className={`atlas-view${view === v.key ? ' atlas-view-on' : ''}`}>
            <input type="radio" name="atlas-view" value={v.key} checked={view === v.key} onChange={() => onView(v.key)} />
            {v.label}
          </label>
        ))}
      </fieldset>

      <div className="atlas-filter-name">
        <label className="atlas-small-label" htmlFor="atlas-filter-text">
          Filter by name
        </label>
        <input
          id="atlas-filter-text"
          className="draft-input"
          type="search"
          value={filter.text}
          onChange={(e) => onFilter({ ...filter, text: e.target.value })}
          autoComplete="off"
        />
      </div>

      <details className="atlas-filters">
        <summary>Filter by kind{filtered ? ' (on)' : ''}</summary>
        <fieldset className="atlas-filter-group">
          <legend className="atlas-small-label">Kinds of concept</legend>
          {TYPE_GROUPS.map((g) => {
            const types = g.types.filter((t) => presentTypes.has(t));
            if (types.length === 0) return null;
            return (
              <div key={g.key} className="atlas-filter-family">
                <p className="atlas-filter-family-name">{g.label}</p>
                {types.map((t) => (
                  <label key={t} className="atlas-check">
                    <input type="checkbox" checked={filter.types.has(t)} onChange={() => toggleType(t)} />
                    <TypeBadge type={t} />
                    {NODE_TYPE_LABELS[t]}
                  </label>
                ))}
              </div>
            );
          })}
        </fieldset>
        <fieldset className="atlas-filter-group">
          <legend className="atlas-small-label">Kinds of relation</legend>
          <p className="atlas-filter-note">Used by the Neighbours view.</p>
          {allRelations.map((r) => (
            <label key={r} className="atlas-check">
              <input type="checkbox" checked={filter.relations.has(r)} onChange={() => toggleRelation(r)} />
              {r}
            </label>
          ))}
        </fieldset>
        {filtered && (
          <button type="button" className="draft-link" onClick={reset}>
            Show everything again
          </button>
        )}
      </details>

      <p className="atlas-filter-status" role="status">
        {filtered || filter.text.trim() ? `${matching} of ${total} concepts match.` : ''}
      </p>

      {view === 'contents' && (
        <ContentsTree contents={contents} index={index} filter={filter} currentId={currentId} link={link} />
      )}
      {view === 'neighbours' && <NeighboursList index={index} filter={filter} currentId={currentId} link={link} />}
      {view === 'types' && <TypeList index={index} filter={filter} currentId={currentId} link={link} contents={contents} />}
    </>
  );
}

const current = (id: string, currentId: string | null) =>
  id === currentId ? { 'aria-current': 'page' as const, className: 'atlas-current' } : {};

function ContentsTree({
  contents,
  index,
  filter,
  currentId,
  link,
}: {
  contents: Contents;
  index: ConceptIndex;
  filter: PageFilter;
  currentId: string | null;
  link: LinkFn;
}) {
  const { shown, matches } = useMemo(() => filterContents(contents, index, filter), [contents, index, filter]);
  const searching = Boolean(filter.text.trim()) || matches.size < index.byId.size;
  // Open: the current page's chapter and sections above it; everything while filtering.
  const [open, setOpen] = useState<Set<string>>(() => new Set(currentId ? [...trail(currentId, contents), currentId] : []));
  useEffect(() => {
    if (!currentId) return;
    setOpen((o) => new Set([...o, ...trail(currentId, contents), currentId]));
  }, [currentId, contents]);
  const listRef = useRef<HTMLUListElement>(null);
  // Bring the current page's entry into view by scrolling the sidebar itself —
  // scrollIntoView would also move where the next Tab starts from.
  useEffect(() => {
    const el = listRef.current?.querySelector('[aria-current="page"]');
    const pane = listRef.current?.closest('.atlas-sidebar');
    if (!el || !pane) return;
    const r = el.getBoundingClientRect(), p = pane.getBoundingClientRect();
    if (r.top < p.top || r.bottom > p.bottom) pane.scrollTop += r.top - p.top - p.height / 3;
  }, [currentId]);

  if (shown.size === 0) return <p className="atlas-empty">No concept matches the filter.</p>;
  const item = (id: string): ReactNode => {
    if (!shown.has(id)) return null;
    const entry = contents.byId.get(id)!;
    const n = index.byId.get(id)!;
    const kids = entry.children.filter((c) => shown.has(c));
    const isOpen = searching || open.has(id);
    const context = !matches.has(id);
    return (
      <li key={id} className={context ? 'atlas-context' : undefined}>
        <span className="atlas-row">
          {kids.length > 0 && !searching ? (
            <button
              type="button"
              className="atlas-disclosure"
              aria-expanded={isOpen}
              onClick={() =>
                setOpen((o) => {
                  const next = new Set(o);
                  if (next.has(id)) next.delete(id);
                  else next.add(id);
                  return next;
                })
              }
            >
              <span aria-hidden>{isOpen ? '▾' : '▸'}</span>
              <span className="visually-hidden">
                {isOpen ? 'Hide' : 'Show'} the sections in {n.label}
              </span>
            </button>
          ) : (
            <span className="atlas-disclosure-space" aria-hidden />
          )}
          {link(
            id,
            <>
              <span className="atlas-number">{entry.number}</span> {n.label}
              {context && <span className="visually-hidden"> (doesn't match; contains matches)</span>}
            </>,
            current(id, currentId),
          )}
        </span>
        {kids.length > 0 && isOpen && <ul>{kids.map(item)}</ul>}
      </li>
    );
  };
  return (
    <ul className="atlas-tree" ref={listRef}>
      {contents.roots.map(item)}
    </ul>
  );
}

function NeighboursList({
  index,
  filter,
  currentId,
  link,
}: {
  index: ConceptIndex;
  filter: PageFilter;
  currentId: string | null;
  link: LinkFn;
}) {
  const node = currentId ? index.byId.get(currentId) : undefined;
  if (!node) return <p className="atlas-empty">Open a page to see what it's connected to.</p>;
  const g = neighbourGroups(node.id, index, filter);
  const groups = [
    { title: `From ${node.label}`, items: g.out.map((i) => ({ id: i.other.id, label: i.other.label, how: i.relation, type: i.other.type })) },
    { title: `Into ${node.label}`, items: g.in.map((i) => ({ id: i.other.id, label: i.other.label, how: i.relation, type: i.other.type })) },
    { title: 'Assumes', items: g.assumes.map((n) => ({ id: n.id, label: n.label, how: '', type: n.type })) },
    { title: 'Assumed by', items: g.assumedBy.map((n) => ({ id: n.id, label: n.label, how: '', type: n.type })) },
  ].filter((x) => x.items.length > 0);
  if (groups.length === 0) return <p className="atlas-empty">Nothing connected matches the filter.</p>;
  return (
    <div className="atlas-neighbours">
      {groups.map((grp) => (
        <section key={grp.title} aria-label={grp.title}>
          <h3 className="atlas-small-label">{grp.title}</h3>
          <ul className="atlas-flat">
            {grp.items.map((i) => (
              <li key={`${i.how}-${i.id}`}>
                <TypeBadge type={i.type} />
                <span>
                  {i.how && <span className="atlas-how">{i.how} </span>}
                  {link(i.id, i.label)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function TypeList({
  index,
  filter,
  currentId,
  link,
  contents,
}: {
  index: ConceptIndex;
  filter: PageFilter;
  currentId: string | null;
  link: LinkFn;
  contents: Contents;
}) {
  const groups = typeGroups(index, filter);
  if (groups.length === 0) return <p className="atlas-empty">No concept matches the filter.</p>;
  return (
    <div className="atlas-bytype">
      {groups.map((g) => (
        <section key={g.key} aria-label={g.label}>
          <h3 className="atlas-small-label">{g.label}</h3>
          {g.types.map(({ type, nodes }) => (
            <div key={type} className="atlas-type">
              <p className="atlas-type-name">
                <TypeBadge type={type} /> {NODE_TYPE_LABELS[type]}
              </p>
              <ul className="atlas-flat">
                {nodes.map((n) => (
                  <li key={n.id}>
                    {link(
                      n.id,
                      <>
                        <span className="atlas-number">{contents.byId.get(n.id)?.number}</span> {n.label}
                      </>,
                      current(n.id, currentId),
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </section>
      ))}
    </div>
  );
}

/* ---------- the page itself ---------- */

function PageNav({
  id,
  contents,
  index,
  link,
  go,
  label,
}: {
  id: string;
  contents: Contents;
  index: ConceptIndex;
  link: LinkFn;
  go: GoFn;
  label: string;
}) {
  const { prev, next, up } = pageNeighbours(id, contents);
  const name = (x: string) => index.byId.get(x)?.label ?? x;
  return (
    <nav className="atlas-pagenav" aria-label={label}>
      <ul>
        <li>{prev ? link(prev, <><span aria-hidden>← </span>Previous: {name(prev)}</>, { rel: 'prev' }) : <span className="atlas-pagenav-none">Start of the atlas</span>}</li>
        <li>{up ? link(up, <><span aria-hidden>↑ </span>Up: {name(up)}</>) : (
            <a href={pageHref(null)} onClick={go(null)}>
              <span aria-hidden>↑ </span>Up: all chapters
            </a>
          )}</li>
        <li>{next ? link(next, <>Next: {name(next)}<span aria-hidden> →</span></>, { rel: 'next' }) : <span className="atlas-pagenav-none">End of the atlas</span>}</li>
      </ul>
    </nav>
  );
}

/** A relation as a sentence, the other concept a link, this one bold. */
function Sentence({ edge, byId, selfId, link }: { edge: GraphEdge; byId: ConceptMap; selfId: string; link: LinkFn }) {
  return (
    <>
      {sentenceParts(edge, byId).map((part, i) =>
        typeof part === 'string' ? (
          <Fragment key={i}>{part}</Fragment>
        ) : part.id === selfId ? (
          <strong key={i}>{part.label}</strong>
        ) : (
          <Fragment key={i}>{link(part.id, part.label)}</Fragment>
        ),
      )}
    </>
  );
}

function ConceptPage({
  node,
  index,
  contents,
  link,
  go,
  headingRef,
  onShowOnMap,
}: {
  node: GraphNode;
  index: ConceptIndex;
  contents: Contents;
  link: LinkFn;
  go: GoFn;
  headingRef: RefObject<HTMLHeadingElement | null>;
  onShowOnMap: (id: string) => void;
}) {
  const entry = contents.byId.get(node.id)!;
  const description = 'description' in node.attrs ? node.attrs.description : undefined;
  const domain = 'domain' in node.attrs ? node.attrs.domain : undefined;
  const conditionSection = CONDITION_SECTIONS[node.type] ?? { heading: 'Assumes' };
  const assumed = conditionItems(node.id, conditionSection, index);
  const { assumedBy } = assumptionsOf(node.id, index);
  const out = index.outgoing.get(node.id) ?? [];
  const into = index.incoming.get(node.id) ?? [];
  const sections = CARD_SECTIONS[node.type]
    .map((s) => ({ heading: s.heading, items: sectionItems(node.id, s, index) }))
    .filter((s) => s.items.length > 0);
  const path = trail(node.id, contents);
  const isChapter = entry.depth === 0;

  return (
    <>
      <PageNav id={node.id} contents={contents} index={index} link={link} go={go} label="Pages, top" />
      {path.length > 0 && (
        <nav className="atlas-trail" aria-label="Where this page sits">
          <ol>
            <li>
              <a href={pageHref(null)} onClick={go(null)}>
                All chapters
              </a>
            </li>
            {path.map((id) => (
              <li key={id}>{link(id, `${contents.byId.get(id)!.number} ${index.byId.get(id)!.label}`)}</li>
            ))}
          </ol>
        </nav>
      )}
      <header className="atlas-page-header">
        <p className="atlas-page-number">
          {isChapter ? 'Chapter' : 'Section'} {entry.number}
        </p>
        <h1 id={PAGE_TITLE_ID} ref={headingRef} tabIndex={-1}>
          <TypeBadge type={node.type} />
          {node.label}
        </h1>
        <p className="atlas-page-meta">
          {NODE_TYPE_LABELS[node.type]}
          {domain && ` · ${domain}`}
          {node.epistemicStatus && ` · ${node.epistemicStatus}`}
        </p>
        <p>
          <button type="button" className="draft-button" onClick={() => onShowOnMap(node.id)}>
            Show on the map
          </button>
        </p>
      </header>

      <section className="atlas-block atlas-definition" aria-labelledby="atlas-definition">
        <h2 id="atlas-definition" className="atlas-block-title">
          Definition
        </h2>
        {description?.trim() ? <p>{description}</p> : <p className="atlas-empty">Not written yet.</p>}
      </section>

      {node.type === 'equation' && (
        <section aria-labelledby="atlas-equation">
          <h2 id="atlas-equation">The equation</h2>
          <EquationView attrs={node.attrs} />
        </section>
      )}
      {node.type === 'formalism' && node.attrs.formulas && node.attrs.formulas.length > 0 && (
        <section aria-labelledby="atlas-formulas">
          <h2 id="atlas-formulas">Formulas</h2>
          <FormulaView formulas={node.attrs.formulas} />
        </section>
      )}

      {assumed.length > 0 && (
        <section aria-labelledby="atlas-assumes">
          <h2 id="atlas-assumes">{conditionSection.heading}</h2>
          <ul className="atlas-assumptions">
            {assumed.map(({ assumption: a, via }, i) => (
              <li key={a.node ? a.node.id : `${a.label}-${i}`}>
                <p className="atlas-assumption-name">
                  {a.node ? link(a.node.id, a.label) : a.label}
                  {via && <span className="concept-via"> — via {link(via.id, via.label)}</span>}
                </p>
                {a.description && <p>{a.description}</p>}
              </li>
            ))}
          </ul>
        </section>
      )}

      {(out.length > 0 || into.length > 0) && (
        <section aria-labelledby="atlas-connects">
          <h2 id="atlas-connects">How it connects</h2>
          {[
            { title: `From ${node.label}`, edges: out, key: 'out' },
            { title: `Into ${node.label}`, edges: into, key: 'in' },
          ]
            .filter((g) => g.edges.length > 0)
            .map((g) => (
              <Fragment key={g.key}>
                <h3>{g.title}</h3>
                <ul className="atlas-relations">
                  {g.edges.map((e) => (
                    <li key={e.id}>
                      <p>
                        <Sentence edge={e} byId={index.byId} selfId={node.id} link={link} />.
                      </p>
                      {e.description && (
                        <details>
                          <summary>How they connect</summary>
                          <RichText source={e.description} />
                        </details>
                      )}
                      {e.derivation && (
                        <details>
                          <summary>Derivation</summary>
                          <RichText source={e.derivation} />
                        </details>
                      )}
                    </li>
                  ))}
                </ul>
              </Fragment>
            ))}
        </section>
      )}

      {sections.map((s, i) => (
        <section key={s.heading} aria-labelledby={`atlas-section-${i}`}>
          <h2 id={`atlas-section-${i}`}>{s.heading}</h2>
          <ul className="atlas-flat">
            {s.items.map(({ node: item, via }) => (
              <li key={item.id}>
                <TypeBadge type={item.type} />
                <span>
                  {link(item.id, item.label)}
                  {via && <span className="concept-via"> — via {via.label}</span>}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ))}

      {assumedBy.length > 0 && (
        <section aria-labelledby="atlas-assumed-by">
          <h2 id="atlas-assumed-by">Assumed by</h2>
          <ul className="atlas-flat">
            {assumedBy.map((n) => (
              <li key={n.id}>
                <TypeBadge type={n.type} />
                {link(n.id, n.label)}
              </li>
            ))}
          </ul>
        </section>
      )}

      {entry.children.length > 0 && (
        <section aria-labelledby="atlas-subsections">
          <h2 id="atlas-subsections">In this {isChapter ? 'chapter' : 'section'}</h2>
          <ul className="atlas-flat">
            {entry.children.map((c) => (
              <li key={c}>
                <TypeBadge type={index.byId.get(c)!.type} />
                {link(
                  c,
                  <>
                    <span className="atlas-number">{contents.byId.get(c)!.number}</span> {index.byId.get(c)!.label}
                  </>,
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <PageNav id={node.id} contents={contents} index={index} link={link} go={go} label="Pages, bottom" />
    </>
  );
}

function FrontPage({
  index,
  contents,
  link,
  headingRef,
  missing,
}: {
  index: ConceptIndex;
  contents: Contents;
  link: LinkFn;
  headingRef: RefObject<HTMLHeadingElement | null>;
  missing: string | null;
}) {
  return (
    <>
      <header className="atlas-page-header">
        <h1 id={PAGE_TITLE_ID} ref={headingRef} tabIndex={-1}>
          Atlas pages
        </h1>
      </header>
      {missing && (
        <p className="atlas-notice" role="alert">
          There's no page for “{missing}” — it may have been renamed or removed. Pick one from the contents.
        </p>
      )}
      <p>
        Every concept on the map has a page here. The big, general concepts are the chapters; each more specific concept
        sits under the most general concept it's connected to, the way it gathers round it on the map. Read in order with
        Previous and Next, or use the contents — by chapter, by what a page is connected to, or by kind of concept.
      </p>
      <section aria-labelledby="atlas-chapters">
        <h2 id="atlas-chapters">Chapters</h2>
        <ol className="atlas-chapters">
          {contents.roots.map((id) => {
            const n = index.byId.get(id)!;
            const count = countBelow(id, contents);
            return (
              <li key={id}>
                <TypeBadge type={n.type} />
                {link(id, n.label)}
                {count > 0 && (
                  <span className="concept-via">
                    {' '}
                    — {count} {count === 1 ? 'section' : 'sections'}
                  </span>
                )}
              </li>
            );
          })}
        </ol>
      </section>
    </>
  );
}

const countBelow = (id: string, contents: Contents): number =>
  contents.byId.get(id)!.children.reduce((s, c) => s + 1 + countBelow(c, contents), 0);
