/** Sizing circles and rectangles: radius, area, width/height, wheel steps, shape conversion. */
import type { Id, SizableKind } from '../../model/types';
import {
  convertShape as convertedShape,
  isSizable,
  shapeSize,
  sizableArea,
  withArea,
  withSize,
} from '../../model/geometry';
import { dimensionText, resolveStyle } from '../../model/selectors';
import { MIN_RADIUS_FT } from '../../model/defaults';
import { detachAnchors } from '../../model/blob';
import {
  formatArea,
  formatFeetInches,
  parseArea,
  parseDimensions,
  parseLength,
  stepToIncrement,
} from '../../model/units';
import { getDoc } from '../documentStore';
import { commit } from './shared';
import { updateNodes } from './nodes';

/** Set the half-extent (radius of a circle, half-width of a rectangle), keeping proportions. */
export function setRadius(ids: Id[], radiusFt: number) {
  const r = Math.max(MIN_RADIUS_FT, radiusFt);
  updateNodes(ids, (n) => {
    n.shape = withSize(n.shape, r);
  });
}

/** Exact area (unsnapped, so the sf is exact), keeping proportions. */
export function setArea(ids: Id[], areaSf: number) {
  if (areaSf <= 0) return;
  updateNodes(ids, (n) => {
    n.shape = withArea(n.shape, areaSf);
  });
}

/** Set a rectangle's width and/or height independently (this is how a square becomes a rectangle). */
export function setRectSize(ids: Id[], size: { widthFt?: number; heightFt?: number }) {
  updateNodes(ids, (n) => {
    if (n.shape.kind !== 'rect') return;
    if (size.widthFt !== undefined) n.shape.widthFt = Math.max(MIN_RADIUS_FT * 2, size.widthFt);
    if (size.heightFt !== undefined) n.shape.heightFt = Math.max(MIN_RADIUS_FT * 2, size.heightFt);
  });
}

/** Scroll-wheel resize: step each node to the next increment (one undo step per scroll burst). */
export function stepRadius(ids: Id[], dir: 1 | -1, incrementFt: number) {
  updateNodes(
    ids,
    (n) => {
      const next = stepToIncrement(shapeSize(n.shape), incrementFt, dir);
      n.shape = withSize(n.shape, Math.max(MIN_RADIUS_FT, next));
    },
    'wheel-resize',
  );
}

/**
 * Change circles/rectangles to another kind, keeping each one's area. Freeform
 * shapes hugging a circle that stops being one are frozen in place.
 */
export function convertShape(ids: Id[], kind: SizableKind) {
  const doc = getDoc();
  const changing = new Set(ids.filter((id) => doc.nodes[id] && isSizable(doc.nodes[id].shape)));
  changing.forEach((id) => doc.nodes[id].shape.kind === kind && changing.delete(id));
  if (changing.size === 0) return;
  const lostRings = new Set([...changing].filter((id) => doc.nodes[id].shape.kind === 'circle'));
  const freed = Object.values(doc.nodes)
    .filter((n) => n.shape.kind === 'blob' && n.shape.points.some((p) => p.t === 'anchor' && lostRings.has(p.node)))
    .map((n) => [n.id, detachAnchors(n, doc, (id) => lostRings.has(id))] as const);
  commit((d) => {
    for (const id of changing) {
      const s = d.nodes[id].shape;
      if (isSizable(s)) d.nodes[id].shape = convertedShape(s, kind);
    }
    for (const [id, shape] of freed) d.nodes[id].shape = shape;
  });
}

/** Text for the on-canvas size editor: the area, or the dimensions when the label shows them. */
export function sizeEditText(id: Id): string {
  const doc = getDoc();
  const n = doc.nodes[id];
  if (!n || !isSizable(n.shape)) return '';
  if (resolveStyle(n, doc).labelSecondary !== 'radius') return formatArea(sizableArea(n.shape));
  return n.shape.kind === 'circle' ? formatFeetInches(n.shape.radiusFt) : (dimensionText(n.shape) ?? '');
}

/** Resize from the on-canvas size editor (area, radius or W × H); unparseable input is ignored. */
export function setSizeFromText(id: Id, text: string) {
  const doc = getDoc();
  const n = doc.nodes[id];
  if (!n || !isSizable(n.shape) || text.trim() === sizeEditText(id)) return;
  if (resolveStyle(n, doc).labelSecondary !== 'radius') {
    const sf = parseArea(text);
    if (sf !== null && sf > 0) setArea([id], sf);
  } else if (n.shape.kind === 'circle') {
    const r = parseLength(text.replace(/^\s*r\s*/i, ''));
    if (r !== null && r > 0) setRadius([id], r);
  } else {
    const dims = parseDimensions(text);
    if (dims) setRectSize([id], dims);
  }
}
