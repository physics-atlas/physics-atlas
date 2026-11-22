import { useId, useMemo, useState } from 'react';
import type { PageSource } from '../data/pageSources';
import { addComment, deleteComment, resolveThread } from '../maps/api';
import type { MapResult, MapRole } from '../maps/api';
import { anchorLabel, newSince, parseAnchor, threadsOf } from '../maps/comments';
import type { CommentThread, MapComment } from '../maps/comments';
import type { ResolvedMap } from '../maps/map';
import RichText from './RichText';

// A saved map's comment threads (Decision 50, Phase 3), under its bar: start one
// about the map, a concept, a relation or a page depth; reply; resolve; reopen.
// Others' comments since the person last closed this are marked "New" — in
// words, never by colour alone.

interface CommentsPanelProps {
  resolved: ResolvedMap;
  comments: MapComment[] | null;
  error: string;
  seen: string | null;
  login: string;
  role: MapRole;
  onChange: (comments: MapComment[]) => void;
  /** The concept chosen on the map or whose page is open: the new thread's first choice */
  current: string | null;
  pages: PageSource;
  onShow: (id: string) => void;
}

type Filter = 'open' | 'resolved' | 'all';

const when = (iso: string) => new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
const same = (a: string | null, b: string) => a?.toLowerCase() === b.toLowerCase();

export default function CommentsPanel({ resolved, comments, error, seen, login, role, onChange, current, pages, onShow }: CommentsPanelProps) {
  const mapId = resolved.map.id;
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState<Filter>('open');
  const [onlyCurrent, setOnlyCurrent] = useState(false);
  const [anchor, setAnchor] = useState(() => (current ? `node:${current}` : 'map'));
  const [body, setBody] = useState('');
  const ids = { about: useId(), body: useId(), hint: useId(), filter: useId(), threads: useId() };

  const byLabel = (a: { label: string }, b: { label: string }) => a.label.localeCompare(b.label);
  const options = useMemo(() => {
    const nodes = resolved.graph.nodes.map((n) => ({ key: `node:${n.id}`, label: n.label })).sort(byLabel);
    const edges = resolved.graph.edges.map((e) => ({ key: `edge:${e.id}`, label: anchorLabel({ kind: 'edge', id: e.id }, resolved) })).sort(byLabel);
    const pageDepths = resolved.graph.nodes
      .flatMap((n) => Array.from({ length: pages.depths(n.id) }, (_, i) => ({ key: `page:${n.id}:${i + 1}`, label: `${n.label} — depth ${i + 1}` })))
      .sort(byLabel);
    return { nodes, edges, pageDepths };
  }, [resolved, pages]);

  const threads = useMemo(() => threadsOf(comments ?? []), [comments]);
  const fresh = useMemo(() => new Set(newSince(comments ?? [], seen, login).map((c) => c.id)), [comments, seen, login]);
  const currentLabel = current ? resolved.graph.nodes.find((n) => n.id === current)?.label : undefined;
  const about = (t: CommentThread) => {
    if (!current) return true;
    const a = parseAnchor(t.first.anchor);
    if (!a || a.kind === 'map') return false;
    if (a.kind === 'edge') {
      const e = resolved.graph.edges.find((x) => x.id === a.id);
      return e?.source === current || e?.target === current;
    }
    return a.id === current;
  };
  const shown = threads.filter(
    (t) => (filter === 'all' || (filter === 'open') === !t.first.resolvedAt) && (!onlyCurrent || !currentLabel || about(t)),
  );
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
    <section className="map-panel comments-panel" aria-label="Comments on this map">
      <p className="draft-status" role="status">
        {status}
      </p>
      {error && <p className="draft-warning">{error}</p>}
      <div className="map-panel-columns">
        <div className="map-panel-part">
          <h2 className="map-panel-heading">Start a thread</h2>
          <form
            className="comments-form"
            onSubmit={async (e) => {
              e.preventDefault();
              if (!body.trim()) return;
              const label = anchorLabel(parseAnchor(anchor), resolved);
              if (await run(() => addComment(mapId, anchor, body.trim()), `Started a thread about ${label}.`)) {
                setBody('');
                setFilter((f) => (f === 'resolved' ? 'open' : f));
              }
            }}
          >
            <label htmlFor={ids.about}>About</label>
            <select id={ids.about} className="draft-input" value={anchor} onChange={(e) => setAnchor(e.target.value)}>
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
            <label htmlFor={ids.body}>Your comment</label>
            <textarea
              id={ids.body}
              className="draft-input draft-textarea"
              rows={3}
              maxLength={4000}
              aria-describedby={ids.hint}
              value={body}
              onChange={(e) => setBody(e.target.value)}
            />
            <p className="map-panel-note" id={ids.hint}>
              Formatting: <code>**bold**</code>, <code>*italic*</code>, LaTeX between <code>$</code> signs. Everyone on the map except viewers reads it.
            </p>
            <button type="submit" className="draft-button draft-button-primary" disabled={busy || !body.trim()}>
              Start thread
            </button>
          </form>
        </div>
        <div className="map-panel-part comments-threads">
          <h2 className="map-panel-heading" id={ids.threads}>
            Threads ({openCount} open{fresh.size ? `, ${fresh.size} new` : ''})
          </h2>
          <fieldset className="comments-filter">
            <legend className="visually-hidden">Which threads</legend>
            {(['open', 'resolved', 'all'] as const).map((f) => (
              <label key={f}>
                <input type="radio" name={ids.filter} value={f} checked={filter === f} onChange={() => setFilter(f)} />{' '}
                {f === 'open' ? 'Open' : f === 'resolved' ? 'Resolved' : 'All'}
              </label>
            ))}
            {currentLabel && (
              <label>
                <input type="checkbox" checked={onlyCurrent} onChange={(e) => setOnlyCurrent(e.target.checked)} /> Only about{' '}
                {currentLabel}
              </label>
            )}
          </fieldset>
          {comments === null && !error && <p>Loading the comments…</p>}
          {comments !== null && shown.length === 0 && (
            <p>{threads.length === 0 ? 'No threads yet.' : 'No threads here — try another choice above.'}</p>
          )}
          <ol className="comments-list" aria-labelledby={ids.threads}>
            {shown.map((t) => (
              <Thread
                key={t.first.id}
                thread={t}
                label={anchorLabel(parseAnchor(t.first.anchor), resolved)}
                nodeId={(() => {
                  const a = parseAnchor(t.first.anchor);
                  return a && a.kind !== 'map' && a.kind !== 'edge' && resolved.graph.nodes.some((n) => n.id === a.id) ? a.id : null;
                })()}
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
                    first && t.replies.length
                      ? 'Delete this thread and all its replies? This can’t be undone.'
                      : 'Delete this comment? This can’t be undone.',
                  );
                  if (sure) void run(() => deleteComment(mapId, c.id), first ? 'Deleted the thread.' : 'Deleted the comment.');
                }}
              />
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}

interface ThreadProps {
  thread: CommentThread;
  label: string;
  nodeId: string | null;
  fresh: Set<string>;
  login: string;
  role: MapRole;
  busy: boolean;
  onShow: (id: string) => void;
  onReply: (body: string) => Promise<boolean>;
  onResolve: (resolved: boolean) => void;
  onDelete: (c: MapComment) => void;
}

function Thread({ thread, label, nodeId, fresh, login, role, busy, onShow, onReply, onResolve, onDelete }: ThreadProps) {
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
            — {first.resolvedAt ? `resolved${first.resolvedBy ? ` by @${first.resolvedBy}` : ''}` : 'open'}
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
          <label htmlFor={ids.reply}>Reply{first.resolvedAt ? ' (reopens the thread)' : ''}</label>
          <textarea
            id={ids.reply}
            className="draft-input draft-textarea"
            rows={2}
            maxLength={4000}
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
                Show on the map
              </button>
            )}
          </div>
        </form>
      </article>
    </li>
  );
}
