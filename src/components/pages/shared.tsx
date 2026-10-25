import { Fragment } from 'react';
import type { GraphEdge } from '../../data/types';
import { sentenceParts } from '../../graph/concepts';
import type { ConceptIndex, ConceptMap } from '../../graph/concepts';
import { pageNeighbours } from '../../graph/contents';
import type { Contents } from '../../graph/contents';
import type { Links } from './links';

// What the parts of the atlas pages share: a relation read as a sentence,
// and Previous / Up / Next.

/** A relation as a sentence, the other concept a link, `selfId` bold. */
export function Sentence({ edge, byId, selfId, links }: { edge: GraphEdge; byId: ConceptMap; selfId: string; links: Links }) {
  return (
    <>
      {sentenceParts(edge, byId).map((part, i) =>
        typeof part === 'string' ? (
          <Fragment key={i}>{part}</Fragment>
        ) : part.id === selfId ? (
          <strong key={i}>{part.label}</strong>
        ) : (
          <Fragment key={i}>{links.concept(part.id, part.label)}</Fragment>
        ),
      )}
    </>
  );
}

/** Previous / Up / Next in reading order. */
export function PageNav({
  id,
  contents,
  index,
  links,
  label,
}: {
  id: string;
  contents: Contents;
  index: ConceptIndex;
  links: Links;
  label: string;
}) {
  const { prev, next, up } = pageNeighbours(id, contents);
  const name = (x: string) => index.byId.get(x)?.label ?? x;
  return (
    <nav className="atlas-pagenav" aria-label={label}>
      <ul>
        <li>
          {prev ? (
            links.concept(prev, <><span aria-hidden>← </span>Previous: {name(prev)}</>, { rel: 'prev' })
          ) : (
            <span className="atlas-pagenav-none">Start of the atlas</span>
          )}
        </li>
        <li>
          {up
            ? links.concept(up, <><span aria-hidden>↑ </span>Up: {name(up)}</>)
            : links.front(<><span aria-hidden>↑ </span>Up: all chapters</>)}
        </li>
        <li>
          {next ? (
            links.concept(next, <>Next: {name(next)}<span aria-hidden> →</span></>, { rel: 'next' })
          ) : (
            <span className="atlas-pagenav-none">End of the atlas</span>
          )}
        </li>
      </ul>
    </nav>
  );
}
