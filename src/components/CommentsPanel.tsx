import { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { PageSource } from '../data/pageSources';
import { addComment, deleteComment, resolveThread } from '../maps/api';
import type { MapResult, MapRole } from '../maps/api';
import { COMMENT_FIELDS, anchorKey, anchorLabel, anchorTarget, newSince, parseAnchor, threadsOf } from '../maps/comments';
import type { Anchor, CommentField, CommentThread, MapComment } from '../maps/comments';
import type { ResolvedMap } from '../maps/map';
import RichText from './RichText';

// A saved map's comments (Decision 50, Phase 3), reworked as a side panel beside
// the map: with it open, the map is in comment mode — clicking a concept or a
// relation starts a comment on it (as a whole, or on one of its parts), and the
// numbers on the map show where threads are open. Every thread can be answered,
// resolved or reopened right here. Others' comments since the person last closed
// the panel are marked "New" — in words, never by colour alone.

/** What was picked on the map (a click, or a comment mark); `tick` makes the same pick count again. */
export interface CommentPick {
  kind: 'node' | 'edge';
  id: string;
  tick: number;
}

interface CommentsPanelProps {
  resolved: ResolvedMap;
  comments: MapComment[] | null;
  error: string;
  seen: string | null;
  login: string;
  role: MapRole;
  onChange: (comments: MapComment[]) => void;
  /** The last thing picked on the map; null until then */
  pick: CommentPick | null;
  /** The concept whose page is open (the pages view): the comment's first choice */
  current: string | null;
  view: 'map' | 'pages';
  pages: PageSource;
  /** Shows a concept: centred on the map, or its page */
  onShow: (id: string) => void;
  onClose: () => void;
}

type Filter = 'open' | 'resolved' | 'all';

const when = (iso: string) => new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
const same = (a: string | null, b: string) => a?.toLowerCase() === b.toLowerCase();
const FIELDS = Object.entries(COMMENT_FIELDS) as [CommentField, string][];

export default function CommentsPanel({
  resolved,
  comments,
  error,
  seen,
  login,
  role,
  onChange,
  pick,
  current,
  view,
  pages,
  onShow,
  onClose,
}: CommentsPanelProps) {
  const mapId = resolved.map.id;
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState<Filter>('open');
  // What a new comment is on: "map", "node:<id>", "edge:<id>" or "page:<id>:<depth>"; and, on a concept, which part.
  const [on, setOn] = useState(() => (current ? `node:${current}` : 'map'));
  const [field, setField] = useState<CommentField | ''>('');
  const [onlyHere, setOnlyHere] = useState(false);
  const [body, setBody] = useState('');
  const ids = { heading: useId(), on: useId(), field: useId(), body: useId(), hint: useId(), filter: useId(), threads: useId() };
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  // A click on the map (or on a mark) points the new comment at it, and shows its threads.
  useEffect(() => {
    if (!pick) return;
    setOn(`${pick.kind}:${pick.id}`);
    setField('');
    setOnlyHere(true);
    bodyRef.current?.focus();
  }, [pick]);

  const byLabel = (a: { label: string }, b: { label: string }) => a.label.localeCompare(b.label);
  const options = useMemo(() => {
    const nodes = resolved.graph.nodes.map((n) => ({ key: `node:${n.id}`, label: n.label })).sort(byLabel);
    const edges = resolved.graph.edges.map((e) => ({ key: `edge:${e.id}`, label: anchorLabel({ kind: 'edge', id: e.id }, resolved) })).sort(byLabel);
    const pageDepths = resolved.graph.nodes
      .flatMap((n) => Array.from({ length: pages.depths(n.id) }, (_, i) => ({ key: `page:${n.id}:${i + 1}`, label: `${n.label} (depth ${i + 1})` })))
      .sort(byLabel);
    return { nodes, edges, pageDepths };
  }, [resolved, pages]);

  const parsed = parseAnchor(on);
  const anchor: Anchor | null = parsed?.kind === 'node' && field ? { ...parsed, field } : parsed;
  const target = anchorTarget(parsed);
  const targetLabel = target ? anchorLabel(target.kind === 'node' ? { kind: 'node', id: target.id } : target, resolved) : null;

  const threads = useMemo(() => threadsOf(comments ?? []), [comments]);
  const fresh = useMemo(() => new Set(newSince(comments ?? [], seen, login).map((c) => c.id)), [comments, seen, login]);
  const isHere = (t: CommentThread) => {
    const tt = anchorTarget(parseAnchor(t.first.anchor));
    return Boolean(target && tt && tt.kind === target.kind && tt.id === target.id);
  };
  const shown = threads.filter((t) => (filter === 'all' || (filter === 'open') === !t.first.resolvedAt) && (!onlyHere || !target || isHere(t)));
  const openCount = threads.filter((t) => !t.first.resolvedAt).length;

  async function run(action: () => Promise<MapResult<{ comments: MapComment[] }>>, done: string): Promise<boolean> {
    setBusy(true);
    const r = await action();
    setBusy(false);
    if (r.ok) onChange(r.value.comments);
    setStatus(r.ok ? done : r.error);
    return r.ok;
  }

  return (
    <aside className="comments-side" aria-labelledby={ids.heading}>
      <div className="comments-side-head">
        <h2 className="map-panel-heading" id={ids.heading}>
          Comments <span className="map-panel-role">({openCount} open{fresh.size ? `, ${fresh.size} new` : ''})</span>
        </h2>
        <button type="button" className="map-card-close comments-side-close" onClick={onClose} aria-label="Close the comments (leaves comment mode)">
          ×
        </button>
      </div>
      {view === 'map' && (
        <p className="map-panel-note">
          <strong>Comment mode:</strong> click a concept or a relation on the map to comment on it. The numbers on the map
          show where threads are open.
        </p>
      )}
      <p className="draft-status" role="status">
        {status}
      </p>
      {error && <p className="draft-warning">{error}</p>}

      <form
        className="comments-form"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!body.trim() || !anchor) return;
          const label = anchorLabel(anchor, resolved);
          if (await run(() => addComment(mapId, anchorKey(anchor), body.trim()), `Commented on ${label}.`)) {
            setBody('');
            setFilter((f) => (f === 'resolved' ? 'open' : f));
          }
        }}
      >
        <h3 className="comments-form-heading">New comment{targetLabel ? ` on ${targetLabel}` : ''}</h3>
        <label htmlFor={ids.on}>On</label>
        <select
          id={ids.on}
          className="draft-input"
          value={on}
          onChange={(e) => {
            setOn(e.target.value);
            setField('');
          }}
        >
          <option value="map">The whole map</option>
          <optgroup label="Concepts">
            {options.nodes.map((o) => (
              <option key={o.key} value={o.key}>
                {o.label}
              </option>
            ))}
          </optgroup>
          {options.edges.length > 0 && (
            <optgroup label="Relations">
              {options.edges.map((o) => (
                <option key={o.key} value={o.key}>
                  {o.label}
                </option>
              ))}
            </optgroup>
          )}
          {options.pageDepths.length > 0 && (
            <optgroup label="Pages">
              {options.pageDepths.map((o) => (
                <option key={o.key} value={o.key}>
                  {o.label}
                </option>
              ))}
            </optgroup>
          )}
        </select>
        {parsed?.kind === 'node' && (
          <>
            <label htmlFor={ids.field}>About</label>
            <select id={ids.field} className="draft-input" value={field} onChange={(e) => setField(e.target.value as CommentField | '')}>
              <option value="">The concept in general</option>
              {FIELDS.map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </>
        )}
        <label htmlFor={ids.body}>Your comment</label>
        <textarea
          ref={bodyRef}
          id={ids.body}
          className="draft-input draft-textarea"
          rows={3}
          maxLength={4000}
          aria-describedby={ids.hint}
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />
        <p className="map-panel-note" id={ids.hint}>
          Formatting: <code>**bold**</code>, <code>*italic*</code>, LaTeX between <code>$</code> signs. Everyone on the map except
          viewers reads it.
        </p>
        <button type="submit" className="draft-button draft-button-primary" disabled={busy || !body.trim()}>
          Post comment
        </button>
      </form>

      <fieldset className="comments-filter">
        <legend className="visually-hidden">Which threads</legend>
        {(['open', 'resolved', 'all'] as const).map((f) => (
          <label key={f}>
            <input type="radio" name={ids.filter} value={f} checked={filter === f} onChange={() => setFilter(f)} />{' '}
            {f === 'open' ? `To address (${openCount})` : f === 'resolved' ? 'Resolved' : 'All'}
          </label>
        ))}
        {target && (
          <label>
            <input type="checkbox" checked={onlyHere} onChange={(e) => setOnlyHere(e.target.checked)} /> Only on {targetLabel}
          </label>
        )}
      </fieldset>
      {comments === null && !error && <p>Loading the comments…</p>}
      {comments !== null && shown.length === 0 && (
        <p className="map-panel-note">{threads.length === 0 ? 'No comments yet.' : 'None here. Try another choice above.'}</p>
      )}
      <ol className="comments-list" aria-labelledby={ids.heading}>
        {shown.map((t) => {
          const a = parseAnchor(t.first.anchor);
          const tt = anchorTarget(a);
          return (
            <Thread
              key={t.first.id}
              thread={t}
              label={anchorLabel(a, resolved)}
              nodeId={tt?.kind === 'node' && resolved.graph.nodes.some((n) => n.id === tt.id) ? tt.id : null}
              showLabel={view === 'map' ? 'Show on the map' : 'Open its page'}
              fresh={fresh}
              login={login}
              role={role}
              busy={busy}
              onShow={onShow}
              onReply={(words) => run(() => addComment(mapId, t.first.anchor, words, t.first.id), 'Replied.')}
              onResolve={(r) => run(() => resolveThread(mapId, t.first.id, r), r ? 'Resolved the thread.' : 'Reopened the thread.')}
              onDelete={(c) => {
                const first = !c.threadId;
                const sure = window.confirm(
                  first && t.replies.length ? 'Delete this thread and all its replies? This can’t be undone.' : 'Delete this comment? This can’t be undone.',
                );
                if (sure) void run(() => deleteComment(mapId, c.id), first ? 'Deleted the thread.' : 'Deleted the comment.');
              }}
            />
          );
        })}
      </ol>
    </aside>
  );
}

interface ThreadProps {
  thread: CommentThread;
  label: string;
  nodeId: string | null;
  showLabel: string;
  fresh: Set<string>;
  login: string;
  role: MapRole;
  busy: boolean;
  onShow: (id: string) => void;
  onReply: (body: string) => Promise<boolean>;
  onResolve: (resolved: boolean) => void;
  onDelete: (c: MapComment) => void;
}

function Thread({ thread, label, nodeId, showLabel, fresh, login, role, busy, onShow, onReply, onResolve, onDelete }: ThreadProps) {
  const [reply, setReply] = useState('');
  const ids = { heading: useId(), reply: useId() };
  const { first, replies } = thread;
  const all = [first, ...replies];
  const mayDelete = (c: MapComment) => role === 'owner' || (same(c.author, login) && (c.threadId !== null || replies.length === 0));

  return (
    <li>
      <article className={`comments-thread${first.resolvedAt ? ' comments-thread-resolved' : ''}`} aria-labelledby={ids.heading}>
        <h3 className="comments-about" id={ids.heading}>
          {label}{' '}
          <span className="comments-state">
            ({first.resolvedAt ? `resolved${first.resolvedBy ? ` by @${first.resolvedBy}` : ''}` : 'open'})
          </span>
        </h3>
        <ol className="comments-entries">
          {all.map((c) => (
            <li key={c.id} className="comments-entry">
              <p className="comments-meta">
                {fresh.has(c.id) && <strong className="comments-new">New</strong>}
                <span>{c.author ? `@${c.author}` : 'Former member'},</span> <time dateTime={c.createdAt}>{when(c.createdAt)}</time>
                {mayDelete(c) && (
                  <button
                    type="button"
                    className="draft-button map-panel-remove"
                    disabled={busy}
                    aria-label={c.threadId ? `Delete this reply by ${c.author ? `@${c.author}` : 'a former member'}` : 'Delete this thread'}
                    onClick={() => onDelete(c)}
                  >
                    Delete
                  </button>
                )}
              </p>
              <RichText source={c.body} />
            </li>
          ))}
        </ol>
        <form
          className="comments-reply"
          onSubmit={async (e) => {
            e.preventDefault();
            if (reply.trim() && (await onReply(reply.trim()))) setReply('');
          }}
        >
          <label htmlFor={ids.reply} className="visually-hidden">
            Reply to the thread on {label}
            {first.resolvedAt ? ' (reopens it)' : ''}
          </label>
          <textarea
            id={ids.reply}
            className="draft-input draft-textarea"
            rows={1}
            maxLength={4000}
            placeholder={first.resolvedAt ? 'Reply (reopens the thread)…' : 'Reply…'}
            value={reply}
            onChange={(e) => setReply(e.target.value)}
          />
          <div className="map-panel-row">
            <button type="submit" className="draft-button" disabled={busy || !reply.trim()}>
              Reply
            </button>
            <button type="button" className="draft-button" disabled={busy} onClick={() => onResolve(!first.resolvedAt)}>
              {first.resolvedAt ? 'Reopen' : 'Resolve'}
            </button>
            {nodeId && (
              <button type="button" className="draft-link" onClick={() => onShow(nodeId)}>
                {showLabel}
              </button>
            )}
          </div>
        </form>
      </article>
    </li>
  );
}
