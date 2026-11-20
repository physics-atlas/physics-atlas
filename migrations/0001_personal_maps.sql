-- Personal maps (Decision 50, .claude/plans/epic-personal-maps.md): the D1 database's
-- first migration. Applied with `npx wrangler d1 migrations apply physics-atlas-maps`
-- (docs/PERSONAL-MAPS-SETUP.md). The atlas itself is not here: it stays in git.
--
-- Data minimisation (Decision 51, docs/PRIVACY-NOTICE.md): the only personal data is a
-- signed-in person's GitHub account — its numeric id and username — and what they write
-- (maps, comments) and do (edits). No e-mail, no real name, no avatar, no IP address.
-- Someone who deletes their account leaves their comments and edits behind as
-- "former member": the columns pointing at them become NULL.

PRAGMA foreign_keys = ON;

-- People who have signed in to use personal maps.
CREATE TABLE users (
  id INTEGER PRIMARY KEY,
  -- GitHub's numeric account id: never changes, unlike the username
  github_id INTEGER NOT NULL UNIQUE,
  -- GitHub username, refreshed at each sign-in (shown to the other members of a map)
  github_login TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE maps (
  -- A random id (not a counter): it appears in addresses
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  -- The owner; a map whose owner deletes their account goes with it
  owner_id INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  -- Raised by every save; a save made against an older revision is refused (conflict)
  revision INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- Who may do what on a map. The owner is also listed here, as 'owner'.
CREATE TABLE map_members (
  map_id TEXT NOT NULL REFERENCES maps (id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('owner', 'editor', 'commenter', 'viewer')),
  added_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (map_id, user_id)
);

-- "Anyone with the link": an unguessable token in the address, view only, revocable.
CREATE TABLE map_links (
  token TEXT PRIMARY KEY,
  map_id TEXT NOT NULL REFERENCES maps (id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'viewer' CHECK (role = 'viewer'),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  revoked_at TEXT
);

-- A map's content, one row per concept, relation, page or reference to an atlas concept.
-- body is JSON in the atlas's own format (src/data/types.ts; a page is its depths).
CREATE TABLE map_items (
  map_id TEXT NOT NULL REFERENCES maps (id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('node', 'edge', 'page', 'ref')),
  item_id TEXT NOT NULL,
  body TEXT NOT NULL,
  -- The map revision that last changed it
  revision INTEGER NOT NULL,
  PRIMARY KEY (map_id, kind, item_id)
);

-- The history: who changed what, when. A deleted account shows as "former member".
CREATE TABLE map_revisions (
  map_id TEXT NOT NULL REFERENCES maps (id) ON DELETE CASCADE,
  revision INTEGER NOT NULL,
  user_id INTEGER REFERENCES users (id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  -- JSON list of the changed items, as "kind:item_id"
  changed TEXT NOT NULL,
  PRIMARY KEY (map_id, revision)
);

-- Comment threads, anchored to a concept, a relation, a page depth, or the whole map.
-- A thread is its first comment; replies point to it. Never shown to link viewers.
CREATE TABLE comments (
  id TEXT PRIMARY KEY,
  map_id TEXT NOT NULL REFERENCES maps (id) ON DELETE CASCADE,
  -- NULL for the first comment of a thread
  thread_id TEXT REFERENCES comments (id) ON DELETE CASCADE,
  -- 'map', 'node:<id>', 'edge:<id>', 'page:<id>:<depth>'
  anchor TEXT NOT NULL,
  -- NULL once the author has deleted their account: "former member"
  author_id INTEGER REFERENCES users (id) ON DELETE SET NULL,
  -- Markdown + LaTeX, shown through the site's own renderer (never as HTML)
  body TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  edited_at TEXT,
  -- On the thread's first comment
  resolved_at TEXT,
  resolved_by INTEGER REFERENCES users (id) ON DELETE SET NULL
);

CREATE INDEX map_members_by_user ON map_members (user_id);
CREATE INDEX map_links_by_map ON map_links (map_id);
CREATE INDEX comments_by_map ON comments (map_id, anchor);
CREATE INDEX comments_by_thread ON comments (thread_id);
