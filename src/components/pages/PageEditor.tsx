import { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { ConceptGraph, GraphNode } from '../../data/types';
import { loadPage, PAGE_DEPTHS } from '../../data/pageSources';
import { draftProblems, newEditDraft } from '../../community/draft';
import { useDrafts } from '../../community/useDraft';
import { pageHref, relationHref } from '../../lib/pageLinks';
import type { LinkTarget } from '../../lib/pageText';
import { pageMathProblems } from '../../lib/pageMaths';
import PageText from './PageText';

/**
 * Writing a concept's page, on the page itself (Decision 49). The text goes
 * into an edit draft of the concept — the same draft the Community view's
 * editor opens, kept in this browser — so it's reviewed and submitted there,
 * with whatever else the edit changes.
 */
export default function PageEditor({
  node,
  graph,
  section,
  onReview,
  onClose,
}: {
  node: GraphNode;
  /** The confirmed graph, for checking the page's links */
  graph: ConceptGraph;
  /** The page's number in the contents, for its numbered blocks */
  section: string;
  /** Opens the draft in the Community view to review and submit */
  onReview: () => void;
  onClose: () => void;
}) {
  const uid = useId();
  const drafts = useDrafts();
  const draft = drafts.drafts.find((d) => d.editOf === node.id);
  const [loading, setLoading] = useState(false);
  const existing = PAGE_DEPTHS[node.id] ?? 0;
  // Started once, even where effects run twice (React's development mode).
  const started = useRef(false);
  const loadingFor = useRef<string | null>(null);

  // The concept's edit draft: the one already started, or a new one.
  useEffect(() => {
    if (draft) {
      if (drafts.active !== draft.suffix) drafts.setActive(draft.suffix);
      return;
    }
    if (started.current) return;
    started.current = true;
    drafts.add(newEditDraft(node));
  }, [draft, drafts, node]);

  // Its page, as written so far — loaded once, when the draft doesn't carry it yet.
  useEffect(() => {
    if (!draft || draft.page !== null || loading) return;
    if (loadingFor.current === draft.suffix) return;
    loadingFor.current = draft.suffix;
    if (!existing) {
      drafts.update(draft.suffix, (d) => ({ ...d, page: [''], pageBefore: 0 }));
      return;
    }
    setLoading(true);
    void loadPage(node.id).then((sources) => {
      drafts.update(draft.suffix, (d) => ({ ...d, page: sources, pageBefore: sources.length }));
      setLoading(false);
    });
  }, [draft, drafts, existing, loading, node.id]);

  const problems = useMemo(() => {
    if (!draft?.page) return [];
    const ctx = { confirmed: graph, drafts: drafts.drafts, proposals: [] };
    return [
      ...draftProblems(draft, ctx).filter((p) => p.field === 'page'),
      ...draft.page.flatMap((source, index) =>
        pageMathProblems(source).map((message) => ({ field: 'page' as const, index, message: `Depth ${index + 1}: ${message}` })),
      ),
    ];
  }, [draft, graph, drafts.drafts]);

  if (!draft || draft.page === null)
    return (
      <p className="atlas-empty" role="status">
        Loading the page…
      </p>
    );

  const page = draft.page;
  const setPage = (next: string[]) => drafts.update(draft.suffix, (d) => ({ ...d, page: next }));
  // A link in the preview opens its page in a new tab, so the editor stays where it is.
  const previewLink = (to: LinkTarget, children: ReactNode) => {
    const href = 'url' in to ? to.url : 'concept' in to ? pageHref(to.concept) : relationHref(to.relation);
    return (
      <a href={href} target="_blank" rel="noopener noreferrer">
        {children ?? ('url' in to ? to.url : 'concept' in to ? to.concept : to.relation)}
        <span className="visually-hidden"> (opens in a new tab)</span>
      </a>
    );
  };

  return (
    <section className="atlas-page-editor" aria-labelledby={`${uid}-title`}>
      <h2 id={`${uid}-title`}>Editing this page</h2>
      <p className="draft-hint" id={`${uid}-hint`}>
        Markdown and LaTeX, at as many depths as you like — depth 1 first, each deeper one going further; readers choose
        how deep to read. The definition, equation and connections are on the page already, from the card. Your text is
        saved in this browser as a proposed edit of {node.label}.
      </p>
      <details className="draft-page-help">
        <summary>Writing a page, in short</summary>
        <ul>
          <li>
            <code>## Heading</code>, <code>**bold**</code>, <code>*italic*</code>, <code>- a list item</code>,{' '}
            <code>1. a numbered one</code>, a blank line between paragraphs.
          </li>
          <li>
            Maths: <code>$E = mc^2$</code> in a sentence, <code>$$E = mc^2$$</code> as its own paragraph.
          </li>
          <li>
            Blocks, numbered on the page: a line <code>::: definition</code> (or <code>theorem</code>, <code>lemma</code>,{' '}
            <code>example</code>, <code>remark</code>, <code>checkpoint</code>; also <code>proof</code> and{' '}
            <code>objectives</code>), an optional title after it, the text, then a line <code>:::</code>.
          </li>
          <li>
            Links: <code>[[concept_id]]</code> or <code>[[concept_id|its name]]</code> to another page,{' '}
            <code>[[relation:relation_id|words]]</code> to a relation's, <code>[words](https://…)</code> to the web.
          </li>
        </ul>
      </details>
      {page.map((source, i) => (
        <div key={i} className="draft-relation draft-page-depth">
          <label className="draft-label" htmlFor={`${uid}-depth-${i}`}>
            Depth {i + 1}
          </label>
          <textarea
            id={`${uid}-depth-${i}`}
            className="draft-input draft-textarea draft-mono"
            rows={i === 0 ? 12 : 8}
            value={source}
            onChange={(e) => setPage(page.map((x, j) => (j === i ? e.target.value : x)))}
            aria-describedby={`${uid}-hint`}
            spellCheck
          />
          {source.trim() && (
            <details className="draft-page-preview">
              <summary>Preview depth {i + 1}</summary>
              <PageText source={source} section={section} link={previewLink} />
            </details>
          )}
          <div className="draft-row-actions">
            <button type="button" className="draft-button" onClick={() => setPage(page.filter((_, j) => j !== i))}>
              Remove depth {i + 1}
            </button>
          </div>
        </div>
      ))}
      <button type="button" className="draft-button" onClick={() => setPage([...page, ''])}>
        {page.length ? `Add a deeper level (depth ${page.length + 1})` : 'Write depth 1'}
      </button>
      {problems.length > 0 && (
        <div className="draft-warning" role="status">
          <p>Before it can be proposed:</p>
          <ul>
            {problems.map((p, k) => (
              <li key={k}>{p.message}</li>
            ))}
          </ul>
        </div>
      )}
      <div className="draft-row-actions atlas-page-editor-actions">
        <button type="button" className="draft-button draft-button-primary" onClick={onReview}>
          Review and submit
        </button>
        <button type="button" className="draft-button" onClick={onClose}>
          Close the editor
        </button>
      </div>
      <p className="draft-hint">
        Closing keeps your text in this browser; <strong>Review and submit</strong> opens it in the Community view, where
        it's proposed as a pull request with the rest of the edit.
      </p>
    </section>
  );
}
