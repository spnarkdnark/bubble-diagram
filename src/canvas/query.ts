/**
 * What is under the pointer? Geometric queries in world feet, shared by all tools.
 * Reads the most recently rendered scene (for labels and overlap markers).
 */
import type { BubbleNode, Id, Point, Shape } from '../model/types';
import { isSizable } from '../model/geometry';
import { blobFromClicks, blobGeometry, circleRings, snapToRing, toBlobShape, type SnapInfo } from '../model/blob';
import { getDoc } from '../store/documentStore';
import { useUi, type EditingLabel } from '../store/uiStore';
import { SNAP_PX } from '../store/actions';
import { labelRect, type Scene } from '../render/scene';
import { hitTest, type Hit } from './hitTest';
import { pxToFt } from './viewport';
import type { SnapHint } from './overlayStore';

export const HIT_TOL_PX = 7;

let latestScene: Scene | null = null;
export function setLatestScene(scene: Scene) {
  latestScene = scene;
}

/** The single selected node when its shape passes `test` (select tool only). */
function soleSelected(test: (shape: Shape) => boolean): Id | null {
  const ui = useUi.getState();
  if (ui.tool !== 'select' || ui.selection.nodes.length !== 1) return null;
  const n = getDoc().nodes[ui.selection.nodes[0]];
  return n && test(n.shape) ? n.id : null;
}

/** Circle or rectangle whose resize handle is shown. */
export const resizeTarget = () => soleSelected(isSizable);
/** Shape whose control points are editable. */
export const pointEditTarget = () => soleSelected((s) => s.kind === 'blob');

/** Overlap markers currently shown: those of selected bubbles or selected overlaps. */
export function visibleMarkers() {
  const sel = useUi.getState().selection;
  return (latestScene?.overlaps ?? []).filter(
    (o) => sel.overlaps.includes(o.key) || sel.nodes.includes(o.a) || sel.nodes.includes(o.b),
  );
}

export function hitAt(p: Point): Hit {
  return hitTest(getDoc(), p, pxToFt(HIT_TOL_PX), resizeTarget(), visibleMarkers());
}

/**
 * Editable label line under `p` (topmost node first): its name, or the size line
 * (area/dimensions) of a circle or rectangle. Freeform shapes' areas follow their
 * outline, so they aren't editable.
 */
export function labelAt(p: Point): EditingLabel | null {
  if (!latestScene) return null;
  const pad = pxToFt(3);
  const doc = getDoc();
  const nodes = latestScene.nodes;
  const inside = (r: ReturnType<typeof labelRect>) =>
    r !== null && p.x >= r.minX - pad && p.x <= r.maxX + pad && p.y >= r.minY - pad && p.y <= r.maxY + pad;
  for (let i = nodes.length - 1; i >= 0; i--) {
    const { id, label } = nodes[i];
    if (inside(labelRect(label, latestScene.ftPerPt))) return { id, part: 'name' };
    if (doc.nodes[id] && isSizable(doc.nodes[id].shape) && inside(labelRect(label, latestScene.ftPerPt, true)))
      return { id, part: 'size' };
  }
  return null;
}

/** Control point of the editable shape under `p`. */
export function shapePointAt(p: Point): { id: Id; index: number } | null {
  const id = pointEditTarget();
  if (!id) return null;
  const doc = getDoc();
  const ctrl = blobGeometry(doc.nodes[id], doc).ctrl;
  const tol = pxToFt(HIT_TOL_PX * 1.2);
  const index = ctrl.findIndex((c) => Math.hypot(p.x - c.x, p.y - c.y) <= tol);
  return index >= 0 ? { id, index } : null;
}

/** Snap `p` to a bubble's offset ring; uses the shape's own gap when editing one. */
export function snapAt(p: Point, shapeId?: Id): { snap: SnapInfo | null; hint: SnapHint | null } {
  const doc = getDoc();
  const own = shapeId ? doc.nodes[shapeId]?.shape : undefined;
  const gap = own?.kind === 'blob' ? own.gapFt : doc.settings.shapeGapFt;
  const snap = snapToRing(p, circleRings(doc), gap, pxToFt(SNAP_PX));
  if (!snap) return { snap, hint: null };
  const R = snap.ring.r + gap;
  return {
    snap,
    hint: {
      x: snap.ring.x,
      y: snap.ring.y,
      R,
      at: { x: snap.ring.x + Math.cos(snap.angle) * R, y: snap.ring.y + Math.sin(snap.angle) * R },
    },
  };
}

/** Live outline of a click-drawn shape so far, including the cursor position. */
export function draftOutline(draft: Point[], cursor: Point | null): Point[] {
  const pts = cursor ? [...draft, cursor] : draft;
  if (pts.length < 3) return pts;
  const doc = getDoc();
  const gap = doc.settings.shapeGapFt;
  const rings = circleRings(doc);
  const { shape, origin } = toBlobShape(blobFromClicks(pts, rings, gap, pxToFt(SNAP_PX)), gap, rings);
  const temp: BubbleNode = { id: '__draft', name: '', x: origin.x, y: origin.y, shape, categoryId: null, style: {} };
  return blobGeometry(temp, doc).poly;
}
