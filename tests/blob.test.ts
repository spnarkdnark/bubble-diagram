import { describe, expect, it } from 'vitest';
import { createNode, createProject } from '../src/model/factory';
import {
  blobFromClicks,
  blobFromPocket,
  blobFromStroke,
  blobGeometry,
  circleRings,
  detachAnchors,
  toBlobShape,
} from '../src/model/blob';
import { connectionSegment, containsPoint, nodeArea } from '../src/model/geometry';
import { migrateProject } from '../src/model/migrate';
import type { BlobShape, Project } from '../src/model/types';

function project(circles: [number, number, number][]) {
  const p = createProject();
  const ids = circles.map(([x, y, r]) => {
    const n = createNode({ x, y, shape: { kind: 'circle', radiusFt: r } });
    p.nodes[n.id] = n;
    p.nodeOrder.push(n.id);
    return n.id;
  });
  return { p, ids };
}

function addBlob(p: Project, pts: ReturnType<typeof blobFromStroke>, gap = 2) {
  const { shape, origin } = toBlobShape(pts, gap, circleRings(p));
  const n = createNode({ x: origin.x, y: origin.y, shape });
  p.nodes[n.id] = n;
  p.nodeOrder.push(n.id);
  return n;
}

describe('blob shapes', () => {
  it('a free square has the right area', () => {
    const p = createProject();
    const n = addBlob(p, [
      { t: 'free', x: 0, y: 0 },
      { t: 'free', x: 10, y: 0 },
      { t: 'free', x: 10, y: 10 },
      { t: 'free', x: 0, y: 10 },
    ]);
    const a = nodeArea(n, p);
    expect(a).toBeGreaterThan(80); // splines bulge a little past the straight square
    expect(a).toBeLessThan(160);
    expect(containsPoint(n, { x: 5, y: 5 }, p)).toBe(true);
  });

  it('a stroke along a ring becomes an attached arc that follows the bubble', () => {
    const { p, ids } = project([[0, 0, 10]]);
    // stroke: arc along the ring (r+gap = 12) from 0 to 90 degrees, then out and back
    const stroke = [] as { x: number; y: number }[];
    for (let a = 0; a <= Math.PI / 2; a += 0.05) stroke.push({ x: Math.cos(a) * 12, y: Math.sin(a) * 12 });
    stroke.push({ x: 5, y: 30 }, { x: 30, y: 30 }, { x: 30, y: 5 });
    const pts = blobFromStroke(stroke, circleRings(p), 2, 1, 0.5);
    const anchors = pts.filter((x) => x.t === 'anchor');
    expect(anchors).toHaveLength(2);
    expect(anchors[0].t === 'anchor' && anchors[0].arc).toBe(true);
    const n = addBlob(p, pts);
    const before = blobGeometry(n, p).ctrl[0];
    expect(Math.hypot(before.x, before.y)).toBeCloseTo(12, 1);
    p.nodes[ids[0]] = { ...p.nodes[ids[0]], x: 5 };
    const after = blobGeometry(n, p).ctrl[0];
    expect(after.x - before.x).toBeCloseTo(5, 5);
  });

  it('clicks on one ring follow it the short way', () => {
    const { p } = project([[0, 0, 10]]);
    const pts = blobFromClicks(
      [
        { x: 12, y: 0 },
        { x: 0, y: 12 },
        { x: 20, y: 20 },
      ],
      circleRings(p),
      2,
      1,
    );
    expect(pts[0]).toMatchObject({ t: 'anchor', arc: true, dir: 1 });
    expect(pts[2].t).toBe('free');
  });

  it('fills an enclosed pocket between bubbles', () => {
    const { p } = project([
      [0, 0, 10],
      [25, 0, 10],
      [12.5, 21, 10],
    ]);
    const pts = blobFromPocket({ x: 12.5, y: 7 }, circleRings(p), 1, 0.5)!;
    expect(pts).not.toBeNull();
    expect(pts.filter((x) => x.t === 'anchor').length).toBeGreaterThanOrEqual(3);
    expect(blobFromPocket({ x: 200, y: 200 }, circleRings(p), 1, 0.5)).toBeNull();
    expect(blobFromPocket({ x: 0, y: 0 }, circleRings(p), 1, 0.5)).toBeNull();
  });

  it('detaches anchors in place and survives save/load', () => {
    const { p, ids } = project([
      [0, 0, 10],
      [40, 0, 5],
    ]);
    const pts = blobFromClicks(
      [
        { x: 12, y: 0 },
        { x: 0, y: 12 },
        { x: 25, y: 25 },
      ],
      circleRings(p),
      2,
      1,
    );
    const n = addBlob(p, pts);
    const pos = blobGeometry(n, p).ctrl;
    const shape = detachAnchors(n, p, (id) => id === ids[0]);
    expect(shape.points.every((x) => x.t === 'free')).toBe(true);
    const n2 = { ...n, shape };
    expect(blobGeometry(n2, p).ctrl[1].x).toBeCloseTo(pos[1].x);
    const back = migrateProject(JSON.parse(JSON.stringify(p)));
    expect((back.nodes[n.id].shape as BlobShape).points).toHaveLength(3);
    expect(connectionSegment(back.nodes[n.id], back.nodes[ids[1]], back)).not.toBeNull();
  });
});
