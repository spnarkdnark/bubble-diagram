/**
 * Freeform "blob" shapes (exterior spaces) that hug bubbles.
 *
 * A blob is a closed loop of control points. A point is either FREE (feet,
 * relative to the node's x/y) or ANCHORED to a circle bubble: it sits on that
 * bubble's offset ring (radius + gap) at an angle, so it follows the bubble.
 * Consecutive anchors on the same bubble with `arc` set follow the ring
 * exactly; every other segment is a cubic spline whose tangents leave the ring
 * smoothly, which is what makes the edge feel drawn rather than constructed.
 */
import type { BlobPoint, BlobShape, BubbleNode, Id, Point, Project } from './types';

export interface RingRef {
  id: Id;
  x: number;
  y: number;
  r: number;
}

const TAU = Math.PI * 2;

export function circleRings(project: Project, exclude?: Id): RingRef[] {
  const out: RingRef[] = [];
  for (const id of project.nodeOrder) {
    const n = project.nodes[id];
    if (id !== exclude && n.shape.kind === 'circle') out.push({ id, x: n.x, y: n.y, r: n.shape.radiusFt });
  }
  return out;
}

interface Resolved {
  p: Point;
  /** unit tangent in the direction of travel */
  tan: Point | null;
  anchor?: { ring: RingRef; angle: number; dir: 1 | -1; arc: boolean };
}

function ringOf(project: Project, id: Id): RingRef | null {
  const n = project.nodes[id];
  return n && n.shape.kind === 'circle' ? { id, x: n.x, y: n.y, r: n.shape.radiusFt } : null;
}

/** World positions of a blob's control points (anchors resolved against current bubbles). */
export function resolvePoints(node: BubbleNode, shape: BlobShape, project: Project): Resolved[] {
  const out: Resolved[] = [];
  for (const pt of shape.points) {
    if (pt.t === 'free') {
      out.push({ p: { x: node.x + pt.x, y: node.y + pt.y }, tan: null });
      continue;
    }
    const ring = ringOf(project, pt.node);
    if (!ring) continue; // dangling anchor: skipped (actions detach anchors before deleting bubbles)
    const R = ring.r + shape.gapFt;
    out.push({
      p: { x: ring.x + Math.cos(pt.angle) * R, y: ring.y + Math.sin(pt.angle) * R },
      tan: { x: -Math.sin(pt.angle) * pt.dir, y: Math.cos(pt.angle) * pt.dir },
      anchor: { ring, angle: pt.angle, dir: pt.dir, arc: pt.arc },
    });
  }
  return out;
}

export interface BlobGeometry {
  /** dense closed polygon, world feet */
  poly: Point[];
  /** for each polygon vertex, the control-point segment it belongs to */
  seg: number[];
  /** resolved control point positions */
  ctrl: Point[];
  area: number;
  centroid: Point;
  labelAt: Point;
}

/** Blend tangent `t` toward `chord` when it points less than ~70° along it. */
function tame(t: Point, chord: Point): Point {
  const dot = t.x * chord.x + t.y * chord.y;
  const MIN = 0.35;
  if (dot >= MIN) return t;
  const w = Math.min(1, (MIN - dot) / (1 + MIN));
  return norm({ x: t.x * (1 - w) + chord.x * w, y: t.y * (1 - w) + chord.y * w });
}

function norm(v: Point): Point {
  const l = Math.hypot(v.x, v.y) || 1;
  return { x: v.x / l, y: v.y / l };
}

export function polygonArea(pts: Point[]): number {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const q = pts[(i + 1) % pts.length];
    a += p.x * q.y - q.x * p.y;
  }
  return a / 2;
}

export function pointInPolygon(p: Point, poly: Point[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

function centroidOf(poly: Point[]): Point {
  const A = polygonArea(poly);
  if (Math.abs(A) < 1e-9) {
    const s = poly.reduce((acc, p) => ({ x: acc.x + p.x, y: acc.y + p.y }), { x: 0, y: 0 });
    return { x: s.x / poly.length, y: s.y / poly.length };
  }
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i];
    const q = poly[(i + 1) % poly.length];
    const f = p.x * q.y - q.x * p.y;
    cx += (p.x + q.x) * f;
    cy += (p.y + q.y) * f;
  }
  return { x: cx / (6 * A), y: cy / (6 * A) };
}

/** A point well inside the polygon for the label: centroid, or the middle of the widest span through it. */
function labelPoint(poly: Point[], c: Point): Point {
  if (pointInPolygon(c, poly)) return c;
  const xs: number[] = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    if (a.y > c.y !== b.y > c.y) xs.push(a.x + ((c.y - a.y) * (b.x - a.x)) / (b.y - a.y));
  }
  xs.sort((p, q) => p - q);
  let best: Point = c;
  let w = -1;
  for (let i = 0; i + 1 < xs.length; i += 2)
    if (xs[i + 1] - xs[i] > w) {
      w = xs[i + 1] - xs[i];
      best = { x: (xs[i] + xs[i + 1]) / 2, y: c.y };
    }
  return best;
}

const cache = new Map<Id, { key: string; geo: BlobGeometry }>();

/** Dense geometry of a blob node (cached on its resolved control points). */
export function blobGeometry(node: BubbleNode, project: Project): BlobGeometry {
  const shape = node.shape as BlobShape;
  const res = resolvePoints(node, shape, project);
  const key = JSON.stringify(res.map((r) => [r.p.x, r.p.y, r.tan?.x, r.tan?.y, r.anchor?.arc, r.anchor?.ring.r]));
  const hit = cache.get(node.id);
  if (hit && hit.key === key) return hit.geo;

  const n = res.length;
  const poly: Point[] = [];
  const seg: number[] = [];
  const step = 0.5; // feet between samples
  for (let i = 0; i < n; i++) {
    const A = res[i];
    const B = res[(i + 1) % n];
    // ring arc between two anchors on the same bubble
    if (A.anchor?.arc && B.anchor && B.anchor.ring.id === A.anchor.ring.id) {
      const { ring, dir } = A.anchor;
      const R = Math.hypot(A.p.x - ring.x, A.p.y - ring.y);
      const a0 = A.anchor.angle;
      let a1 = B.anchor.angle;
      if (dir > 0) while (a1 <= a0 + 1e-9) a1 += TAU;
      else while (a1 >= a0 - 1e-9) a1 -= TAU;
      const m = Math.max(2, Math.ceil((Math.abs(a1 - a0) * R) / step));
      for (let k = 0; k < m; k++) {
        const a = a0 + ((a1 - a0) * k) / m;
        poly.push({ x: ring.x + Math.cos(a) * R, y: ring.y + Math.sin(a) * R });
        seg.push(i);
      }
      continue;
    }
    // cubic Hermite spline
    const prev = res[(i - 1 + n) % n].p;
    const next = res[(i + 2) % n].p;
    const L = Math.hypot(B.p.x - A.p.x, B.p.y - A.p.y);
    const chord = norm({ x: B.p.x - A.p.x, y: B.p.y - A.p.y });
    // a ring tangent pointing back against the chord would loop: ease it toward the chord
    const t0 = tame(A.tan ?? norm({ x: B.p.x - prev.x, y: B.p.y - prev.y }), chord);
    const t1 = tame(B.tan ?? norm({ x: next.x - A.p.x, y: next.y - A.p.y }), chord);
    const c0 = { x: A.p.x + (t0.x * L) / 3, y: A.p.y + (t0.y * L) / 3 };
    const c1 = { x: B.p.x - (t1.x * L) / 3, y: B.p.y - (t1.y * L) / 3 };
    const m = Math.max(4, Math.ceil(L / step));
    for (let k = 0; k < m; k++) {
      const t = k / m;
      const u = 1 - t;
      poly.push({
        x: u * u * u * A.p.x + 3 * u * u * t * c0.x + 3 * u * t * t * c1.x + t * t * t * B.p.x,
        y: u * u * u * A.p.y + 3 * u * u * t * c0.y + 3 * u * t * t * c1.y + t * t * t * B.p.y,
      });
      seg.push(i);
    }
  }
  const centroid = poly.length >= 3 ? centroidOf(poly) : { x: node.x, y: node.y };
  const geo: BlobGeometry = {
    poly,
    seg,
    ctrl: res.map((r) => r.p),
    area: Math.abs(polygonArea(poly)),
    centroid,
    labelAt: poly.length >= 3 ? labelPoint(poly, centroid) : centroid,
  };
  cache.set(node.id, { key, geo });
  if (cache.size > 2000) cache.clear();
  return geo;
}

// ------------------------------------------------------------------ building

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

/**
 * Detach anchors that point at bubbles in `ids` (or at missing bubbles),
 * freezing them as free points at their current position.
 */
export function detachAnchors(node: BubbleNode, project: Project, shouldDetach: (id: Id) => boolean): BlobShape {
  const shape = node.shape as BlobShape;
  const points: BlobPoint[] = shape.points.map((pt) => {
    if (pt.t !== 'anchor' || !shouldDetach(pt.node)) return pt;
    const ring = ringOf(project, pt.node);
    if (!ring) return pt;
    const R = ring.r + shape.gapFt;
    return { t: 'free', x: ring.x + Math.cos(pt.angle) * R - node.x, y: ring.y + Math.sin(pt.angle) * R - node.y };
  });
  // an arc needs anchors at both ends
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    if (a.t === 'anchor' && a.arc && !(b.t === 'anchor' && b.node === a.node)) points[i] = { ...a, arc: false };
  }
  return { ...shape, points };
}

/**
 * Copy a blob for duplicate/paste: anchors to bubbles that are copied along
 * are re-pointed at the copies; anchors to bubbles left behind become free
 * points at their current position.
 */
export function remapBlob(node: BubbleNode, project: Project, idMap: Map<Id, Id>): BlobShape {
  const detached = detachAnchors(node, project, (id) => !idMap.has(id));
  return {
    ...detached,
    points: detached.points.map((pt) => (pt.t === 'anchor' ? { ...pt, node: idMap.get(pt.node)! } : pt)),
  };
}

/** Move one control point to `p`: snapped to a ring when `snap` is given, otherwise free. */
export function movePoint(node: BubbleNode, index: number, p: Point, snap: SnapInfo | null): BlobShape {
  const shape = node.shape as BlobShape;
  const points = shape.points.slice();
  const old = points[index];
  if (snap) {
    const same = old.t === 'anchor' && old.node === snap.ring.id;
    points[index] = {
      t: 'anchor',
      node: snap.ring.id,
      angle: snap.angle,
      dir: same ? (old as any).dir : 1,
      arc: same ? (old as any).arc : false,
    };
  } else points[index] = { t: 'free', x: p.x - node.x, y: p.y - node.y };
  // keep arcs valid on both sides of the moved point
  const n = points.length;
  for (const i of [(index - 1 + n) % n, index]) {
    const a = points[i];
    const b = points[(i + 1) % n];
    if (a.t === 'anchor' && a.arc && !(b.t === 'anchor' && b.node === a.node)) points[i] = { ...a, arc: false };
  }
  return { ...shape, points };
}

export function deletePoint(shape: BlobShape, index: number): BlobShape {
  if (shape.points.length <= 3) return shape;
  const points = shape.points.filter((_, i) => i !== index);
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    if (a.t === 'anchor' && a.arc && !(b.t === 'anchor' && b.node === a.node)) points[i] = { ...a, arc: false };
  }
  return { ...shape, points };
}

/** Insert a free point at world position `p` after control point `after`. */
export function insertPoint(node: BubbleNode, after: number, p: Point): BlobShape {
  const shape = node.shape as BlobShape;
  const points = shape.points.slice();
  const a = points[after];
  if (a.t === 'anchor' && a.arc) points[after] = { ...a, arc: false };
  points.splice(after + 1, 0, { t: 'free', x: p.x - node.x, y: p.y - node.y });
  return { ...shape, points };
}
