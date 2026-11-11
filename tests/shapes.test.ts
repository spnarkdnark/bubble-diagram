import { describe, expect, it } from 'vitest';
import { createNode, createProject } from '../src/model/factory';
import {
  boundaryPoint,
  containsPoint,
  convertShape,
  intersectsRect,
  newShape,
  nodeArea,
  nodeBounds,
  resizeHandle,
  sizeAtHandle,
  withArea,
  withSize,
} from '../src/model/geometry';
import { dimensionText } from '../src/model/selectors';
import { parseDimensions } from '../src/model/units';
import { migrateProject } from '../src/model/migrate';
import { parseCsv, buildImport } from '../src/io/csvImport';

const P = createProject();
const square = (x = 0, y = 0, side = 20) =>
  createNode({ x, y, shape: { kind: 'rect', widthFt: side, heightFt: side } });

describe('squares and rectangles', () => {
  it('area, bounds, containment and marquee', () => {
    const n = square();
    expect(nodeArea(n, P)).toBe(400);
    expect(nodeBounds(n, P)).toEqual({ minX: -10, minY: -10, maxX: 10, maxY: 10 });
    expect(containsPoint(n, { x: 9.9, y: 9.9 }, P)).toBe(true); // a circle would miss the corner
    expect(containsPoint(n, { x: 10.1, y: 0 }, P)).toBe(false);
    expect(intersectsRect(n, { minX: -1, minY: -1, maxX: 1, maxY: 1 }, P)).toBe(true); // marquee inside
    expect(intersectsRect(n, { minX: -30, minY: -2, maxX: 30, maxY: 2 }, P)).toBe(true); // crosses, no corner inside
    expect(intersectsRect(n, { minX: 11, minY: 11, maxX: 20, maxY: 20 }, P)).toBe(false);
  });

  it('connection endpoints sit on the edge', () => {
    const p = boundaryPoint(square(), { x: 50, y: 0 }, P);
    expect(p.x).toBeCloseTo(10);
    expect(p.y).toBeCloseTo(0);
    const d = boundaryPoint(square(), { x: 50, y: 50 }, P);
    expect(d.x).toBeCloseTo(10);
    expect(d.y).toBeCloseTo(10);
  });

  it('sizing keeps proportions; half-extent drives handle and steps', () => {
    const rect = { kind: 'rect' as const, widthFt: 20, heightFt: 10 };
    expect(withSize(rect, 20)).toEqual({ kind: 'rect', widthFt: 40, heightFt: 20 });
    const a = withArea(rect, 800);
    expect(a.kind === 'rect' && a.widthFt * a.heightFt).toBeCloseTo(800);
    expect(a.kind === 'rect' && a.widthFt / a.heightFt).toBeCloseTo(2);
    const n = createNode({ shape: rect });
    expect(resizeHandle(n)).toEqual({ x: 10, y: 5 });
    expect(sizeAtHandle(n, { x: 15, y: 0 })).toBe(15);
    expect(sizeAtHandle(n, { x: 0, y: 10 })).toBe(20); // height 20 → width 40 → half 20
    expect(newShape('rect', 10)).toEqual({ kind: 'rect', widthFt: 20, heightFt: 20 });
  });

  it('converting keeps the area', () => {
    const sq = convertShape({ kind: 'circle', radiusFt: 10 }, 'rect');
    expect(sq.kind === 'rect' && sq.widthFt * sq.heightFt).toBeCloseTo(Math.PI * 100);
    const c = convertShape({ kind: 'rect', widthFt: 20, heightFt: 30 }, 'circle');
    expect(c.kind === 'circle' && Math.PI * c.radiusFt ** 2).toBeCloseTo(600);
  });

  it('dimensions as text and back', () => {
    expect(dimensionText({ kind: 'rect', widthFt: 20, heightFt: 30.5 })).toBe(`20' × 30'-6"`);
    expect(dimensionText({ kind: 'circle', radiusFt: 10 })).toBe(`R 10'`);
    expect(parseDimensions(`20' × 30'-6"`)).toEqual({ widthFt: 20, heightFt: 30.5 });
    expect(parseDimensions('12x15')).toEqual({ widthFt: 12, heightFt: 15 });
    expect(parseDimensions('18')).toEqual({ widthFt: 18, heightFt: 18 });
    expect(parseDimensions('big')).toBeNull();
  });

  it('files keep rectangles and drop broken ones', () => {
    const p = createProject();
    const ok = square();
    const bad = { ...square(), shape: { kind: 'rect', widthFt: -1, heightFt: 5 } };
    const out = migrateProject({ ...p, nodes: { [ok.id]: ok, [bad.id]: bad }, nodeOrder: [ok.id, bad.id] });
    expect(out.nodes[ok.id].shape).toEqual(ok.shape);
    expect(out.nodes[bad.id]).toBeUndefined();
  });

  it('CSV shape column makes squares sized by area', () => {
    const { rows, errors } = parseCsv('name,area,shape\nGarage,400,square\nLiving,314,\nOdd,100,hexagon');
    expect(errors).toHaveLength(1); // unknown shape → circle, with a note
    expect(rows.map((r) => r.kind)).toEqual(['rect', 'circle', 'circle']);
    const { nodes } = buildImport(createProject(), rows, { x: 0, y: 0 });
    expect(nodes[0].shape).toEqual({ kind: 'rect', widthFt: 20, heightFt: 20 });
  });
});
