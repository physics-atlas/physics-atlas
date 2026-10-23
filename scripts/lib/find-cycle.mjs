// Kahn's algorithm over an adjacency map: node -> prerequisite nodes.
// Returns ids stuck in a cycle ([] when acyclic).
// Used by scripts/validate-concepts.mjs.
export function findCycle(prereqsByNode) {
  const indegree = new Map();
  const dependents = new Map();
  for (const [node, prereqs] of prereqsByNode) {
    indegree.set(node, prereqs.length);
    if (!dependents.has(node)) dependents.set(node, []);
    for (const p of prereqs) {
      if (!dependents.has(p)) dependents.set(p, []);
      dependents.get(p).push(node);
    }
  }
  const queue = [...indegree].filter(([, d]) => d === 0).map(([id]) => id);
  let visited = 0;
  while (queue.length) {
    const id = queue.shift();
    visited++;
    for (const dep of dependents.get(id) ?? []) {
      indegree.set(dep, indegree.get(dep) - 1);
      if (indegree.get(dep) === 0) queue.push(dep);
    }
  }
  if (visited === indegree.size) return [];
  return [...indegree].filter(([, d]) => d > 0).map(([id]) => id);
}
