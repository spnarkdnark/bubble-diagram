import { describe, expect, it } from 'vitest';
import { createNode } from '../src/model/factory';
import { connectionSegment, intersectsRect, radiusFromArea, shapeArea } from '../src/model/geometry';

describe('geometry', () => {
  it('area & inverse', () => {
    const r = radiusFromArea(1000);
    expect(shapeArea({ kind: 'circle', radiusFt: r })).toBeCloseTo(1000);
  });
  it('edge-to-edge segment', () => {
    const a = createNode({ x: 0, y: 0, shape: { kind: 'circle', radiusFt: 5 } });
    const b = createNode({ x: 20, y: 0, shape: { kind: 'circle', radiusFt: 3 } });
    const seg = connectionSegment(a, b)!;
    expect(seg[0]).toEqual({ x: 5, y: 0 });
    expect(seg[1]).toEqual({ x: 17, y: 0 });
    const c = createNode({ x: 6, y: 0, shape: { kind: 'circle', radiusFt: 3 } });
    expect(connectionSegment(a, c)).toBeNull();
  });
  it('marquee intersection', () => {
    const a = createNode({ x: 0, y: 0, shape: { kind: 'circle', radiusFt: 5 } });
    expect(intersectsRect(a, { minX: 4, minY: -1, maxX: 10, maxY: 1 })).toBe(true);
    expect(intersectsRect(a, { minX: 4, minY: 4, maxX: 10, maxY: 10 })).toBe(false);
  });
});
