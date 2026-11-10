/** Geometry-based hit testing in world feet (Konva layers are non-listening). */
import type { Id, Point, Project } from '../model/types';
import { connectionSegment, containsPoint, shapeSize } from '../model/geometry';

export type Hit =
  | { kind: 'handle'; id: Id }
  | { kind: 'node'; id: Id }
  | { kind: 'connection'; id: Id }
  | { kind: 'overlap'; key: string }
  | { kind: 'empty' };

function distToSegment(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy || 1;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/** World position of a node's resize handle (right edge). */
export function handlePosition(project: Project, id: Id): Point | null {
  const n = project.nodes[id];
  return n ? { x: n.x + shapeSize(n.shape), y: n.y } : null;
}

export function topNodeAt(project: Project, p: Point): Id | null {
  for (let i = project.nodeOrder.length - 1; i >= 0; i--) {
    const id = project.nodeOrder[i];
    if (containsPoint(project.nodes[id], p, project)) return id;
  }
  return null;
}

/**
 * @param tolFt hit tolerance in feet (screen px / stage scale)
 * @param handleFor node id showing a resize handle (single selection), if any
 */
export function hitTest(
  project: Project,
  p: Point,
  tolFt: number,
  handleFor: Id | null,
  markers: { key: string; marker: Point }[] = [],
): Hit {
  if (handleFor) {
    const h = handlePosition(project, handleFor);
    if (h && Math.hypot(p.x - h.x, p.y - h.y) <= tolFt * 1.2) return { kind: 'handle', id: handleFor };
  }
  for (const m of markers) if (Math.hypot(p.x - m.marker.x, p.y - m.marker.y) <= tolFt * 1.1) return { kind: 'overlap', key: m.key };
  const node = topNodeAt(project, p);
  if (node) return { kind: 'node', id: node };
  for (const c of Object.values(project.connections)) {
    const a = project.nodes[c.from];
    const b = project.nodes[c.to];
    if (!a || !b) continue;
    const seg = connectionSegment(a, b, project);
    if (seg && distToSegment(p, seg[0], seg[1]) <= tolFt) return { kind: 'connection', id: c.id };
  }
  return { kind: 'empty' };
}
