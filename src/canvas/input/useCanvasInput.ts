/**
 * Pointer plumbing for the canvas: panning (Space+drag / middle button),
 * routing presses to the active tool, window-level drag tracking (so drags
 * continue outside the canvas), double-clicks, the wheel and the cursor.
 */
import { useEffect, useRef, type RefObject } from 'react';
import { useUi } from '../../store/uiStore';
import { pointer } from '../pointer';
import { overlay } from '../overlayStore';
import { TOOLS } from '../tools';
import type { CanvasEvent, Gesture } from '../tools/types';
import { clientToScreen, screenToWorld } from '../viewport';
import { createWheelHandler } from './wheel';

type MouseLike = { clientX: number; clientY: number; shiftKey: boolean; altKey: boolean };

export function useCanvasInput(container: RefObject<HTMLDivElement | null>) {
  const gesture = useRef<Gesture | null>(null);
  const pan = useRef<{ sx: number; sy: number; panX: number; panY: number } | null>(null);

  const toEvent = (e: MouseLike): CanvasEvent => {
    const screen = clientToScreen(container.current!, e.clientX, e.clientY);
    return { screen, world: screenToWorld(screen), shift: e.shiftKey, alt: e.altKey };
  };
  const activeTool = () => TOOLS[useUi.getState().tool];

  const onMouseDown = (e: React.MouseEvent) => {
    const ui = useUi.getState();
    (document.activeElement as HTMLElement | null)?.blur?.();
    if (e.button === 1 || (e.button === 0 && ui.spaceDown)) {
      e.preventDefault();
      pan.current = { sx: e.clientX, sy: e.clientY, panX: ui.view.panX, panY: ui.view.panY };
      return;
    }
    if (e.button === 0) gesture.current = activeTool().down(toEvent(e));
  };

  const onDoubleClick = (e: React.MouseEvent) => activeTool().doubleClick?.(toEvent(e));

  const onMouseLeave = () => {
    pointer.inside = false;
    overlay().set({ pointerWorld: null, snapHint: gesture.current ? overlay().snapHint : null });
  };

  useEffect(() => {
    const el = container.current!;
    const inside = (e: MouseEvent) => {
      const r = el.getBoundingClientRect();
      return e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
    };

    const onMove = (e: MouseEvent) => {
      if (pan.current) {
        const p = pan.current;
        useUi.getState().setView({ panX: p.panX + e.clientX - p.sx, panY: p.panY + e.clientY - p.sy });
        return;
      }
      const ev = toEvent(e);
      pointer.world = ev.world;
      pointer.inside = inside(e);
      if (gesture.current) return gesture.current.move(ev);
      const tool = activeTool();
      tool.hover?.(ev);
      if (pointer.inside) el.style.cursor = useUi.getState().spaceDown ? 'grab' : tool.cursor(ev);
    };

    const onUp = (e: MouseEvent) => {
      pan.current = null;
      const g = gesture.current;
      gesture.current = null;
      g?.up(toEvent(e));
    };

    const wheel = createWheelHandler();
    const onWheel = (e: WheelEvent) => {
      const ev = toEvent(e);
      wheel(e, ev.screen, ev.world);
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      el.removeEventListener('wheel', onWheel);
    };
    // the handlers read live store state, so they never need re-binding
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Space shows the pan cursor immediately, without waiting for a mouse move
  const spaceDown = useUi((s) => s.spaceDown);
  useEffect(() => {
    if (container.current) container.current.style.cursor = spaceDown ? 'grab' : 'default';
  }, [spaceDown, container]);

  // switching tools drops any leftover preview (snap ring, rubber band)
  const tool = useUi((s) => s.tool);
  useEffect(() => {
    overlay().set({ pointerWorld: null, snapHint: null, stroke: null, marquee: null });
  }, [tool]);

  return { onMouseDown, onDoubleClick, onMouseLeave };
}
