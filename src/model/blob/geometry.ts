/**
 * Blob geometry: resolving control points against bubbles and sampling the
 * outline. Freeform "blob" shapes (exterior spaces) that hug bubbles.
 *
 * A blob is a closed loop of control points. A point is either FREE (feet,
 * relative to the node's x/y) or ANCHORED to a circle bubble: it sits on that
 * bubble's offset ring (radius + gap) at an angle, so it follows the bubble.
 * Consecutive anchors on the same bubble with `arc` set follow the ring
 * exactly; every other segment is a cubic spline whose tangents leave the ring
 * smoothly, which is what makes the edge feel drawn rather than constructed.
 */
import type { BlobShape, BubbleNode, Id, Point, Project } from '../types';
import { centroidOf, labelPoint, pointInPolygon, polygonArea } from '../polygon';

export { pointInPolygon, polygonArea };

export interface RingRef {
  id: Id;
  x: number;
  y: number;
  r: number;
}

export const TAU = Math.PI * 2;

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

export function ringOf(project: Project, id: Id): RingRef | null {
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
