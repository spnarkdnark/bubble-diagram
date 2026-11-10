/** Building blobs from input: freehand strokes, clicked points and pocket fill, with ring snapping. */
import type { BlobPoint, BlobShape, Id, Point } from '../types';
import { TAU, type RingRef } from './geometry';

export interface SnapInfo {
  ring: RingRef;
  angle: number;
}

/** Snap a point to the nearest offset ring within tolerance (inside a ring also snaps). */
export function snapToRing(p: Point, rings: RingRef[], gap: number, tol: number): SnapInfo | null {
  let best: SnapInfo | null = null;
  let score = Infinity;
  for (const ring of rings) {
    const R = ring.r + gap;
    const d = Math.hypot(p.x - ring.x, p.y - ring.y);
    if (d > R + tol) continue;
    const s = Math.abs(d - R);
    if (s < score) {
      score = s;
      best = { ring, angle: Math.atan2(p.y - ring.y, p.x - ring.x) };
    }
  }
  return best;
}

function wrapDelta(a: number): number {
  return ((((a + Math.PI) % TAU) + TAU) % TAU) - Math.PI;
}

function rdp(pts: Point[], eps: number): Point[] {
  if (pts.length < 3) return pts;
  const a = pts[0];
  const b = pts[pts.length - 1];
  let idx = -1;
  let max = 0;
  const L = Math.hypot(b.x - a.x, b.y - a.y) || 1e-9;
  for (let i = 1; i < pts.length - 1; i++) {
    const p = pts[i];
    const d = Math.abs((b.x - a.x) * (a.y - p.y) - (a.x - p.x) * (b.y - a.y)) / L;
    if (d > max) {
      max = d;
      idx = i;
    }
  }
  if (max <= eps) return [a, b];
  return [...rdp(pts.slice(0, idx + 1), eps).slice(0, -1), ...rdp(pts.slice(idx), eps)];
}

/** Absolute-coordinate version of BlobPoint used while building. */
export type BuildPoint =
  { t: 'free'; x: number; y: number } | { t: 'anchor'; node: Id; angle: number; dir: 1 | -1; arc: boolean };

/**
 * Turn a closed sequence of (possibly snapped) samples into control points.
 * Runs of samples on the same ring become an arc; free runs are simplified.
 */
export function pointsFromSamples(samples: { p: Point; snap: SnapInfo | null }[], simplifyEps: number): BuildPoint[] {
  if (samples.length < 2) return [];
  // group into runs by ring id (null = free)
  type Run = { id: Id | null; items: { p: Point; snap: SnapInfo | null }[] };
  const runs: Run[] = [];
  for (const s of samples) {
    const id = s.snap?.ring.id ?? null;
    const last = runs[runs.length - 1];
    if (last && last.id === id) last.items.push(s);
    else runs.push({ id, items: [s] });
  }
  // the loop is closed: join the last run onto the first when they match
  if (runs.length > 1 && runs[0].id === runs[runs.length - 1].id) {
    const last = runs.pop()!;
    runs[0].items = [...last.items, ...runs[0].items];
  }
  const out: BuildPoint[] = [];
  for (const run of runs) {
    if (run.id === null) {
      const simple = rdp(
        run.items.map((s) => s.p),
        simplifyEps,
      );
      for (const p of simple) out.push({ t: 'free', x: p.x, y: p.y });
      continue;
    }
    const angles = run.items.map((s) => s.snap!.angle);
    let sweep = 0;
    for (let i = 1; i < angles.length; i++) sweep += wrapDelta(angles[i] - angles[i - 1]);
    const a0 = angles[0];
    const dir: 1 | -1 = sweep >= 0 ? 1 : -1;
    if (Math.abs(sweep) >= TAU - 0.35) {
      // went all the way around: a full ring
      for (let k = 0; k < 3; k++)
        out.push({ t: 'anchor', node: run.id, angle: a0 + (dir * k * TAU) / 3, dir, arc: true });
    } else if (Math.abs(sweep) < 0.06) {
      const mid = a0 + sweep / 2;
      out.push({ t: 'anchor', node: run.id, angle: mid, dir, arc: false });
    } else {
      out.push({ t: 'anchor', node: run.id, angle: a0, dir, arc: true });
      out.push({ t: 'anchor', node: run.id, angle: a0 + sweep, dir, arc: false });
    }
  }
  return dedupe(out, simplifyEps);
}

/** Drop free points that sit right on top of a neighbor (prevents kinks). */
function dedupe(pts: BuildPoint[], eps: number): BuildPoint[] {
  const out: BuildPoint[] = [];
  for (const b of pts) {
    const last = out[out.length - 1];
    if (b.t === 'free' && last?.t === 'free' && Math.hypot(b.x - last.x, b.y - last.y) < eps * 0.5) continue;
    out.push(b);
  }
  return out;
}

/** Freehand stroke (world feet) → control points. */
export function blobFromStroke(
  stroke: Point[],
  rings: RingRef[],
  gap: number,
  tol: number,
  simplifyEps: number,
): BuildPoint[] {
  return pointsFromSamples(
    stroke.map((p) => ({ p, snap: snapToRing(p, rings, gap, tol) })),
    simplifyEps,
  );
}

/** Clicked points → control points; consecutive clicks on one ring follow it the short way. */
export function blobFromClicks(clicks: Point[], rings: RingRef[], gap: number, tol: number): BuildPoint[] {
  const snaps = clicks.map((p) => snapToRing(p, rings, gap, tol));
  const n = clicks.length;
  const pts: BuildPoint[] = clicks.map((p, i) => {
    const s = snaps[i];
    return s ? { t: 'anchor', node: s.ring.id, angle: s.angle, dir: 1, arc: false } : { t: 'free', x: p.x, y: p.y };
  });
  for (let i = 0; i < n; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % n];
    if (a.t !== 'anchor') continue;
    if (b.t === 'anchor' && b.node === a.node) {
      a.dir = wrapDelta(b.angle - a.angle) >= 0 ? 1 : -1;
      a.arc = true;
    } else {
      // lone anchor: travel direction from its neighbors
      const prev = clicks[(i - 1 + n) % n];
      const next = clicks[(i + 1) % n];
      const rx = Math.cos(a.angle);
      const ry = Math.sin(a.angle);
      a.dir = rx * (next.y - prev.y) - ry * (next.x - prev.x) >= 0 ? 1 : -1;
    }
  }
  return pts;
}

/**
 * "Fill the pocket": cast rays from `c` to the surrounding offset rings.
 * Returns null when the point is inside a bubble or the space is not enclosed.
 */
export function blobFromPocket(c: Point, rings: RingRef[], gap: number, simplifyEps: number): BuildPoint[] | null {
  if (rings.length < 2) return null;
  if (rings.some((r) => Math.hypot(c.x - r.x, c.y - r.y) < r.r + gap)) return null;
  const radii = rings.map((r) => r.r).sort((a, b) => a - b);
  const maxDist = Math.max(30, radii[Math.floor(radii.length / 2)] * 5);
  const N = 120;
  const hits: ({ p: Point; snap: SnapInfo; t: number } | null)[] = [];
  for (let i = 0; i < N; i++) {
    const a = (i / N) * TAU;
    const d = { x: Math.cos(a), y: Math.sin(a) };
    let best: { p: Point; snap: SnapInfo; t: number } | null = null;
    for (const ring of rings) {
      const R = ring.r + gap;
      const fx = c.x - ring.x;
      const fy = c.y - ring.y;
      const b = fx * d.x + fy * d.y;
      const disc = b * b - (fx * fx + fy * fy - R * R);
      if (disc < 0) continue;
      const t = -b - Math.sqrt(disc);
      if (t <= 0 || t > maxDist || (best && t >= best.t)) continue;
      const p = { x: c.x + d.x * t, y: c.y + d.y * t };
      best = { p, t, snap: { ring, angle: Math.atan2(p.y - ring.y, p.x - ring.x) } };
    }
    hits.push(best);
  }
  const escaped = hits.filter((h) => !h).length;
  if (escaped > N * 0.25) return null;
  // escaped rays: free points at the average distance of their hit neighbors
  const avg = hits.filter(Boolean).reduce((s, h) => s + h!.t, 0) / (N - escaped);
  const samples = hits.map((h, i) => {
    if (h) return { p: h.p, snap: h.snap as SnapInfo | null };
    const a = (i / N) * TAU;
    return { p: { x: c.x + Math.cos(a) * avg, y: c.y + Math.sin(a) * avg }, snap: null };
  });
  return pointsFromSamples(samples, simplifyEps);
}

/** Convert build points to a node-relative BlobShape. Returns the origin used. */
export function toBlobShape(pts: BuildPoint[], gapFt: number, rings: RingRef[]): { shape: BlobShape; origin: Point } {
  const abs = pts.map((b) => {
    if (b.t === 'free') return { x: b.x, y: b.y };
    const r = rings.find((x) => x.id === b.node)!;
    return { x: r.x + Math.cos(b.angle) * (r.r + gapFt), y: r.y + Math.sin(b.angle) * (r.r + gapFt) };
  });
  const origin = {
    x: abs.reduce((s, p) => s + p.x, 0) / Math.max(1, abs.length),
    y: abs.reduce((s, p) => s + p.y, 0) / Math.max(1, abs.length),
  };
  const points: BlobPoint[] = pts.map((b) =>
    b.t === 'free' ? { t: 'free', x: b.x - origin.x, y: b.y - origin.y } : { ...b },
  );
  return { shape: { kind: 'blob', points, gapFt }, origin };
}
