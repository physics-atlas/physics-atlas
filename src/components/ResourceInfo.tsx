import type { ResourceAttrs } from '../data/types';
import { resourceMeta } from '../graph/cardSections';
import RichText from './RichText';

/** A resource on its card: the link, what kind it is and how long it takes, and who it works for. */
export default function ResourceInfo({ attrs, headingId }: { attrs: ResourceAttrs; headingId: string }) {
  return (
    <div className="rel-block">
      <a className="concept-resource-link" href={attrs.link} target="_blank" rel="noreferrer">
        Open resource ↗
      </a>
      <p className="concept-resource-meta">{resourceMeta(attrs)}</p>
      <section className="resource-access" aria-labelledby={headingId}>
        <h3 className="block-heading" id={headingId}>
          Accessibility
        </h3>
        {attrs.accessibility ? (
          <RichText source={attrs.accessibility} />
        ) : (
          <p className="concept-empty">Not described yet.</p>
        )}
      </section>
    </div>
  );
}
