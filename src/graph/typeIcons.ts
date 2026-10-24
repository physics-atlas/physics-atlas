import type { NodeType } from '../data/types';

// Sophie's per-type glyphs (24×24, stroke = currentColor), each centred on
// (12, 12) and kept inside r ≈ 10 so the cropped VIEWBOX lets them fill the
// circle. Types without a glyph yet render as plain circles; colour + label +
// legend still name them.
const ICON_MARKUP: Partial<Record<NodeType, string>> = {
  physical_system:
    '<circle cx="12" cy="12" r="2.2" fill="currentColor" stroke="none"/>' +
    '<ellipse cx="12" cy="12" rx="10" ry="3.8"/>' +
    '<ellipse cx="12" cy="12" rx="10" ry="3.8" transform="rotate(60 12 12)"/>' +
    '<ellipse cx="12" cy="12" rx="10" ry="3.8" transform="rotate(120 12 12)"/>',
  property: '<path d="M10 3.5 7.5 20.5M16.5 3.5 14 20.5M4.5 9h16M3.5 15h16"/>',
  phenomenon: '<path d="M3.5 19.5h2l2-6 2 6 2.5-15 2.5 15 2-9 2 9 1-3 1 3"/>',
  model_regime:
    '<path d="M3 6h18M3 12h18M3 18h18M5 4.5 3 6l2 1.5M19 4.5 21 6l-2 1.5M5 10.5 3 12l2 1.5M19 10.5 21 12l-2 1.5M5 16.5 3 18l2 1.5M19 16.5 21 18l-2 1.5"/>' +
    '<circle cx="8" cy="6" r="1.6" fill="currentColor"/>' +
    '<circle cx="16" cy="12" r="1.6" fill="currentColor"/>' +
    '<circle cx="12" cy="18" r="1.6" fill="currentColor"/>',
  formalism:
    '<path d="M9.1 5.2C7.7 4.2 6.1 5 5.9 7.2L5.1 17.6C4.9 19.6 3.7 20.2 2.5 19.6M3.3 10.2h5.2' +
    'M11.7 6.5Q9.3 12 11.7 17.5M20.3 6.5Q22.7 12 20.3 17.5M13.5 9.5l5 5M18.5 9.5l-5 5"/>',
  equation: '<path d="M3.5 8h17M3.5 16h17" stroke-width="3"/>',
  // A smiley: fluff is told apart by its glyph too, never by colour alone.
  fluff:
    '<circle cx="12" cy="12" r="9.5"/>' +
    '<circle cx="8.8" cy="9.6" r="1.4" fill="currentColor" stroke="none"/>' +
    '<circle cx="15.2" cy="9.6" r="1.4" fill="currentColor" stroke="none"/>' +
    '<path d="M7.3 13.8q4.7 5 9.4 0"/>',
};

export const TYPE_ICON_VIEWBOX = '1.5 1.5 21 21';

const svgFor = (markup: string) =>
  // Explicit width/height: Cytoscape's zoomed-out texture cache mis-scales an
  // SVG without an intrinsic size (tiny, top-left glyphs).
  `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="${TYPE_ICON_VIEWBOX}" ` +
  'fill="none" stroke="currentColor" ' +
  `stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${markup}</svg>`;

/** Inner SVG markup for inline use (inherits the CSS colour), or null. */
export function typeIconMarkup(type: NodeType): string | null {
  return ICON_MARKUP[type] ?? null;
}

/** A data URI for Cytoscape's background-image — the canvas can't inherit CSS colour. */
export function typeIconUri(type: NodeType, color: string): string | null {
  const markup = ICON_MARKUP[type];
  if (!markup) return null;
  const svg = svgFor(markup).replaceAll('currentColor', color);
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}
