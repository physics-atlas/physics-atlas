import { useEffect, useState } from 'react';
import type { ReactNode, RefObject } from 'react';
import { NODE_TYPE_LABELS, RELATION_CATEGORIES, relationCategory } from '../../data/types';
import type { GraphEdge, GraphNode } from '../../data/types';
import { loadPage, PAGE_DEPTHS } from '../../data/pageSources';
import { assumptionsOf, normalizeRelationship } from '../../graph/concepts';
import type { ConceptIndex } from '../../graph/concepts';
import { CARD_SECTIONS, CONDITION_SECTIONS, conditionItems, sectionItems } from '../../graph/cardSections';
import { connectionsOf, trail } from '../../graph/contents';
import type { Contents } from '../../graph/contents';
import type { PageRef } from '../../lib/pageLinks';
import type { LinkTarget } from '../../lib/pageText';
import EquationView, { FormulaView } from '../EquationView';
import RichText from '../RichText';
import TypeBadge from '../TypeBadge';
import ConnectionsDiagram from './ConnectionsDiagram';
import { PAGE_TITLE_ID } from './links';
import type { Links } from './links';
import PageText from './PageText';
import { PageNav, Sentence } from './shared';

const typeOf = (e: GraphEdge) => normalizeRelationship(e.relationship) ?? e.relationship.trim();

/** A page's written depths, once loaded (null while loading, [] when there are none). */
function useWrittenDepths(id: string) {
  const [state, setState] = useState<{ id: string; depths: string[] } | null>(null);
  useEffect(() => {
    if (!PAGE_DEPTHS[id]) return;
    let live = true;
    loadPage(id).then((depths) => live && setState({ id, depths }));
    return () => {
      live = false;
    };
  }, [id]);
  if (!PAGE_DEPTHS[id]) return [];
  return state?.id === id ? state.depths : null;
}

/** A link written on a page: to a concept's or a relation's page (named after it when the text is left out), or the web. */
function pageLink(to: LinkTarget, children: ReactNode, index: ConceptIndex, links: Links): ReactNode {
  if ('url' in to)
    return (
      <a href={to.url} rel="noopener noreferrer">
        {children ?? to.url}
      </a>
    );
  if ('concept' in to) {
    const n = index.byId.get(to.concept);
    return n ? links.concept(n.id, children ?? n.label) : (children ?? to.concept);
  }
  const e = [...index.outgoing.values()].flat().find((x) => x.id === to.relation);
  if (!e) return children ?? to.relation;
  const name = `${index.byId.get(e.source)?.label ?? e.source} ${typeOf(e)} ${index.byId.get(e.target)?.label ?? e.target}`;
  return links.relation(e.id, children ?? name);
}

export default function ConceptPage({
  node,
  index,
  contents,
  links,
  headingRef,
  onShowOnMap,
  onOpen,
  depth,
  onDepth,
}: {
  node: GraphNode;
  index: ConceptIndex;
  contents: Contents;
  links: Links;
  headingRef: RefObject<HTMLHeadingElement | null>;
  onShowOnMap: (id: string) => void;
  onOpen: (ref: PageRef) => void;
  /** The depth the reader last chose (pages with fewer show their deepest) */
  depth: number;
  onDepth: (d: number) => void;
}) {
  const entry = contents.byId.get(node.id)!;
  const description = 'description' in node.attrs ? node.attrs.description : undefined;
  const domain = 'domain' in node.attrs ? node.attrs.domain : undefined;
  const conditionSection = CONDITION_SECTIONS[node.type] ?? { heading: 'Assumes' };
  const assumed = conditionItems(node.id, conditionSection, index);
  const { assumedBy } = assumptionsOf(node.id, index);
  const edges = [...(index.outgoing.get(node.id) ?? []), ...(index.incoming.get(node.id) ?? [])];
  const sections = CARD_SECTIONS[node.type]
    .map((s) => ({ heading: s.heading, items: sectionItems(node.id, s, index) }))
    .filter((s) => s.items.length > 0);
  const path = trail(node.id, contents);
  const isChapter = entry.depth === 0;
  const written = useWrittenDepths(node.id);
  const depthCount = PAGE_DEPTHS[node.id] ?? 0;
  const shownDepth = Math.min(Math.max(depth, 1), depthCount);
  const conn = connectionsOf(node.id, index);
  // The second-order list appears once per neighbour, under its first relation.
  const furtherShown = new Set<string>();

  return (
    <>
      <PageNav id={node.id} contents={contents} index={index} links={links} label="Pages, top" />
      {path.length > 0 && (
        <nav className="atlas-trail" aria-label="Where this page sits">
          <ol>
            <li>{links.front('All chapters')}</li>
            {path.map((id) => (
              <li key={id}>{links.concept(id, `${contents.byId.get(id)!.number} ${index.byId.get(id)!.label}`)}</li>
            ))}
          </ol>
        </nav>
      )}
      <header className="atlas-page-header">
        <p className="atlas-page-number">
          {isChapter ? 'Chapter' : 'Section'} {entry.number}
        </p>
        <h1 id={PAGE_TITLE_ID} ref={headingRef} tabIndex={-1}>
          <TypeBadge type={node.type} />
          {node.label}
        </h1>
        <p className="atlas-page-meta">
          {NODE_TYPE_LABELS[node.type]}
          {domain && ` · ${domain}`}
          {node.epistemicStatus && ` · ${node.epistemicStatus}`}
        </p>
        <p>
          <button type="button" className="draft-button" onClick={() => onShowOnMap(node.id)}>
            Show on the map
          </button>
        </p>
      </header>

      <section className="atlas-block atlas-definition" aria-labelledby="atlas-definition">
        <h2 id="atlas-definition" className="atlas-block-title">
          Definition
        </h2>
        {description?.trim() ? <p>{description}</p> : <p className="atlas-empty">Not written yet.</p>}
      </section>

      {depthCount > 1 && (
        <fieldset className="atlas-depths">
          <legend className="atlas-small-label">Depth</legend>
          <p className="atlas-filter-note" id="atlas-depth-hint">
            This page is written at {depthCount} depths; each goes further into the concept.
          </p>
          <div className="atlas-depth-choices">
            {Array.from({ length: depthCount }, (_, i) => i + 1).map((d) => (
              <label key={d} className={`atlas-view${d === shownDepth ? ' atlas-view-on' : ''}`}>
                <input
                  type="radio"
                  name="atlas-depth"
                  value={d}
                  checked={d === shownDepth}
                  onChange={() => onDepth(d)}
                  aria-describedby="atlas-depth-hint"
                />
                Depth {d}
              </label>
            ))}
          </div>
        </fieldset>
      )}
      {depthCount > 0 &&
        (written === null ? (
          <p className="atlas-empty" role="status">
            Loading the page…
          </p>
        ) : (
          written[shownDepth - 1] !== undefined && (
            <PageText
              key={`${node.id}-${shownDepth}`}
              source={written[shownDepth - 1]}
              section={entry.number}
              link={(to, children) => pageLink(to, children, index, links)}
            />
          )
        ))}
      {depthCount === 0 && (
        <p className="atlas-empty">
          Nothing has been written for this page yet. Pages are written in Markdown and LaTeX, at as many depths as their authors want —
          propose one from the Community view.
        </p>
      )}

      {node.type === 'equation' && (
        <section aria-labelledby="atlas-equation">
          <h2 id="atlas-equation">The equation</h2>
          <EquationView attrs={node.attrs} />
        </section>
      )}
      {node.type === 'formalism' && node.attrs.formulas && node.attrs.formulas.length > 0 && (
        <section aria-labelledby="atlas-formulas">
          <h2 id="atlas-formulas">Formulas</h2>
          <FormulaView formulas={node.attrs.formulas} />
        </section>
      )}

      {assumed.length > 0 && (
        <section aria-labelledby="atlas-assumes">
          <h2 id="atlas-assumes">{conditionSection.heading}</h2>
          <ul className="atlas-assumptions">
            {assumed.map(({ assumption: a, via }, i) => (
              <li key={a.node ? a.node.id : `${a.label}-${i}`}>
                <p className="atlas-assumption-name">
                  {a.node ? links.concept(a.node.id, a.label) : a.label}
                  {via && <span className="concept-via"> — via {links.concept(via.id, via.label)}</span>}
                </p>
                {a.description && <p>{a.description}</p>}
              </li>
            ))}
          </ul>
        </section>
      )}

      {conn.first.length > 0 && (
        <section aria-labelledby="atlas-connects">
          <h2 id="atlas-connects">How it connects</h2>
          <p>
            {node.label} is connected to {conn.first.length} {conn.first.length === 1 ? 'concept' : 'concepts'} directly
            {conn.second.length > 0 && `, and through them to ${conn.second.length} more`}.
          </p>
          <figure className="atlas-diagram-figure">
            <ConnectionsDiagram
              center={node}
              first={conn.first}
              second={conn.second}
              onOpen={(id) => onOpen({ concept: id })}
            />
            <figcaption>
              {node.label} in the middle, what it's connected to around it, and what those connect to on the outer ring.
              Every connection is listed below.
            </figcaption>
          </figure>
          {RELATION_CATEGORIES.map((c) => {
            const mine = edges.filter((e) => relationCategory(typeOf(e)).key === c.key);
            if (mine.length === 0) return null;
            return (
              <section key={c.key} aria-labelledby={`atlas-cat-${c.key}`}>
                <h3 id={`atlas-cat-${c.key}`}>{c.label}</h3>
                <ul className="atlas-relations">
                  {mine.map((e) => {
                    const other = e.source === node.id ? e.target : e.source;
                    const otherNode = index.byId.get(other);
                    const further = !furtherShown.has(other) ? conn.furtherVia(other) : [];
                    furtherShown.add(other);
                    return (
                      <li key={e.id}>
                        <p>
                          <Sentence edge={e} byId={index.byId} selfId={node.id} links={links} />{' '}
                          {links.relation(e.id, <>About this relation<span className="visually-hidden">: {typeOf(e)} {otherNode?.label}</span></>, { className: 'atlas-about' })}
                        </p>
                        {e.description && (
                          <details>
                            <summary>How they connect</summary>
                            <RichText source={e.description} />
                          </details>
                        )}
                        {e.derivation && (
                          <details>
                            <summary>Derivation</summary>
                            <RichText source={e.derivation} />
                          </details>
                        )}
                        {further.length > 0 && otherNode && (
                          <details className="atlas-further">
                            <summary>
                              Further, through {otherNode.label}: {further.length} {further.length === 1 ? 'concept' : 'concepts'}
                            </summary>
                            <ul>
                              {further.map((s) => (
                                <li key={s.node.id}>
                                  <TypeBadge type={s.node.type} />
                                  <span>
                                    {s.edges[0] ? (
                                      <Sentence edge={s.edges[0]} byId={index.byId} selfId={other} links={links} />
                                    ) : (
                                      <>
                                        {links.concept(s.node.id, s.node.label)} — linked by an assumption
                                      </>
                                    )}
                                  </span>
                                </li>
                              ))}
                            </ul>
                          </details>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })}
        </section>
      )}

      {sections.map((s, i) => (
        <section key={s.heading} aria-labelledby={`atlas-section-${i}`}>
          <h2 id={`atlas-section-${i}`}>{s.heading}</h2>
          <ul className="atlas-flat">
            {s.items.map(({ node: item, via }) => (
              <li key={item.id}>
                <TypeBadge type={item.type} />
                <span>
                  {links.concept(item.id, item.label)}
                  {via && <span className="concept-via"> — via {via.label}</span>}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ))}

      {assumedBy.length > 0 && (
        <section aria-labelledby="atlas-assumed-by">
          <h2 id="atlas-assumed-by">Assumed by</h2>
          <ul className="atlas-flat">
            {assumedBy.map((n) => (
              <li key={n.id}>
                <TypeBadge type={n.type} />
                {links.concept(n.id, n.label)}
              </li>
            ))}
          </ul>
        </section>
      )}

      {entry.children.length > 0 && (
        <section aria-labelledby="atlas-subsections">
          <h2 id="atlas-subsections">In this {isChapter ? 'chapter' : 'section'}</h2>
          <ul className="atlas-flat">
            {entry.children.map((c) => (
              <li key={c}>
                <TypeBadge type={index.byId.get(c)!.type} />
                {links.concept(
                  c,
                  <>
                    <span className="atlas-number">{contents.byId.get(c)!.number}</span> {index.byId.get(c)!.label}
                  </>,
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <PageNav id={node.id} contents={contents} index={index} links={links} label="Pages, bottom" />
    </>
  );
}
