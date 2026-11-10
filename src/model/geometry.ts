/**
 * Shape geometry. Every `switch (shape.kind)` in the app should live here so
 * adding ellipses / rounded rectangles is a local change.
 */
import type { Bounds, BubbleNode, Point, Project, Shape } from './types';

export function shapeArea(shape: Shape): number {
  switch (shape.kind) {
    case 'circle':
      return Math.PI * shape.radiusFt * shape.radiusFt;
  }
}

/** Area in sf. `project` is needed by shapes whose geometry depends on other nodes. */
export function nodeArea(node: BubbleNode, _project?: Project): number {
  return shapeArea(node.shape);
}

export function isCircle(node: BubbleNode): boolean {
  return node.shape.kind === 'circle';
}

export function radiusFromArea(areaSf: number): number {
  return Math.sqrt(Math.max(0, areaSf) / Math.PI);
}

/** Primary size handle value (radius for circles). */
export function shapeSize(shape: Shape): number {
  switch (shape.kind) {
    case 'circle':
      return shape.radiusFt;
  }
}

export function withSize(shape: Shape, sizeFt: number): Shape {
  switch (shape.kind) {
    case 'circle':
      return { ...shape, radiusFt: sizeFt };
  }
}

/** Half-extents of the shape's axis-aligned bounding box. */
export function shapeExtents(shape: Shape): { hx: number; hy: number } {
  switch (shape.kind) {
    case 'circle':
      return { hx: shape.radiusFt, hy: shape.radiusFt };
  }
}

export function nodeBounds(node: BubbleNode): Bounds {
  const { hx, hy } = shapeExtents(node.shape);
  return { minX: node.x - hx, minY: node.y - hy, maxX: node.x + hx, maxY: node.y + hy };
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

export function containsPoint(node: BubbleNode, p: Point): boolean {
  switch (node.shape.kind) {
    case 'circle':
      return Math.hypot(p.x - node.x, p.y - node.y) <= node.shape.radiusFt;
  }
}

/** Does the shape touch the axis-aligned rectangle? (marquee selection) */
export function intersectsRect(node: BubbleNode, r: Bounds): boolean {
  switch (node.shape.kind) {
    case 'circle': {
      const cx = Math.max(r.minX, Math.min(node.x, r.maxX));
      const cy = Math.max(r.minY, Math.min(node.y, r.maxY));
      return Math.hypot(node.x - cx, node.y - cy) <= node.shape.radiusFt;
    }
  }
}

/** Point on the node's boundary in the direction of `toward`. */
export function boundaryPoint(node: BubbleNode, toward: Point): Point {
  const dx = toward.x - node.x;
  const dy = toward.y - node.y;
  const len = Math.hypot(dx, dy) || 1;
  switch (node.shape.kind) {
    case 'circle':
      return { x: node.x + (dx / len) * node.shape.radiusFt, y: node.y + (dy / len) * node.shape.radiusFt };
  }
}

/**
 * Edge-to-edge segment between two nodes. Returns null when the shapes
 * overlap so much that there is no visible gap.
 */
export function connectionSegment(a: BubbleNode, b: BubbleNode): [Point, Point] | null {
  const p1 = boundaryPoint(a, b);
  const p2 = boundaryPoint(b, a);
  const dist = Math.hypot(b.x - a.x, b.y - a.y);
  const ra = Math.hypot(p1.x - a.x, p1.y - a.y);
  const rb = Math.hypot(p2.x - b.x, p2.y - b.y);
  if (dist <= ra + rb) return null;
  return [p1, p2];
}

export function boundsCenter(b: Bounds): Point {
  return { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 };
}
