import { describe, expect, it } from 'vitest';
import { dashSplit, PRESETS, sampleCircle, sketchClosedStroke, sketchFill, sketchOpenStroke } from '../src/render/sketch';

const circle = sampleCircle(0, 0, 50, 96);
const opts = (id: string) => ({ params: PRESETS.find((p) => p.id === id)!.params, seed: 'a', unitsPerPt: 1 });

describe('sketch', () => {
  it('is deterministic per seed', () => {
    const a = sketchClosedStroke(circle, { width: 1 }, opts('pencil'));
    const b = sketchClosedStroke(circle, { width: 1 }, opts('pencil'));
    expect(a).toEqual(b);
    expect(a.length).toBe(2); // 2 passes
  });
  it('clean returns exact geometry', () => {
    const ops = sketchFill(circle, opts('clean'));
    expect(ops).toHaveLength(1);
    expect(ops[0].t === 'poly' && ops[0].pts).toBe(circle);
  });
  it('stays near the source path', () => {
    for (const op of sketchClosedStroke(circle, { width: 1 }, opts('watercolor')))
      for (const p of op.pts) expect(Math.abs(Math.hypot(p.x, p.y) - 50)).toBeLessThan(8);
  });
  it('fill styles produce ops', () => {
    for (const id of ['fine-pen', 'pencil', 'marker', 'watercolor']) expect(sketchFill(circle, opts(id)).length).toBeGreaterThan(0);
  });
  it('open strokes and dashes', () => {
    expect(sketchOpenStroke([{ x: 0, y: 0 }, { x: 100, y: 0 }], { width: 1, dash: [4, 3] }, opts('marker')).length).toBeGreaterThan(5);
    const d = dashSplit([{ x: 0, y: 0 }, { x: 20, y: 0 }], 4, 3);
    expect(d.length).toBe(3);
    expect(d[1][0].x).toBeCloseTo(7);
  });
});
