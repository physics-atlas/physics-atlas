import type { MouseEvent } from 'react';
import type { GraphNode } from '../../data/types';
import type { FurtherReached, Reached } from '../../graph/contents';
import { TYPE_COLORS } from '../../graph/typeColors';
import { isPlainClick, pageHref } from '../../lib/pageLinks';

// A page's neighbourhood at a glance: the concept in the middle, what it's
// connected to on the inner ring, and what those connect to on the outer one
// (each placed by the neighbour that reaches it). A picture for sighted
// readers: the same connections are listed under it as links, so the drawing
// itself is hidden from assistive tech and its links stay out of the Tab order.

const W = 720, H = 540, CX = W / 2, CY = H / 2;
const R1 = 130, R2 = 232;
/** The outer ring stops here; the list under the drawing has them all. */
const MAX_SECOND = 28;

const shorten = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

export default function ConnectionsDiagram({
  center,
  first,
  second,
  onOpen,
}: {
  center: GraphNode;
  first: Reached[];
  second: FurtherReached[];
  onOpen: (id: string) => void;
}) {
  const angleOf = new Map<string, number>();
  const p1 = first.map((r, i) => {
    const a = -Math.PI / 2 + (2 * Math.PI * i) / Math.max(first.length, 1);
    angleOf.set(r.node.id, a);
    return { node: r.node, x: CX + R1 * Math.cos(a), y: CY + R1 * Math.sin(a), a };
  });
  // Each outer concept fans out around the angle of the neighbour that reaches it.
  const shown = second.slice(0, MAX_SECOND);
  const byVia = new Map<string, FurtherReached[]>();
  for (const s of shown) byVia.set(s.via.id, [...(byVia.get(s.via.id) ?? []), s]);
  const slot = (2 * Math.PI) / Math.max(first.length, 1);
  const p2 = shown.map((s) => {
    const siblings = byVia.get(s.via.id)!;
    const k = siblings.indexOf(s);
    const spread = Math.min(slot * 0.85, 0.28 * siblings.length);
    const a = (angleOf.get(s.via.id) ?? 0) + (siblings.length > 1 ? -spread / 2 + (spread * k) / (siblings.length - 1) : 0);
    return { node: s.node, via: s.via, x: CX + R2 * Math.cos(a), y: CY + R2 * Math.sin(a), a };
  });
  const at = new Map(p1.map((p) => [p.node.id, p]));
  const open = (id: string) => (e: MouseEvent<Element>) => {
    if (!isPlainClick(e)) return;
    e.preventDefault();
    onOpen(id);
  };
  const label = (x: number, y: number, a: number, text: string, cls: string) => {
    const cos = Math.cos(a);
    const anchor = Math.abs(cos) < 0.3 ? 'middle' : cos > 0 ? 'start' : 'end';
    const dx = anchor === 'start' ? 12 : anchor === 'end' ? -12 : 0;
    const dy = anchor === 'middle' ? (Math.sin(a) > 0 ? 20 : -12) : 4;
    return (
      <text x={x + dx} y={y + dy} textAnchor={anchor} className={cls}>
        {text}
      </text>
    );
  };
  return (
    <svg className="atlas-diagram" viewBox={`0 0 ${W} ${H}`} aria-hidden="true" focusable="false">
      {p2.map((p) => {
        const from = at.get(p.via.id)!;
        return <line key={`l2-${p.node.id}`} x1={from.x} y1={from.y} x2={p.x} y2={p.y} className="atlas-diagram-line2" />;
      })}
      {p1.map((p) => (
        <line key={`l1-${p.node.id}`} x1={CX} y1={CY} x2={p.x} y2={p.y} className="atlas-diagram-line1" />
      ))}
      {p2.map((p) => (
        <a key={`n2-${p.node.id}`} href={pageHref(p.node.id)} onClick={open(p.node.id)} tabIndex={-1}>
          <circle cx={p.x} cy={p.y} r={6} fill={TYPE_COLORS[p.node.type]} />
          {label(p.x, p.y, p.a, shorten(p.node.label, 22), 'atlas-diagram-label2')}
        </a>
      ))}
      {p1.map((p) => (
        <a key={`n1-${p.node.id}`} href={pageHref(p.node.id)} onClick={open(p.node.id)} tabIndex={-1}>
          <circle cx={p.x} cy={p.y} r={10} fill={TYPE_COLORS[p.node.type]} />
          {label(p.x, p.y, p.a, shorten(p.node.label, 26), 'atlas-diagram-label1')}
        </a>
      ))}
      <circle cx={CX} cy={CY} r={18} fill={TYPE_COLORS[center.type]} className="atlas-diagram-center" />
      <text x={CX} y={CY + 36} textAnchor="middle" className="atlas-diagram-label0">
        {shorten(center.label, 30)}
      </text>
    </svg>
  );
}
