/**
 * Overlap treatments (merged outline, shared zone, zone fill, threshold line).
 * Drawn above all bubbles; merged bubbles have their own outline suppressed.
 */
import type { Id, Project } from '../model/types';
import type { ResolvedStyle } from '../model/selectors';
import { darken } from '../model/color';
import { ptToFt } from '../model/units';
import { hiddenInterval, mergeClusters, visibleArcs, type Interval, type Overlap } from '../model/overlaps';
import { hatchRegion, isClean, sampleArc, sampleCircle, scaleParams, type Pt, type SketchParams } from './sketch';
import { circleSamples, mix, monoPrims, openStrokePrims, type Prim, type StrokeP } from './primitives';

interface Circle {
  x: number;
  y: number;
  r: number;
}

export interface OverlapContext {
  project: Project;
  overlaps: Overlap[];
  styleOf: (id: Id) => ResolvedStyle;
  /** the drawing's sketch params before per-category scaling */
  base: SketchParams;
  seed: (key: string) => string;
  ftPerPt: number;
}

function arcPrims(
  c: Circle,
  arc: Interval,
  stroke: StrokeP,
  params: SketchParams,
  seed: string,
  ftPerPt: number,
): Prim[] {
  if (isClean(params)) return [{ t: 'arc', cx: c.x, cy: c.y, r: c.r, a0: arc[0], a1: arc[1], stroke }];
  const pts = sampleArc(c.x, c.y, c.r, arc[0], arc[1], Math.min(0.05, (3 * ftPerPt) / c.r));
  return openStrokePrims(pts, stroke, params, seed, ftPerPt);
}

function lensPolygon(A: Circle, B: Circle, ftPerPt: number): Pt[] {
  const ha = hiddenInterval(A, B);
  const hb = hiddenInterval(B, A);
  if (ha === 'all') return sampleCircle(A.x, A.y, A.r, circleSamples(A.r, ftPerPt));
  if (hb === 'all') return sampleCircle(B.x, B.y, B.r, circleSamples(B.r, ftPerPt));
  if (!ha || !hb) return [];
  const step = (r: number) => Math.min(0.05, (2 * ftPerPt) / r);
  return [...sampleArc(A.x, A.y, A.r, ha[0], ha[1], step(A.r)), ...sampleArc(B.x, B.y, B.r, hb[0], hb[1], step(B.r))];
}

/** Primitives for every overlap, plus the ids whose own outline the merge replaces. */
export function buildOverlays(ctx: OverlapContext): { prims: Prim[]; merged: Set<Id> } {
  const { project, overlaps, styleOf, base, seed, ftPerPt } = ctx;
  const ov = project.settings.overlap;
  const circle = (id: Id): Circle => {
    const n = project.nodes[id];
    return { x: n.x, y: n.y, r: n.shape.kind === 'circle' ? n.shape.radiusFt : 0 };
  };
  const width = ptToFt(ov.weightPt, project.settings.scale);
  const colorFor = (ids: Id[]): string => {
    if (ov.color === 'dark') return '#333333';
    if (ov.color === 'blend') return ids.map((id) => styleOf(id).stroke).reduce(mix);
    const largest = ids.reduce((a, b) => (circle(b).r > circle(a).r ? b : a));
    return styleOf(largest).stroke;
  };
  const paramsFor = (ids: Id[]) => scaleParams(base, Math.max(...ids.map((id) => styleOf(id).sketchAmount)));

  const prims: Prim[] = [];
  const merged = new Set<Id>();

  // merged outline: the visible boundary of each cluster, thick; inner arcs optional
  for (const members of mergeClusters(overlaps).values()) {
    const color = colorFor(members);
    const params = paramsFor(members);
    const thick: StrokeP = { color, alpha: 1, width, cap: 'round' };
    const inner: StrokeP | null =
      ov.innerArcs === 'hidden'
        ? null
        : {
            color,
            alpha: 0.8,
            width: 0.5 * ftPerPt,
            cap: 'butt',
            dash: ov.innerArcs === 'dashed' ? [3 * ftPerPt, 2.5 * ftPerPt] : undefined,
          };
    const memberSet = new Set(members);
    for (const id of members) {
      merged.add(id);
      const A = circle(id);
      const hidden: Interval[] = [];
      let all = false;
      for (const o of overlaps) {
        if (o.mode !== 'merge' || (o.a !== id && o.b !== id)) continue;
        const other = o.a === id ? o.b : o.a;
        if (!memberSet.has(other)) continue;
        const h = hiddenInterval(A, circle(other));
        if (h === 'all') all = true;
        else if (h) hidden.push(h);
      }
      (all ? [] : visibleArcs(hidden)).forEach((arc, i) =>
        prims.push(...arcPrims(A, arc, thick, params, seed(`${id}:m${i}`), ftPerPt)),
      );
      if (inner) {
        const innerArcs: Interval[] = all ? [[0, Math.PI * 2]] : hidden;
        innerArcs.forEach((arc, i) =>
          prims.push(...arcPrims(A, arc, inner, { ...params, overshoot: 0 }, seed(`${id}:i${i}`), ftPerPt)),
        );
      }
    }
  }

  // pairwise treatments
  for (const o of overlaps) {
    if (o.mode === 'merge' || o.mode === 'none') continue;
    const ids = [o.a, o.b];
    const color = colorFor(ids);
    const params = paramsFor(ids);
    const thick: StrokeP = { color, alpha: 1, width, cap: 'round' };
    const A = circle(o.a);
    const B = circle(o.b);
    if (o.mode === 'threshold') {
      if (o.p1 && o.p2) prims.push(...openStrokePrims([o.p1, o.p2], thick, params, seed(`${o.key}:t`), ftPerPt));
      continue;
    }
    if (o.mode === 'lensFill') {
      const poly = lensPolygon(A, B, ftPerPt);
      if (poly.length < 3) continue;
      const fill = darken(mix(styleOf(o.a).fill, styleOf(o.b).fill), 0.12);
      prims.push({ t: 'path', pts: poly, closed: true, fill: { color: fill, alpha: 0.6 } });
      prims.push(...monoPrims(hatchRegion(poly, 45, 3 * ftPerPt, 0.5 * ftPerPt, seed(`${o.key}:h`), ftPerPt), color));
    }
    // lens outline: thick for 'lens', a thin edge for 'lensFill'
    const edge: StrokeP = o.mode === 'lens' ? thick : { ...thick, width: Math.max(0.75 * ftPerPt, width * 0.4) };
    const ha = hiddenInterval(A, B);
    const hb = hiddenInterval(B, A);
    if (ha === 'all') prims.push(...arcPrims(A, [0, Math.PI * 2], edge, params, seed(`${o.key}:la`), ftPerPt));
    else if (hb === 'all') prims.push(...arcPrims(B, [0, Math.PI * 2], edge, params, seed(`${o.key}:lb`), ftPerPt));
    else {
      if (ha) prims.push(...arcPrims(A, ha, edge, params, seed(`${o.key}:la`), ftPerPt));
      if (hb) prims.push(...arcPrims(B, hb, edge, params, seed(`${o.key}:lb`), ftPerPt));
    }
  }
  return { prims, merged };
}
