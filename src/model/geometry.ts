/**
 * Shape geometry. Every `switch (shape.kind)` in the app should live here so
 * adding a shape is a local change. Node-level functions take the project
 * because blob geometry depends on the bubbles it hugs.
 *
 * Circles are exact; every other shape is described by its outline polygon
 * (`nodeOutline`), so containment, bounds, marquee and connection endpoints
 * come for free. A new "sizable" shape (placed by the bubble tool, resizable,
 * sized by area) also needs its cases in the sizing section below.
 */
import type { Bounds, BubbleNode, CircleShape, Point, Project, RectShape, Shape, SizableKind } from './types';
import { blobGeometry } from './blob';
import { pointInPolygon } from './polygon';

export function radiusFromArea(areaSf: number): number {
  return Math.sqrt(Math.max(0, areaSf) / Math.PI);
}

// ------------------------------------------------------------------ sizing

export type SizableShape = CircleShape | RectShape;

export function isSizable(shape: Shape): shape is SizableShape {
  return shape.kind !== 'blob';
}

/**
 * Half-extent of a sizable shape: the radius of a circle, half the width of a
 * rectangle. The resize handle, wheel step and radius snap all work on this,
 * so a 6" step grows a circle's diameter or a square's side by 1'. 0 for blobs.
 */
export function shapeSize(shape: Shape): number {
  switch (shape.kind) {
    case 'circle':
      return shape.radiusFt;
    case 'rect':
      return shape.widthFt / 2;
    case 'blob':
      return 0;
  }
}

/** Set the half-extent (see shapeSize), keeping proportions. */
export function withSize(shape: Shape, sizeFt: number): Shape {
  switch (shape.kind) {
    case 'circle':
      return { ...shape, radiusFt: sizeFt };
    case 'rect': {
      const k = sizeFt / (shape.widthFt / 2);
      return { ...shape, widthFt: sizeFt * 2, heightFt: shape.heightFt * k };
    }
    case 'blob':
      return shape;
  }
}

/** Area of a shape that doesn't depend on other nodes, in sf (blobs: use nodeArea). */
export function sizableArea(shape: SizableShape): number {
  return shape.kind === 'circle' ? Math.PI * shape.radiusFt ** 2 : shape.widthFt * shape.heightFt;
}

/** Scale to an exact area, keeping proportions. */
export function withArea(shape: Shape, areaSf: number): Shape {
  if (!isSizable(shape) || areaSf <= 0) return shape;
  if (shape.kind === 'circle') return { ...shape, radiusFt: radiusFromArea(areaSf) };
  const k = Math.sqrt(areaSf / sizableArea(shape));
  return { ...shape, widthFt: shape.widthFt * k, heightFt: shape.heightFt * k };
}

/** A shape of `kind` with the same area (circle → square, rectangle → circle). */
export function convertShape(shape: SizableShape, kind: SizableKind): SizableShape {
  if (shape.kind === kind) return shape;
  const area = sizableArea(shape);
  if (kind === 'circle') return { kind: 'circle', radiusFt: radiusFromArea(area) };
  const side = Math.sqrt(area);
  return { kind: 'rect', widthFt: side, heightFt: side };
}

/** A new shape of `kind` whose half-extent is `sizeFt` (the bubble tool). */
export function newShape(kind: SizableKind, sizeFt: number): SizableShape {
  return kind === 'circle'
    ? { kind: 'circle', radiusFt: sizeFt }
    : { kind: 'rect', widthFt: sizeFt * 2, heightFt: sizeFt * 2 };
}

/** World position of the resize handle: right edge of a circle, bottom-right corner of a rectangle. */
export function resizeHandle(node: BubbleNode): Point | null {
  switch (node.shape.kind) {
    case 'circle':
      return { x: node.x + node.shape.radiusFt, y: node.y };
    case 'rect':
      return { x: node.x + node.shape.widthFt / 2, y: node.y + node.shape.heightFt / 2 };
    case 'blob':
      return null;
  }
}

/** Half-extent (see shapeSize) that puts the resize handle at `p`. */
export function sizeAtHandle(node: BubbleNode, p: Point): number {
  const dx = p.x - node.x;
  const dy = p.y - node.y;
  switch (node.shape.kind) {
    case 'circle':
      return Math.hypot(dx, dy);
    case 'rect':
      // proportional: whichever axis the pointer pushes further
      return Math.max(Math.abs(dx), (Math.abs(dy) * node.shape.widthFt) / node.shape.heightFt);
    case 'blob':
      return 0;
  }
}

// ------------------------------------------------------------------ nodes

/** Area in sf. */
export function nodeArea(node: BubbleNode, project: Project): number {
  return isSizable(node.shape) ? sizableArea(node.shape) : blobGeometry(node, project).area;
}

/** Characteristic radius: the real one for circles, area-equivalent otherwise. */
export function nodeSize(node: BubbleNode, project: Project): number {
  return node.shape.kind === 'circle' ? node.shape.radiusFt : radiusFromArea(nodeArea(node, project));
}

/** Width available to the label, feet (it wraps to this). */
export function labelWidthFt(node: BubbleNode, project: Project): number {
  switch (node.shape.kind) {
    case 'circle':
      return node.shape.radiusFt * 1.6;
    case 'rect':
      return node.shape.widthFt * 0.85;
    case 'blob':
      return nodeSize(node, project) * 1.2;
  }
}

/** Visual center (label position, connection origin). */
export function nodeCenter(node: BubbleNode, project: Project): Point {
  return node.shape.kind === 'blob' ? blobGeometry(node, project).labelAt : { x: node.x, y: node.y };
}

/** Outline polygon in world feet; null for circles (they are exact). */
export function nodeOutline(node: BubbleNode, project: Project): Point[] | null {
  switch (node.shape.kind) {
    case 'circle':
      return null;
    case 'rect': {
      const w = node.shape.widthFt / 2;
      const h = node.shape.heightFt / 2;
      const { x, y } = node;
      return [
        { x: x - w, y: y - h },
        { x: x + w, y: y - h },
        { x: x + w, y: y + h },
        { x: x - w, y: y + h },
      ];
    }
    case 'blob':
      return blobGeometry(node, project).poly;
  }
}

export function nodeBounds(node: BubbleNode, project: Project): Bounds {
  const poly = nodeOutline(node, project);
  if (!poly) {
    const r = shapeSize(node.shape);
    return { minX: node.x - r, minY: node.y - r, maxX: node.x + r, maxY: node.y + r };
  }
  if (poly.length === 0) return { minX: node.x, minY: node.y, maxX: node.x, maxY: node.y };
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of poly) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  return { minX, minY, maxX, maxY };
}

export function unionBounds(list: Bounds[]): Bounds | null {
  if (list.length === 0) return null;
  return list.reduce((a, b) => ({
    minX: Math.min(a.minX, b.minX),
    minY: Math.min(a.minY, b.minY),
    maxX: Math.max(a.maxX, b.maxX),
    maxY: Math.max(a.maxY, b.maxY),
  }));
}

export function containsPoint(node: BubbleNode, p: Point, project: Project): boolean {
  const poly = nodeOutline(node, project);
  return poly ? pointInPolygon(p, poly) : Math.hypot(p.x - node.x, p.y - node.y) <= shapeSize(node.shape);
}

/** Does the shape touch the axis-aligned rectangle? (marquee selection) */
export function intersectsRect(node: BubbleNode, r: Bounds, project: Project): boolean {
  const poly = nodeOutline(node, project);
  if (!poly) {
    const cx = Math.max(r.minX, Math.min(node.x, r.maxX));
    const cy = Math.max(r.minY, Math.min(node.y, r.maxY));
    return Math.hypot(node.x - cx, node.y - cy) <= shapeSize(node.shape);
  }
  if (poly.some((p) => p.x >= r.minX && p.x <= r.maxX && p.y >= r.minY && p.y <= r.maxY)) return true;
  const b = nodeBounds(node, project);
  // the marquee may sit entirely inside the shape, or cross it without containing a corner
  const overlaps = b.minX <= r.maxX && b.maxX >= r.minX && b.minY <= r.maxY && b.maxY >= r.minY;
  return overlaps && (node.shape.kind === 'rect' || pointInPolygon(boundsCenter(r), poly));
}

/** Point on the node's boundary in the direction of `toward` (from its center). */
export function boundaryPoint(node: BubbleNode, toward: Point, project: Project): Point {
  const c = nodeCenter(node, project);
  const dx = toward.x - c.x;
  const dy = toward.y - c.y;
  const len = Math.hypot(dx, dy) || 1;
  const d = { x: dx / len, y: dy / len };
  const poly = nodeOutline(node, project);
  if (!poly) return { x: c.x + d.x * shapeSize(node.shape), y: c.y + d.y * shapeSize(node.shape) };
  // first crossing of the ray from the center with the outline
  let best = Infinity;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const ex = b.x - a.x;
    const ey = b.y - a.y;
    const den = d.x * ey - d.y * ex;
    if (Math.abs(den) < 1e-12) continue;
    const t = ((a.x - c.x) * ey - (a.y - c.y) * ex) / den;
    const u = ((a.x - c.x) * d.y - (a.y - c.y) * d.x) / den;
    if (u >= 0 && u <= 1 && t > 1e-9 && t < best) best = t;
  }
  return best === Infinity ? c : { x: c.x + d.x * best, y: c.y + d.y * best };
}

/**
 * Edge-to-edge segment between two nodes. Returns null when the shapes
 * overlap so much that there is no visible gap.
 */
export function connectionSegment(a: BubbleNode, b: BubbleNode, project: Project): [Point, Point] | null {
  const ca = nodeCenter(a, project);
  const cb = nodeCenter(b, project);
  const p1 = boundaryPoint(a, cb, project);
  const p2 = boundaryPoint(b, ca, project);
  const dist = Math.hypot(cb.x - ca.x, cb.y - ca.y);
  const ra = Math.hypot(p1.x - ca.x, p1.y - ca.y);
  const rb = Math.hypot(p2.x - cb.x, p2.y - cb.y);
  if (dist <= ra + rb) return null;
  return [p1, p2];
}

export function boundsCenter(b: Bounds): Point {
  return { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 };
}
