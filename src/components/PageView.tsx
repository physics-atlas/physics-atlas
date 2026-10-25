import { useEffect, useMemo, useRef, useState } from 'react';
import type { RefObject } from 'react';
import type { ConceptGraph } from '../data/types';
import { buildConceptIndex, sentenceParts } from '../graph/concepts';
import type { ConceptIndex } from '../graph/concepts';
import { buildContents, relationTypes } from '../graph/contents';
import type { Contents, PageFilter } from '../graph/contents';
import type { PageRef } from '../lib/pageLinks';
import TypeBadge from './TypeBadge';
import ConceptPage from './pages/ConceptPage';
import RelationPage from './pages/RelationPage';
import Sidebar from './pages/Sidebar';
import type { SidebarView } from './pages/Sidebar';
import { makeLinks, PAGE_TITLE_ID } from './pages/links';
import type { Links } from './pages/links';

// The atlas as pages, like a book of lecture notes: a contents sidebar, a page
// per concept (what the map knows about it, and what its authors have written,
// at as many depths as they've written) and a page per relation. Loaded on
// demand. Every link is a real link — open it in a new tab, copy it — and
// moving between pages works like a page load for a screen reader: focus lands
// on the new page's heading, and its title changes.

const SIDEBAR_ID = 'atlas-sidebar';
const VIEW_KEY = 'physics-atlas-page-sidebar-v1';
const DEPTH_KEY = 'physics-atlas-page-depth-v1';

function stored<T>(key: string, parse: (v: string | null) => T): T {
  try {
    return parse(localStorage.getItem(key));
  } catch {
    return parse(null);
  }
}
function store(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // storage blocked — the choice lasts this visit
  }
}

interface PageViewProps {
  /** The confirmed, serious graph (no fluff) */
  graph: ConceptGraph;
  /** The page shown: a concept's, a relation's, or neither (the front page) */
  target: PageRef;
  onOpen: (ref: PageRef) => void;
  onShowOnMap: (id: string) => void;
  /** Changes when a navigation should move focus to the page's heading */
  focusTick: number;
}

export default function PageView({ graph, target, onOpen, onShowOnMap, focusTick }: PageViewProps) {
  const index = useMemo(() => buildConceptIndex(graph), [graph]);
  const contents = useMemo(() => buildContents(index), [index]);
  const allRelations = useMemo(() => relationTypes(graph.edges), [graph]);
  const [view, setView] = useState<SidebarView>(() =>
    stored(VIEW_KEY, (v) => (v === 'neighbours' || v === 'types' ? v : 'contents')),
  );
  const [depth, setDepth] = useState(() => stored(DEPTH_KEY, (v) => Math.max(1, Number(v) || 1)));
  const [filter, setFilter] = useState<PageFilter>(() => ({
    types: new Set(graph.nodes.map((n) => n.type)),
    relations: new Set(allRelations),
    text: '',
  }));
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const node = target.concept ? index.byId.get(target.concept) : undefined;
  const edge = target.relation ? graph.edges.find((e) => e.id === target.relation) : undefined;

  // Every way to another page folds the phone's contents drawer on the way.
  const open = useMemo(
    () => (ref: PageRef) => {
      setSidebarOpen(false);
      onOpen(ref);
    },
    [onOpen],
  );
  const links = useMemo(() => makeLinks(open), [open]);

  // Each page is a page to assistive tech: its own title, focus on its heading.
  const headingRef = useRef<HTMLHeadingElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const articleRef = useRef<HTMLElement>(null);
  const titleText = node
    ? node.label
    : edge
      ? sentenceParts(edge, index.byId)
          .map((p) => (typeof p === 'string' ? p : p.label))
          .join('')
          .replace(/\.$/, '')
      : '';
  useEffect(() => {
    document.title = `${titleText ? `${titleText} — ` : ''}Atlas pages — Physics Atlas`;
  }, [titleText]);
  const pageKey = target.relation ? `r:${target.relation}` : `c:${target.concept ?? ''}`;
  useEffect(() => {
    articleRef.current?.scrollTo?.({ top: 0 });
    if (focusTick > 0) headingRef.current?.focus({ preventScroll: true });
  }, [focusTick, pageKey]);

  const missing = (target.concept && !node) || (target.relation && !edge) ? (target.concept ?? target.relation)! : null;

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
          onView={(v) => {
            setView(v);
            store(VIEW_KEY, v);
          }}
          filter={filter}
          onFilter={setFilter}
          allRelations={allRelations}
          index={index}
          contents={contents}
          currentId={node?.id ?? null}
          aroundId={node?.id ?? edge?.source ?? null}
          links={links}
        />
      </nav>
      <article className="atlas-page" ref={articleRef} aria-labelledby={PAGE_TITLE_ID}>
        {node ? (
          <ConceptPage
            node={node}
            index={index}
            contents={contents}
            links={links}
            headingRef={headingRef}
            onShowOnMap={onShowOnMap}
            onOpen={open}
            depth={depth}
            onDepth={(d) => {
              setDepth(d);
              store(DEPTH_KEY, String(d));
            }}
          />
        ) : edge ? (
          <RelationPage
            edge={edge}
            index={index}
            contents={contents}
            links={links}
            headingRef={headingRef}
            onShowOnMap={onShowOnMap}
          />
        ) : (
          <FrontPage index={index} contents={contents} links={links} headingRef={headingRef} missing={missing} />
        )}
      </article>
    </div>
  );
}

function FrontPage({
  index,
  contents,
  links,
  headingRef,
  missing,
}: {
  index: ConceptIndex;
  contents: Contents;
  links: Links;
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
        Every concept on the map has a page here, and so does every relation between two of them. The big, general
        concepts are the chapters; each more specific concept sits under the most general concept it's connected to, the
        way it gathers round it on the map. A page can be written at several depths, each going further. Read in order with
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
                {links.concept(id, n.label)}
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
