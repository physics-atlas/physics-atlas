import { useEffect } from 'react';
import source from '../../content/guide/en.md?raw';
import PageText from './pages/PageText';

// The atlas guide (Decision 53): how to use the atlas and what we're working on.
// Its text is content/guide/en.md, drawn by the atlas pages' own renderer like
// the privacy notice. Loaded on demand.

export default function GuideView() {
  useEffect(() => {
    document.title = 'Atlas guide — Physics Atlas';
  }, []);
  return (
    <div className="feedback-view">
      <article className="feedback-panel atlas-page atlas-guide" aria-labelledby="guide-title">
        <h1 id="guide-title" tabIndex={-1}>
          Atlas guide
        </h1>
        <PageText source={source} section="" link={(to, children) => ('url' in to ? <a href={to.url}>{children ?? to.url}</a> : children)} />
      </article>
    </div>
  );
}
