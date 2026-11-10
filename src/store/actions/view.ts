/** Zoom and pan (not undoable). */
import type { Point } from '../../model/types';
import { boundsCenter, nodeBounds, unionBounds } from '../../model/geometry';
import { pxPerFt } from '../../model/units';
import { getDoc } from '../documentStore';
import { MAX_ZOOM, MIN_ZOOM } from '../uiStore';
import { ui } from './shared';

export function zoomAt(screen: Point, factor: number) {
  const { view } = ui();
  const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, view.zoom * factor));
  const ratio = zoom / view.zoom;
  ui().setView({
    zoom,
    panX: screen.x - (screen.x - view.panX) * ratio,
    panY: screen.y - (screen.y - view.panY) * ratio,
  });
}

export function setZoom(zoom: number) {
  const { stageSize } = ui();
  zoomAt({ x: stageSize.width / 2, y: stageSize.height / 2 }, zoom / ui().view.zoom);
}

/** Center a world point in the viewport. */
export function centerOn(p: Point, zoom = ui().view.zoom) {
  const { stageSize } = ui();
  const k = pxPerFt(getDoc().settings.scale, zoom);
  ui().setView({ zoom, panX: stageSize.width / 2 - p.x * k, panY: stageSize.height / 2 - p.y * k });
}

export function zoomToFit() {
  const doc = getDoc();
  const b = unionBounds(doc.nodeOrder.map((id) => nodeBounds(doc.nodes[id], doc)));
  if (!b) return centerOn({ x: 0, y: 0 }, 1);
  const { stageSize } = ui();
  const pad = 60;
  const k1 = pxPerFt(doc.settings.scale, 1);
  const zx = (stageSize.width - pad * 2) / ((b.maxX - b.minX) * k1);
  const zy = (stageSize.height - pad * 2) / ((b.maxY - b.minY) * k1);
  centerOn(boundsCenter(b), Math.min(4, Math.max(MIN_ZOOM, Math.min(zx, zy))));
}

export function viewCenterWorld(): Point {
  const { view, stageSize } = ui();
  const k = pxPerFt(getDoc().settings.scale, view.zoom);
  return { x: (stageSize.width / 2 - view.panX) / k, y: (stageSize.height / 2 - view.panY) / k };
}
