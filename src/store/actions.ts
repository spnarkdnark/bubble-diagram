/**
 * Domain operations. UI components call these instead of mutating stores
 * directly, so every document change is undoable via commit()/gestures.
 */
import type { Draft } from 'immer';
import type {
  BubbleNode,
  Category,
  ConnectionType,
  Id,
  Point,
  Project,
  ScaleId,
} from '../model/types';
import { createCategory, createConnection, createNode, newId, nextCategoryColor } from '../model/factory';
import { findConnection } from '../model/selectors';
import { boundsCenter, intersectsRect, nodeBounds, shapeSize, unionBounds, withSize } from '../model/geometry';
import { DUPLICATE_OFFSET_FT, MIN_RADIUS_FT } from '../model/defaults';
import { pxPerFt, stepToIncrement } from '../model/units';
import { getDoc, useDocument } from './documentStore';
import { useUi } from './uiStore';

const commit = (...args: Parameters<ReturnType<typeof useDocument.getState>['commit']>) =>
  useDocument.getState().commit(...args);
const ui = () => useUi.getState();

// ---------- selection ----------

export function selectNodes(ids: Id[], additive = false) {
  const cur = ui().selection;
  const nodes = additive ? Array.from(new Set([...cur.nodes, ...ids])) : ids;
  ui().select({ nodes, connections: additive ? cur.connections : [] });
}

export function toggleNodeSelection(id: Id) {
  const cur = ui().selection;
  const nodes = cur.nodes.includes(id) ? cur.nodes.filter((n) => n !== id) : [...cur.nodes, id];
  ui().select({ nodes, connections: cur.connections });
}

export function selectConnection(id: Id, additive = false) {
  const cur = ui().selection;
  if (additive) {
    const connections = cur.connections.includes(id)
      ? cur.connections.filter((c) => c !== id)
      : [...cur.connections, id];
    ui().select({ nodes: cur.nodes, connections });
  } else ui().select({ nodes: [], connections: [id] });
}

export function selectAll() {
  const d = getDoc();
  ui().select({ nodes: [...d.nodeOrder], connections: Object.keys(d.connections) });
}

export function nodesInRect(rect: { minX: number; minY: number; maxX: number; maxY: number }): Id[] {
  const d = getDoc();
  return d.nodeOrder.filter((id) => intersectsRect(d.nodes[id], rect));
}

/** Keep the selection consistent with the document (after undo/delete/load). */
export function installSelectionPruning() {
  return useDocument.subscribe((s, prev) => {
    if (s.history.present === prev.history.present) return;
    const d = s.history.present;
    const sel = ui().selection;
    const nodes = sel.nodes.filter((id) => d.nodes[id]);
    const connections = sel.connections.filter((id) => d.connections[id]);
    if (nodes.length !== sel.nodes.length || connections.length !== sel.connections.length)
      ui().select({ nodes, connections });
    const cf = ui().connectFrom;
    if (cf && !d.nodes[cf]) ui().setConnectFrom(null);
  });
}

// ---------- nodes ----------

export function addNode(at: Point, partial: Partial<Omit<BubbleNode, 'id'>> = {}): Id {
  const n = createNode({ name: `Space ${getDoc().nodeOrder.length + 1}`, ...partial, x: at.x, y: at.y });
  commit((d) => {
    d.nodes[n.id] = n;
    d.nodeOrder.push(n.id);
  });
  ui().select({ nodes: [n.id] });
  return n.id;
}

export function updateNodes(ids: Id[], fn: (n: Draft<BubbleNode>) => void, coalesceKey?: string) {
  if (ids.length === 0) return;
  commit(
    (d) => {
      for (const id of ids) if (d.nodes[id]) fn(d.nodes[id]);
    },
    coalesceKey ? { coalesceKey: `${coalesceKey}:${ids.join(',')}` } : undefined,
  );
}

export function setRadius(ids: Id[], radiusFt: number) {
  const r = Math.max(MIN_RADIUS_FT, radiusFt);
  updateNodes(ids, (n) => {
    n.shape = withSize(n.shape, r);
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

export function nudge(ids: Id[], dx: number, dy: number) {
  updateNodes(
    ids,
    (n) => {
      n.x += dx;
      n.y += dy;
    },
    'nudge',
  );
}

export function deleteSelection() {
  const { nodes, connections } = ui().selection;
  if (nodes.length === 0 && connections.length === 0) return;
  const nodeSet = new Set(nodes);
  commit((d) => {
    for (const id of nodes) delete d.nodes[id];
    d.nodeOrder = d.nodeOrder.filter((id) => !nodeSet.has(id));
    for (const c of Object.values(d.connections)) {
      if (connections.includes(c.id) || nodeSet.has(c.from) || nodeSet.has(c.to)) delete d.connections[c.id];
    }
  });
  ui().clearSelection();
}

/** Duplicate selected nodes (and connections between them), offset, and select the copies. */
export function duplicateSelection() {
  const doc = getDoc();
  const ids = ui().selection.nodes.filter((id) => doc.nodes[id]);
  if (ids.length === 0) return;
  const map = new Map<Id, Id>();
  ids.forEach((id) => map.set(id, newId()));
  commit((d) => {
    for (const id of ids) {
      const src = doc.nodes[id];
      const nid = map.get(id)!;
      d.nodes[nid] = { ...structuredClone(src), id: nid, x: src.x + DUPLICATE_OFFSET_FT, y: src.y + DUPLICATE_OFFSET_FT };
      d.nodeOrder.push(nid);
    }
    for (const c of Object.values(doc.connections)) {
      if (map.has(c.from) && map.has(c.to)) {
        const cid = newId();
        d.connections[cid] = { id: cid, from: map.get(c.from)!, to: map.get(c.to)!, type: c.type };
      }
    }
  });
  ui().select({ nodes: ids.map((id) => map.get(id)!) });
}

export function bringToFront(ids: Id[]) {
  const set = new Set(ids);
  commit((d) => {
    d.nodeOrder = [...d.nodeOrder.filter((id) => !set.has(id)), ...d.nodeOrder.filter((id) => set.has(id))];
  });
}

// ---------- connections ----------

export function addConnection(from: Id, to: Id, type: ConnectionType = 'near'): Id | null {
  if (from === to) return null;
  const doc = getDoc();
  if (!doc.nodes[from] || !doc.nodes[to]) return null;
  const existing = findConnection(doc, from, to);
  if (existing) {
    ui().select({ connections: [existing.id] });
    return existing.id;
  }
  const c = createConnection(from, to, type);
  commit((d) => {
    d.connections[c.id] = c;
  });
  return c.id;
}

export function setConnectionType(ids: Id[], type: ConnectionType) {
  commit((d) => {
    for (const id of ids) if (d.connections[id]) d.connections[id].type = type;
  });
}

// ---------- categories ----------

export function addCategory(name = 'New category'): Id {
  const c = createCategory(name, nextCategoryColor(getDoc()));
  commit((d) => {
    d.categories[c.id] = c;
    d.categoryOrder.push(c.id);
  });
  return c.id;
}

export function updateCategory(id: Id, patch: Partial<Omit<Category, 'id'>>, coalesce = true) {
  commit(
    (d) => {
      if (d.categories[id]) Object.assign(d.categories[id], patch);
    },
    coalesce ? { coalesceKey: `cat:${id}:${Object.keys(patch).join(',')}` } : undefined,
  );
}

/** Deleting a category un-assigns its bubbles but keeps their look (color baked in). */
export function deleteCategory(id: Id) {
  commit((d) => {
    const cat = d.categories[id];
    if (!cat) return;
    for (const n of Object.values(d.nodes)) {
      if (n.categoryId === id) {
        n.categoryId = null;
        if (n.style.fill === null) n.style.fill = cat.color;
      }
    }
    delete d.categories[id];
    d.categoryOrder = d.categoryOrder.filter((c) => c !== id);
  });
}

// ---------- settings ----------

/** Change scale while keeping the view center fixed on the same world point. */
export function setScale(scale: ScaleId) {
  const doc = getDoc();
  const { view, stageSize } = ui();
  const kOld = pxPerFt(doc.settings.scale, view.zoom);
  const cx = (stageSize.width / 2 - view.panX) / kOld;
  const cy = (stageSize.height / 2 - view.panY) / kOld;
  commit((d) => {
    d.settings.scale = scale;
  });
  const kNew = pxPerFt(scale, view.zoom);
  ui().setView({ panX: stageSize.width / 2 - cx * kNew, panY: stageSize.height / 2 - cy * kNew });
}

export function setGrid(patch: Partial<Project['settings']['grid']>) {
  commit((d) => {
    Object.assign(d.settings.grid, patch);
  });
}

export function renameProject(name: string) {
  commit((d) => {
    d.meta.name = name;
  }, { coalesceKey: 'project-name' });
}

// ---------- view ----------

export function zoomAt(screen: Point, factor: number) {
  const { view } = ui();
  const zoom = Math.min(32, Math.max(0.05, view.zoom * factor));
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
  const b = unionBounds(doc.nodeOrder.map((id) => nodeBounds(doc.nodes[id])));
  if (!b) return centerOn({ x: 0, y: 0 }, 1);
  const { stageSize } = ui();
  const pad = 60;
  const k1 = pxPerFt(doc.settings.scale, 1);
  const zx = (stageSize.width - pad * 2) / ((b.maxX - b.minX) * k1);
  const zy = (stageSize.height - pad * 2) / ((b.maxY - b.minY) * k1);
  centerOn(boundsCenter(b), Math.min(4, Math.max(0.05, Math.min(zx, zy))));
}

export function viewCenterWorld(): Point {
  const { view, stageSize } = ui();
  const k = pxPerFt(getDoc().settings.scale, view.zoom);
  return { x: (stageSize.width / 2 - view.panX) / k, y: (stageSize.height / 2 - view.panY) / k };
}
