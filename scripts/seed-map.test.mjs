import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { seedProblems, seedSql } from './seed-map.mjs';

// The seed maps (scripts/maps-seed/): each fits the atlas, and its SQL makes the
// map in the real schema — once; running it again changes nothing.
const sqlite = await import('node:sqlite').catch(() => null);
const schema = ['0001_personal_maps.sql', '0002_course_goals.sql'].map((f) => readFileSync(new URL(`../migrations/${f}`, import.meta.url), 'utf8')).join('\n');
const atlas = JSON.parse(readFileSync(new URL('../src/data/concepts.json', import.meta.url), 'utf8'));
const dir = new URL('./maps-seed/', import.meta.url);
const seeds = readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => [f, JSON.parse(readFileSync(new URL(f, dir), 'utf8'))]);

describe.each(seeds)('the seed map %s', (_file, seed) => {
  it('is complete, and uses only concepts on the atlas', () => {
    expect(seedProblems(seed)).toEqual([]);
    expect(seed.refs.filter((id) => !atlas.nodes.some((n) => n.id === id))).toEqual([]);
  });

  it.skipIf(!sqlite)('makes the map with its owner and members, once', () => {
    const db = new sqlite.DatabaseSync(':memory:');
    db.exec(schema);
    db.exec('PRAGMA foreign_keys = ON;');
    const people = [seed.owner, ...Object.keys(seed.members)];
    const accounts = Object.fromEntries(people.map((login, i) => [login, { id: 9000 + i, login }]));
    const sql = seedSql(seed, accounts);
    db.exec(sql);
    // A member who left, and a reference removed, stay that way when it runs again.
    const editor = Object.keys(seed.members)[0];
    db.prepare('DELETE FROM map_members WHERE user_id = (SELECT id FROM users WHERE github_login = ?)').run(editor);
    db.prepare("DELETE FROM map_items WHERE item_id = ?").run(seed.refs[0]);
    db.exec(sql);
    const members = db.prepare('SELECT u.github_login AS login, m.role AS role FROM map_members m JOIN users u ON u.id = m.user_id ORDER BY login').all();
    expect(members).toEqual(
      [[seed.owner, 'owner'], ...Object.entries(seed.members)]
        .filter(([login]) => login !== editor)
        .map(([login, role]) => ({ login, role }))
        .sort((a, b) => a.login.localeCompare(b.login)),
    );
    expect(db.prepare("SELECT COUNT(*) AS n FROM map_items WHERE kind = 'ref'").get().n).toBe(seed.refs.length - 1);
    expect(db.prepare('SELECT id, title, revision FROM maps').get()).toEqual({ id: seed.id, title: seed.title, revision: 1 });
  });
});
