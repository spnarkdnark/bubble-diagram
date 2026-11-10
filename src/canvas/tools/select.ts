/**
 * Select tool: click/shift-click/marquee selection, moving, the circle resize
 * handle, shape point editing, overlap markers and in-place name/area editing.
 */
import type { Id, Point } from '../../model/types';
import { blobGeometry, movePoint } from '../../model/blob';
import { shapeSize, withSize } from '../../model/geometry';
import { MIN_RADIUS_FT } from '../../model/defaults';
import { formatFeetInches, snap } from '../../model/units';
import { getDoc, useDocument } from '../../store/documentStore';
import { useUi } from '../../store/uiStore';
import * as A from '../../store/actions';
import { overlay, rectFrom } from '../overlayStore';
import { hitAt, labelAt, pointEditTarget, shapePointAt, snapAt } from '../query';
import { pxToFt } from '../viewport';
import { DRAG_THRESHOLD_PX, screenDistance, type CanvasEvent, type Gesture, type Tool } from './types';

const gesture = () => useDocument.getState();
/** true when the user pressed Esc mid-drag (the document gesture was cancelled) */
const cancelled = () => !gesture().gestureBase;

function moveGesture(start: CanvasEvent, clicked: Id, wasSelected: boolean): Gesture {
  const doc = getDoc();
  const origins = new Map<Id, Point>(
    useUi.getState().selection.nodes.map((id) => [id, { x: doc.nodes[id].x, y: doc.nodes[id].y }]),
  );
  let moved = false;
  let dead = false;
  return {
    move(e) {
      if (dead) return;
      if (!moved) {
        if (screenDistance(e, start) < DRAG_THRESHOLD_PX) return;
        moved = true;
        gesture().beginGesture();
      } else if (cancelled()) {
        dead = true;
        return;
      }
      const dx = e.world.x - start.world.x;
      const dy = e.world.y - start.world.y;
      gesture().preview((d) => {
        for (const [id, o] of origins) {
          if (!d.nodes[id]) continue;
          d.nodes[id].x = o.x + dx;
          d.nodes[id].y = o.y + dy;
        }
      });
    },
    up(e) {
      const ui = useUi.getState();
      if (moved) gesture().endGesture();
      else if (!e.shift && ui.selection.nodes.length > 1) A.selectNodes([clicked]);
      // click on the name or area of the already-selected element: edit it in place
      else if (wasSelected && ui.selection.nodes.length === 1) {
        const label = labelAt(e.world);
        if (label?.id === clicked) ui.setEditingLabel(label);
      }
    },
  };
}

function resizeGesture(id: Id): Gesture {
  gesture().beginGesture();
  const ui = useUi.getState();
  let dead = false;
  return {
    move(e) {
      const n = getDoc().nodes[id];
      if (dead || !n || cancelled()) {
        dead = true;
        ui.setReadout(null);
        return;
      }
      let r = Math.hypot(e.world.x - n.x, e.world.y - n.y);
      if (!e.shift) r = snap(r, getDoc().settings.snap.radiusIncrementFt);
      r = Math.max(MIN_RADIUS_FT, r);
      gesture().preview((d) => {
        d.nodes[id].shape = withSize(d.nodes[id].shape, r);
      });
      ui.setReadout({ text: `R ${formatFeetInches(r)}`, at: { x: n.x + r, y: n.y } });
    },
    up() {
      gesture().endGesture();
      ui.setReadout(null);
    },
  };
}

function marqueeGesture(start: CanvasEvent, additive: boolean): Gesture {
  return {
    move(e) {
      overlay().set({ marquee: rectFrom(start.world, e.world) });
    },
    up(e) {
      overlay().set({ marquee: null });
      if (screenDistance(e, start) < DRAG_THRESHOLD_PX) return;
      A.selectNodes(A.nodesInRect(rectFrom(start.world, e.world)), additive);
    },
  };
}

function shapePointGesture(id: Id, index: number): Gesture {
  let moved = false;
  let dead = false;
  return {
    move(e) {
      const node = getDoc().nodes[id];
      if (dead || node?.shape.kind !== 'blob') return;
      if (!moved) {
        moved = true;
        gesture().beginGesture();
      } else if (cancelled()) {
        dead = true;
        overlay().set({ snapHint: null });
        return;
      }
      const { snap, hint } = e.alt ? { snap: null, hint: null } : snapAt(e.world, id);
      overlay().set({ snapHint: hint });
      const shape = movePoint(node, index, e.world, snap);
      gesture().preview((d) => {
        d.nodes[id].shape = shape;
      });
    },
    up() {
      if (moved) gesture().endGesture();
      overlay().set({ snapHint: null });
    },
  };
}

export const selectTool: Tool = {
  down(e) {
    const ui = useUi.getState();
    const point = shapePointAt(e.world);
    if (point) return shapePointGesture(point.id, point.index);
    const hit = hitAt(e.world);
    switch (hit.kind) {
      case 'handle':
        return resizeGesture(hit.id);
      case 'node': {
        const isSel = ui.selection.nodes.includes(hit.id);
        if (e.shift) {
          A.toggleNodeSelection(hit.id);
          if (isSel) return null; // deselected: no drag
        } else if (!isSel) A.selectNodes([hit.id]);
        return moveGesture(e, hit.id, isSel && !e.shift);
      }
      case 'connection':
        A.selectConnection(hit.id, e.shift);
        return null;
      case 'overlap':
        ui.select({ overlaps: [hit.key] });
        return null;
      case 'empty':
        if (!e.shift) ui.clearSelection();
        return marqueeGesture(e, e.shift);
    }
  },

  doubleClick(e) {
    const ui = useUi.getState();
    const point = shapePointAt(e.world);
    if (point) return A.deleteBlobPoint(point.id, point.index);
    const label = labelAt(e.world);
    if (label) {
      A.selectNodes([label.id]);
      ui.setEditingLabel(label);
      return;
    }
    // on the edge of the selected shape: insert a point
    const target = pointEditTarget();
    if (!target) return;
    const geo = blobGeometry(getDoc().nodes[target], getDoc());
    let best = -1;
    let bestDist = Infinity;
    geo.poly.forEach((q, i) => {
      const d = Math.hypot(q.x - e.world.x, q.y - e.world.y);
      if (d < bestDist) {
        bestDist = d;
        best = i;
      }
    });
    if (best >= 0 && bestDist < pxToFt(10)) A.insertBlobPoint(target, geo.seg[best], e.world);
  },

  cursor(e) {
    const ui = useUi.getState();
    if (shapePointAt(e.world)) return 'grab';
    if (ui.selection.nodes.length === 1 && labelAt(e.world)?.id === ui.selection.nodes[0]) return 'text';
    const hit = hitAt(e.world);
    if (hit.kind === 'handle') return 'ew-resize';
    if (hit.kind === 'node') return 'move';
    if (hit.kind === 'connection' || hit.kind === 'overlap') return 'pointer';
    return 'default';
  },
};

/** Radius readout position for a circle (used by the wheel resize too). */
export function radiusReadout(id: Id) {
  const n = getDoc().nodes[id];
  const r = shapeSize(n.shape);
  return { text: `R ${formatFeetInches(r)}`, at: { x: n.x + r, y: n.y } };
}
