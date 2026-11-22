#!/usr/bin/env node
// Makes a personal map in the maps database (Decision 50) from a seed file in
// scripts/maps-seed/ — for a map that has to exist before its owner first signs in.
//
//   node scripts/seed-map.mjs scripts/maps-seed/<name>.json seed.sql
//   npx wrangler d1 execute physics-atlas-maps --remote --file seed.sql
//
// GitHub's public API gives each username's account id (the database keys people
// by it, not by the username, which can change). Running the SQL again changes
// nothing once the map exists: its members' later edits are never overwritten.
// Without a token GitHub allows 60 lookups an hour; set GITHUB_TOKEN (any token,
// no scopes needed) for more.
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const quote = (v) => `'${String(v).replace(/'/g, "''")}'`;
const ROLES = new Set(['editor', 'commenter', 'viewer']);

/** What's wrong with a seed — empty when it's fine. */
export function seedProblems(seed) {
  const out = [];
  if (!/^[\w-]{8,}$/.test(seed.id ?? '')) out.push('id: at least 8 letters, digits, "_" or "-"');
  if (!seed.title?.trim()) out.push('title: missing');
  if (!seed.owner) out.push('owner: missing');
  for (const [login, role] of Object.entries(seed.members ?? {})) if (!ROLES.has(role)) out.push(`members.${login}: "${role}" isn't editor, commenter or viewer`);
  if (!Array.isArray(seed.refs)) out.push('refs: not a list');
  return out;
}

/** The SQL that makes the map. `accounts` maps each username to its GitHub account { id, login }. */
export function seedSql(seed, accounts) {
  const people = [seed.owner, ...Object.keys(seed.members ?? {})];
  const user = (login) => `(SELECT id FROM users WHERE github_id = ${Number(accounts[login].id)})`;
  const fresh = `NOT EXISTS (SELECT 1 FROM map_revisions WHERE map_id = ${quote(seed.id)})`;
  const lines = [`-- ${seed.title} (${seed.id}), from scripts/seed-map.mjs`];
  for (const login of people)
    lines.push(
      `INSERT INTO users (github_id, github_login) VALUES (${Number(accounts[login].id)}, ${quote(accounts[login].login)}) ON CONFLICT (github_id) DO UPDATE SET github_login = excluded.github_login;`,
    );
  lines.push(
    `INSERT OR IGNORE INTO maps (id, title, description, owner_id, revision) VALUES (${quote(seed.id)}, ${quote(seed.title)}, ${quote(seed.description ?? '')}, ${user(seed.owner)}, 1);`,
  );
  const members = [[seed.owner, 'owner'], ...Object.entries(seed.members ?? {})];
  for (const [login, role] of members)
    lines.push(`INSERT OR IGNORE INTO map_members (map_id, user_id, role) SELECT ${quote(seed.id)}, ${user(login)}, ${quote(role)} WHERE ${fresh};`);
  for (const id of seed.refs)
    lines.push(`INSERT OR IGNORE INTO map_items (map_id, kind, item_id, body, revision) SELECT ${quote(seed.id)}, 'ref', ${quote(id)}, '{}', 1 WHERE ${fresh};`);
  // Its share link (Phase 4): random, made by the database. The owner can replace it or turn it off.
  lines.push(`INSERT INTO map_links (token, map_id) SELECT lower(hex(randomblob(18))), ${quote(seed.id)} WHERE ${fresh};`);
  lines.push(
    `INSERT OR IGNORE INTO map_revisions (map_id, revision, user_id, changed) VALUES (${quote(seed.id)}, 1, ${user(seed.owner)}, ${quote(JSON.stringify(seed.refs.map((id) => `ref:${id}`)))});`,
  );
  return `${lines.join('\n')}\n`;
}

async function account(login) {
  const res = await fetch(`https://api.github.com/users/${encodeURIComponent(login)}`, {
    headers: {
      accept: 'application/vnd.github+json',
      'user-agent': 'physics-atlas',
      ...(process.env.GITHUB_TOKEN ? { authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {}),
    },
  });
  if (res.status === 404) throw new Error(`GitHub has no user @${login}`);
  if (res.status === 403 || res.status === 429)
    throw new Error(`GitHub refused to look up @${login} (${res.status}) — most likely its limit of 60 lookups an hour without a token; try again later, or set GITHUB_TOKEN`);
  if (!res.ok) throw new Error(`GitHub could not look up @${login} (${res.status})`);
  const u = await res.json();
  return { id: u.id, login: u.login };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const file = process.argv[2];
  if (!file) {
    console.error('usage: node scripts/seed-map.mjs scripts/maps-seed/<name>.json [seed.sql]');
    process.exit(2);
  }
  const seed = JSON.parse(readFileSync(file, 'utf8'));
  const problems = seedProblems(seed);
  if (problems.length) {
    console.error(`${file}:\n  ${problems.join('\n  ')}`);
    process.exit(1);
  }
  const atlas = JSON.parse(readFileSync(new URL('../src/data/concepts.json', import.meta.url), 'utf8'));
  const missing = seed.refs.filter((id) => !atlas.nodes.some((n) => n.id === id));
  if (missing.length) {
    console.error(`not on the atlas: ${missing.join(', ')} (run npm run build:content first?)`);
    process.exit(1);
  }
  const accounts = {};
  for (const login of [seed.owner, ...Object.keys(seed.members ?? {})]) accounts[login] = await account(login);
  // Written only once every account is found, so a failed run never leaves an empty file to execute.
  if (process.argv[3]) writeFileSync(process.argv[3], seedSql(seed, accounts), "utf8");
  else process.stdout.write(seedSql(seed, accounts));
  console.error(`"${seed.title}": ${seed.refs.length} atlas concepts, owner @${accounts[seed.owner].login}, ${Object.keys(seed.members ?? {}).length} members. Open it at ?mode=map&map=${seed.id}`);
}
