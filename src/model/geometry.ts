/**
 * Shape geometry. Every `switch (shape.kind)` in the app should live here so
 * adding ellipses / rounded rectangles is a local change. Node-level functions
 * take the project because blob geometry depends on the bubbles it hugs.
 */
import type { Bounds, BubbleNode, Point, Project, Shape } from './types';
import { blobGeometry } from './blob';
import { pointInPolygon } from './polygon';

export function radiusFromArea(areaSf: number): number {
  return Math.sqrt(Math.max(0, areaSf) / Math.PI);
}

/** Radius for circles; 0 for shapes without one (use nodeSize for a characteristic size). */
export function shapeSize(shape: Shape): number {
  switch (shape.kind) {
    case 'circle':
      return shape.radiusFt;
    case 'blob':
      return 0;
  }
}

export function withSize(shape: Shape, sizeFt: number): Shape {
  switch (shape.kind) {
    case 'circle':
      return { ...shape, radiusFt: sizeFt };
    case 'blob':
      return shape;
  }
}

/** Area in sf. */
export function nodeArea(node: BubbleNode, project: Project): number {
  switch (node.shape.kind) {
    case 'circle':
      return Math.PI * node.shape.radiusFt * node.shape.radiusFt;
    case 'blob':
      return blobGeometry(node, project).area;
  }
}

/** Characteristic radius: the real one for circles, area-equivalent otherwise. */
export function nodeSize(node: BubbleNode, project: Project): number {
  return node.shape.kind === 'circle' ? node.shape.radiusFt : radiusFromArea(nodeArea(node, project));
}

/** Visual center (label position, connection origin). */
export function nodeCenter(node: BubbleNode, project: Project): Point {
  switch (node.shape.kind) {
    case 'circle':
      return { x: node.x, y: node.y };
    case 'blob':
      return blobGeometry(node, project).labelAt;
  }
}

export function nodeBounds(node: BubbleNode, project: Project): Bounds {
  switch (node.shape.kind) {
    case 'circle': {
      const r = node.shape.radiusFt;
      return { minX: node.x - r, minY: node.y - r, maxX: node.x + r, maxY: node.y + r };
    }
    case 'blob': {
      const poly = blobGeometry(node, project).poly;
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
  }
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
  switch (node.shape.kind) {
    case 'circle':
      return Math.hypot(p.x - node.x, p.y - node.y) <= node.shape.radiusFt;
    case 'blob':
      return pointInPolygon(p, blobGeometry(node, project).poly);
  }
}

/** Does the shape touch the axis-aligned rectangle? (marquee selection) */
export function intersectsRect(node: BubbleNode, r: Bounds, project: Project): boolean {
  switch (node.shape.kind) {
    case 'circle': {
      const cx = Math.max(r.minX, Math.min(node.x, r.maxX));
      const cy = Math.max(r.minY, Math.min(node.y, r.maxY));
      return Math.hypot(node.x - cx, node.y - cy) <= node.shape.radiusFt;
    }
    case 'blob': {
      const poly = blobGeometry(node, project).poly;
      if (poly.some((p) => p.x >= r.minX && p.x <= r.maxX && p.y >= r.minY && p.y <= r.maxY)) return true;
      return pointInPolygon({ x: (r.minX + r.maxX) / 2, y: (r.minY + r.maxY) / 2 }, poly);
    }
  }
}

/** Point on the node's boundary in the direction of `toward` (from its center). */
export function boundaryPoint(node: BubbleNode, toward: Point, project: Project): Point {
  const c = nodeCenter(node, project);
  const dx = toward.x - c.x;
  const dy = toward.y - c.y;
  const len = Math.hypot(dx, dy) || 1;
  switch (node.shape.kind) {
    case 'circle':
      return { x: c.x + (dx / len) * node.shape.radiusFt, y: c.y + (dy / len) * node.shape.radiusFt };
    case 'blob': {
      // first crossing of the ray from the center with the outline
      const poly = blobGeometry(node, project).poly;
      const d = { x: dx / len, y: dy / len };
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
  }
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
