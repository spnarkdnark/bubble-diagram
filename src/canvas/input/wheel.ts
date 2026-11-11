/** Wheel: zoom at the cursor, or step the size of a selected bubble under it. */
import { getDoc } from '../../store/documentStore';
import { useUi } from '../../store/uiStore';
import * as A from '../../store/actions';
import { topNodeAt } from '../hitTest';
import { sizeReadout } from '../tools/select';
import type { Point } from '../../model/types';
import { isSizable } from '../../model/geometry';

/** A wheel delta at least this big is one mouse-wheel notch; smaller deltas (trackpads) accumulate. */
const NOTCH = 40;

export function createWheelHandler() {
  let accumulated = 0;
  let readoutTimer = 0;

  return (e: WheelEvent, screen: Point, world: Point) => {
    e.preventDefault();
    const unit = e.deltaMode === 1 ? 33 : e.deltaMode === 2 ? 400 : 1;
    // Shift+wheel is reported as horizontal scroll in some browsers
    const delta = (e.deltaY || e.deltaX) * unit;
    if (e.ctrlKey || e.metaKey) return A.zoomAt(screen, Math.exp(-delta * 0.01)); // pinch / ctrl+wheel

    const ui = useUi.getState();
    const doc = getDoc();
    const over = topNodeAt(doc, world);
    const resizing =
      over && ui.tool === 'select' && ui.selection.nodes.includes(over) && isSizable(doc.nodes[over].shape);
    if (!resizing) return A.zoomAt(screen, Math.exp(-delta * 0.0015));

    let dir: 1 | -1 | 0 = 0;
    if (Math.abs(delta) >= NOTCH) {
      dir = delta < 0 ? 1 : -1;
      accumulated = 0;
    } else {
      accumulated += delta;
      if (Math.abs(accumulated) >= NOTCH) {
        dir = accumulated < 0 ? 1 : -1;
        accumulated = 0;
      }
    }
    if (!dir) return;
    const sizable = ui.selection.nodes.filter((id) => doc.nodes[id] && isSizable(doc.nodes[id].shape));
    A.stepRadius(sizable, dir, e.shiftKey ? 1 / 12 : doc.settings.snap.radiusIncrementFt);
    ui.setReadout(sizeReadout(over));
    window.clearTimeout(readoutTimer);
    readoutTimer = window.setTimeout(() => useUi.getState().setReadout(null), 900);
  };
}
