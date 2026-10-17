import { useCallback, useEffect, useRef, useState } from 'react';
import { graph as data } from './data/loadGraph';
import Home from './components/Home';
import GoalView from './components/GoalView';
import MapView from './components/MapView';
import ConceptMapView from './components/ConceptMapView';
import { concepts } from './data/loadConcepts';
import TopicPage from './components/TopicPage';
import SearchBox from './components/SearchBox';
import type { SearchEntry } from './components/SearchBox';
import Starfield from './components/Starfield';
import { NODE_TYPE_LABELS } from './data/types';
import { expandedCurriculumFor, parseUnitId } from './graph/dag';
import { TYPE_COLORS } from './graph/typeColors';
import { useProgress } from './lib/useProgress';
import { useTheme } from './lib/useTheme';
import { useMotion } from './lib/motion';
import './App.css';

type Mode = 'home' | 'map' | 'goal' | 'topic' | 'concepts' | 'community';

const VIEW_TITLES: Record<Mode, string> = {
  home: 'Learn by prerequisites',
  map: 'Topic map',
  goal: 'Learning goal',
  topic: 'Topic',
  concepts: 'Concept map',
  community: 'Community review',
};

// The community view (.claude/plans/epic-community-review.md) is the concept
// map with the proposed layer and the proposal editor. Open to everyone for
// now — sign-in comes with Phase 3.
const isConceptView = (m: Mode) => m === 'concepts' || m === 'community';

function initialMode(): Mode {
  const params = new URLSearchParams(window.location.search);
  const m = params.get('mode');
  if (m === 'map' || m === 'explore') return 'map';
  if (m === 'goal') return 'goal';
  if (m === 'topic') return 'topic';
  // `?mode=concepts&community=1` was the community preview's address before it had a tab.
  if (m === 'community' || (m === 'concepts' && params.get('community') === '1')) return 'community';
  if (m === 'concepts') return 'concepts';
  return 'home';
}

function initialTopicId(): string {
  const id = new URLSearchParams(window.location.search).get('id');
  return id && data.topics.some((t) => t.id === id) ? id : data.topics[0].id;
}

function isValidRef(ref: string): boolean {
  const { topicId, subId } = parseUnitId(ref);
  const t = data.topics.find((t) => t.id === topicId);
  if (!t) return false;
  return !subId || (t.subtopics ?? []).some((s) => s.id === subId);
}

function initialGoal(): string {
  const g = new URLSearchParams(window.location.search).get('goal');
  if (!g) return 'cosmology';
  if (isValidRef(g)) return g;
  const { topicId } = parseUnitId(g);
  return data.topics.some((t) => t.id === topicId) ? topicId : 'cosmology';
}

function initialConceptGoal(): string | null {
  const params = new URLSearchParams(window.location.search);
  const g = params.get('goal');
  if ((params.get('mode') !== 'concepts' && params.get('mode') !== 'community') || !g) return null;
  return concepts.nodes.some((n) => n.id === g) ? g : null;
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

export default function App() {
  const [mode, setMode] = useState<Mode>(initialMode);
  const [goalRef, setGoalRef] = useState(initialGoal);
  const [conceptGoal, setConceptGoal] = useState(initialConceptGoal);
  const [topicPageId, setTopicPageId] = useState(initialTopicId);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [focus, setFocus] = useState<{ id: string | null; tick: number }>({ id: null, tick: 0 });
  const progress = useProgress();
  const { theme, toggle: toggleTheme } = useTheme();
  const motion = useMotion();
  // The home hero is intentionally dark-only; every other view honors the choice.
  useEffect(() => {
    document.documentElement.dataset.theme = mode === 'home' ? 'dark' : theme;
  }, [mode, theme]);

  // Each view is a page to assistive tech: its own title (WCAG 2.4.2), and
  // focus moves to the new view on navigation so a screen reader starts
  // reading there instead of staying on the button that was pressed.
  const mainRef = useRef<HTMLElement>(null);
  const firstView = useRef(true);
  useEffect(() => {
    document.title = `${VIEW_TITLES[mode]} — Physics Atlas`;
    if (firstView.current) {
      firstView.current = false;
      return;
    }
    mainRef.current?.focus({ preventScroll: true });
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
    const view =
      mode === 'home'
        ? ''
        : mode === 'goal'
          ? `?mode=goal&goal=${encodeURIComponent(goalRef)}`
          : mode === 'topic'
            ? `?mode=topic&id=${encodeURIComponent(topicPageId)}`
            : isConceptView(mode) && conceptGoal
              ? `?mode=${mode}&goal=${encodeURIComponent(conceptGoal)}`
              : `?mode=${mode}`;
    const target = view;
    if (window.location.search === target) {
      firstUrlSync.current = false;
      return;
    }
    const url = target || window.location.pathname;
    // Initial normalization (e.g. legacy ?mode=explore) replaces instead of
    // stacking an extra entry under the very first view.
    if (firstUrlSync.current) window.history.replaceState(null, '', url);
    else window.history.pushState(null, '', url);
    firstUrlSync.current = false;
  }, [mode, goalRef, conceptGoal, topicPageId]);

  useEffect(() => {
    const onPop = () => {
      setMode(initialMode());
      setGoalRef(initialGoal());
      setConceptGoal(initialConceptGoal());
      setTopicPageId(initialTopicId());
      setSelectedId(null);
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const pickGoal = useCallback((ref: string) => {
    setGoalRef(ref);
    setSelectedId(null);
    setMode('goal');
  }, []);

  const openTopic = useCallback((id: string) => {
    setTopicPageId(parseUnitId(id).topicId);
    setMode('topic');
  }, []);

  // Subtopics have no map node — the graph centers on the parent topic
  const focusOn = useCallback((ref: string) => {
    setSelectedId(ref);
    setFocus((f) => ({ id: parseUnitId(ref).topicId, tick: f.tick + 1 }));
  }, []);

  // Home search lands on the full map, centered on the hit;
  // a subtopic hit becomes a learning goal directly.
  const homeSearchPick = useCallback(
    (ref: string) => {
      if (parseUnitId(ref).subId) {
        pickGoal(ref);
        return;
      }
      setMode('map');
      focusOn(ref);
    },
    [focusOn, pickGoal],
  );

  // Header search: select + center. Subtopic hits become the goal; in goal
  // mode a topic outside the current curriculum becomes the new goal
  // (a humbler ending).
  const headerSearchPick = useCallback(
    (ref: string) => {
      if (parseUnitId(ref).subId) {
        pickGoal(ref);
        return;
      }
      if (mode === 'topic') {
        openTopic(ref);
        return;
      }
      if (
        mode === 'goal' &&
        !expandedCurriculumFor(goalRef, data.topics).some((g) => g.topic.id === ref)
      ) {
        setGoalRef(ref);
      }
      focusOn(ref);
    },
    [mode, goalRef, focusOn, pickGoal, openTopic],
  );

  return (
    <div className="app">
      <a className="skip-link" href="#main">
        Skip to main content
      </a>
      <Starfield still={motion.reduced} />
      <div className="nebula nebula-a" aria-hidden />
      <div className="nebula nebula-b" aria-hidden />
      <div className="nebula nebula-c" aria-hidden />
      {mode !== 'home' && (
        <header className="app-header">
          <p className="app-heading">
            <button className="app-wordmark" onClick={() => setMode('home')} aria-label="Physics Atlas, home">
              <span className="app-title">Physics Atlas</span>
            </button>
          </p>
          {isConceptView(mode) ? (
            <SearchBox
              key="concepts"
              entries={conceptSearchEntries}
              onPick={focusOn}
              placeholder="Search concepts…"
              label="Search concepts"
            />
          ) : (
            <SearchBox key="topics" topics={data.topics} onPick={headerSearchPick} />
          )}
          <nav className="mode-tabs" aria-label="Views">
            <button
              className={`mode-tab ${mode === 'concepts' ? 'mode-tab-active' : ''}`}
              aria-current={mode === 'concepts' ? 'page' : undefined}
              onClick={() => setMode('concepts')}
            >
              Concept map
            </button>
            <button
              className={`mode-tab ${mode === 'community' ? 'mode-tab-active' : ''}`}
              aria-current={mode === 'community' ? 'page' : undefined}
              onClick={() => setMode('community')}
              title="Propose concepts and edits, and see open proposals"
            >
              Community
            </button>
            <button
              className={`mode-tab ${mode === 'goal' ? 'mode-tab-active' : ''}`}
              aria-current={mode === 'goal' ? 'page' : undefined}
              onClick={() => setMode('goal')}
            >
              Learning goal
            </button>
          </nav>
          <div className="header-settings" role="group" aria-label="Display settings">
            {motionButton}
            {themeButton}
          </div>
        </header>
      )}
      <main id="main" className="app-main" ref={mainRef} tabIndex={-1}>
        {mode !== 'home' && <h1 className="visually-hidden">{VIEW_TITLES[mode]}</h1>}
        {mode === 'home' && (
          <Home
            topics={data.topics}
            onSearchPick={homeSearchPick}
            onExplore={() => setMode('concepts')}
            onCommunity={() => setMode('community')}
            onPickGoal={pickGoal}
            motionButton={motionButton}
            still={motion.reduced}
          />
        )}
        {mode === 'map' && (
          <MapView
            topics={data.topics}
            progress={progress}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onMakeGoal={pickGoal}
            onOpenTopic={openTopic}
            focus={focus}
            theme={theme}
          />
        )}
        {mode === 'goal' && (
          <GoalView
            topics={data.topics}
            skills={data.skills ?? []}
            progress={progress}
            goalRef={goalRef}
            onPickGoal={(ref) => {
              setGoalRef(ref);
              setSelectedId(null);
            }}
            onOpenTopic={openTopic}
            selectedId={selectedId}
            onSelect={setSelectedId}
            focus={focus}
            theme={theme}
          />
        )}
        {mode === 'topic' && (
          <TopicPage
            topics={data.topics}
            progress={progress}
            topicId={topicPageId}
            onOpenTopic={openTopic}
            onMakeGoal={pickGoal}
            onShowOnMap={(id) => {
              setMode('map');
              focusOn(id);
            }}
            theme={theme}
          />
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
          />
        )}
      </main>
    </div>
  );
}
