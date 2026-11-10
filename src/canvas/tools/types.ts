import type { Point } from '../../model/types';

/** A pointer event already converted to screen and world coordinates. */
export interface CanvasEvent {
  world: Point;
  /** px relative to the canvas */
  screen: Point;
  shift: boolean;
  alt: boolean;
}

/** The rest of a press-drag-release started by a tool's `down`. */
export interface Gesture {
  move(e: CanvasEvent): void;
  up(e: CanvasEvent): void;
}

export interface Tool {
  /** Left button pressed on the canvas. Return a gesture to receive the drag. */
  down(e: CanvasEvent): Gesture | null;
  /** Pointer moved with no gesture in progress. */
  hover?(e: CanvasEvent): void;
  doubleClick?(e: CanvasEvent): void;
  cursor(e: CanvasEvent): string;
}

/** Pixels the pointer must travel before a press becomes a drag. */
export const DRAG_THRESHOLD_PX = 3;

export function screenDistance(a: CanvasEvent, b: CanvasEvent): number {
  return Math.hypot(a.screen.x - b.screen.x, a.screen.y - b.screen.y);
}
