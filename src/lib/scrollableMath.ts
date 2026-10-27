/**
 * A display equation wider than its column scrolls sideways; a box that does
 * has to be reachable by keyboard (WCAG 2.1.1), so it becomes focusable and
 * named then — and only then, so equations that fit add no Tab stops.
 */
export function markScrollableMath(root: ParentNode | null) {
  root?.querySelectorAll<HTMLElement>('.rich-math-display').forEach((box) => {
    const wide = box.scrollWidth > box.clientWidth + 1;
    if (wide) {
      box.tabIndex = 0;
      box.setAttribute('role', 'group');
      box.setAttribute('aria-label', 'Equation (scrolls sideways)');
    } else {
      box.removeAttribute('tabindex');
      box.removeAttribute('role');
      box.removeAttribute('aria-label');
    }
  });
}
