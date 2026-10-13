import { CATEGORY_COLORS, CATEGORY_LABELS, CATEGORY_ORDER } from '../graph/categoryColors';
import { TYPE_ORDER } from '../graph/typeColors';
import { NODE_TYPE_LABELS } from '../data/types';
import TypeBadge from './TypeBadge';

export default function Legend({ variant = 'category' }: { variant?: 'category' | 'type' }) {
  if (variant === 'type') {
    return (
      <div className="legend legend-type">
        {TYPE_ORDER.map((type) => (
          <span key={type} className="legend-entry">
            <TypeBadge type={type} />
            {NODE_TYPE_LABELS[type]}
          </span>
        ))}
        <span className="legend-entry legend-size-note">larger circle = more general</span>
      </div>
    );
  }
  return (
    <div className="legend">
      {CATEGORY_ORDER.map((category) => (
        <span key={category} className="legend-entry">
          <span
            className="cat-dot"
            style={{ background: CATEGORY_COLORS[category], color: CATEGORY_COLORS[category] }}
            aria-hidden
          />
          {CATEGORY_LABELS[category]}
        </span>
      ))}
      <span className="legend-entry">
        <span className="legend-dash" aria-hidden />
        optional prerequisite
      </span>
    </div>
  );
}
