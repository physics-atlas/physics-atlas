import { concepts } from '../src/data/loadConcepts';
import { applyChanges, changeProblem, itemKey, mapFromItems } from '../src/maps/items';
import type { MapChange, MapItemKind } from '../src/maps/items';
import { mapProblems, resolveMap } from '../src/maps/map';
import { canEdit } from '../src/maps/api';
import { COMMENT_LIMITS, anchorInMap, anchorKey, canComment, parseAnchor } from '../src/maps/comments';
import type { MapComment } from '../src/maps/comments';
import type { MapMember, MapRole, MapSummary, SavedMap } from '../src/maps/api';
import { randomToken } from './crypto';
import type { D1Database } from './d1';
import type { GitHub } from './github';
import type { SessionUser } from './session';

// Personal maps (Decision 50, .claude/plans/epic-personal-maps.md, Phase 2), kept
// in the D1 database (migrations/0001). Every request checks the person's role on
// the map; every query is parameterised. A map someone isn't a member of answers
// as if it didn't exist.
//
//   GET    /api/maps                         { maps } — the ones I'm a member of
//   POST   /api/maps                         { title, description? } → { id } — those marked "maps" only
//   GET    /api/maps/<id>                    { map, revision, role, members }
//   POST   /api/maps/<id>/save               { base, changes, title?, description? } → the map as now saved
//   POST   /api/maps/<id>/members            { login, role } — the owner adds or changes someone
//   DELETE /api/maps/<id>/members/<login>    the owner removes someone; anyone may leave
//   GET    /api/maps/<id>/comments                  { comments } — not for viewers
//   POST   /api/maps/<id>/comments                  { anchor, body } a new thread, { thread, body } a reply → { comments }
//   POST   /api/maps/<id>/comments/<thread>/resolve { resolved } → { comments }
//   DELETE /api/maps/<id>/comments/<comment>        its author, or the owner → { comments }

const ROLE_ORDER: MapRole[] = ['owner', 'editor', 'commenter', 'viewer'];
const GRANTABLE = new Set<MapRole>(['editor', 'commenter', 'viewer']);

/** The pilot's limits (Phase 0): generous for one course, a brake on anything else. */
export const LIMITS = { mapsPerOwner: 20, itemsPerMap: 1000, changesPerSave: 300, itemBytes: 64_000, members: 50, title: 120, description: 2000 };

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });

const NOT_FOUND = () => json({ error: "This map doesn't exist, or you're not one of its members." }, 404);

/** The person's row in users, made or refreshed (a GitHub username can change; the id can't). */
async function userRow(db: D1Database, user: SessionUser): Promise<number> {
  const row = await db
    .prepare('INSERT INTO users (github_id, github_login) VALUES (?, ?) ON CONFLICT (github_id) DO UPDATE SET github_login = excluded.github_login RETURNING id')
    .bind(user.id, user.login)
    .first<{ id: number }>();
  return row!.id;
}

async function roleOn(db: D1Database, mapId: string, userId: number): Promise<MapRole | null> {
  const row = await db.prepare('SELECT role FROM map_members WHERE map_id = ? AND user_id = ?').bind(mapId, userId).first<{ role: MapRole }>();
  return row?.role ?? null;
}

interface ItemRow {
  kind: MapItemKind;
  item_id: string;
  body: string;
  revision: number;
}

async function readMap(db: D1Database, mapId: string, role: MapRole): Promise<SavedMap | null> {
  const meta = await db.prepare('SELECT id, title, description, revision FROM maps WHERE id = ?').bind(mapId).first<{ id: string; title: string; description: string; revision: number }>();
  if (!meta) return null;
  const items = (await db.prepare('SELECT kind, item_id, body, revision FROM map_items WHERE map_id = ?').bind(mapId).all<ItemRow>()).results;
  const members = (
    await db
      .prepare('SELECT u.github_login AS login, m.role AS role FROM map_members m JOIN users u ON u.id = m.user_id WHERE m.map_id = ?')
      .bind(mapId)
      .all<MapMember>()
  ).results.sort((a, b) => ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role) || a.login.localeCompare(b.login));
  return {
    map: mapFromItems(meta, items.map((r) => ({ kind: r.kind, id: r.item_id, body: JSON.parse(r.body) }))),
    revision: meta.revision,
    role,
    members,
  };
}

/** Every comment on a map, oldest first; an author who deleted their account reads as null. */
async function commentsOf(db: D1Database, mapId: string): Promise<MapComment[]> {
  return (
    await db
      .prepare(
        'SELECT c.id AS id, c.thread_id AS threadId, c.anchor AS anchor, a.github_login AS author, c.body AS body, c.created_at AS createdAt, c.edited_at AS editedAt, c.resolved_at AS resolvedAt, r.github_login AS resolvedBy FROM comments c LEFT JOIN users a ON a.id = c.author_id LEFT JOIN users r ON r.id = c.resolved_by WHERE c.map_id = ? ORDER BY c.created_at, c.rowid',
      )
      .bind(mapId)
      .all<MapComment>()
  ).results;
}

const sameOrigin =(request: Request, url: URL) => {
  const origin = request.headers.get('origin');
  return !origin || origin === url.origin;
};

const text = (v: unknown, max: number): string | null | undefined =>
  v === undefined ? undefined : typeof v === 'string' && v.trim().length <= max ? v.trim() : null;

export interface MapsContext {
  db: D1Database;
  user: SessionUser | null;
  /** Marked "maps" in community/experts.json: may create maps */
  mayCreate: () => Promise<boolean>;
  gh: GitHub;
  now: number;
}

export async function handleMaps(request: Request, url: URL, { db, user, mayCreate, gh, now }: MapsContext): Promise<Response> {
  const parts = url.pathname.replace(/\/+$/, '').split('/').slice(3).map(decodeURIComponent);
  const method = request.method;
  if (method !== 'GET' && !sameOrigin(request, url)) return json({ error: 'Cross-site requests are not accepted.' }, 403);
  if (!user) return json({ error: 'Sign in with GitHub to open your maps.' }, 401);
  const me = await userRow(db, user);
  const stamp = new Date(now).toISOString();

  // /api/maps
  if (parts.length === 0) {
    if (method === 'GET') {
      const maps = (
        await db
          .prepare('SELECT m.id AS id, m.title AS title, mm.role AS role, m.updated_at AS updatedAt FROM maps m JOIN map_members mm ON mm.map_id = m.id WHERE mm.user_id = ? ORDER BY m.updated_at DESC')
          .bind(me)
          .all<MapSummary>()
      ).results;
      return json({ maps });
    }
    if (method === 'POST') {
      if (!(await mayCreate())) return json({ error: `@${user.login} may not create maps yet. Ask the curators.` }, 403);
      const body = (await request.json().catch(() => null)) as { title?: unknown; description?: unknown } | null;
      const title = text(body?.title, LIMITS.title);
      const description = text(body?.description, LIMITS.description) ?? '';
      if (!title) return json({ error: `A map needs a title of at most ${LIMITS.title} characters.` }, 422);
      const owned = await db.prepare('SELECT COUNT(*) AS n FROM maps WHERE owner_id = ?').bind(me).first<{ n: number }>();
      if ((owned?.n ?? 0) >= LIMITS.mapsPerOwner) return json({ error: `You already have ${LIMITS.mapsPerOwner} maps, the most for now.` }, 429);
      const id = randomToken(12);
      await db.batch([
          db.prepare('INSERT INTO maps (id, title, description, owner_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)').bind(id, title, description, me, stamp, stamp),
          db.prepare("INSERT INTO map_members (map_id, user_id, role, added_at) VALUES (?, ?, 'owner', ?)").bind(id, me, stamp),
      ]);
      console.log(`map created by @${user.login}`);
      return json({ id }, 201);
    }
    return json({ error: 'Not found.' }, 404);
  }

  const [mapId, sub, subId] = parts;
  const role = await roleOn(db, mapId, me);
  if (!role) return NOT_FOUND();

  // /api/maps/<id>
  if (parts.length === 1 && method === 'GET') {
    const saved = await readMap(db, mapId, role);
    return saved ? json(saved) : NOT_FOUND();
  }

  // /api/maps/<id>/save
  if (parts.length === 2 && sub === 'save' && method === 'POST') {
    if (!canEdit(role)) return json({ error: 'Only the owner and editors may change this map.' }, 403);
    const body = (await request.json().catch(() => null)) as { base?: unknown; changes?: unknown; title?: unknown; description?: unknown } | null;
    if (!body || typeof body.base !== 'number' || !Array.isArray(body.changes)) return json({ error: 'No changes in the request.' }, 400);
    const changes = body.changes as MapChange[];
    if (changes.length > LIMITS.changesPerSave) return json({ error: `At most ${LIMITS.changesPerSave} changes in one save.` }, 413);
    const shape = changes.flatMap((c) => changeProblem(c) ?? []);
    if (new Set(changes.map((c) => itemKey(c.kind, c.id))).size !== changes.length) shape.push('the same item twice');
    const bodies = changes.map((c) => (c.body === null ? null : JSON.stringify(c.body)));
    if (bodies.some((b) => b !== null && b.length > LIMITS.itemBytes)) shape.push(`an item over ${LIMITS.itemBytes / 1000} kB`);
    const title = text(body.title, LIMITS.title);
    const description = text(body.description, LIMITS.description);
    if (title === null || (body.title !== undefined && !title)) shape.push(`a title of at most ${LIMITS.title} characters`);
    if (description === null) shape.push(`a description of at most ${LIMITS.description} characters`);
    if (shape.length) return json({ error: 'The changes are not readable.', problems: shape }, 400);

    const current = await readMap(db, mapId, role);
    if (!current) return NOT_FOUND();
    // Per item: someone else's newer save of the same item is never overwritten.
    const revisions = new Map(
      (await db.prepare('SELECT kind, item_id, revision FROM map_items WHERE map_id = ?').bind(mapId).all<ItemRow>()).results.map((r) => [itemKey(r.kind, r.item_id), r.revision]),
    );
    const conflicts = changes.map((c) => itemKey(c.kind, c.id)).filter((k) => (revisions.get(k) ?? 0) > (body.base as number));
    if (conflicts.length)
      return json({ error: 'Someone else changed the same thing since you opened the map. Here it is as they saved it.', conflicts, current }, 409);

    const next = applyChanges({ ...current.map, ...(title ? { title } : {}) }, changes);
    if (revisions.size + changes.filter((c) => c.body !== null && !revisions.has(itemKey(c.kind, c.id))).length > LIMITS.itemsPerMap)
      return json({ error: `A map holds at most ${LIMITS.itemsPerMap} items for now.` }, 413);
    const atlasIds = new Set(concepts.nodes.map((n) => n.id));
    const problems = [
      ...changes.filter((c) => c.kind === 'ref' && c.body !== null && !atlasIds.has(c.id)).map((c) => `"${c.id}" isn't a concept on the atlas`),
      ...mapProblems(next, concepts),
    ];
    if (problems.length) return json({ error: 'The changes do not fit the map.', problems }, 422);

    const revision = current.revision + 1;
    try {
      await db.batch([
      // First: two saves made at the same moment both claim this revision; the second fails here, whole.
      db.prepare('INSERT INTO map_revisions (map_id, revision, user_id, created_at, changed) VALUES (?, ?, ?, ?, ?)').bind(mapId, revision, me, stamp, JSON.stringify(changes.map((c) => itemKey(c.kind, c.id)))),
      db
        .prepare('UPDATE maps SET revision = ?, updated_at = ?, title = COALESCE(?, title), description = COALESCE(?, description) WHERE id = ?')
        .bind(revision, stamp, title ?? null, description ?? null, mapId),
      ...changes.map((c, i) =>
        c.body === null
          ? db.prepare('DELETE FROM map_items WHERE map_id = ? AND kind = ? AND item_id = ?').bind(mapId, c.kind, c.id)
          : db
              .prepare('INSERT INTO map_items (map_id, kind, item_id, body, revision) VALUES (?, ?, ?, ?, ?) ON CONFLICT (map_id, kind, item_id) DO UPDATE SET body = excluded.body, revision = excluded.revision')
              .bind(mapId, c.kind, c.id, bodies[i], revision),
      ),
      ]);
    } catch (e) {
      if (/UNIQUE|PRIMARY KEY|constraint/i.test(String(e)))
        return json({ error: 'Someone else saved at the same moment. Please save again.', conflicts: [] }, 409);
      throw e;
    }
    return json(await readMap(db, mapId, role));
  }

  // /api/maps/<id>/members
  if (sub === 'members') {
    if (parts.length === 2 && method === 'POST') {
      if (role !== 'owner') return json({ error: 'Only the owner adds members.' }, 403);
      const body = (await request.json().catch(() => null)) as { login?: unknown; role?: unknown } | null;
      const login = typeof body?.login === 'string' ? body.login.trim().replace(/^@/, '') : '';
      const grant = body?.role as MapRole;
      if (!/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/.test(login)) return json({ error: 'That isn’t a GitHub username.' }, 422);
      if (!GRANTABLE.has(grant)) return json({ error: 'A member is an editor, a commenter or a viewer.' }, 422);
      const count = await db.prepare('SELECT COUNT(*) AS n FROM map_members WHERE map_id = ?').bind(mapId).first<{ n: number }>();
      const account = await gh.userByLogin(login);
      if (!account) return json({ error: `GitHub has no user @${login}.` }, 404);
      const row = await db
        .prepare('INSERT INTO users (github_id, github_login) VALUES (?, ?) ON CONFLICT (github_id) DO UPDATE SET github_login = excluded.github_login RETURNING id')
        .bind(account.id, account.login)
        .first<{ id: number }>();
      const existing = await roleOn(db, mapId, row!.id);
      if (existing === 'owner') return json({ error: 'That’s the owner.' }, 409);
      if (!existing && (count?.n ?? 0) >= LIMITS.members) return json({ error: `A map has at most ${LIMITS.members} members for now.` }, 413);
      await db
        .prepare('INSERT INTO map_members (map_id, user_id, role, added_at) VALUES (?, ?, ?, ?) ON CONFLICT (map_id, user_id) DO UPDATE SET role = excluded.role')
        .bind(mapId, row!.id, grant, stamp)
        .run();
      return json(await readMap(db, mapId, role));
    }
    if (parts.length === 3 && method === 'DELETE') {
      const target = await db
        .prepare('SELECT m.user_id AS id, m.role AS role FROM map_members m JOIN users u ON u.id = m.user_id WHERE m.map_id = ? AND lower(u.github_login) = lower(?)')
        .bind(mapId, subId)
        .first<{ id: number; role: MapRole }>();
      if (!target) return json({ error: `@${subId} isn't a member.` }, 404);
      if (target.role === 'owner') return json({ error: 'The owner can’t be removed.' }, 409);
      if (role !== 'owner' && target.id !== me) return json({ error: 'Only the owner removes members.' }, 403);
      await db.prepare('DELETE FROM map_members WHERE map_id = ? AND user_id = ?').bind(mapId, target.id).run();
      return target.id === me ? new Response(null, { status: 204 }) : json(await readMap(db, mapId, role));
    }
  }

  // /api/maps/<id>/comments (Phase 3)
  if (sub === 'comments') {
    if (!canComment(role)) return json({ error: 'Viewers don’t see this map’s comments.' }, 403);
    const list = async () => json({ comments: await commentsOf(db, mapId) });
    if (parts.length === 2 && method === 'GET') return list();

    if (parts.length === 2 && method === 'POST') {
      const body = (await request.json().catch(() => null)) as { anchor?: unknown; body?: unknown; thread?: unknown } | null;
      const words = text(body?.body, COMMENT_LIMITS.body);
      if (!words) return json({ error: `A comment needs some words, at most ${COMMENT_LIMITS.body} characters.` }, 422);
      const count = await db.prepare('SELECT COUNT(*) AS n FROM comments WHERE map_id = ?').bind(mapId).first<{ n: number }>();
      if ((count?.n ?? 0) >= COMMENT_LIMITS.perMap) return json({ error: `A map holds at most ${COMMENT_LIMITS.perMap} comments for now.` }, 413);
      let anchor: string;
      let thread: string | null = null;
      if (body?.thread !== undefined) {
        const first = await db
          .prepare('SELECT id, anchor FROM comments WHERE id = ? AND map_id = ? AND thread_id IS NULL')
          .bind(String(body.thread), mapId)
          .first<{ id: string; anchor: string }>();
        if (!first) return json({ error: 'That thread is no longer there.' }, 404);
        anchor = first.anchor;
        thread = first.id;
      } else {
        const parsed = typeof body?.anchor === 'string' ? parseAnchor(body.anchor) : null;
        if (!parsed) return json({ error: 'A comment is about the map, one of its concepts or relations, or a page depth.' }, 422);
        const saved = await readMap(db, mapId, role);
        if (!saved) return NOT_FOUND();
        if (!anchorInMap(parsed, resolveMap(saved.map, concepts))) return json({ error: 'That isn’t on the map (any more).' }, 422);
        anchor = anchorKey(parsed);
      }
      await db.batch([
        db
          .prepare('INSERT INTO comments (id, map_id, thread_id, anchor, author_id, body, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
          .bind(randomToken(12), mapId, thread, anchor, me, words, stamp),
        // A reply reopens a resolved thread: the conversation goes on.
        ...(thread ? [db.prepare('UPDATE comments SET resolved_at = NULL, resolved_by = NULL WHERE id = ?').bind(thread)] : []),
      ]);
      return list();
    }

    if (parts.length === 4 && parts[3] === 'resolve' && method === 'POST') {
      const body = (await request.json().catch(() => null)) as { resolved?: unknown } | null;
      if (typeof body?.resolved !== 'boolean') return json({ error: 'Resolve or reopen?' }, 400);
      const r = await db
        .prepare('UPDATE comments SET resolved_at = ?, resolved_by = ? WHERE id = ? AND map_id = ? AND thread_id IS NULL')
        .bind(body.resolved ? stamp : null, body.resolved ? me : null, subId, mapId)
        .run();
      if (!r.meta.changes) return json({ error: 'That thread is no longer there.' }, 404);
      return list();
    }

    if (parts.length === 3 && method === 'DELETE') {
      const target = await db
        .prepare('SELECT c.author_id AS author, c.thread_id AS thread, (SELECT COUNT(*) FROM comments r WHERE r.thread_id = c.id) AS replies FROM comments c WHERE c.id = ? AND c.map_id = ?')
        .bind(subId, mapId)
        .first<{ author: number | null; thread: string | null; replies: number }>();
      if (!target) return json({ error: 'That comment is no longer there.' }, 404);
      if (role !== 'owner' && target.author !== me) return json({ error: 'Only its author, or the map’s owner, deletes a comment.' }, 403);
      // Others' replies go with a thread: only the owner may take them.
      if (role !== 'owner' && !target.thread && target.replies > 0)
        return json({ error: 'Others have replied to this thread, so it stays. Resolve it instead.' }, 409);
      await db.prepare('DELETE FROM comments WHERE id = ? AND map_id = ?').bind(subId, mapId).run();
      return list();
    }
  }
  return json({ error: 'Not found.' }, 404);
}
