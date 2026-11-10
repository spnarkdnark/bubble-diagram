/** Selection operations (selection itself lives in uiStore and is not undoable). */
import type { Id } from '../../model/types';
import { intersectsRect } from '../../model/geometry';
import { getDoc, useDocument } from '../documentStore';
import { ui } from './shared';

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
  return d.nodeOrder.filter((id) => intersectsRect(d.nodes[id], rect, d));
}

/** Keep the selection consistent with the document (after undo/delete/load). */
export function installSelectionPruning() {
  return useDocument.subscribe((s, prev) => {
    if (s.history.present === prev.history.present) return;
    const d = s.history.present;
    const sel = ui().selection;
    const nodes = sel.nodes.filter((id) => d.nodes[id]);
    const connections = sel.connections.filter((id) => d.connections[id]);
    const overlaps = sel.overlaps.filter((k) => k.split('|').every((id) => d.nodes[id]));
    if (
      nodes.length !== sel.nodes.length ||
      connections.length !== sel.connections.length ||
      overlaps.length !== sel.overlaps.length
    )
      ui().select({ nodes, connections, overlaps });
    const cf = ui().connectFrom;
    if (cf && !d.nodes[cf]) ui().setConnectFrom(null);
  });
}
