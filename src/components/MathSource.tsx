import { useEffect, useRef } from 'react';
import typstMath from '../data/typstMath.json';
import type { MathNotation } from '../data/types';
import { markScrollableMath } from '../lib/scrollableMath';
import { safeTypstHtml } from '../lib/typstHtml';
import { typstPreviewTex } from '../lib/typstPreview';
import { MathText } from './RichText';

// One equation or symbol, in the notation its concept is written in. LaTeX is
// typeset by KaTeX. Typst was compiled to MathML at build time
// (scripts/compile-pages.mjs) and is shown as it is; what the build hasn't
// seen — a proposal, the editor's preview — is converted to LaTeX for a
// preview, which is close but not exact (it says so in the editor).

const compiled = typstMath as Record<string, string>;

export default function MathSource({
  source,
  notation = 'latex',
  display = false,
}: {
  source: string;
  notation?: MathNotation;
  display?: boolean;
}) {
  if (notation !== 'typst') return <MathText tex={source} display={display} />;
  const math = compiled[`${display ? 'display' : 'inline'}:${source}`];
  if (math) return display ? <TypstDisplay math={math} /> : <span className="typst-math" dangerouslySetInnerHTML={{ __html: safeTypstHtml(math) }} />;
  const tex = typstPreviewTex(source);
  return tex !== null ? <MathText tex={tex} display={display} /> : <code>{source}</code>;
}

/** A compiled display equation; its box scrolls (and takes focus) only when it's too wide. */
function TypstDisplay({ math }: { math: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const mark = () => markScrollableMath(ref.current);
    mark();
    window.addEventListener('resize', mark);
    return () => window.removeEventListener('resize', mark);
  }, [math]);
  return <div className="typst-math" ref={ref} dangerouslySetInnerHTML={{ __html: safeTypstHtml(math) }} />;
}
