import type { ReactNode } from 'react';
import { previewBlocks, PREVIEW_BLOCKS, typstPreviewTex } from '../lib/typstPreview';
import type { PreviewBlock, PreviewInline } from '../lib/typstPreview';
import { MathText } from './RichText';

// The editor's preview of a page depth written in Typst — approximate (see
// lib/typstPreview.ts); the page as published is compiled by Typst.

function Maths({ source, display }: { source: string; display?: boolean }) {
  const tex = typstPreviewTex(source);
  return tex === null ? <code>{source}</code> : <MathText tex={tex} display={display} />;
}

function Inline({ parts }: { parts: PreviewInline[] }) {
  return (
    <>
      {parts.map((p, i) =>
        p.kind === 'strong' ? (
          <strong key={i}>{p.value}</strong>
        ) : p.kind === 'em' ? (
          <em key={i}>{p.value}</em>
        ) : p.kind === 'code' ? (
          <code key={i}>{p.value}</code>
        ) : p.kind === 'math' ? (
          <Maths key={i} source={p.source} />
        ) : p.kind === 'link' ? (
          <u key={i}>{p.text}</u>
        ) : (
          <span key={i}>{p.value}</span>
        ),
      )}
    </>
  );
}

function Blocks({ blocks }: { blocks: PreviewBlock[] }): ReactNode {
  return blocks.map((b, i) => {
    switch (b.kind) {
      case 'heading':
        return (
          <p key={i} className={`typst-preview-h typst-preview-h${Math.min(b.level, 3)}`}>
            <Inline parts={b.inline} />
          </p>
        );
      case 'para':
        return (
          <p key={i}>
            <Inline parts={b.inline} />
          </p>
        );
      case 'math':
        return <Maths key={i} source={b.source} display />;
      case 'list': {
        const List = b.ordered ? 'ol' : 'ul';
        return (
          <List key={i}>
            {b.items.map((item, j) => (
              <li key={j}>
                <Inline parts={item} />
              </li>
            ))}
          </List>
        );
      }
      case 'block':
        return (
          <div key={i} className={`atlas-tblock atlas-tblock-${b.name === 'lemma' ? 'theorem' : b.name}`}>
            <p className="atlas-tblock-label">
              {b.name === 'proof' ? <em>Proof.</em> : <strong>{PREVIEW_BLOCKS[b.name]}</strong>}
              {b.title && ` (${b.title})`}
            </p>
            <Blocks blocks={b.body} />
          </div>
        );
    }
  });
}

export default function TypstPreview({ source }: { source: string }) {
  return (
    <div className="typst-preview">
      <Blocks blocks={previewBlocks(source)} />
    </div>
  );
}
