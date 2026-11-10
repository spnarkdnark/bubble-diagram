/** Screen <-> world conversions, always reading fresh store state. */
import type { Point } from '../model/types';
import { pxPerFt } from '../model/units';
import { getDoc } from '../store/documentStore';
import { useUi } from '../store/uiStore';

/** Stage scale: screen px per world foot at the current zoom. */
export function currentK(): number {
  return pxPerFt(getDoc().settings.scale, useUi.getState().view.zoom);
}

export function clientToScreen(el: HTMLElement, clientX: number, clientY: number): Point {
  const r = el.getBoundingClientRect();
  return { x: clientX - r.left, y: clientY - r.top };
}

export function screenToWorld(s: Point): Point {
  const { panX, panY } = useUi.getState().view;
  const k = currentK();
  return { x: (s.x - panX) / k, y: (s.y - panY) / k };
}

/** Convert a distance in screen pixels to feet at the current zoom. */
export function pxToFt(px: number): number {
  return px / currentK();
}
