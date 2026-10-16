import katex from 'katex';
import 'katex/dist/katex.min.css';
import { parseInline, parseRichText } from '../community/richText';
import type { Inline } from '../community/richText';

/**
 * LaTeX via KaTeX. Its output is built from escaped input (`trust` stays off),
 * and includes MathML, so screen readers read the formula, not the markup.
 */
export function MathText({ tex, display = false }: { tex: string; display?: boolean }) {
  const html = katex.renderToString(tex, { displayMode: display, throwOnError: false, output: 'htmlAndMathml' });
  return display ? (
    <div className="rich-math-display" dangerouslySetInnerHTML={{ __html: html }} />
  ) : (
    <span className="rich-math" dangerouslySetInnerHTML={{ __html: html }} />
  );
}

function InlineRun({ inline }: { inline: Inline }) {
  switch (inline.kind) {
    case 'strong':
      return <strong>{inline.value}</strong>;
    case 'em':
      return <em>{inline.value}</em>;
    case 'code':
      return <code>{inline.value}</code>;
    case 'math':
      return <MathText tex={inline.value} />;
    default:
      return <>{inline.value}</>;
  }
}

/** One line of Markdown + LaTeX (no paragraphs), e.g. a note. */
export function InlineText({ source }: { source: string }) {
  return (
    <>
      {parseInline(source).map((inline, i) => (
        <InlineRun key={i} inline={inline} />
      ))}
    </>
  );
}

/** A claim or description in the proposal Markdown subset (src/community/richText.ts). */
export default function RichText({ source }: { source: string }) {
  return (
    <div className="rich-text">
      {parseRichText(source).map((block, i) =>
        block.kind === 'math' ? (
          <MathText key={i} tex={block.tex} display />
        ) : (
          <p key={i}>
            {block.inlines.map((inline, j) => (
              <InlineRun key={j} inline={inline} />
            ))}
          </p>
        ),
      )}
    </div>
  );
}
