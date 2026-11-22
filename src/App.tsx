import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ConceptMapView from './components/ConceptMapView';
import { concepts } from './data/loadConcepts';
import SearchBox from './components/SearchBox';
import type { SearchEntry } from './components/SearchBox';
import { NODE_TYPE_LABELS } from './data/types';
import { splitFluff } from './graph/concepts';
import { TYPE_COLORS } from './graph/typeColors';
import { useProgress } from './lib/useProgress';
import { useTheme } from './lib/useTheme';
import { PALETTES, usePalette, type Palette } from './lib/usePalette';
import { useMotion } from './lib/motion';
import { hrefOf, isPlainClick, refFromSearch } from './lib/pageLinks';
import type { PageRef } from './lib/pageLinks';
import { useArrangement } from './lib/useArrangement';
import { MapScope } from './lib/mapScope';
import { mapPageSource, PageSourceContext } from './data/pageSources';
import { fetchMe, loginHref } from './community/api';
import type { Me } from './community/api';
import { readMap } from './maps/api';
import type { SavedMap } from './maps/api';
import { resolveMap } from './maps/map';
import { anchorLabel, canComment, newSince, parseAnchor } from './maps/comments';
import { useComments } from './maps/useComments';
import type { ResolvedMap } from './maps/map';
import { mapHref, pageHref } from './lib/pageLinks';
import './App.css';

// The atlas pages typeset maths and carry their own sidebar: loaded on first visit.
const PageView = lazy(() => import('./components/PageView'));
const FeedbackView = lazy(() => import('./components/FeedbackView'));
const PrivacyView = lazy(() => import('./components/PrivacyView'));
const GuideView = lazy(() => import('./components/GuideView'));
const MapsView = lazy(() => import('./components/MapsView'));
const MapPanel = lazy(() => import('./components/MapPanel'));
const CommentsPanel = lazy(() => import('./components/CommentsPanel'));

type Mode = 'concepts' | 'community' | 'page' | 'feedback' | 'privacy' | 'guide' | 'map' | 'maps';
type PrivacyLang = 'en' | 'de';

const VIEW_TITLES: Record<Mode, string> = {
  concepts: 'Concept map',
  community: 'Community review',
  page: 'Atlas pages',
  feedback: 'Feedback',
  privacy: 'Privacy',
  guide: 'Atlas guide',
  map: 'Personal map',
  maps: 'My maps',
};

/** The pages cover the confirmed, serious atlas — fluff is fun mode only. */
const pageGraph = splitFluff(concepts).base;

// The community view (.claude/plans/epic-community-review.md) is the concept
// map with the proposed layer and the proposal editor.
const isConceptView = (m: Mode) => m === 'concepts' || m === 'community';

/** How long the map guide shows on arrival before it steps aside to its button. */
const HINT_SECONDS = 3;

function initialMode(): Mode {
  const params = new URLSearchParams(window.location.search);
  const m = params.get('mode');
  // `?mode=concepts&community=1` was the community preview's address before it had a tab.
  if (m === 'community' || (m === 'concepts' && params.get('community') === '1')) return 'community';
  if (m === 'page') return 'page';
  if (m === 'feedback') return 'feedback';
  if (m === 'privacy') return 'privacy';
  if (m === 'guide') return 'guide';
  if (m === 'maps') return 'maps';
  // A personal map needs its id; a bare ?mode=map was the retired topic map's address.
  if (m === 'map' && params.get('map')) return 'map';
  // The concept map is the front page (the home page was retired, Decision 48); the
  // retired topic views (map, explore, goal, topic) land on it too.
  return 'concepts';
}

/**
 * Where in a personal map (Decision 50, Phase 1): `?mode=map&map=<id>` its map,
 * `&view=pages` (with `&concept=…` or `&relation=…`) its pages.
 */
interface MapPlace {
  map: string;
  view: 'map' | 'pages';
  page: PageRef;
}

function initialMapPlace(): MapPlace | null {
  const params = new URLSearchParams(window.location.search);
  const map = params.get('map');
  if (params.get('mode') !== 'map' || !map) return null;
  return { map, view: params.get('view') === 'pages' ? 'pages' : 'map', page: refFromSearch(window.location.search) };
}

/** A saved personal map, as the server answered for the map in the address (Phase 2). */
type MapLoad =
  | { id: string; state: 'loading' }
  | { id: string; state: 'ready'; saved: SavedMap }
  | { id: string; state: 'failed'; status: number; error: string };

/** The privacy notice's language (Decision 51): from the address, else English. */
function initialPrivacyLang(): PrivacyLang {
  return new URLSearchParams(window.location.search).get('lang') === 'de' ? 'de' : 'en';
}

function initialConceptGoal(): string | null {
  const params = new URLSearchParams(window.location.search);
  const g = params.get('goal');
  const m = params.get('mode');
  if ((m !== null && m !== 'concepts' && m !== 'community') || !g) return null;
  return concepts.nodes.some((n) => n.id === g) ? g : null;
}

/** The page in the address (`?mode=page&concept=…` or `&relation=…`); neither is the front page. */
function initialPage(): PageRef {
  const params = new URLSearchParams(window.location.search);
  return params.get('mode') === 'page' ? refFromSearch(window.location.search) : {};
}

// Alphabetical: the source files are ordered by id, which means nothing to a reader.
const conceptSearchEntries: SearchEntry[] = concepts.nodes
  .map((n) => ({
    ref: n.id,
    title: n.label,
    context: NODE_TYPE_LABELS[n.type],
    color: TYPE_COLORS[n.type],
  }))
  .sort((a, b) => a.title.localeCompare(b.title));
/** Fluff is fun mode only — search finds it only then. */
const isFluff = (e: SearchEntry) => concepts.nodes.find((n) => n.id === e.ref)?.type === 'fluff';
const seriousSearchEntries = conceptSearchEntries.filter((e) => !isFluff(e));

export default function App() {
  const [mode, setMode] = useState<Mode>(initialMode);
  const [privacyLang, setPrivacyLang] = useState<PrivacyLang>(initialPrivacyLang);
  const [mapPlace, setMapPlace] = useState<MapPlace | null>(initialMapPlace);
  const [me, setMe] = useState<Me | null>(null);
  useEffect(() => {
    void fetchMe().then(setMe);
  }, []);
  // The saved map in the address, read from the server whenever another map is opened.
  const [mapLoad, setMapLoad] = useState<MapLoad | null>(null);
  const wantedMap = mode === 'map' ? (mapPlace?.map ?? null) : null;
  useEffect(() => {
    if (!wantedMap) return;
    let live = true;
    setMapLoad((l) => (l?.id === wantedMap && l.state === 'ready' ? l : { id: wantedMap, state: 'loading' }));
    void readMap(wantedMap).then((r) => {
      if (!live) return;
      setMapLoad(r.ok ? { id: wantedMap, state: 'ready', saved: r.value } : { id: wantedMap, state: 'failed', status: r.status, error: r.error });
    });
    return () => {
      live = false;
    };
  }, [wantedMap]);
  const savedMap = mapLoad && mapLoad.id === wantedMap && mapLoad.state === 'ready' ? mapLoad.saved : null;
  const onMapSaved = useCallback((saved: SavedMap) => setMapLoad({ id: saved.map.id, state: 'ready', saved }), []);
  const [mapPanelOpen, setMapPanelOpen] = useState(false);
  const personal: ResolvedMap | null = useMemo(() => (savedMap ? resolveMap(savedMap.map, concepts) : null), [savedMap]);
  // Its comments (Phase 3): for members who aren't only viewers. One panel under the bar at a time.
  const commenting = Boolean(savedMap && me?.user && canComment(savedMap.role));
  const mapComments = useComments(commenting && savedMap ? savedMap.map.id : null, me?.user?.login ?? null);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const toggleComments = () => {
    if (commentsOpen) mapComments.markRead();
    else setMapPanelOpen(false);
    setCommentsOpen(!commentsOpen);
  };
  const [commentNews, setCommentNews] = useState('');
  const { arrived } = mapComments;
  useEffect(() => {
    if (!arrived.tick || !personal) return;
    const [c] = arrived.comments;
    setCommentNews(
      arrived.comments.length === 1
        ? `New ${c.threadId ? 'reply' : 'comment'} from ${c.author ? `@${c.author}` : 'a former member'} about ${anchorLabel(parseAnchor(c.anchor), personal)}.`
        : `${arrived.comments.length} new comments on this map.`,
    );
  }, [arrived, personal]);
  const commentCounts = useMemo(() => {
    const list = mapComments.comments ?? [];
    return {
      open: list.filter((c) => !c.threadId && !c.resolvedAt).length,
      fresh: me?.user ? newSince(list, mapComments.seen, me.user.login).length : 0,
    };
  }, [mapComments.comments, mapComments.seen, me]);
  const personalPages = useMemo(() => (personal ? mapPageSource(personal.map.pages ?? {}) : null), [personal]);
  // A personal map's search finds its own concepts and the atlas concepts it uses.
  const personalEntries = useMemo(
    () =>
      personal
        ? personal.graph.nodes
            .map((n) => ({ ref: n.id, title: n.label, context: NODE_TYPE_LABELS[n.type], color: TYPE_COLORS[n.type] }))
            .sort((a, b) => a.title.localeCompare(b.title))
        : [],
    [personal],
  );
  const [conceptGoal, setConceptGoal] = useState(initialConceptGoal);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [focus, setFocus] = useState<{ id: string | null; tick: number }>({ id: null, tick: 0 });
  // Fun mode: off on every visit; kept while switching between the map's two tabs.
  const [fun, setFun] = useState(false);
  // The map's arrangement, clustered or even: remembered in this browser.
  const [arrangement, setArrangement] = useArrangement();
  // The atlas page shown, and a tick that moves focus to its heading on each navigation.
  const [pageRef, setPageRef] = useState<PageRef>(initialPage);
  const [pageFocus, setPageFocus] = useState(0);
  // The map guide greets a visitor on the map, steps aside after a few seconds,
  // and the header's "Atlas guide" (Decision 53) explains the rest.
  const [hintOpen, setHintOpen] = useState(false);
  const greeted = useRef(false);
  useEffect(() => {
    if (!isConceptView(mode) || greeted.current) return;
    setHintOpen(true);
    // Greeted once the guide has stepped aside — set here, not above, so a
    // re-run of this effect (leaving early, React's dev double run) greets again.
    const t = window.setTimeout(() => {
      greeted.current = true;
      setHintOpen(false);
    }, HINT_SECONDS * 1000);
    return () => window.clearTimeout(t);
  }, [mode]);
  const progress = useProgress();
  const { theme, toggle: toggleTheme } = useTheme();
  const { palette, setPalette } = usePalette();
  const motion = useMotion();
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  // Each view is a page to assistive tech: its own title (WCAG 2.4.2), and
  // focus moves to the new view on navigation so a screen reader starts
  // reading there instead of staying on the button that was pressed.
  const mainRef = useRef<HTMLElement>(null);
  const firstView = useRef(true);
  useEffect(() => {
    // An atlas page sets its own title and focuses its own heading.
    // An atlas page and the privacy notice set their own titles.
    if (mode !== 'page' && mode !== 'privacy' && mode !== 'guide') document.title = `${VIEW_TITLES[mode]} — Physics Atlas`;
    if (firstView.current) {
      firstView.current = false;
      return;
    }
    if (mode !== 'page') mainRef.current?.focus({ preventScroll: true });
  }, [mode]);

  const themeButton = (
    <button
      className="theme-toggle"
      onClick={toggleTheme}
      aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
      title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
    >
      <span aria-hidden>{theme === 'dark' ? '☀' : '🌙'}</span>
    </button>
  );
  const paletteSelect = (
    <label className="palette-select" title="The accent colour beside the blue">
      <span className="visually-hidden">Accent colour</span>
      <select value={palette} onChange={(e) => setPalette(e.target.value as Palette)}>
        {PALETTES.map((p) => (
          <option key={p.value} value={p.value}>
            {p.label}
          </option>
        ))}
      </select>
    </label>
  );
  const motionButton = (
    <button
      className="theme-toggle motion-toggle"
      onClick={motion.toggle}
      aria-pressed={motion.reduced}
      title="Stop the moving background and smooth map animations"
    >
      Reduce motion
    </button>
  );

  // URL sync with real history entries: each navigation pushes, so browser
  // back/forward walks through visited views. popstate restores state from
  // the URL; the effect then recomputes the same URL and skips the push —
  // no guard flag needed, no loop.
  const firstUrlSync = useRef(true);
  useEffect(() => {
    // The concept map is the front page: its address is the site's own.
    const target =
      mode === 'page'
        ? hrefOf(pageRef)
        : conceptGoal && isConceptView(mode)
          ? `?mode=${mode}&goal=${encodeURIComponent(conceptGoal)}`
          : mode === 'privacy'
            ? `?mode=privacy${privacyLang === 'de' ? '&lang=de' : ''}`
            : mode === 'map' && mapPlace
              ? mapPlace.view === 'pages'
                ? mapPlace.page.relation
                  ? `${mapHref(mapPlace.map)}&view=pages&relation=${encodeURIComponent(mapPlace.page.relation)}`
                  : pageHref(mapPlace.page.concept ?? null, mapPlace.map)
                : mapHref(mapPlace.map)
            : mode === 'concepts'
            ? ''
            : `?mode=${mode}`;
    if (window.location.search === target) {
      firstUrlSync.current = false;
      return;
    }
    const url = target || window.location.pathname;
    // Initial normalization (e.g. a retired ?mode=goal) replaces instead of
    // stacking an extra entry under the very first view.
    if (firstUrlSync.current) window.history.replaceState(null, '', url);
    else window.history.pushState(null, '', url);
    firstUrlSync.current = false;
  }, [mode, conceptGoal, pageRef, privacyLang, mapPlace]);

  useEffect(() => {
    const onPop = () => {
      setMode(initialMode());
      setConceptGoal(initialConceptGoal());
      setSelectedId(null);
      setPageRef(initialPage());
      setPrivacyLang(initialPrivacyLang());
      setMapPlace(initialMapPlace());
      setPageFocus((t) => t + 1);
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const focusOn = useCallback((id: string) => {
    setSelectedId(id);
    setFocus((f) => ({ id, tick: f.tick + 1 }));
  }, []);

  /** Open an atlas page — a concept's, a relation's, or the chapters — from a card, the tab, search or another page. */
  const openPage = useCallback((ref: PageRef) => {
    setMode('page');
    setPageRef(ref);
    setPageFocus((t) => t + 1);
  }, []);
  const openConceptPage = useCallback((id: string) => openPage({ concept: id }), [openPage]);
  // Page editing lives on the page (Decision 49): the community editor opens a page with its
  // editor, and the page's "Review and submit" opens the draft in the community editor.
  const [pageEdit, setPageEdit] = useState<string | null>(null);
  const [draftOnArrival, setDraftOnArrival] = useState(false);
  const editPage = useCallback(
    (id: string) => {
      setPageEdit(id);
      openPage({ concept: id });
    },
    [openPage],
  );
  const reviewDraft = useCallback(() => {
    setDraftOnArrival(true);
    setMode('community');
  }, []);
  useEffect(() => {
    if (mode !== 'page') setPageEdit(null);
    if (mode !== 'community') setDraftOnArrival(false);
  }, [mode]);
  const openRelationPage = useCallback((id: string) => openPage({ relation: id }), [openPage]);
  // From a page back to the map, centred on its concept.
  const showOnMap = useCallback(
    (id: string) => {
      setMode('concepts');
      focusOn(id);
    },
    [focusOn],
  );

  // Feedback remembers where it was opened from, so the writer can say which page it's about.
  const [feedbackFrom, setFeedbackFrom] = useState<string | null>(null);
  const openFeedback = useCallback(() => {
    setFeedbackFrom(window.location.search ? `${window.location.pathname}${window.location.search}` : null);
    setMode('feedback');
  }, []);

  // Inside a personal map: its map, centred on a concept; its pages.
  const showOnPersonalMap = useCallback(
    (id: string) => {
      setMapPlace((p) => (p ? { ...p, view: 'map' } : p));
      focusOn(id);
    },
    [focusOn],
  );
  const openMapPage = useCallback((ref: PageRef) => {
    setMapPlace((p) => (p ? { ...p, view: 'pages', page: ref } : p));
    setPageFocus((t) => t + 1);
  }, []);

  const openSavedMap = useCallback((id: string) => {
    setMapPlace({ map: id, view: 'map', page: {} });
    setMode('map');
  }, []);
  const leaveMap = useCallback(() => {
    setMapPanelOpen(false);
    setCommentsOpen(false);
    setMode('maps');
  }, []);

  // A search outside the map (on the feedback form) lands on the concept map, centred on the pick.
  const pickOnMap = useCallback(
    (id: string) => {
      setMode('concepts');
      focusOn(id);
    },
    [focusOn],
  );

  return (
    <div className="app">
      <a className="skip-link" href="#main">
        Skip to main content
      </a>
      <div className="nebula nebula-a" aria-hidden />
      <div className="nebula nebula-b" aria-hidden />
      <div className="nebula nebula-c" aria-hidden />
        <header className="app-header">
          <p className="app-heading">
            <button className="app-wordmark" onClick={() => setMode('concepts')} aria-label="Physics Atlas, the concept map">
              <span className="app-title">Physics Atlas</span>
            </button>
          </p>
          {/* On the pages, a search opens the concept's page; elsewhere, it centres the map on it. */}
          <SearchBox
            entries={personal ? personalEntries : mode === 'page' || !fun ? seriousSearchEntries : conceptSearchEntries}
            onPick={
              personal
                ? mapPlace?.view === 'pages'
                  ? (id) => openMapPage({ concept: id })
                  : focusOn
                : mode === 'page'
                  ? openConceptPage
                  : isConceptView(mode)
                    ? focusOn
                    : pickOnMap
            }
          />
          <a
            href="?mode=guide"
            className="map-hint-toggle"
            aria-current={mode === 'guide' ? 'page' : undefined}
            onClick={(e) => {
              if (!isPlainClick(e)) return;
              e.preventDefault();
              setMode('guide');
            }}
          >
            Atlas guide
          </a>
          <nav className="mode-tabs" aria-label="Views">
            <button
              className={`mode-tab ${mode === 'concepts' ? 'mode-tab-active' : ''}`}
              aria-current={mode === 'concepts' ? 'page' : undefined}
              onClick={() => setMode('concepts')}
            >
              Concept map
            </button>
            <a
              href={hrefOf(pageRef)}
              className={`mode-tab ${mode === 'page' ? 'mode-tab-active' : ''}`}
              aria-current={mode === 'page' ? 'page' : undefined}
              onClick={(e) => {
                if (!isPlainClick(e)) return;
                e.preventDefault();
                openPage(pageRef);
              }}
            >
              Atlas pages
            </a>
            <button
              className={`mode-tab ${mode === 'community' ? 'mode-tab-active' : ''}`}
              aria-current={mode === 'community' ? 'page' : undefined}
              onClick={() => setMode('community')}
              title="Propose concepts and edits, and see open proposals"
            >
              Community
            </button>
          </nav>
          {me?.maps && me.user && (
            <a
              href="?mode=maps"
              className="header-feedback"
              aria-current={mode === 'maps' ? 'page' : undefined}
              onClick={(e) => {
                if (!isPlainClick(e)) return;
                e.preventDefault();
                setMode('maps');
              }}
            >
              My maps
            </a>
          )}
          <a
            href="?mode=feedback"
            className="header-feedback"
            aria-current={mode === 'feedback' ? 'page' : undefined}
            onClick={(e) => {
              if (!isPlainClick(e)) return;
              e.preventDefault();
              if (mode !== 'feedback') openFeedback();
            }}
          >
            Feedback
          </a>
          <a
            href="?mode=privacy"
            className="header-feedback header-privacy"
            aria-current={mode === 'privacy' ? 'page' : undefined}
            onClick={(e) => {
              if (!isPlainClick(e)) return;
              e.preventDefault();
              setMode('privacy');
            }}
          >
            Privacy
          </a>
          <div className="header-settings" role="group" aria-label="Display settings">
            {motionButton}
            {paletteSelect}
            {themeButton}
          </div>
        </header>
      {mode === 'map' && personal && mapPlace && (
        <nav className="map-bar" aria-label="Personal map">
          <p className="map-bar-title">
            <span className="map-bar-kind">Personal map</span> {personal.map.title}
          </p>
          <ul className="map-bar-views">
            {(['map', 'pages'] as const).map((view) => (
              <li key={view}>
                <a
                  href={view === 'map' ? mapHref(personal.map.id) : pageHref(null, personal.map.id)}
                  aria-current={mapPlace.view === view ? 'page' : undefined}
                  className={`mode-tab ${mapPlace.view === view ? 'mode-tab-active' : ''}`}
                  onClick={(e) => {
                    if (!isPlainClick(e)) return;
                    e.preventDefault();
                    if (view === 'map') setMapPlace({ ...mapPlace, view: 'map' });
                    else openMapPage({});
                  }}
                >
                  {view === 'map' ? 'Map' : 'Pages'}
                </a>
              </li>
            ))}
          </ul>
          {savedMap && me?.user && (
            <button
              type="button"
              className="draft-button map-bar-panel"
              aria-expanded={mapPanelOpen}
              aria-controls="map-panel"
              onClick={() => {
                if (!mapPanelOpen && commentsOpen) toggleComments();
                setMapPanelOpen(!mapPanelOpen);
              }}
            >
              {savedMap.role === 'owner' || savedMap.role === 'editor' ? 'Edit map and members' : 'Contents and members'}
            </button>
          )}
          {commenting && (
            <button type="button" className="draft-button map-bar-comments" aria-expanded={commentsOpen} aria-controls="comments-panel" onClick={toggleComments}>
              Comments ({commentCounts.open} open{commentCounts.fresh ? `, ${commentCounts.fresh} new` : ''})
            </button>
          )}
          {commenting && (
            <p className="visually-hidden" role="status">
              {commentNews}
            </p>
          )}
          <a className="map-bar-back" href="/">
            Back to the atlas
          </a>
          {personal.missingRefs.length > 0 && (
            <p className="map-bar-note">
              {personal.missingRefs.length === 1 ? 'One concept it uses is' : `${personal.missingRefs.length} concepts it uses are`} no
              longer on the atlas: {personal.missingRefs.join(', ')}.
            </p>
          )}
        </nav>
      )}
      {mode === 'map' && savedMap && me?.user && mapPanelOpen && (
        <div id="map-panel">
          <Suspense fallback={<p className="atlas-loading">Loading…</p>}>
            <MapPanel saved={savedMap} login={me.user.login} onSaved={onMapSaved} onLeft={leaveMap} onShow={showOnPersonalMap} />
          </Suspense>
        </div>
      )}
      {mode === 'map' && savedMap && personal && personalPages && mapPlace && me?.user && commenting && commentsOpen && (
        <div id="comments-panel">
          <Suspense fallback={<p className="atlas-loading">Loading…</p>}>
            <CommentsPanel
              resolved={personal}
              comments={mapComments.comments}
              error={mapComments.error}
              seen={mapComments.seen}
              login={me.user.login}
              role={savedMap.role}
              onChange={mapComments.replace}
              current={(mapPlace.view === 'pages' ? mapPlace.page.concept : selectedId) ?? null}
              pages={personalPages}
              onShow={showOnPersonalMap}
            />
          </Suspense>
        </div>
      )}
      <main id="main" className="app-main" ref={mainRef} tabIndex={-1}>
        {/* An atlas page's own heading is the view's h1, and the feedback form's; a map's pages, too. */}
        {mode !== 'page' && mode !== 'feedback' && mode !== 'privacy' && mode !== 'guide' && mode !== 'maps' && !(mode === 'map' && mapPlace?.view === 'pages' && personal) && (
          <h1 className="visually-hidden">{mode === 'map' && personal ? `${personal.map.title} — personal map` : VIEW_TITLES[mode]}</h1>
        )}
        {isConceptView(mode) && (
          <ConceptMapView
            graph={concepts}
            progress={progress}
            goalId={conceptGoal}
            onGoalChange={setConceptGoal}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onFocus={focusOn}
            focus={focus}
            theme={theme}
            community={mode === 'community'}
            fun={fun}
            onFunChange={setFun}
            arrangement={arrangement}
            onArrangementChange={setArrangement}
            hintOpen={hintOpen}
            onOpenPage={openConceptPage}
            onOpenRelationPage={openRelationPage}
            startEditing={mode === 'community' && draftOnArrival}
            onEditPage={editPage}
          />
        )}
        {mode === 'page' && (
          <Suspense fallback={<p className="atlas-loading">Loading the atlas pages…</p>}>
            <PageView
              graph={pageGraph}
              target={pageRef}
              onOpen={openPage}
              onShowOnMap={showOnMap}
              focusTick={pageFocus}
              editOnArrival={pageEdit}
              onReviewDraft={reviewDraft}
            />
          </Suspense>
        )}
        {mode === 'feedback' && (
          <Suspense fallback={<p className="atlas-loading">Loading the feedback form…</p>}>
            <FeedbackView from={feedbackFrom} />
          </Suspense>
        )}
        {mode === 'privacy' && (
          <Suspense fallback={<p className="atlas-loading">Loading the privacy notice…</p>}>
            <PrivacyView lang={privacyLang} onLang={setPrivacyLang} />
          </Suspense>
        )}
        {mode === 'guide' && (
          <Suspense fallback={<p className="atlas-loading">Loading the guide…</p>}>
            <GuideView />
          </Suspense>
        )}
        {mode === 'maps' && (
          <Suspense fallback={<p className="atlas-loading">Loading your maps…</p>}>
            <MapsView me={me} onOpen={openSavedMap} />
          </Suspense>
        )}
        {mode === 'map' && !personal && (
          <div className="feedback-view">
            <div className="feedback-panel">
              {!mapLoad || mapLoad.state === 'loading' ? (
                <p role="status">Opening the map…</p>
              ) : mapLoad.state === 'failed' && mapLoad.status === 401 ? (
                <p>
                  This map is open to its members only.{' '}
                  <a className="draft-button community-signin" href={loginHref(window.location.pathname + window.location.search)}>
                    Sign in with GitHub
                  </a>{' '}
                  to open it.
                </p>
              ) : (
                <p>{mapLoad.state === 'failed' ? mapLoad.error : ''}</p>
              )}
              <p>
                <a href="/">Back to the atlas</a>
              </p>
            </div>
          </div>
        )}
        {mode === 'map' && personal && mapPlace && personalPages && (
          <MapScope.Provider value={personal.map.id}>
            {mapPlace.view === 'map' ? (
              <ConceptMapView
                key={personal.map.id}
                graph={personal.graph}
                progress={progress}
                goalId={null}
                onGoalChange={() => {}}
                selectedId={selectedId}
                onSelect={setSelectedId}
                onFocus={focusOn}
                focus={focus}
                theme={theme}
                arrangement={arrangement}
                onArrangementChange={setArrangement}
                hintOpen={hintOpen}
                onOpenPage={(id) => openMapPage({ concept: id })}
                onOpenRelationPage={(id) => openMapPage({ relation: id })}
                fromAtlas={personal.refIds}
              />
            ) : (
              <PageSourceContext.Provider value={personalPages}>
                <Suspense fallback={<p className="atlas-loading">Loading the map's pages…</p>}>
                  <PageView
                    key={personal.map.id}
                    graph={personal.graph}
                    target={mapPlace.page}
                    onOpen={openMapPage}
                    onShowOnMap={showOnPersonalMap}
                    focusTick={pageFocus}
                    fromAtlas={personal.refIds}
                  />
                </Suspense>
              </PageSourceContext.Provider>
            )}
          </MapScope.Provider>
        )}
      </main>
    </div>
  );
}
