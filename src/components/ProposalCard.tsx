import { NODE_TYPE_LABELS } from '../data/types';
import type { GraphNode } from '../data/types';
import { evidenceHref } from '../community/proposals';
import type { Proposal } from '../community/types';
import type { ConceptMap } from '../graph/concepts';
import { CONCEPT_CARD_TITLE_ID } from './ConceptCard';
import RelationSentence from './RelationSentence';
import RichText, { InlineText, MathText } from './RichText';
import TypeBadge from './TypeBadge';

interface ProposalCardProps {
  proposal: Proposal;
  /** The proposed concept that was clicked */
  node: GraphNode;
  /** Confirmed + proposed concepts, so relation sentences can name both */
  byId: ConceptMap;
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
export default function ProposalCard({ proposal: p, node, byId, onPick }: ProposalCardProps) {
  const description = 'description' in node.attrs ? node.attrs.description : undefined;
  const domain = 'domain' in node.attrs ? node.attrs.domain : undefined;
  const contested = p.state === 'contested';
  const others = p.nodes.filter((n) => n.id !== node.id);
  const date = new Date(p.createdAt).toLocaleDateString('en', { year: 'numeric', month: 'short', day: 'numeric' });

  return (
    <>
      <p className={`proposal-status ${contested ? 'proposal-status-contested' : ''}`}>
        <span aria-hidden>{contested ? '⚑ ' : ''}</span>
        {contested ? 'Contested proposal' : 'Proposal'} · not yet confirmed
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
        <h3 className="block-heading">The claim</h3>
        <p className="proposal-title">{p.title}</p>
        <div className="proposal-claim">
          <RichText source={p.claim} />
        </div>
        <p className="proposal-meta">
          Proposed by <strong>{p.author.name}</strong>
          {p.author.verified && <span className="verified-badge">✓ Verified expert</span>} ·{' '}
          <time dateTime={p.createdAt}>{date}</time>
        </p>
      </section>

      {contested && p.dispute && (
        <section className="rel-block proposal-dispute">
          <h3 className="block-heading">Why it's contested</h3>
          <p>{p.dispute.summary}</p>
        </section>
      )}

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
      </section>

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
