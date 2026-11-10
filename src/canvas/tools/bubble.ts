/** Bubble tool: click to place a bubble (Shift keeps the tool active). */
import { useUi } from '../../store/uiStore';
import * as A from '../../store/actions';
import type { Tool } from './types';

export const bubbleTool: Tool = {
  down(e) {
    A.addNode(e.world);
    if (!e.shift) useUi.getState().setTool('select');
    return null;
  },
  cursor: () => 'copy',
};
