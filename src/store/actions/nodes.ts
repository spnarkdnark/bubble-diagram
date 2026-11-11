/** Creating, editing, moving, duplicating and deleting elements (sizing: size.ts). */
import type { Draft } from 'immer';
import type { BubbleNode, Id, Point } from '../../model/types';
import { createNode, newId } from '../../model/factory';
import { DUPLICATE_OFFSET_FT } from '../../model/defaults';
import { detachAnchors, remapBlob } from '../../model/blob';
import { getDoc } from '../documentStore';
import { commit, ui } from './shared';

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
  const doc = getDoc();
  // shapes hugging deleted bubbles keep their outline: anchors become free points
  const detached = Object.values(doc.nodes)
    .filter(
      (n) =>
        n.shape.kind === 'blob' &&
        !nodeSet.has(n.id) &&
        n.shape.points.some((p) => p.t === 'anchor' && nodeSet.has(p.node)),
    )
    .map((n) => ({ id: n.id, shape: detachAnchors(n, doc, (id) => nodeSet.has(id)) }));
  commit((d) => {
    for (const x of detached) d.nodes[x.id].shape = x.shape;
    for (const id of nodes) delete d.nodes[id];
    d.nodeOrder = d.nodeOrder.filter((id) => !nodeSet.has(id));
    for (const c of Object.values(d.connections)) {
      if (connections.includes(c.id) || nodeSet.has(c.from) || nodeSet.has(c.to)) delete d.connections[c.id];
    }
    for (const k of Object.keys(d.overlaps)) if (k.split('|').some((id) => nodeSet.has(id))) delete d.overlaps[k];
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
      const copy = { ...structuredClone(src), id: nid, x: src.x + DUPLICATE_OFFSET_FT, y: src.y + DUPLICATE_OFFSET_FT };
      if (copy.shape.kind === 'blob') copy.shape = remapBlob(src, doc, map);
      d.nodes[nid] = copy;
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

/** Rename from the on-canvas editor: one undo step; empty names are ignored. */
export function renameNode(id: Id, name: string) {
  const n = getDoc().nodes[id];
  const clean = name.replace(/\s+$/g, '');
  if (!n || !clean.trim() || clean === n.name) return;
  updateNodes([id], (d) => void (d.name = clean));
}
