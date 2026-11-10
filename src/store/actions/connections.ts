/** Connections between elements. */
import type { ConnectionType, Id } from '../../model/types';
import { createConnection } from '../../model/factory';
import { findConnection } from '../../model/selectors';
import { getDoc } from '../documentStore';
import { commit, ui } from './shared';

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
