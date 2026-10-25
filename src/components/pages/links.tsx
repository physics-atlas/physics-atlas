import type { MouseEvent, ReactNode } from 'react';
import { hrefOf, isPlainClick } from '../../lib/pageLinks';
import type { PageRef } from '../../lib/pageLinks';

// Links between the atlas pages: real links (new tab, copy, history) that
// move in place on a plain click.

export const PAGE_TITLE_ID = 'atlas-page-title';

type LinkProps = Record<string, unknown>;

export interface Links {
  /** Navigate in place on a plain click; anything else (new tab…) is the browser's */
  go: (ref: PageRef) => (e: MouseEvent<HTMLAnchorElement>) => void;
  concept: (id: string, children: ReactNode, extra?: LinkProps) => ReactNode;
  relation: (id: string, children: ReactNode, extra?: LinkProps) => ReactNode;
  front: (children: ReactNode, extra?: LinkProps) => ReactNode;
}

export function makeLinks(open: (ref: PageRef) => void): Links {
  const go = (ref: PageRef) => (e: MouseEvent<HTMLAnchorElement>) => {
    if (!isPlainClick(e)) return;
    e.preventDefault();
    open(ref);
  };
  const a = (ref: PageRef, children: ReactNode, extra: LinkProps = {}) => (
    <a href={hrefOf(ref)} onClick={go(ref)} {...extra}>
      {children}
    </a>
  );
  return {
    go,
    concept: (id, children, extra) => a({ concept: id }, children, extra),
    relation: (id, children, extra) => a({ relation: id }, children, extra),
    front: (children, extra) => a({}, children, extra),
  };
}

