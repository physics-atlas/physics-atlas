import type { RefObject } from 'react';
import { NODE_TYPE_LABELS, relationCategory } from '../../data/types';
import type { GraphEdge } from '../../data/types';
import { normalizeRelationship, sentenceParts } from '../../graph/concepts';
import type { ConceptIndex } from '../../graph/concepts';
import { trail } from '../../graph/contents';
import type { Contents } from '../../graph/contents';
import RichText from '../RichText';
import TypeBadge from '../TypeBadge';
import { PAGE_TITLE_ID } from './links';
import type { Links } from './links';
import { Sentence } from './shared';

// A relation's own page: short, about the two concepts it joins — what kind
// of relation it is, the two ends, how they connect and the derivation.
// For now it holds what the relation's card does.

export default function RelationPage({
  edge,
  index,
  contents,
  links,
  headingRef,
  onShowOnMap,
}: {
  edge: GraphEdge;
  index: ConceptIndex;
  contents: Contents;
  links: Links;
  headingRef: RefObject<HTMLHeadingElement | null>;
  onShowOnMap: (id: string) => void;
}) {
  const type = normalizeRelationship(edge.relationship) ?? edge.relationship.trim();
  const category = relationCategory(type);
  const source = index.byId.get(edge.source), target = index.byId.get(edge.target);
  const title = sentenceParts(edge, index.byId)
    .map((p) => (typeof p === 'string' ? p : p.label))
    .join('');
  // Other relations between the same two concepts, either way round.
  const others = [...(index.outgoing.get(edge.source) ?? []), ...(index.incoming.get(edge.source) ?? [])].filter(
    (e) => e.id !== edge.id && (e.source === edge.target || e.target === edge.target),
  );
  const path = source ? [...trail(source.id, contents), source.id] : [];
  const ends = [
    { role: 'From', node: source },
    { role: 'To', node: target },
  ];

  return (
    <>
      <nav className="atlas-pagenav" aria-label="Pages, top">
        <ul>
          {source && <li>{links.concept(source.id, <><span aria-hidden>↑ </span>Up: {source.label}</>)}</li>}
          {target && <li>{links.concept(target.id, <>To: {target.label}<span aria-hidden> →</span></>)}</li>}
        </ul>
      </nav>
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
        <p className="atlas-page-number">Relation · {category.label}</p>
        <h1 id={PAGE_TITLE_ID} ref={headingRef} tabIndex={-1}>
          {title.replace(/\.$/, '')}
        </h1>
        <p className="atlas-page-meta">“{type}”</p>
        {source && (
          <p>
            <button type="button" className="draft-button" onClick={() => onShowOnMap(source.id)}>
              Show on the map
            </button>
          </p>
        )}
      </header>

      <section className="atlas-block atlas-definition" aria-labelledby="atlas-relation-kind">
        <h2 id="atlas-relation-kind" className="atlas-block-title">
          {category.label}
        </h2>
        <p>{category.description}</p>
      </section>

      <section aria-labelledby="atlas-relation-ends">
        <h2 id="atlas-relation-ends">The two concepts</h2>
        <dl className="atlas-ends">
          {ends.map(({ role, node }) =>
            node ? (
              <div key={role}>
                <dt className="atlas-small-label">{role}</dt>
                <dd>
                  <p className="atlas-end-name">
                    <TypeBadge type={node.type} />
                    {links.concept(node.id, node.label)}
                    <span className="concept-via"> — {NODE_TYPE_LABELS[node.type]}</span>
                  </p>
                  {'description' in node.attrs && node.attrs.description && <p>{node.attrs.description}</p>}
                </dd>
              </div>
            ) : null,
          )}
        </dl>
      </section>

      {edge.assumes && edge.assumes.length > 0 && (
        <section aria-labelledby="atlas-relation-assumes">
          <h2 id="atlas-relation-assumes">Under the assumption of</h2>
          <p>The relation holds only when this does:</p>
          <ul className="atlas-assumptions">
            {edge.assumes.map((a, i) => {
              const node = a.concept ? index.byId.get(a.concept) : undefined;
              const name = a.label ?? node?.label ?? a.concept ?? '';
              return (
                <li key={a.concept ?? `${a.label}-${i}`}>
                  <p className="atlas-assumption-name">{node ? links.concept(node.id, name) : name}</p>
                  {a.description && <p>{a.description}</p>}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <section aria-labelledby="atlas-relation-how">
        <h2 id="atlas-relation-how">How they connect</h2>
        {edge.description ? <RichText source={edge.description} /> : <p className="atlas-empty">Not described yet.</p>}
      </section>

      <section aria-labelledby="atlas-relation-derivation">
        <h2 id="atlas-relation-derivation">Derivation</h2>
        {edge.derivation ? <RichText source={edge.derivation} /> : <p className="atlas-empty">No derivation yet.</p>}
      </section>

      {edge.review && (
        <section aria-labelledby="atlas-relation-review">
          <h2 id="atlas-relation-review">Open question</h2>
          <p>{edge.review}</p>
        </section>
      )}

      {others.length > 0 && source && (
        <section aria-labelledby="atlas-relation-others">
          <h2 id="atlas-relation-others">Also between these two</h2>
          <ul className="atlas-relations">
            {others.map((e) => (
              <li key={e.id}>
                <p>
                  <Sentence edge={e} byId={index.byId} selfId="" links={links} />{' '}
                  {links.relation(e.id, 'About this relation', { className: 'atlas-about' })}
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
