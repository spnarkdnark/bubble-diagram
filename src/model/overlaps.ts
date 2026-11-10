/**
 * Overlapping bubbles: detection, per-overlap mode, merge clusters and the
 * arc math the renderer needs. Circles only for now.
 */
import type { BubbleNode, Id, OverlapMode, Point, Project } from './types';

export interface Overlap {
  key: string;
  a: Id;
  b: Id;
  mode: OverlapMode;
  /** true when one circle lies entirely inside the other */
  contained: boolean;
  /** the two boundary intersection points (absent when contained) */
  p1?: Point;
  p2?: Point;
  /** where to put the overlap's selection marker */
  marker: Point;
}

export function overlapKey(a: Id, b: Id): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

export const OVERLAP_MODE_LABELS: Record<OverlapMode, string> = {
  merge: 'Merged outline',
  lens: 'Shared zone outline',
  lensFill: 'Shared zone fill',
  threshold: 'Threshold line',
  none: 'Plain (no treatment)',
};

const EPS = 1e-6;

function circleOf(n: BubbleNode): { x: number; y: number; r: number } | null {
  return n.shape.kind === 'circle' ? { x: n.x, y: n.y, r: n.shape.radiusFt } : null;
}

/** All overlapping circle pairs, with their effective mode. */
export function findOverlaps(project: Project): Overlap[] {
  const circles = project.nodeOrder
    .map((id) => project.nodes[id])
    .map((n) => ({ n, c: circleOf(n) }))
    .filter((x): x is { n: BubbleNode; c: { x: number; y: number; r: number } } => !!x.c);
  const out: Overlap[] = [];
  for (let i = 0; i < circles.length; i++) {
    for (let j = i + 1; j < circles.length; j++) {
      const A = circles[i].c;
      const B = circles[j].c;
      const dx = B.x - A.x;
      const dy = B.y - A.y;
      const d = Math.hypot(dx, dy);
      if (d >= A.r + B.r - EPS) continue;
      const a = circles[i].n.id;
      const b = circles[j].n.id;
      const key = overlapKey(a, b);
      const mode = project.overlaps[key]?.mode ?? project.settings.overlap.mode;
      const contained = d <= Math.abs(A.r - B.r) + EPS;
      if (contained) {
        const small = A.r < B.r ? A : B;
        out.push({ key, a, b, mode, contained, marker: { x: small.x, y: small.y } });
        continue;
      }
      // intersection points
      const along = (A.r * A.r - B.r * B.r + d * d) / (2 * d);
      const h = Math.sqrt(Math.max(0, A.r * A.r - along * along));
      const mx = A.x + (dx * along) / d;
      const my = A.y + (dy * along) / d;
      const p1 = { x: mx - (dy * h) / d, y: my + (dx * h) / d };
      const p2 = { x: mx + (dy * h) / d, y: my - (dx * h) / d };
      // marker at the middle of the lens (between the two inner arc midpoints)
      const innerA = { x: A.x + (dx / d) * A.r, y: A.y + (dy / d) * A.r };
      const innerB = { x: B.x - (dx / d) * B.r, y: B.y - (dy / d) * B.r };
      out.push({ key, a, b, mode, contained, p1, p2, marker: { x: (innerA.x + innerB.x) / 2, y: (innerA.y + innerB.y) / 2 } });
    }
  }
  return out;
}

/** Groups of node ids joined by 'merge' overlaps (union-find). */
export function mergeClusters(overlaps: Overlap[]): Map<Id, Id[]> {
  const parent = new Map<Id, Id>();
  const find = (x: Id): Id => {
    let r = x;
    while (parent.get(r) !== r) r = parent.get(r)!;
    parent.set(x, r);
    return r;
  };
  for (const o of overlaps) {
    if (o.mode !== 'merge') continue;
    for (const id of [o.a, o.b]) if (!parent.has(id)) parent.set(id, id);
    parent.set(find(o.a), find(o.b));
  }
  const groups = new Map<Id, Id[]>();
  for (const id of parent.keys()) {
    const r = find(id);
    if (!groups.has(r)) groups.set(r, []);
    groups.get(r)!.push(id);
  }
  return groups;
}

export type Interval = [number, number];
const TAU = Math.PI * 2;

/**
 * Angular interval of circle A's boundary that lies inside circle B.
 * Returns 'all' when A is inside B, null when none of A is inside B.
 */
export function hiddenInterval(A: { x: number; y: number; r: number }, B: { x: number; y: number; r: number }): Interval | 'all' | null {
  const d = Math.hypot(B.x - A.x, B.y - A.y);
  if (d >= A.r + B.r) return null;
  if (d + A.r <= B.r) return 'all';
  if (d + B.r <= A.r) return null;
  const theta = Math.atan2(B.y - A.y, B.x - A.x);
  const beta = Math.acos(Math.max(-1, Math.min(1, (A.r * A.r + d * d - B.r * B.r) / (2 * A.r * d))));
  return [theta - beta, theta + beta];
}

/** Complement of a set of intervals on the circle: the visible arcs. */
export function visibleArcs(hidden: Interval[]): Interval[] {
  if (hidden.length === 0) return [[0, TAU]];
  // normalize into [0, TAU), splitting wrap-arounds
  const segs: Interval[] = [];
  for (const [a0, b0] of hidden) {
    const len = b0 - a0;
    if (len >= TAU) return [];
    const a = ((a0 % TAU) + TAU) % TAU;
    const b = a + len;
    if (b <= TAU) segs.push([a, b]);
    else {
      segs.push([a, TAU]);
      segs.push([0, b - TAU]);
    }
  }
  segs.sort((x, y) => x[0] - y[0]);
  const merged: Interval[] = [];
  for (const s of segs) {
    const last = merged[merged.length - 1];
    if (last && s[0] <= last[1] + 1e-9) last[1] = Math.max(last[1], s[1]);
    else merged.push([s[0], s[1]]);
  }
  const vis: Interval[] = [];
  let cur = 0;
  for (const [a, b] of merged) {
    if (a > cur + 1e-9) vis.push([cur, a]);
    cur = Math.max(cur, b);
  }
  if (cur < TAU - 1e-9) vis.push([cur, TAU]);
  // join an arc ending at TAU with one starting at 0
  if (vis.length > 1 && vis[0][0] < 1e-9 && vis[vis.length - 1][1] > TAU - 1e-9) {
    const first = vis.shift()!;
    vis[vis.length - 1] = [vis[vis.length - 1][0], first[1] + TAU];
  }
  return vis;
}
