import type { NodeType } from '../data/types';
import { TYPE_COLORS } from '../graph/typeColors';
import { TYPE_ICON_VIEWBOX, typeIconMarkup } from '../graph/typeIcons';

/** Type colour disc with the type's glyph — the legend key for the on-canvas icons. */
export default function TypeBadge({ type }: { type: NodeType }) {
  const markup = typeIconMarkup(type);
  return (
    <span className="type-badge" style={{ background: TYPE_COLORS[type] }} aria-hidden>
      {markup && (
        <svg
          viewBox={TYPE_ICON_VIEWBOX}
          fill="none"
          stroke="currentColor"
          strokeWidth={1.8}
          strokeLinecap="round"
          strokeLinejoin="round"
          dangerouslySetInnerHTML={{ __html: markup }}
        />
      )}
    </span>
  );
}
