export type Point = { x: number; y: number };
export type LayoutMode = 'relations' | 'horizontal' | 'vertical' | 'matrix' | 'compact' | 'radial';
export type SchemaNode = { name: string; height: number };
export type SchemaEdge = { source: string; target: string };
export const CARD_WIDTH = 278;
export const MIN_ZOOM = 0.1;
export const MAX_ZOOM = 2.6;
const GAP = 24;
const STEP_X = 374;

function collision(a: Point, ah: number, b: Point, bh: number) {
  return a.x < b.x + CARD_WIDTH + GAP && a.x + CARD_WIDTH + GAP > b.x &&
    a.y < b.y + bh + GAP && a.y + ah + GAP > b.y;
}
export function hasCollision(table: string, point: Point, positions: Record<string, Point>, heights: Record<string, number>) {
  return Object.entries(positions).some(([name, other]) =>
    name !== table && collision(point, heights[table] || 66, other, heights[name] || 66));
}
export function separateNodes(desired: Record<string, Point>, heights: Record<string, number>, order = Object.keys(desired)) {
  const placed: Record<string, Point> = {};
  for (const name of order) {
    const initial = desired[name];
    if (!initial) continue;
    let candidate: Point = { ...initial };
    for (let attempts = 0; attempts <= order.length; attempts++) {
      const blocking = Object.entries(placed).filter(([otherName, other]) =>
        collision(candidate, heights[name] || 66, other, heights[otherName] || 66));
      if (!blocking.length) break;
      candidate = { x: initial.x, y: Math.max(...blocking.map(([otherName, other]) => other.y + (heights[otherName] || 66) + GAP)) };
    }
    placed[name] = candidate;
  }
  return placed;
}
export function arrangeSchema(nodes: SchemaNode[], edges: SchemaEdge[], mode: LayoutMode): Record<string, Point> {
  const names = nodes.map(node => node.name);
  const heights = Object.fromEntries(nodes.map(node => [node.name, node.height]));
  const desired: Record<string, Point> = {};
  if (!names.length) return desired;
  if (mode === 'relations') {
    const known = new Set(names);
    const dependencies = new Map(names.map(name => [name, new Set<string>()]));
    for (const edge of edges) if (known.has(edge.source) && known.has(edge.target) && edge.source !== edge.target) dependencies.get(edge.source)?.add(edge.target);
    const ranks = new Map(names.map(name => [name, 0]));
    for (let pass = 0; pass < names.length; pass++) {
      let change = false;
      for (const name of names) {
        const deps = [...(dependencies.get(name) || [])];
        const next = deps.length ? Math.min(names.length - 1, 1 + Math.max(...deps.map(dep => ranks.get(dep) || 0))) : 0;
        if (next > (ranks.get(name) || 0)) { ranks.set(name, next); change = true; }
      }
      if (!change) break;
    }
    const levels = [...new Set(ranks.values())].sort((a, b) => a - b);
    const offsets = new Map(levels.map(level => [level, 72]));
    const ordered = [...names].sort((a, b) => (ranks.get(a) || 0) - (ranks.get(b) || 0) || a.localeCompare(b));
    for (const name of ordered) {
      const level = ranks.get(name) || 0;
      desired[name] = { x: 72 + levels.indexOf(level) * 438, y: offsets.get(level) || 72 };
      offsets.set(level, (offsets.get(level) || 72) + heights[name] + 90);
    }
    return separateNodes(desired, heights, ordered);
  }
  if (mode === 'radial') {
    names.forEach((name, index) => {
      const ring = Math.floor(index / 12);
      const count = Math.min(12, names.length - ring * 12);
      const angle = 2 * Math.PI * (index % 12) / count;
      const radius = 480 + ring * 620;
      desired[name] = { x: 1200 + Math.cos(angle) * radius, y: 1200 + Math.sin(angle) * radius };
    });
  } else if (mode === 'horizontal') {
    let x = 72;
    for (const name of names) { desired[name] = { x, y: 72 }; x += STEP_X; }
  } else if (mode === 'vertical') {
    let y = 72;
    for (const name of names) { desired[name] = { x: 72, y }; y += heights[name] + 84; }
  } else {
    const cols = Math.max(2, Math.ceil(Math.sqrt(names.length * (mode === 'compact' ? 1.8 : 1))));
    let y = 72;
    for (let i = 0; i < names.length; i += cols) {
      const row = names.slice(i, i + cols);
      for (let j = 0; j < row.length; j++) desired[row[j]] = { x: 72 + j * STEP_X, y };
      y += Math.max(...row.map(name => heights[name])) + (mode === 'compact' ? 32 : 84);
    }
  }
  return separateNodes(desired, heights, names);
}
