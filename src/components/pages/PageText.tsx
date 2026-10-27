import { useEffect, useMemo, useRef } from 'react';
import type { ReactNode } from 'react';
import { BOX_KINDS, parsePage } from '../../lib/pageText';
import type { LinkTarget, PageBlock, PageInline } from '../../lib/pageText';
import { markScrollableMath } from '../../lib/scrollableMath';
import { InlineText, MathText } from '../RichText';

// A page depth as its authors wrote it (lib/pageText.ts), on the page and in
// the editor's preview alike — the same renderer, so the preview is exact.
// Everything is built as React elements; only KaTeX's own output is HTML.

/** How a link inside the atlas is drawn: a page link, or (in a preview) a link that opens a new tab. */
export type RenderLink = (to: LinkTarget, children: ReactNode) => ReactNode;

function Inlines({ inlines, link }: { inlines: PageInline[]; link: RenderLink }) {
  return (
    <>
      {inlines.map((x, i) => {
        if (x.kind === 'link') return <span key={i}>{link(x.to, x.text ? <InlineText source={x.text} /> : null)}</span>;
        if (x.kind === 'math') return <MathText key={i} tex={x.value} />;
        if (x.kind === 'strong') return <strong key={i}>{x.value}</strong>;
        if (x.kind === 'em') return <em key={i}>{x.value}</em>;
        if (x.kind === 'code') return <code key={i}>{x.value}</code>;
        return <span key={i}>{x.value}</span>;
      })}
    </>
  );
}

function Blocks({ blocks, section, link }: { blocks: PageBlock[]; section: string; link: RenderLink }): ReactNode {
  return blocks.map((b, i) => {
    switch (b.kind) {
      case 'heading': {
        const H = `h${b.level}` as const;
        return (
          <H key={i}>
            <Inlines inlines={b.inlines} link={link} />
          </H>
        );
      }
      case 'paragraph':
        return (
          <p key={i}>
            <Inlines inlines={b.inlines} link={link} />
          </p>
        );
      case 'math':
        return <MathText key={i} tex={b.tex} display />;
      case 'list': {
        const List = b.ordered ? 'ol' : 'ul';
        return (
          <List key={i}>
            {b.items.map((item, j) => (
              <li key={j}>
                <Inlines inlines={item} link={link} />
              </li>
            ))}
          </List>
        );
      }
      case 'box': {
        const { label } = BOX_KINDS[b.box];
        const name = b.number ? `${label} ${section ? `${section}.` : ''}${b.number}` : label;
        return (
          <div key={i} className={`atlas-tblock atlas-tblock-${b.box === 'lemma' ? 'theorem' : b.box}`}>
            <p className="atlas-tblock-label">
              {b.box === 'proof' ? <em>{name}.</em> : <strong>{name}</strong>}
              {b.title && <> ({b.title})</>}
            </p>
            <Blocks blocks={b.body} section={section} link={link} />
          </div>
        );
      }
    }
  });
}

/**
 * One depth of a page. `section` numbers its blocks ("3.1" → Definition
 * 3.1.2); a display equation too wide for the column scrolls sideways, and
 * takes keyboard focus only then.
 */
export default function PageText({ source, section, link }: { source: string; section: string; link: RenderLink }) {
  const { blocks } = useMemo(() => parsePage(source), [source]);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const mark = () => markScrollableMath(ref.current);
    mark();
    window.addEventListener('resize', mark);
    return () => window.removeEventListener('resize', mark);
  }, [blocks]);
  return (
    <div className="atlas-written" ref={ref}>
      <Blocks blocks={blocks} section={section} link={link} />
    </div>
  );
}
