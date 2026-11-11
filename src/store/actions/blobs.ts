/** Freeform shapes (blobs): creating, pocket fill, gap and point edits. */
import type { Id, Point } from '../../model/types';
import { createNode } from '../../model/factory';
import { EXTERIOR_CATEGORY } from '../../model/defaults';
import { matchCategory } from '../../model/categories';
import { pxPerFt } from '../../model/units';
import {
  blobFromClicks,
  blobFromPocket,
  circleRings,
  deletePoint,
  insertPoint,
  toBlobShape,
  type BuildPoint,
} from '../../model/blob';
import { getDoc } from '../documentStore';
import { commit, ui } from './shared';
import { updateNodes } from './nodes';

/** Screen distance (px) within which shape points snap to a bubble's offset ring. */
export const SNAP_PX = 14;

const shapeCount = () => Object.values(getDoc().nodes).filter((n) => n.shape.kind === 'blob').length;

/** Create a blob from build points; returns its id or null when too few points. */
export function createBlob(pts: BuildPoint[]): Id | null {
  if (pts.length < 3) return null;
  const doc = getDoc();
  const { shape, origin } = toBlobShape(pts, doc.settings.shapeGapFt, circleRings(doc));
  const exterior = matchCategory(doc.categories, { name: EXTERIOR_CATEGORY });
  const n = createNode({
    name: `Outdoor ${shapeCount() + 1}`,
    x: origin.x,
    y: origin.y,
    shape,
    categoryId: exterior ?? null,
  });
  commit((d) => {
    d.nodes[n.id] = n;
    // exterior spaces sit behind the bubbles
    d.nodeOrder.unshift(n.id);
  });
  ui().select({ nodes: [n.id] });
  return n.id;
}

export function finishShapeDraft() {
  const draft = ui().shapeDraft;
  ui().setShapeDraft(null);
  if (!draft || draft.length < 3) return;
  const doc = getDoc();
  const k = pxPerFt(doc.settings.scale, ui().view.zoom);
  createBlob(blobFromClicks(draft, circleRings(doc), doc.settings.shapeGapFt, SNAP_PX / k));
}

/** Double-click in a gap between bubbles: generate the hugging shape. */
export function fillPocket(at: Point): boolean {
  const doc = getDoc();
  const k = pxPerFt(doc.settings.scale, ui().view.zoom);
  const pts = blobFromPocket(at, circleRings(doc), doc.settings.shapeGapFt, 3 / k);
  if (!pts) {
    ui().showToast('No enclosed space there. Double-click in a gap surrounded by bubbles, or draw the shape by hand.');
    return false;
  }
  return createBlob(pts) !== null;
}

export function setBlobGap(ids: Id[], gapFt: number) {
  updateNodes(ids, (n) => {
    if (n.shape.kind === 'blob') n.shape.gapFt = Math.max(0, gapFt);
  });
}

export function setShapeGapDefault(gapFt: number) {
  commit((d) => {
    d.settings.shapeGapFt = Math.max(0, gapFt);
  });
}

export function deleteBlobPoint(id: Id, index: number) {
  updateNodes([id], (n) => {
    if (n.shape.kind === 'blob') n.shape = deletePoint(n.shape, index);
  });
}

export function insertBlobPoint(id: Id, after: number, p: Point) {
  const n = getDoc().nodes[id];
  if (n?.shape.kind !== 'blob') return;
  const shape = insertPoint(n, after, p);
  updateNodes([id], (d) => void (d.shape = shape));
}
