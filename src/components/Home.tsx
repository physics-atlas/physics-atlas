import type { Topic } from '../data/types';
import { CATEGORY_COLORS, categoryOf } from '../graph/categoryColors';
import Galaxy from './Galaxy';
import SearchBox from './SearchBox';

interface HomeProps {
  topics: Topic[];
  onSearchPick: (id: string) => void;
  onExplore: () => void;
  /** Opens the community view: proposals and the proposal editor */
  onCommunity: () => void;
  onPickGoal: (id: string) => void;
  /** The reduce-motion switch — the galaxy animates indefinitely, so it must be stoppable here too */
  motionButton: React.ReactNode;
  still: boolean;
}

export default function Home({ topics, onSearchPick, onExplore, onCommunity, onPickGoal, motionButton, still }: HomeProps) {
  const featured = topics.filter((t) => t.featured);

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
          <SearchBox topics={topics} onPick={onSearchPick} hero placeholder="Where do you want to go? Try “cosmology”…" />
        </div>
        <div className="home-goals">
          <span className="home-goals-label">or start from a goal</span>
          {featured.map((t) => (
            <button
              key={t.id}
              className="goal-chip"
              style={{ '--chip-color': CATEGORY_COLORS[categoryOf(t)] } as React.CSSProperties}
              onClick={() => onPickGoal(t.id)}
            >
              {t.title}
            </button>
          ))}
        </div>
        <div className="home-actions">
          <button className="home-explore" onClick={onExplore}>
            Explore the concept map
            <span aria-hidden> →</span>
          </button>
          <button className="home-explore home-community" onClick={onCommunity}>
            Propose concepts and review
            <span aria-hidden> →</span>
          </button>
        </div>
      </div>
    </div>
  );
}
