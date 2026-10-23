// Generic DAG helpers over string ids — the concept learning path
// (conceptPathFor in concepts.ts) is built from these.

/** Every id reachable from `start` through `next`, `start` included. */
export function dfsClosure(start: string, next: (id: string) => string[]): Set<string> {
  const seen = new Set<string>();
  const stack = [start];
  while (stack.length) {
    const cur = stack.pop()!;
    if (seen.has(cur)) continue;
    seen.add(cur);
    stack.push(...next(cur));
  }
  return seen;
}

/** Kahn over a prereq adjacency, ties broken by longest-path depth then id. */
export function kahnOrder(prereqsOf: Map<string, string[]>): string[] {
  const memo = new Map<string, number>();
  const depth = (id: string): number => {
    if (memo.has(id)) return memo.get(id)!;
    const ps = prereqsOf.get(id) ?? [];
    const d = ps.length === 0 ? 0 : 1 + Math.max(...ps.map(depth));
    memo.set(id, d);
    return d;
  };
  const indegree = new Map([...prereqsOf].map(([id, ps]) => [id, ps.length]));
  const dependents = new Map<string, string[]>([...prereqsOf].map(([id]) => [id, []]));
  for (const [id, ps] of prereqsOf) for (const p of ps) dependents.get(p)?.push(id);
  const ready = [...indegree].filter(([, d]) => d === 0).map(([id]) => id);
  const order: string[] = [];
  while (ready.length) {
    ready.sort((a, b) => depth(a) - depth(b) || a.localeCompare(b));
    const id = ready.shift()!;
    order.push(id);
    for (const dep of dependents.get(id)!) {
      indegree.set(dep, indegree.get(dep)! - 1);
      if (indegree.get(dep) === 0) ready.push(dep);
    }
  }
  return order;
}
