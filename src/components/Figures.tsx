import type { Figure } from '../data/types';
import { figureUrl } from '../data/media';
import { InlineText } from './RichText';

// A concept's pictures (node.figures), on its card and its page: each with its
// description as the alt text, its caption, and its credit. A picture that
// comes with an open proposal isn't on the site yet: its description stands in.

export default function Figures({ figures }: { figures: Figure[] }) {
  return (
    <ul className="concept-figures">
      {figures.map((f) => {
        const src = figureUrl(f.file);
        return (
          <li key={f.file}>
            <figure className="concept-figure">
              {src ? (
                <img src={src} alt={f.alt} loading="lazy" decoding="async" />
              ) : (
                <p className="concept-empty">A picture comes with the proposal — shown once it's accepted: {f.alt}</p>
              )}
              <figcaption>
                {f.caption && (
                  <span className="concept-figure-caption">
                    <InlineText source={f.caption} />
                  </span>
                )}
                <span className="concept-figure-credit">Credit: {f.credit}</span>
              </figcaption>
            </figure>
          </li>
        );
      })}
    </ul>
  );
}
