/** Connect tool: click A then B, or drag from A and release on B. */
import { getDoc } from '../../store/documentStore';
import { useUi } from '../../store/uiStore';
import * as A from '../../store/actions';
import { overlay } from '../overlayStore';
import { hitAt } from '../query';
import { topNodeAt } from '../hitTest';
import type { Tool } from './types';

export const connectTool: Tool = {
  down(e) {
    const ui = useUi.getState();
    const hit = hitAt(e.world);
    if (hit.kind === 'connection') {
      A.selectConnection(hit.id);
      return null;
    }
    if (hit.kind !== 'node') {
      ui.setConnectFrom(null);
      return null;
    }
    if (ui.connectFrom && ui.connectFrom !== hit.id) {
      A.addConnection(ui.connectFrom, hit.id);
      ui.setConnectFrom(null);
      return null;
    }
    const from = hit.id;
    ui.setConnectFrom(from);
    return {
      move() {},
      up(up) {
        // drag-to-connect: released over a different bubble
        const target = topNodeAt(getDoc(), up.world);
        if (target && target !== from) {
          A.addConnection(from, target);
          ui.setConnectFrom(null);
          overlay().set({ pointerWorld: null });
        }
      },
    };
  },
  hover(e) {
    if (useUi.getState().connectFrom) overlay().set({ pointerWorld: e.world });
  },
  cursor: (e) => (hitAt(e.world).kind === 'node' ? 'crosshair' : 'default'),
};
