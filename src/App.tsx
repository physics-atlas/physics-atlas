import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ConceptMapView from './components/ConceptMapView';
import type { MapEditing } from './components/ConceptMapView';
import { concepts } from './data/loadConcepts';
import SearchBox from './components/SearchBox';
import type { SearchEntry } from './components/SearchBox';
import { NODE_TYPE_LABELS } from './data/types';
import { splitFluff } from './graph/concepts';
import { TYPE_COLORS } from './graph/typeColors';
import { useProgress } from './lib/useProgress';
import { useTheme } from './lib/useTheme';
import { useMotion } from './lib/motion';
import { hrefOf, isPlainClick, refFromSearch, relationHref, shareFromHash, shareKey, shareToken } from './lib/pageLinks';
import type { PageRef } from './lib/pageLinks';
import { useArrangement } from './lib/useArrangement';
import { MapScope } from './lib/mapScope';
import { mapPageSource, PageSourceContext } from './data/pageSources';
import { fetchMe, loginHref } from './community/api';
import type { Me } from './community/api';
import { canEdit, deleteConceptChanges, proposalChanges, readMap, readShared, saveMap } from './maps/api';
import type { MapChange } from './maps/items';
import type { SavedMap } from './maps/api';
import { resolveMap } from './maps/map';
import { anchorLabel, canComment, newSince, openThreadsByTarget, parseAnchor } from './maps/comments';
import type { CommentPick } from './components/CommentsPanel';
import type { CommentMark } from './components/GraphView';
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
const CourseGoalsPanel = lazy(() => import('./components/CourseGoalsPanel'));

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
  // A personal map needs its id, or its share link's token (Phase 4); a bare ?mode=map was the
  // retired topic map's address.
  if (m === 'map' && (params.get('map') || shareFromHash(window.location.hash))) return 'map';
  // The concept map is the front page (the home page was retired, Decision 48); the
  // retired topic views (map, explore, goal, topic) land on it too.
  return 'concepts';
}

/**
 * Where in a personal map (Decision 50, Phase 1): `?mode=map&map=<id>` its map,
 * `&view=pages` (with `&concept=…` or `&relation=…`) its pages. Opened with its share
 * link, `#share=<token>` stands in for the id (lib/pageLinks.ts).
 */
interface MapPlace {
  /** The map's id, or shareKey(token) */
  map: string;
  view: 'map' | 'pages';
  page: PageRef;
}

function initialMapPlace(): MapPlace | null {
  const params = new URLSearchParams(window.location.search);
  const token = shareFromHash(window.location.hash);
  const map = params.get('map') ?? (token ? shareKey(token) : null);
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
    const token = shareToken(wantedMap);
    void (token ? readShared(token) : readMap(wantedMap)).then((r) => {
      if (!live) return;
      setMapLoad(r.ok ? { id: wantedMap, state: 'ready', saved: r.value } : { id: wantedMap, state: 'failed', status: r.status, error: r.error });
    });
    return () => {
      live = false;
    };
  }, [wantedMap]);
  const savedMap = mapLoad && mapLoad.id === wantedMap && mapLoad.state === 'ready' ? mapLoad.saved : null;
  const onMapSaved = useCallback((saved: SavedMap) => setMapLoad({ id: saved.map.id, state: 'ready', saved }), []);
  // The panel open under the map bar, one at a time: edit and members, comments, course goals.
  const [barPanel, setBarPanel] = useState<'edit' | 'goals' | null>(null);
  const mapPanelOpen = barPanel === 'edit';
  const personal: ResolvedMap | null = useMemo(() => (savedMap ? resolveMap(savedMap.map, concepts) : null), [savedMap]);
  // Its comments (Phase 3): for members who aren't only viewers. They open beside the map, which is
  // then in comment mode: a click on a concept or relation picks it for a comment; marks show open threads.
  const commenting = Boolean(savedMap && me?.user && canComment(savedMap.role));
  const mapComments = useComments(commenting && savedMap ? savedMap.map.id : null, me?.user?.login ?? null);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [commentPick, setCommentPick] = useState<CommentPick | null>(null);
  const toggleComments = () => {
    if (commentsOpen) mapComments.markRead();
    // Comment mode starts with the map clear: a click picks for a comment, so no card stays open,
    // and the panels under the bar make way for the map and the comments beside it.
    else {
      setSelectedId(null);
      setBarPanel(null);
    }
    setCommentsOpen(!commentsOpen);
  };
  const toggleBarPanel = (panel: 'edit' | 'goals') => setBarPanel(barPanel === panel ? null : panel);
  const pickForComment = useCallback((kind: 'node' | 'edge', id: string) => setCommentPick((p) => ({ kind, id, tick: (p?.tick ?? 0) + 1 })), []);
  const commentMarks: CommentMark[] = useMemo(() => {
    if (!personal || !mapComments.comments) return [];
    return [...openThreadsByTarget(mapComments.comments)].map(([key, count]) => {
      const [kind, id] = [key.slice(0, 4) as 'node' | 'edge', key.slice(5)];
      return { kind, id, count, label: anchorLabel({ kind, id }, personal) };
    });
  }, [mapComments.comments, personal]);
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
                  ? relationHref(mapPlace.page.relation, mapPlace.map)
                  : pageHref(mapPlace.page.concept ?? null, mapPlace.map)
                : mapHref(mapPlace.map)
            : mode === 'concepts'
            ? ''
            : `?mode=${mode}`;
    // A shared map's address ends in its "#share=…"; other addresses are compared without the hash.
    if ((target.includes('#') ? window.location.search + window.location.hash : window.location.search) === target) {
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

  // Editing a map (Phase 2): its editor saves into the map; a page is written on the page, and
  // "Review and save" brings its draft back to the editor (as on the atlas, Decision 49).
  const mayEditMap = Boolean(savedMap && me?.user && canEdit(savedMap.role));
  const [mapPageEdit, setMapPageEdit] = useState<string | null>(null);
  const [mapDraftOnArrival, setMapDraftOnArrival] = useState(false);
  const editMapPage = useCallback(
    (id: string) => {
      setMapDraftOnArrival(false);
      setMapPageEdit(id);
      openMapPage({ concept: id });
    },
    [openMapPage],
  );
  const reviewMapDraft = useCallback(() => {
    setMapPageEdit(null);
    setMapDraftOnArrival(true);
    setMapPlace((p) => (p ? { ...p, view: 'map' } : p));
  }, []);
  const mapEditing: MapEditing | undefined = useMemo(() => {
    if (!savedMap || !mayEditMap) return undefined;
    const save = async (changes: MapChange[]) => {
      const r = await saveMap(savedMap.map.id, savedMap.revision, changes);
      if (r.ok) {
        onMapSaved(r.value);
        return { ok: true as const };
      }
      if (r.current) onMapSaved(r.current);
      return { ok: false as const, error: r.error, problems: r.problems };
    };
    return {
      own: new Set(savedMap.map.nodes.map((n) => n.id)),
      ownEdges: new Set(savedMap.map.edges.map((e) => e.id)),
      onSave: async (proposal) => {
        const { changes, problems } = proposalChanges(savedMap.map, proposal);
        if (problems.length) return { ok: false as const, error: 'This can’t be saved in a map as it is.', problems };
        return save(changes);
      },
      onDelete: (id) => save(deleteConceptChanges(savedMap.map, id)),
    };
  }, [savedMap, mayEditMap, onMapSaved]);
  // The editor opens once on arrival (ConceptMapView reads it when it mounts), not on every return to the map.
  useEffect(() => {
    if (mapDraftOnArrival && mapPlace?.view === 'map') setMapDraftOnArrival(false);
  }, [mapDraftOnArrival, mapPlace?.view]);
  const ownConcept = useCallback((id: string) => Boolean(mapEditing?.own.has(id)), [mapEditing]);

  const openSavedMap = useCallback((id: string) => {
    setMapPlace({ map: id, view: 'map', page: {} });
    setMode('map');
  }, []);
  const leaveMap = useCallback(() => {
    setBarPanel(null);
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
      {/* Moves focus without touching the address: a shared map's "#share=…" stays (Phase 4). */}
      <a
        className="skip-link"
        href="#main"
        onClick={(e) => {
          e.preventDefault();
          mainRef.current?.focus();
        }}
      >
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
            {themeButton}
          </div>
        </header>
      {mode === 'map' && personal && mapPlace && (
        <nav className="map-bar" aria-label="Personal map">
          <p className="map-bar-title">
            <span className="map-bar-kind">{savedMap?.shared ? 'Shared map' : 'Personal map'}</span> {personal.map.title}
          </p>
          <ul className="map-bar-views">
            {(['map', 'pages'] as const).map((view) => (
              <li key={view}>
                <a
                  href={view === 'map' ? mapHref(mapPlace.map) : pageHref(null, mapPlace.map)}
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
          {savedMap && (
            <button
              type="button"
              className="draft-button map-bar-goals"
              aria-expanded={barPanel === 'goals'}
              aria-controls="goals-panel"
              onClick={() => toggleBarPanel('goals')}
            >
              Course goals ({personal.map.courseGoals?.length ?? 0})
            </button>
          )}
          {savedMap && me?.user && !savedMap.shared && (
            <button
              type="button"
              className="draft-button map-bar-panel"
              aria-expanded={mapPanelOpen}
              aria-controls="map-panel"
              onClick={() => toggleBarPanel('edit')}
            >
              {savedMap.role === 'owner' || savedMap.role === 'editor' ? 'Edit map and members' : 'Contents and members'}
            </button>
          )}
          {commenting && (
            <button type="button" className="draft-button map-bar-comments" aria-pressed={commentsOpen} onClick={toggleComments}>
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
          {savedMap?.shared && (
            <p className="map-bar-note">
              Shared with you by link. You can read the map and its pages; ticks on completed learning goals stay in this browser.
            </p>
          )}
          {personal.missingRefs.length > 0 && (
            <p className="map-bar-note">
              {personal.missingRefs.length === 1 ? 'One concept it uses is' : `${personal.missingRefs.length} concepts it uses are`} no
              longer on the atlas: {personal.missingRefs.join(', ')}.
            </p>
          )}
        </nav>
      )}
      {mode === 'map' && savedMap && personal && mapPlace && barPanel === 'goals' && (
        <div id="goals-panel">
          <Suspense fallback={<p className="atlas-loading">Loading…</p>}>
            <CourseGoalsPanel
              resolved={personal}
              saved={savedMap}
              editable={Boolean(me?.user) && canEdit(savedMap.role)}
              view={mapPlace.view}
              onPick={(id) => (mapPlace.view === 'pages' ? openMapPage({ concept: id }) : showOnPersonalMap(id))}
              onSaved={onMapSaved}
              progress={progress}
            />
          </Suspense>
        </div>
      )}
      {mode === 'map' && savedMap && me?.user && !savedMap.shared && mapPanelOpen && (
        <div id="map-panel">
          <Suspense fallback={<p className="atlas-loading">Loading…</p>}>
            <MapPanel saved={savedMap} login={me.user.login} onSaved={onMapSaved} onLeft={leaveMap} onShow={showOnPersonalMap} />
          </Suspense>
        </div>
      )}
      {/* The main view, and — in a personal map — its comments beside it. */}
      <div className="app-body">
      <main id="main" className="app-main" ref={mainRef} tabIndex={-1}>
        {/* An atlas page's own heading is the view's h1, and the feedback form's; a map's pages, too. */}
        {mode !== 'page' && mode !== 'feedback' && mode !== 'privacy' && mode !== 'guide' && mode !== 'maps' && !(mode === 'map' && mapPlace?.view === 'pages' && personal) && (
          <h1 className="visually-hidden">{mode === 'map' && personal ? `${personal.map.title}, personal map` : VIEW_TITLES[mode]}</h1>
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
          <MapScope.Provider value={mapPlace.map}>
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
                completedIn={personal.map.id}
                mapEditing={mapEditing}
                commentMode={commentsOpen && commenting ? { marks: commentMarks, onPick: pickForComment } : undefined}
                startEditing={Boolean(mapEditing) && mapDraftOnArrival}
                onEditPage={mapEditing ? editMapPage : undefined}
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
                    editOnArrival={mapEditing ? mapPageEdit : null}
                    onReviewDraft={mapEditing ? reviewMapDraft : undefined}
                    canEditPage={ownConcept}
                  />
                </Suspense>
              </PageSourceContext.Provider>
            )}
          </MapScope.Provider>
        )}
      </main>
      {mode === 'map' && savedMap && personal && personalPages && mapPlace && me?.user && commenting && commentsOpen && (
        <Suspense fallback={<p className="atlas-loading">Loading…</p>}>
          <CommentsPanel
            resolved={personal}
            comments={mapComments.comments}
            error={mapComments.error}
            seen={mapComments.seen}
            login={me.user.login}
            role={savedMap.role}
            onChange={mapComments.replace}
            pick={commentPick}
            current={mapPlace.view === 'pages' ? (mapPlace.page.concept ?? null) : null}
            view={mapPlace.view}
            pages={personalPages}
            onShow={(id) => (mapPlace.view === 'pages' ? openMapPage({ concept: id }) : focusOn(id))}
            onClose={toggleComments}
          />
        </Suspense>
      )}
      </div>
    </div>
  );
}
