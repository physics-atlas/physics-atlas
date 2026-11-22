import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// The personal maps' D1 schema (migrations/0001_personal_maps.sql), applied to an
// in-memory SQLite database — D1 is SQLite. Node's built-in node:sqlite needs
// Node 22.13 or later; on an older Node these tests are skipped.
const sqlite = await import('node:sqlite').catch(() => null);
const first = readFileSync(new URL('../migrations/0001_personal_maps.sql', import.meta.url), 'utf8');
const second = readFileSync(new URL('../migrations/0002_course_goals.sql', import.meta.url), 'utf8');
const third = readFileSync(new URL('../migrations/0003_share_links.sql', import.meta.url), 'utf8');
const schema = `${first}
${second}
${third}`;

function database() {
  const db = new sqlite.DatabaseSync(':memory:');
  db.exec(schema);
  db.exec('PRAGMA foreign_keys = ON;');
  db.prepare('INSERT INTO users (id, github_id, github_login) VALUES (?, ?, ?)').run(1, 1001, 'sample-owner');
  db.prepare('INSERT INTO users (id, github_id, github_login) VALUES (?, ?, ?)').run(2, 1002, 'sample-editor');
  db.prepare("INSERT INTO maps (id, title, owner_id) VALUES ('m1', 'Sample course map', 1)").run();
  db.prepare("INSERT INTO map_members (map_id, user_id, role) VALUES ('m1', 1, 'owner'), ('m1', 2, 'editor')").run();
  return db;
}

describe.skipIf(!sqlite)('the personal maps database (migrations/0001–0003)', () => {
  it('gives each map that has no link one, leaving a live link as it is (0003)', () => {
    const db = new sqlite.DatabaseSync(':memory:');
    db.exec(`${first}
${second}`);
    db.prepare('INSERT INTO users (id, github_id, github_login) VALUES (1, 1001, ?)').run('sample-owner');
    db.prepare("INSERT INTO maps (id, title, owner_id) VALUES ('m1', 'Sample', 1), ('m2', 'Sample', 1), ('m3', 'Sample', 1)").run();
    db.prepare("INSERT INTO map_links (token, map_id) VALUES ('kept-sample-token-1', 'm2')").run();
    db.prepare("INSERT INTO map_links (token, map_id, revoked_at) VALUES ('old-sample-token-1', 'm3', '2026-01-01')").run();
    db.exec(third);
    const live = db.prepare('SELECT map_id, token FROM map_links WHERE revoked_at IS NULL ORDER BY map_id').all();
    expect(live.map((l) => l.map_id)).toEqual(['m1', 'm2', 'm3']);
    expect(live[1].token).toBe('kept-sample-token-1');
    for (const l of [live[0], live[2]]) expect(l.token).toMatch(/^[0-9a-f]{36}$/);
    expect(live[0].token).not.toBe(live[2].token);
  });

  it('takes course goals, keeping the items already there (0002)', () => {
    const db = new sqlite.DatabaseSync(':memory:');
    db.exec(first);
    db.prepare('INSERT INTO users (id, github_id, github_login) VALUES (1, 1001, ?)').run('sample-owner');
    db.prepare("INSERT INTO maps (id, title, owner_id) VALUES ('m1', 'Sample', 1)").run();
    db.prepare("INSERT INTO map_items (map_id, kind, item_id, body, revision) VALUES ('m1', 'ref', 'velocity_7r85', '{}', 3)").run();
    expect(() => db.prepare("INSERT INTO map_items (map_id, kind, item_id, body, revision) VALUES ('m1', 'goal', 'g1', '{}', 4)").run()).toThrow();
    db.exec(second);
    db.exec('PRAGMA foreign_keys = ON;');
    db.prepare("INSERT INTO map_items (map_id, kind, item_id, body, revision) VALUES ('m1', 'goal', 'g1', '{}', 4)").run();
    expect(db.prepare('SELECT kind, item_id, revision FROM map_items ORDER BY kind').all()).toEqual([
      { kind: 'goal', item_id: 'g1', revision: 4 },
      { kind: 'ref', item_id: 'velocity_7r85', revision: 3 },
    ]);
    expect(() => db.prepare("INSERT INTO map_items (map_id, kind, item_id, body, revision) VALUES ('m1', 'other', 'x', '{}', 4)").run()).toThrow();
    db.prepare("DELETE FROM maps WHERE id = 'm1'").run();
    expect(db.prepare('SELECT COUNT(*) AS n FROM map_items').get()).toEqual({ n: 0 });
  });

  it('keeps only a GitHub id and username about a person', () => {
    const columns = (database().prepare('PRAGMA table_info(users)').all()).map((c) => c.name);
    expect(columns).toEqual(['id', 'github_id', 'github_login', 'created_at']);
  });

  it('keeps a deleted member’s comments and edits, as "former member"', () => {
    const db = database();
    db.prepare("INSERT INTO comments (id, map_id, anchor, author_id, body) VALUES ('c1', 'm1', 'map', 2, 'Sample comment')").run();
    db.prepare("INSERT INTO map_revisions (map_id, revision, user_id, changed) VALUES ('m1', 1, 2, '[]')").run();
    db.prepare('DELETE FROM users WHERE id = 2').run();
    expect(db.prepare("SELECT author_id, body FROM comments WHERE id = 'c1'").get()).toEqual({ author_id: null, body: 'Sample comment' });
    expect(db.prepare("SELECT user_id FROM map_revisions WHERE map_id = 'm1'").get()).toEqual({ user_id: null });
    expect(db.prepare("SELECT COUNT(*) AS n FROM map_members WHERE user_id = 2").get()).toEqual({ n: 0 });
  });

  it('removes a map, with everything in it, when its owner deletes their account', () => {
    const db = database();
    db.prepare(`INSERT INTO map_items (map_id, kind, item_id, body, revision) VALUES ('m1', 'node', 'n1', '{}', 1)`).run();
    db.prepare("INSERT INTO map_links (token, map_id) VALUES ('t', 'm1')").run();
    db.prepare('DELETE FROM users WHERE id = 1').run();
    for (const table of ['maps', 'map_members', 'map_items', 'map_links'])
      expect(db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get()).toEqual({ n: 0 });
  });

  it('accepts only the four roles, and links that only view', () => {
    const db = database();
    expect(() => db.prepare("INSERT INTO map_members (map_id, user_id, role) VALUES ('m1', 2, 'admin')").run()).toThrow();
    expect(() => db.prepare("INSERT INTO map_links (token, map_id, role) VALUES ('t2', 'm1', 'editor')").run()).toThrow();
  });
});
