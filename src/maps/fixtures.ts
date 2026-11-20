import type { PersonalMap } from './map';

// The sample maps (content/maps-fixtures/*.json): Phase 1 shows a personal map
// from one of these, before maps are saved in the database (Phase 2). Each is
// labelled "Sample" — agents don't write physics content.

const FILES = import.meta.glob<PersonalMap>('/content/maps-fixtures/*.json', { eager: true, import: 'default' });

export const SAMPLE_MAPS: PersonalMap[] = Object.values(FILES);

export const sampleMap = (id: string): PersonalMap | undefined => SAMPLE_MAPS.find((m) => m.id === id);
