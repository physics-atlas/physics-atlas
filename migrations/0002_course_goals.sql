-- Course goals (Decision 50, Phase 2): a map's items may also be 'goal' — a named
-- set of the map's learning goals (src/maps/map.ts CourseGoal). SQLite can't change
-- a CHECK constraint in place, so map_items is copied into a new table with the
-- wider one, and takes its place. Nothing else points at map_items.
-- Applied with `npx wrangler d1 migrations apply physics-atlas-maps --remote`.

CREATE TABLE map_items_new (
  map_id TEXT NOT NULL REFERENCES maps (id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('node', 'edge', 'page', 'ref', 'goal')),
  item_id TEXT NOT NULL,
  body TEXT NOT NULL,
  -- The map revision that last changed it
  revision INTEGER NOT NULL,
  PRIMARY KEY (map_id, kind, item_id)
);

INSERT INTO map_items_new (map_id, kind, item_id, body, revision)
  SELECT map_id, kind, item_id, body, revision FROM map_items;

DROP TABLE map_items;

ALTER TABLE map_items_new RENAME TO map_items;
