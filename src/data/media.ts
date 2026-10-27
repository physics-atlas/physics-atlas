// The concepts' pictures, content/media/<concept-id>/<name>.<ext> (node.figures):
// each one an asset of the build, here as the address it's served at.
// scripts/validate-concepts.mjs checks they exist and aren't too large.

const URLS = import.meta.glob<string>('/content/media/*/*.{png,jpg,webp,gif}', { eager: true, query: '?url', import: 'default' });

/** Where a figure's picture is served, or undefined when it isn't in the build (a proposal's new picture). */
export const figureUrl = (file: string): string | undefined => URLS[`/content/media/${file}`];
