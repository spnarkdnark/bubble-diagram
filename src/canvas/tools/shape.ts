/**
 * Shape tool: drag to draw freehand, or click to place points (closed by the
 * first point, a double-click or Enter). Double-click in a gap fills the pocket.
 */
import type { Point } from '../../model/types';
import { blobFromStroke, circleRings } from '../../model/blob';
import { getDoc } from '../../store/documentStore';
import { useUi } from '../../store/uiStore';
import * as A from '../../store/actions';
import { overlay } from '../overlayStore';
import { snapAt } from '../query';
import { pxToFt } from '../viewport';
import type { CanvasEvent, Tool } from './types';

/** Strokes shorter than this (screen px) count as clicks. */
const CLICK_PX = 6;

export const shapeTool: Tool = {
  down(start) {
    const pts: Point[] = [start.world];
    let last = start.screen;
    let length = 0;
    return {
      move(e) {
        const step = Math.hypot(e.screen.x - last.x, e.screen.y - last.y);
        if (step < 2) return;
        length += step;
        last = e.screen;
        pts.push(e.world);
        overlay().set({ stroke: length > CLICK_PX ? pts.slice() : null, snapHint: snapAt(e.world).hint });
      },
      up() {
        const ui = useUi.getState();
        overlay().set({ stroke: null, snapHint: null });
        if (length < CLICK_PX) return addDraftPoint(start);
        ui.setShapeDraft(null);
        const doc = getDoc();
        const built = blobFromStroke(pts, circleRings(doc), doc.settings.shapeGapFt, pxToFt(A.SNAP_PX), pxToFt(4));
        if (A.createBlob(built)) ui.setTool('select');
      },
    };
  },

  hover(e) {
    overlay().set({ pointerWorld: e.world, snapHint: snapAt(e.world).hint });
  },

  doubleClick(e) {
    const ui = useUi.getState();
    const draft = ui.shapeDraft ?? [];
    // each click of the double-click added a point: drop those
    const near = (q: Point) => Math.hypot(q.x - e.world.x, q.y - e.world.y) < pxToFt(8);
    const kept = draft.filter((q, i) => !(i >= draft.length - 2 && near(q)));
    if (kept.length >= 3) {
      ui.setShapeDraft(kept);
      A.finishShapeDraft();
      ui.setTool('select');
    } else if (kept.length === 0) {
      ui.setShapeDraft(null);
      if (A.fillPocket(e.world)) ui.setTool('select');
    } else ui.setShapeDraft(kept);
  },

  cursor: () => 'crosshair',
};

/** A click adds a point to the draft, or closes it when on the first point. */
function addDraftPoint(e: CanvasEvent) {
  const ui = useUi.getState();
  const draft = ui.shapeDraft ?? [];
  const first = draft[0];
  if (first && draft.length >= 3 && Math.hypot(first.x - e.world.x, first.y - e.world.y) < pxToFt(10)) {
    A.finishShapeDraft();
    ui.setTool('select');
  } else ui.setShapeDraft([...draft, e.world]);
}
