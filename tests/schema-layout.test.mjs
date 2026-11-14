import assert from 'node:assert/strict';
import test from 'node:test';
import { arrangeSchema, separateNodes, hasCollision, CARD_WIDTH } from '../src/lib/schemaLayout.ts';

const nodes = Array.from({ length: 120 }, (_, i) => ({ name: `table_${i}`, height: i % 7 === 0 ? 2900 : 66 + (i % 23) * 26 }));
const heights = Object.fromEntries(nodes.map(n => [n.name, n.height]));
const edges = nodes.slice(1).map((n, i) => ({ source: n.name, target: nodes[i].name }));
function verify(positions) {
  const names = Object.keys(positions);
  for (let i = 0; i < names.length; i++) for (let j = i + 1; j < names.length; j++) {
    const a = positions[names[i]], b = positions[names[j]];
    const overlap = a.x < b.x + CARD_WIDTH && a.x + CARD_WIDTH > b.x &&
      a.y < b.y + heights[names[j]] && a.y + heights[names[i]] > b.y;
    assert.ok(!overlap, `${names[i]} overlaps ${names[j]}`);
  }
}
for (const mode of ['relations', 'horizontal', 'vertical', 'matrix', 'compact', 'radial']) {
  test(`${mode}: varied table heights never collide`, () => {
    const positions = arrangeSchema(nodes, edges, mode);
    assert.equal(Object.keys(positions).length, nodes.length);
    verify(positions);
    assert.deepEqual(positions, arrangeSchema(nodes, edges, mode));
  });
}
test('persisted overlapping positions are resolved', () => {
  const points = Object.fromEntries(nodes.map(n => [n.name, { x: 0, y: 0 }]));
  verify(separateNodes(points, heights));
});
test('manual dragging cannot cover another table', () => {
  const points = arrangeSchema(nodes.slice(0, 3), edges, 'matrix');
  assert.ok(hasCollision(nodes[0].name, points[nodes[1].name], points, heights));
  assert.ok(!hasCollision(nodes[0].name, points[nodes[0].name], points, heights));
});
