/** Bubble tool: click to place a circle or square (uiStore.bubbleKind); Shift keeps the tool active. */
import { useUi } from '../../store/uiStore';
import * as A from '../../store/actions';
import { newShape } from '../../model/geometry';
import { DEFAULT_RADIUS_FT } from '../../model/defaults';
import type { Tool } from './types';

export const bubbleTool: Tool = {
  down(e) {
    A.addNode(e.world, { shape: newShape(useUi.getState().bubbleKind, DEFAULT_RADIUS_FT) });
    if (!e.shift) useUi.getState().setTool('select');
    return null;
  },
  cursor: () => 'copy',
};
