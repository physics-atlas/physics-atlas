import { NODE_TYPE_LABELS } from '../data/types';
import type { ConceptGraph, GraphNode } from '../data/types';
import { evidenceHref, nodeChanges } from '../community/proposals';
import type { Proposal } from '../community/types';
import type { ConceptMap } from '../graph/concepts';
import { CONCEPT_CARD_TITLE_ID } from './ConceptCard';
import RelationSentence from './RelationSentence';
import RichText, { InlineText, MathText } from './RichText';
import TypeBadge from './TypeBadge';

interface ProposalCardProps {
  proposal: Proposal;
  /** The proposed concept that was clicked, or for an edit the concept as edited */
  node: GraphNode;
  /** Confirmed + proposed concepts, so relation sentences can name both */
  byId: ConceptMap;
  /** For an edit's before/after and the relations it removes */
  confirmed: ConceptGraph;
  /** The open proposals, to say which dependencies are still open */
  proposals: Proposal[];
  onPick: (id: string) => void;
}

const VOTES = [
  { key: 'verify', label: 'Verify', mark: '✓' },
  { key: 'dispute', label: 'Dispute', mark: '✗' },
  { key: 'clarify', label: 'Needs clarification', mark: '?' },
] as const;

/**
 * A proposed concept's card: what's being claimed, by whom, on what
 * evidence, and how the vote stands. Loaded lazily with KaTeX, only in
 * community mode.
 */
export default function ProposalCard({ proposal: p, node, byId, confirmed, proposals, onPick }: ProposalCardProps) {
  const description = 'description' in node.attrs ? node.attrs.description : undefined;
  const domain = 'domain' in node.attrs ? node.attrs.domain : undefined;
  const contested = p.state === 'contested';
  const others = p.nodes.filter((n) => n.id !== node.id);
  const before = p.edits?.length ? confirmed.nodes.find((n) => n.id === node.id) : undefined;
  const changes = before ? nodeChanges(before, node) : [];
  const removed = (p.removals ?? []).flatMap((id) => confirmed.edges.filter((e) => e.id === id));
  const kind = before ? 'Edit proposal' : 'Proposal';
  const date = new Date(p.createdAt).toLocaleDateString('en', { year: 'numeric', month: 'short', day: 'numeric' });

  return (
    <>
      <p className={`proposal-status ${contested ? 'proposal-status-contested' : ''}`}>
        <span aria-hidden>{contested ? '⚑ ' : ''}</span>
        {contested ? `Contested ${kind.toLowerCase()}` : kind} · not yet confirmed
      </p>
      <h2 className="map-card-title" id={CONCEPT_CARD_TITLE_ID}>
        <TypeBadge type={node.type} />
        {node.label}
      </h2>
      <p className="map-card-category">
        {NODE_TYPE_LABELS[node.type]}
        {domain && ` · ${domain}`}
      </p>
      {description && <p className="topic-description">{description}</p>}

      <section className="rel-block">
        <h3 className="block-heading">{p.claim ? 'The claim' : 'The proposal'}</h3>
        <p className="proposal-title">{p.title}</p>
        {p.claim && (
          <div className="proposal-claim">
            <RichText source={p.claim} />
          </div>
        )}
        <p className="proposal-meta">
          Proposed by <strong>{p.author.name}</strong>
          {p.author.handle && <span className="concept-via"> @{p.author.handle}</span>}
          {p.author.verified && <span className="verified-badge">✓ Verified expert</span>} ·{' '}
          <time dateTime={p.createdAt}>{date}</time>
        </p>
        {p.pr && (
          <p className="proposal-meta">
            <a className="concept-resource-link" href={p.pr.url} target="_blank" rel="noreferrer">
              Pull request #{p.pr.number} on GitHub ↗
            </a>
          </p>
        )}
      </section>

      {contested && p.dispute && (
        <section className="rel-block proposal-dispute">
          <h3 className="block-heading">Why it's contested</h3>
          <p>{p.dispute.summary}</p>
        </section>
      )}

      {before && (
        <section className="rel-block">
          <h3 className="block-heading">
            What it would change
            <span className="rel-count">{changes.length + p.edges.length + removed.length}</span>
          </h3>
          {changes.length > 0 && (
            <dl className="proposal-changes">
              {changes.map((c) => (
                <div key={c.field} className="proposal-change">
                  <dt>{c.field}</dt>
                  <dd>
                    <del>{c.before || '—'}</del> <span aria-hidden>→</span>
                    <span className="visually-hidden"> becomes </span> <ins>{c.after || '—'}</ins>
                  </dd>
                </div>
              ))}
            </dl>
          )}
          <ul className="concept-relations">
            {p.edges.map((e) => (
              <li key={e.id}>
                <span className="proposal-op">Adds:</span>{' '}
                <RelationSentence edge={e} byId={byId} selfId={node.id} onPick={onPick} />
              </li>
            ))}
            {removed.map((e) => (
              <li key={e.id} className="proposal-removed">
                <span className="proposal-op">Removes:</span>{' '}
                <del>
                  <RelationSentence edge={e} byId={byId} selfId={node.id} onPick={onPick} />
                </del>
              </li>
            ))}
          </ul>
        </section>
      )}

      {(p.dependsOn?.length ?? 0) > 0 && (
        <section className="rel-block">
          <h3 className="block-heading">Depends on</h3>
          <ul className="concept-relations">
            {p.dependsOn!.map((id) => {
              const dep = proposals.find((x) => x.id === id);
              const lost = (p.dropped ?? []).filter((d) => d.dependency.split(', ').includes(id)).length;
              return (
                <li key={id}>
                  {dep ? (
                    <>
                      {dep.nodes.length > 0 ? (
                        <button className="concept-relation-link" onClick={() => onPick(dep.nodes[0].id)}>
                          {dep.title}
                        </button>
                      ) : (
                        dep.title
                      )}{' '}
                      <span className="concept-via">still open — it has to be accepted first</span>
                    </>
                  ) : lost ? (
                    <>
                      <code>{id}</code>{' '}
                      <span className="concept-via">
                        no longer open — {lost} relation{lost === 1 ? '' : 's'} dropped
                      </span>
                    </>
                  ) : (
                    <>
                      <code>{id}</code> <span className="concept-via">accepted</span>
                    </>
                  )}
                </li>
              );
            })}
          </ul>
          {(p.dropped?.length ?? 0) > 0 && (
            <>
              <p className="concept-relations-heading">Dropped, because what they pointed at was rejected or withdrawn</p>
              <ul className="concept-relations">
                {p.dropped!.map(({ edge }) => (
                  <li key={edge.id} className="proposal-removed">
                    <del>
                      {byId.get(edge.source)?.label ?? edge.source} — {edge.relationship} —{' '}
                      {byId.get(edge.target)?.label ?? edge.target}
                    </del>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      )}

      {!before && (
      <section className="rel-block">
        <h3 className="block-heading">
          What it would add
          <span className="rel-count">{p.nodes.length + p.edges.length}</span>
        </h3>
        <ul className="concept-relations">
          <li>
            Concept <strong>{node.label}</strong> ({NODE_TYPE_LABELS[node.type]})
          </li>
          {others.map((n) => (
            <li key={n.id}>
              Concept{' '}
              <button className="concept-relation-link" onClick={() => onPick(n.id)}>
                {n.label}
              </button>{' '}
              ({NODE_TYPE_LABELS[n.type]})
            </li>
          ))}
          {p.edges.map((e) => (
            <li key={e.id}>
              <RelationSentence edge={e} byId={byId} selfId={node.id} onPick={onPick} />
            </li>
          ))}
        </ul>
        {p.edges.length === 0 && <p className="concept-empty">It has no relations left.</p>}
      </section>
      )}

      <section className="rel-block">
        <h3 className="block-heading">
          Evidence
          <span className="rel-count">{p.evidence.length}</span>
        </h3>
        {p.evidence.length === 0 ? (
          <p className="concept-empty">No evidence given yet.</p>
        ) : (
          <ul className="proposal-evidence">
            {p.evidence.map((ev, i) => {
              const href = evidenceHref(ev);
              return (
                <li key={i}>
                  {href ? (
                    <a className="concept-resource-link" href={href} target="_blank" rel="noreferrer">
                      {ev.kind === 'arxiv' ? `arXiv:${ev.ref}` : ev.kind === 'doi' ? `doi:${ev.ref}` : ev.ref} ↗
                    </a>
                  ) : (
                    <MathText tex={ev.ref} display />
                  )}
                  {ev.note && (
                    <span className="proposal-evidence-note">
                      <InlineText source={ev.note} />
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="rel-block">
        <h3 className="block-heading">Votes so far</h3>
        <ul className="proposal-tally">
          {VOTES.map((v) => (
            <li key={v.key}>
              <span className="proposal-tally-count">
                <span aria-hidden>{v.mark} </span>
                {p.tally[v.key]}
              </span>{' '}
              {v.label}
            </li>
          ))}
        </ul>
        <p className="concept-empty">Voting opens in a later phase.</p>
      </section>
    </>
  );
}
