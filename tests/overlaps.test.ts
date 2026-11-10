import { describe, expect, it } from 'vitest';
import { createNode, createProject } from '../src/model/factory';
import { findOverlaps, hiddenInterval, mergeClusters, overlapKey, visibleArcs } from '../src/model/overlaps';

function proj(circles: [number, number, number][]) {
  const p = createProject();
  const ids = circles.map(([x, y, r]) => {
    const n = createNode({ x, y, shape: { kind: 'circle', radiusFt: r } });
    p.nodes[n.id] = n;
    p.nodeOrder.push(n.id);
    return n.id;
  });
  return { p, ids };
}

describe('overlaps', () => {
  it('detects pairs, intersection points and containment', () => {
    const { p, ids } = proj([[0, 0, 10], [15, 0, 10], [100, 0, 5], [100, 0, 20]]);
    const o = findOverlaps(p);
    expect(o).toHaveLength(2);
    const ab = o.find((x) => x.key === overlapKey(ids[0], ids[1]))!;
    expect(ab.p1!.x).toBeCloseTo(7.5);
    expect(Math.abs(ab.p1!.y)).toBeCloseTo(Math.sqrt(100 - 56.25));
    expect(ab.marker.x).toBeCloseTo(7.5);
    expect(o.find((x) => x.contained)).toBeTruthy();
  });
  it('per-pair override beats the global mode', () => {
    const { p, ids } = proj([[0, 0, 10], [15, 0, 10]]);
    p.overlaps[overlapKey(ids[0], ids[1])] = { mode: 'threshold' };
    expect(findOverlaps(p)[0].mode).toBe('threshold');
  });
  it('clusters chained merges', () => {
    const { p } = proj([[0, 0, 10], [15, 0, 10], [30, 0, 10], [200, 0, 5]]);
    const groups = [...mergeClusters(findOverlaps(p)).values()];
    expect(groups).toHaveLength(1);
    expect(groups[0]).toHaveLength(3);
  });
  it('visible arcs are the complement of hidden intervals', () => {
    const h = hiddenInterval({ x: 0, y: 0, r: 10 }, { x: 15, y: 0, r: 10 }) as [number, number];
    const vis = visibleArcs([h]);
    expect(vis).toHaveLength(1);
    const span = vis[0][1] - vis[0][0];
    expect(span + (h[1] - h[0])).toBeCloseTo(Math.PI * 2);
    expect(hiddenInterval({ x: 0, y: 0, r: 2 }, { x: 0, y: 0, r: 10 })).toBe('all');
    expect(visibleArcs([])).toEqual([[0, Math.PI * 2]]);
  });
});
