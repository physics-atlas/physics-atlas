import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { NODE_TYPE_LABELS, RELATION_CATEGORIES } from '../../data/types';
import type { ConceptIndex } from '../../graph/concepts';
import { filterContents, matchesFilter, neighbourGroups, trail, typeGroups } from '../../graph/contents';
import type { Contents, PageFilter } from '../../graph/contents';
import { TYPE_GROUPS } from '../../graph/typeColors';
import TypeBadge from '../TypeBadge';
import FilterGroups from './FilterGroups';
import type { Links } from './links';

// The atlas pages' sidebar: three ways through the atlas — the contents (by
// chapter), what the current page is connected to, and by kind of concept —
// under one filter (a name; kinds of concept by family; kinds of relation by
// category).

export type SidebarView = 'contents' | 'neighbours' | 'types';
const VIEWS: { key: SidebarView; label: string }[] = [
  { key: 'contents', label: 'Contents' },
  { key: 'neighbours', label: 'Neighbours' },
  { key: 'types', label: 'By kind' },
];

const currentMark = (id: string, currentId: string | null) =>
  id === currentId ? { 'aria-current': 'page' as const, className: 'atlas-current' } : {};

export default function Sidebar({
  view,
  onView,
  filter,
  onFilter,
  allRelations,
  index,
  contents,
  currentId,
  aroundId,
  links,
}: {
  view: SidebarView;
  onView: (v: SidebarView) => void;
  filter: PageFilter;
  onFilter: (f: PageFilter) => void;
  allRelations: string[];
  index: ConceptIndex;
  contents: Contents;
  /** The concept whose page is open (marked in the lists) */
  currentId: string | null;
  /** The concept the Neighbours view is about: the open page's, or a relation page's source */
  aroundId: string | null;
  links: Links;
}) {
  const presentTypes = useMemo(() => new Set([...index.byId.values()].map((n) => n.type)), [index]);
  const total = index.byId.size;
  const matching = [...index.byId.values()].filter((n) => matchesFilter(n, filter)).length;
  const filtered = matching < total || filter.relations.size < allRelations.length;
  const reset = () => onFilter({ types: new Set(presentTypes), relations: new Set(allRelations), text: '' });
  const conceptGroups = TYPE_GROUPS.map((g) => ({
    key: g.key,
    label: g.label,
    items: g.types
      .filter((t) => presentTypes.has(t))
      .map((t) => ({
        key: t,
        label: (
          <>
            <TypeBadge type={t} />
            {NODE_TYPE_LABELS[t]}
          </>
        ),
      })),
  })).filter((g) => g.items.length > 0);
  const relationGroups = RELATION_CATEGORIES.map((c) => ({
    key: c.key,
    label: c.label,
    items: c.types.filter((t) => allRelations.includes(t)).map((t) => ({ key: t, label: t })),
  })).filter((g) => g.items.length > 0);

  return (
    <>
      <fieldset className="atlas-views">
        <legend className="atlas-small-label">Show</legend>
        {VIEWS.map((v) => (
          <label key={v.key} className={`atlas-view${view === v.key ? ' atlas-view-on' : ''}`}>
            <input type="radio" name="atlas-view" value={v.key} checked={view === v.key} onChange={() => onView(v.key)} />
            {v.label}
          </label>
        ))}
      </fieldset>

      <div className="atlas-filter-name">
        <label className="atlas-small-label" htmlFor="atlas-filter-text">
          Filter by name
        </label>
        <input
          id="atlas-filter-text"
          className="draft-input"
          type="search"
          value={filter.text}
          onChange={(e) => onFilter({ ...filter, text: e.target.value })}
          autoComplete="off"
        />
      </div>

      <details className="atlas-filters">
        <summary>Filter by kind{filtered ? ' (on)' : ''}</summary>
        <FilterGroups
          legend="Kinds of concept"
          groups={conceptGroups}
          selected={filter.types as Set<string>}
          onChange={(types) => onFilter({ ...filter, types: types as PageFilter['types'] })}
        />
        <FilterGroups
          legend="Kinds of relation"
          note="Used by the Neighbours view."
          groups={relationGroups}
          selected={filter.relations}
          onChange={(relations) => onFilter({ ...filter, relations })}
        />
        {filtered && (
          <button type="button" className="draft-link" onClick={reset}>
            Show everything again
          </button>
        )}
      </details>

      <p className="atlas-filter-status" role="status">
        {filtered || filter.text.trim() ? `${matching} of ${total} concepts match.` : ''}
      </p>

      {view === 'contents' && <ContentsTree contents={contents} index={index} filter={filter} currentId={currentId} links={links} />}
      {view === 'neighbours' && <NeighboursList index={index} filter={filter} aroundId={aroundId} currentId={currentId} links={links} />}
      {view === 'types' && <TypeList index={index} filter={filter} currentId={currentId} links={links} contents={contents} />}
    </>
  );
}

function ContentsTree({
  contents,
  index,
  filter,
  currentId,
  links,
}: {
  contents: Contents;
  index: ConceptIndex;
  filter: PageFilter;
  currentId: string | null;
  links: Links;
}) {
  const { shown, matches } = useMemo(() => filterContents(contents, index, filter), [contents, index, filter]);
  const searching = Boolean(filter.text.trim()) || matches.size < index.byId.size;
  // Open: the current page's chapter and sections above it; everything while filtering.
  const [open, setOpen] = useState<Set<string>>(() => new Set(currentId ? [...trail(currentId, contents), currentId] : []));
  useEffect(() => {
    if (!currentId) return;
    setOpen((o) => new Set([...o, ...trail(currentId, contents), currentId]));
  }, [currentId, contents]);
  const listRef = useRef<HTMLUListElement>(null);
  // Bring the current page's entry into view by scrolling the sidebar itself —
  // scrollIntoView would also move where the next Tab starts from.
  useEffect(() => {
    const el = listRef.current?.querySelector('[aria-current="page"]');
    const pane = listRef.current?.closest('.atlas-sidebar');
    if (!el || !pane) return;
    const r = el.getBoundingClientRect(), p = pane.getBoundingClientRect();
    if (r.top < p.top || r.bottom > p.bottom) pane.scrollTop += r.top - p.top - p.height / 3;
  }, [currentId]);

  if (shown.size === 0) return <p className="atlas-empty">No concept matches the filter.</p>;
  const item = (id: string): ReactNode => {
    if (!shown.has(id)) return null;
    const entry = contents.byId.get(id)!;
    const n = index.byId.get(id)!;
    const kids = entry.children.filter((c) => shown.has(c));
    const isOpen = searching || open.has(id);
    const context = !matches.has(id);
    return (
      <li key={id} className={context ? 'atlas-context' : undefined}>
        <span className="atlas-row">
          {kids.length > 0 && !searching ? (
            <button
              type="button"
              className="atlas-disclosure"
              aria-expanded={isOpen}
              onClick={() =>
                setOpen((o) => {
                  const next = new Set(o);
                  if (next.has(id)) next.delete(id);
                  else next.add(id);
                  return next;
                })
              }
            >
              <span aria-hidden>{isOpen ? '▾' : '▸'}</span>
              <span className="visually-hidden">
                {isOpen ? 'Hide' : 'Show'} the sections in {n.label}
              </span>
            </button>
          ) : (
            <span className="atlas-disclosure-space" aria-hidden />
          )}
          {links.concept(
            id,
            <>
              <span className="atlas-number">{entry.number}</span> {n.label}
              {context && <span className="visually-hidden"> (doesn't match; contains matches)</span>}
            </>,
            currentMark(id, currentId),
          )}
        </span>
        {kids.length > 0 && isOpen && <ul>{kids.map(item)}</ul>}
      </li>
    );
  };
  return (
    <ul className="atlas-tree" ref={listRef}>
      {contents.roots.map(item)}
    </ul>
  );
}

function NeighboursList({
  index,
  filter,
  aroundId,
  currentId,
  links,
}: {
  index: ConceptIndex;
  filter: PageFilter;
  aroundId: string | null;
  currentId: string | null;
  links: Links;
}) {
  const node = aroundId ? index.byId.get(aroundId) : undefined;
  if (!node) return <p className="atlas-empty">Open a page to see what it's connected to.</p>;
  const g = neighbourGroups(node.id, index, filter);
  const groups = [
    { title: `From ${node.label}`, items: g.out.map((i) => ({ id: i.other.id, label: i.other.label, how: i.relation, type: i.other.type, edge: i.edge.id })) },
    { title: `Into ${node.label}`, items: g.in.map((i) => ({ id: i.other.id, label: i.other.label, how: i.relation, type: i.other.type, edge: i.edge.id })) },
    { title: 'Assumes', items: g.assumes.map((n) => ({ id: n.id, label: n.label, how: '', type: n.type, edge: '' })) },
    { title: 'Assumed by', items: g.assumedBy.map((n) => ({ id: n.id, label: n.label, how: '', type: n.type, edge: '' })) },
  ].filter((x) => x.items.length > 0);
  if (groups.length === 0) return <p className="atlas-empty">Nothing connected matches the filter.</p>;
  return (
    <div className="atlas-neighbours">
      {node.id !== currentId && (
        <p className="atlas-filter-note">
          Around {links.concept(node.id, node.label)}, which this relation starts from.
        </p>
      )}
      {groups.map((grp) => (
        <section key={grp.title} aria-label={grp.title}>
          <h3 className="atlas-small-label">{grp.title}</h3>
          <ul className="atlas-flat">
            {grp.items.map((i) => (
              <li key={`${i.edge}-${i.id}`}>
                <TypeBadge type={i.type} />
                <span>
                  {i.how && (
                    <span className="atlas-how">
                      {links.relation(i.edge, i.how, { className: 'atlas-how-link' })}{' '}
                    </span>
                  )}
                  {links.concept(i.id, i.label, currentMark(i.id, currentId))}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function TypeList({
  index,
  filter,
  currentId,
  links,
  contents,
}: {
  index: ConceptIndex;
  filter: PageFilter;
  currentId: string | null;
  links: Links;
  contents: Contents;
}) {
  const groups = typeGroups(index, filter);
  if (groups.length === 0) return <p className="atlas-empty">No concept matches the filter.</p>;
  return (
    <div className="atlas-bytype">
      {groups.map((g) => (
        <section key={g.key} aria-label={g.label}>
          <h3 className="atlas-small-label">{g.label}</h3>
          {g.types.map(({ type, nodes }) => (
            <div key={type} className="atlas-type">
              <p className="atlas-type-name">
                <TypeBadge type={type} /> {NODE_TYPE_LABELS[type]}
              </p>
              <ul className="atlas-flat">
                {nodes.map((n) => (
                  <li key={n.id}>
                    {links.concept(
                      n.id,
                      <>
                        <span className="atlas-number">{contents.byId.get(n.id)?.number}</span> {n.label}
                      </>,
                      currentMark(n.id, currentId),
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </section>
      ))}
    </div>
  );
}
