import type { NodeType } from '../data/types';

// Sophie's per-type glyphs (24×24, stroke = currentColor), each centred on
// (12, 12) and kept inside r ≈ 10 so the cropped VIEWBOX lets them fill the
// circle. Every type has one, so the type never rests on colour alone; a new
// type without a glyph renders as a plain circle (label and legend still name it).
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
  // From Sophie's second sketch (2026-10), drawn in the same line style:
  // a flag (the sketch's summit read as a mountain, not a goal)
  learning_goal: '<path d="M6.5 21V3.5"/><path d="M6.5 4.5c2.6-1.6 5-1.6 7 0s4.4 1.6 6.5 0v8.5c-2.1 1.6-4.5 1.6-6.5 0s-4.4-1.6-7 0"/>',
  // an open book
  resource: '<path d="M12 6.6C10 5.2 6.9 4.7 3.5 5.1v13.2c3.4-.4 6.5.1 8.5 1.5 2-1.4 5.1-1.9 8.5-1.5V5.1c-3.4-.4-6.5.1-8.5 1.5z"/><path d="M12 6.6v13.2M6 9.3h3.4M6 12.3h3.4M14.6 9.3H18M14.6 12.3H18"/>',
  // a thought with ≠
  misconception: '<path d="M7.6 15.3a3.6 3.6 0 0 1-.7-7.1 4.7 4.7 0 0 1 9-1.3 3.7 3.7 0 0 1 1 8.4z"/><path d="M9.6 9.9h4.8M9.6 12.4h4.8M13.2 8.5l-2.4 5.3"/><circle cx="7.4" cy="18" r="1.1"/><circle cx="5.4" cy="20.2" r=".6" fill="currentColor"/>',
  // a question
  claim: '<path d="M8.4 8.4a3.6 3.6 0 1 1 5.1 3.3c-1.1.5-1.5 1.3-1.5 2.4v.9"/><circle cx="12" cy="18.6" r="1.3" fill="currentColor" stroke="none"/>',
  // a magnifying glass
  finding: '<circle cx="13.6" cy="10.4" r="6.2"/><path d="M9.2 14.8 3.8 20.2" stroke-width="2.6"/>',
  // a flask
  experiment: '<path d="M9 3.4h6M10.3 3.4v5.4L5 18.4a1.5 1.5 0 0 0 1.3 2.2h11.4a1.5 1.5 0 0 0 1.3-2.2l-5.3-9.6V3.4"/><path d="M7.4 14.4h9.2"/>',
  // a bar chart
  dataset: '<path d="M3.6 20.4h16.8"/><path d="M6.6 20.4v-5.6M10.2 20.4V8.2M13.8 20.4v-8.6M17.4 20.4V5.6" stroke-width="2.6"/>',
  // a step in a cycle
  method: '<path d="M19.2 11.4a7.2 7.2 0 0 1-12.6 5.3M4.8 12.6a7.2 7.2 0 0 1 12.6-5.3"/><path d="M17.6 3.6v3.9h-3.9M6.4 20.4v-3.9h3.9"/><rect x="9.9" y="9.9" width="4.2" height="4.2" rx=".7"/>',
  // a gear
  process: '<path d="M19.04 9.72L21.67 10.42L21.67 13.58L19.04 14.28L18.59 15.37L19.96 17.72L17.72 19.96L15.37 18.59L14.28 19.04L13.58 21.67L10.42 21.67L9.72 19.04L8.63 18.59L6.28 19.96L4.04 17.72L5.41 15.37L4.96 14.28L2.33 13.58L2.33 10.42L4.96 9.72L5.41 8.63L4.04 6.28L6.28 4.04L8.63 5.41L9.72 4.96L10.42 2.33L13.58 2.33L14.28 4.96L15.37 5.41L17.72 4.04L19.96 6.28L18.59 8.63Z"/><circle cx="12" cy="12" r="3.3"/>',
  // Newton's apple
  theory: '<path d="M12 8.3c-1.5-1.1-4.6-1.3-6.1.8-1.8 2.4-.9 6.5 1.2 9.1 1.3 1.6 2.7 2.3 3.7 1.8.8-.4 1.6-.4 2.4 0 1 .5 2.4-.2 3.7-1.8 2.1-2.6 3-6.7 1.2-9.1-1.5-2.1-4.6-1.9-6.1-.8z"/><path d="M12 8.3c0-1.9.5-3.3 1.9-4.6"/><path d="M12.9 6c1.6-1 3.4-.9 4.4.2-1.6 1.1-3.2 1.1-4.4-.2z"/>',
  // A smiley: fluff is told apart by its glyph too, never by colour alone.
  fluff:
    '<circle cx="12" cy="12" r="9.5"/>' +
    '<circle cx="8.8" cy="9.6" r="1.4" fill="currentColor" stroke="none"/>' +
    '<circle cx="15.2" cy="9.6" r="1.4" fill="currentColor" stroke="none"/>' +
    '<path d="M7.3 13.8q4.7 5 9.4 0"/>',
};

/**
 * Moves each glyph so its drawn box is centred on (12, 12), the middle of
 * the circle — measured from the drawings (SVG getBBox). Re-measure after
 * changing or adding a glyph; a glyph not listed is already centred.
 */
const CENTRING: Partial<Record<NodeType, [number, number]>> = {
  formalism: [0, -0.3],
  learning_goal: [-1.25, -0.15],
  resource: [0, -0.38],
  misconception: [-0.38, -0.41],
  claim: [0, -0.36],
  finding: [0.2, -0.2],
  dataset: [0, -1],
  theory: [0, 0.07],
};

/** A glyph's markup, centred in its circle. */
function centred(type: NodeType): string | null {
  const markup = ICON_MARKUP[type];
  if (!markup) return null;
  const shift = CENTRING[type];
  return shift ? `<g transform="translate(${shift[0]} ${shift[1]})">${markup}</g>` : markup;
}

export const TYPE_ICON_VIEWBOX = '1.5 1.5 21 21';

const svgFor = (markup: string) =>
  // Explicit width/height: Cytoscape's zoomed-out texture cache mis-scales an
  // SVG without an intrinsic size (tiny, top-left glyphs).
  `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="${TYPE_ICON_VIEWBOX}" ` +
  'fill="none" stroke="currentColor" ' +
  `stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${markup}</svg>`;

/** Inner SVG markup for inline use (inherits the CSS colour), or null. */
export function typeIconMarkup(type: NodeType): string | null {
  return centred(type);
}

/** A data URI for Cytoscape's background-image — the canvas can't inherit CSS colour. */
export function typeIconUri(type: NodeType, color: string): string | null {
  const markup = centred(type);
  if (!markup) return null;
  const svg = svgFor(markup).replaceAll('currentColor', color);
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}
