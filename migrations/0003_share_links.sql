-- Share links for every map (Phase 4): a new map now starts with one (server/maps.ts), so the
-- maps made before that get theirs here — a random token from the database, as long as the
-- map has no link at the moment. The owner can replace it or turn it off in the map's panel.
-- Applied with `npx wrangler d1 migrations apply physics-atlas-maps --remote`.

INSERT INTO map_links (token, map_id)
  SELECT lower(hex(randomblob(18))), id FROM maps
  WHERE NOT EXISTS (SELECT 1 FROM map_links l WHERE l.map_id = maps.id AND l.revoked_at IS NULL);
