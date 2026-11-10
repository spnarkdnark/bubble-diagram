/** Transient, non-document visuals drawn over the canvas while tools are in use. */
import { create } from 'zustand';
import type { Bounds, Point } from '../model/types';

export interface SnapHint {
  /** ring center and radius, feet */
  x: number;
  y: number;
  R: number;
  /** the snapped point */
  at: Point;
}

interface OverlayState {
  marquee: Bounds | null;
  /** cursor position for rubber bands and the shape draft preview */
  pointerWorld: Point | null;
  /** raw freehand stroke while drawing a shape */
  stroke: Point[] | null;
  snapHint: SnapHint | null;
  set: (patch: Partial<Omit<OverlayState, 'set'>>) => void;
}

export const useOverlay = create<OverlayState>((set) => ({
  marquee: null,
  pointerWorld: null,
  stroke: null,
  snapHint: null,
  set: (patch) => set(patch),
}));

export const overlay = () => useOverlay.getState();

export function rectFrom(a: Point, b: Point): Bounds {
  return { minX: Math.min(a.x, b.x), minY: Math.min(a.y, b.y), maxX: Math.max(a.x, b.x), maxY: Math.max(a.y, b.y) };
}
