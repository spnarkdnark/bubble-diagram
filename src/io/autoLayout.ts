import type { Point } from '../model/types';

/**
 * Loose grid layout: every cell fits the largest bubble plus a gap, so nothing
 * overlaps. Returns centers (ft); `origin` is the top-left corner of the grid.
 */
export function gridLayout(radii: number[], origin: Point): Point[] {
  if (radii.length === 0) return [];
  const maxR = Math.max(...radii);
  const gap = Math.max(5, maxR * 0.5);
  const cell = maxR * 2 + gap;
  const cols = Math.ceil(Math.sqrt(radii.length));
  return radii.map((_, i) => ({
    x: origin.x + (i % cols) * cell + cell / 2,
    y: origin.y + Math.floor(i / cols) * cell + cell / 2,
  }));
}

export function gridSize(radii: number[]): { width: number; height: number } {
  if (radii.length === 0) return { width: 0, height: 0 };
  const maxR = Math.max(...radii);
  const cell = maxR * 2 + Math.max(5, maxR * 0.5);
  const cols = Math.ceil(Math.sqrt(radii.length));
  return { width: cols * cell, height: Math.ceil(radii.length / cols) * cell };
}
