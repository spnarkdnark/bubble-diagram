/** Renderer-neutral drawing primitives (world feet) and helpers for producing them. */
import { hexToRgb, rgbToHex } from '../model/color';
import { isClean, sketchOpenStroke, type ColorSlot, type Op, type Pt, type SketchParams } from './sketch';

export interface Paint {
  color: string;
  alpha: number;
}

export interface StrokeP {
  color: string;
  alpha: number;
  /** feet */
  width: number;
  /** feet */
  dash?: [number, number];
  cap: 'butt' | 'round';
}

export type Prim =
  | { t: 'circle'; cx: number; cy: number; r: number; fill?: Paint; stroke?: StrokeP }
  /** exact arc from angle a0 to a1 (radians, a1 > a0, y-down) */
  | { t: 'arc'; cx: number; cy: number; r: number; a0: number; a1: number; stroke: StrokeP }
  | { t: 'path'; pts: Pt[]; closed: boolean; fill?: Paint; stroke?: StrokeP };

/** Convert sketch ops into primitives with concrete colors. */
export function opsToPrims(ops: Op[], colors: Record<ColorSlot, string>, fillAlpha: number): Prim[] {
  return ops.map((o): Prim => {
    const color = colors[o.color];
    const alpha = o.color === 'stroke' ? o.alpha : o.alpha * fillAlpha;
    return o.t === 'poly'
      ? { t: 'path', pts: o.pts, closed: true, fill: { color, alpha } }
      : { t: 'path', pts: o.pts, closed: false, stroke: { color, alpha, width: o.width, cap: 'round' } };
  });
}

/** Sketch ops drawn in a single color (lines, hatching). */
export function monoPrims(ops: Op[], color: string): Prim[] {
  return opsToPrims(ops, { fill: color, fillDark: color, stroke: color }, 1);
}

/** An open polyline: exact when the params are clean, hand-drawn otherwise. */
export function openStrokePrims(
  pts: Pt[],
  stroke: StrokeP,
  params: SketchParams,
  seed: string,
  ftPerPt: number,
): Prim[] {
  if (isClean(params)) return [{ t: 'path', pts, closed: false, stroke }];
  const ops = sketchOpenStroke(pts, { width: stroke.width, dash: stroke.dash }, { params, seed, unitsPerPt: ftPerPt });
  return monoPrims(ops, stroke.color);
}

/** Per-drawing "new hand" seed applied to an element's random seed. */
export function seeded(id: string, seed: number): string {
  return seed ? `${id}~${seed}` : id;
}

export function mix(a: string, b: string): string {
  const [r1, g1, b1] = hexToRgb(a);
  const [r2, g2, b2] = hexToRgb(b);
  return rgbToHex((r1 + r2) / 2, (g1 + g2) / 2, (b1 + b2) / 2);
}

/** Sample count for a circle so sketch noise has ~1 sample per paper point (bounded). */
export function circleSamples(r: number, ftPerPt: number): number {
  return Math.max(48, Math.min(240, Math.round((r / ftPerPt) * 1.2)));
}

/** Resample a closed polygon to roughly even spacing (sketch noise needs even samples). */
export function resample(poly: Pt[], spacing: number): Pt[] {
  if (poly.length < 3) return poly;
  let total = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    total += Math.hypot(b.x - a.x, b.y - a.y);
  }
  const n = Math.max(24, Math.min(600, Math.round(total / spacing)));
  const step = total / n;
  const out: Pt[] = [];
  let acc = 0;
  let next = 0;
  for (let i = 0; i < poly.length && out.length < n; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    while (next <= acc + len && out.length < n) {
      const t = len ? (next - acc) / len : 0;
      out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
      next += step;
    }
    acc += len;
  }
  return out;
}

/**
 * Densify a closed polygon with sharp corners for sketching: every corner is
 * kept exactly, edges get points about `spacing` apart, and the ring starts in
 * the middle of the first edge so a hand-drawn stroke closes on a straight side.
 */
export function subdivide(poly: Pt[], spacing: number): Pt[] {
  if (poly.length < 3) return poly;
  const out: Pt[] = [];
  let start = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const n = Math.max(2, Math.min(150, Math.round(Math.hypot(b.x - a.x, b.y - a.y) / spacing)));
    if (i === 0) start = Math.floor(n / 2);
    for (let j = 0; j < n; j++) out.push({ x: a.x + ((b.x - a.x) * j) / n, y: a.y + ((b.y - a.y) * j) / n });
  }
  return [...out.slice(start), ...out.slice(0, start)];
}
