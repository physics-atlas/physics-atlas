import { createContext } from 'react';

/**
 * The personal map being shown (its id), or null on the atlas. Links to a
 * concept's or relation's page read it, so inside a personal map they stay in
 * that map (Decision 50, Phase 1).
 */
export const MapScope = createContext<string | null>(null);
