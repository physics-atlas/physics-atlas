import { useEffect, useMemo, useRef } from 'react';
import type { MouseEvent } from 'react';
import { markScrollableMath } from '../../lib/scrollableMath';
import { safeTypstHtml } from '../../lib/typstHtml';
import { isPlainClick, refFromSearch } from '../../lib/pageLinks';
import type { PageRef } from '../../lib/pageLinks';

/**
 * A page's written content — Typst compiled to HTML at build time — made safe
 * and shown. Its links to other pages (#concept(), #relation()) move in
 * place like the rest of the pages; other links are left to the browser.
 */
export default function TypstContent({ html, onOpen }: { html: string; onOpen: (ref: PageRef) => void }) {
  const safe = useMemo(() => ({ __html: safeTypstHtml(html) }), [html]);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const mark = () => markScrollableMath(ref.current);
    mark();
    window.addEventListener('resize', mark);
    return () => window.removeEventListener('resize', mark);
  }, [safe]);
  const onClick = (e: MouseEvent<HTMLDivElement>) => {
    const a = (e.target as Element).closest('a');
    const href = a?.getAttribute('href') ?? '';
    if (!a || !href.startsWith('?mode=page') || !isPlainClick(e)) return;
    e.preventDefault();
    onOpen(refFromSearch(href));
  };
  // The links inside are real links; the click handler only keeps them in place.
  return <div className="atlas-written" ref={ref} onClick={onClick} dangerouslySetInnerHTML={safe} />;
}
