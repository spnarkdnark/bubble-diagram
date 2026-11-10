/** Editing blobs: moving, inserting and deleting points; detaching and remapping anchors. */
import type { BlobPoint, BlobShape, BubbleNode, Id, Point, Project } from '../types';
import { ringOf } from './geometry';
import type { SnapInfo } from './build';

/** An arc must end on an anchor of the same bubble; clear arcs that no longer do. */
function fixArcs(points: BlobPoint[], only?: number[]): BlobPoint[] {
  const n = points.length;
  for (const i of only ?? points.keys()) {
    const a = points[i];
    const b = points[(i + 1) % n];
    if (a.t === 'anchor' && a.arc && !(b.t === 'anchor' && b.node === a.node)) points[i] = { ...a, arc: false };
  }
  return points;
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
  return { ...shape, points: fixArcs(points) };
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
    // staying on the same bubble keeps its travel direction and arc flag
    const same = old.t === 'anchor' && old.node === snap.ring.id ? old : null;
    points[index] = {
      t: 'anchor',
      node: snap.ring.id,
      angle: snap.angle,
      dir: same ? same.dir : 1,
      arc: same ? same.arc : false,
    };
  } else points[index] = { t: 'free', x: p.x - node.x, y: p.y - node.y };
  // keep arcs valid on both sides of the moved point
  return { ...shape, points: fixArcs(points, [(index - 1 + points.length) % points.length, index]) };
}

export function deletePoint(shape: BlobShape, index: number): BlobShape {
  if (shape.points.length <= 3) return shape;
  return { ...shape, points: fixArcs(shape.points.filter((_, i) => i !== index)) };
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
