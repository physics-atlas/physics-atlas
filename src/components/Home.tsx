import type { SearchEntry } from './SearchBox';
import Galaxy from './Galaxy';
import SearchBox from './SearchBox';
import { isPlainClick } from '../lib/pageLinks';

interface HomeProps {
  /** Every concept, for the hero search */
  entries: SearchEntry[];
  /** The landmark concepts offered as starting points */
  landmarks: SearchEntry[];
  /** Opens the concept map, centred on the picked concept */
  onPick: (id: string) => void;
  onExplore: () => void;
  /** Opens the community view: proposals and the proposal editor */
  onCommunity: () => void;
  /** Open the atlas pages (the chapters) */
  onPages: () => void;
  /** Open the feedback form */
  onFeedback: () => void;
  /** The reduce-motion switch — the galaxy animates indefinitely, so it must be stoppable here too */
  motionButton: React.ReactNode;
  still: boolean;
}

export default function Home({
  entries,
  landmarks,
  onPick,
  onExplore,
  onCommunity,
  onPages,
  onFeedback,
  motionButton,
  still,
}: HomeProps) {
  return (
    <div className="home">
      <Galaxy still={still} />
      <div className="home-settings">{motionButton}</div>
      <div className="home-content">
        <p className="home-eyebrow">An atlas of physics</p>
        <h1 className="home-title">
          Every concept.
          <br />
          Everything it stands on.
        </h1>
        <p className="home-lede">
          Physics is a map, not a ladder — from high-school algebra to the edge of the universe.
          Find a concept and see the whole path that leads to it.
        </p>
        <div className="home-search">
          <SearchBox entries={entries} onPick={onPick} hero placeholder="Where do you want to go? Try “dark matter”…" />
        </div>
        <div className="home-goals">
          <span className="home-goals-label">or start from a landmark</span>
          {landmarks.map((c) => (
            <button
              key={c.ref}
              className="goal-chip"
              style={{ '--chip-color': c.color } as React.CSSProperties}
              onClick={() => onPick(c.ref)}
            >
              {c.title}
            </button>
          ))}
        </div>
        <div className="home-actions">
          <button className="home-explore" onClick={onExplore}>
            Explore the concept map
            <span aria-hidden> →</span>
          </button>
          <button className="home-explore" onClick={onPages}>
            Read the atlas as pages
            <span aria-hidden> →</span>
          </button>
          <button className="home-explore home-community" onClick={onCommunity}>
            Propose concepts and review
            <span aria-hidden> →</span>
          </button>
        </div>
        <p className="home-feedback">
          <a
            href="?mode=feedback"
            onClick={(e) => {
              if (!isPlainClick(e)) return;
              e.preventDefault();
              onFeedback();
            }}
          >
            Tell us what you think of the site
          </a>
        </p>
      </div>
    </div>
  );
}
