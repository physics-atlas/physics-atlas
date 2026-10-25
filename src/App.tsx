import { useCallback, useEffect, useRef, useState } from 'react';
import Home from './components/Home';
import ConceptMapView, { MAP_HINT_ID } from './components/ConceptMapView';
import { concepts } from './data/loadConcepts';
import SearchBox from './components/SearchBox';
import type { SearchEntry } from './components/SearchBox';
import Starfield from './components/Starfield';
import { NODE_TYPE_LABELS } from './data/types';
import { IMPORTANCE_MAX } from './graph/concepts';
import { TYPE_COLORS } from './graph/typeColors';
import { useProgress } from './lib/useProgress';
import { useTheme } from './lib/useTheme';
import { useMotion } from './lib/motion';
import './App.css';

type Mode = 'home' | 'concepts' | 'community';

const VIEW_TITLES: Record<Mode, string> = {
  home: 'Learn by prerequisites',
  concepts: 'Concept map',
  community: 'Community review',
};

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
  // The retired topic views (map, explore, goal, topic) land on the concept map.
  if (m) return 'concepts';
  return 'home';
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
/** Fluff is fun mode only — search finds it only then. */
const isFluff = (e: SearchEntry) => concepts.nodes.find((n) => n.id === e.ref)?.type === 'fluff';
const seriousSearchEntries = conceptSearchEntries.filter((e) => !isFluff(e));

/** The concepts visible at every zoom — the home page's starting points. */
const landmarkEntries = seriousSearchEntries.filter(
  (e) => concepts.nodes.find((n) => n.id === e.ref)?.importance === IMPORTANCE_MAX,
);

export default function App() {
  const [mode, setMode] = useState<Mode>(initialMode);
  const [conceptGoal, setConceptGoal] = useState(initialConceptGoal);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [focus, setFocus] = useState<{ id: string | null; tick: number }>({ id: null, tick: 0 });
  // Fun mode: off on every visit; kept while switching between the map's two tabs.
  const [fun, setFun] = useState(false);
  // The map guide greets a visitor on the map, steps aside after a few seconds,
  // and stays one click away ("How to read this map"). Opened again, it stays.
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
    const target =
      mode === 'home'
        ? ''
        : conceptGoal
          ? `?mode=${mode}&goal=${encodeURIComponent(conceptGoal)}`
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
  }, [mode, conceptGoal]);

  useEffect(() => {
    const onPop = () => {
      setMode(initialMode());
      setConceptGoal(initialConceptGoal());
      setSelectedId(null);
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const focusOn = useCallback((id: string) => {
    setSelectedId(id);
    setFocus((f) => ({ id, tick: f.tick + 1 }));
  }, []);

  // Home search and landmarks land on the concept map, centred on the pick.
  const homePick = useCallback(
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
          <SearchBox entries={fun ? conceptSearchEntries : seriousSearchEntries} onPick={focusOn} />
          <button
            type="button"
            className="map-hint-toggle"
            aria-expanded={hintOpen}
            aria-controls={MAP_HINT_ID}
            onClick={() => setHintOpen((o) => !o)}
          >
            {hintOpen ? 'Hide the map guide' : 'How to read this map'}
          </button>
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
            entries={seriousSearchEntries}
            landmarks={landmarkEntries}
            onPick={homePick}
            onExplore={() => setMode('concepts')}
            onCommunity={() => setMode('community')}
            motionButton={motionButton}
            still={motion.reduced}
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
            fun={fun}
            onFunChange={setFun}
            hintOpen={hintOpen}
          />
        )}
      </main>
    </div>
  );
}
