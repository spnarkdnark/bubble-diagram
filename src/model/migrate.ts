import type { Project } from './types';
import { SCHEMA_VERSION } from './types';
import { DEFAULT_LABEL, DEFAULT_NODE_STYLE, DEFAULT_SETTINGS } from './defaults';
import { SCALES } from './units';

export class ProjectFormatError extends Error {}

/**
 * Validate an unknown JSON value and upgrade it to the current schema.
 * Add a `case` per old schemaVersion when the format changes.
 */
export function migrateProject(raw: unknown): Project {
  if (!raw || typeof raw !== 'object') throw new ProjectFormatError('Not a project file.');
  const p = raw as any;
  if (typeof p.schemaVersion !== 'number') throw new ProjectFormatError('Missing schemaVersion.');
  if (p.schemaVersion > SCHEMA_VERSION)
    throw new ProjectFormatError('This file was made with a newer version of the app.');
  if (!p.nodes || typeof p.nodes !== 'object') throw new ProjectFormatError('Missing nodes.');

  // v1 is current; normalize missing/partial fields defensively.
  const settings = { ...DEFAULT_SETTINGS, ...p.settings };
  settings.grid = { ...DEFAULT_SETTINGS.grid, ...p.settings?.grid };
  settings.snap = { ...DEFAULT_SETTINGS.snap, ...p.settings?.snap };
  if (!SCALES.some((s) => s.id === settings.scale)) settings.scale = DEFAULT_SETTINGS.scale;

  const nodes: Project['nodes'] = {};
  for (const [id, n] of Object.entries<any>(p.nodes)) {
    if (!n || typeof n.x !== 'number' || typeof n.y !== 'number') continue;
    const r = n.shape?.radiusFt;
    if (n.shape?.kind !== 'circle' || typeof r !== 'number' || !(r > 0)) continue;
    nodes[id] = {
      id,
      name: String(n.name ?? ''),
      x: n.x,
      y: n.y,
      shape: { kind: 'circle', radiusFt: r },
      categoryId: n.categoryId ?? null,
      style: { ...DEFAULT_NODE_STYLE, ...n.style },
      label: { ...DEFAULT_LABEL, ...n.label },
    };
  }
  const categories: Project['categories'] = {};
  for (const [id, c] of Object.entries<any>(p.categories ?? {})) {
    categories[id] = { id, name: String(c?.name ?? 'Category'), color: String(c?.color ?? '#cccccc') };
  }
  for (const n of Object.values(nodes)) if (n.categoryId && !categories[n.categoryId]) n.categoryId = null;

  const connections: Project['connections'] = {};
  for (const [id, c] of Object.entries<any>(p.connections ?? {})) {
    if (!c || !nodes[c.from] || !nodes[c.to] || c.from === c.to) continue;
    const type = ['strong', 'near', 'visual'].includes(c.type) ? c.type : 'near';
    connections[id] = { id, from: c.from, to: c.to, type };
  }

  const order: string[] = Array.isArray(p.nodeOrder) ? p.nodeOrder.filter((id: string) => nodes[id]) : [];
  for (const id of Object.keys(nodes)) if (!order.includes(id)) order.push(id);
  const catOrder: string[] = Array.isArray(p.categoryOrder)
    ? p.categoryOrder.filter((id: string) => categories[id])
    : [];
  for (const id of Object.keys(categories)) if (!catOrder.includes(id)) catOrder.push(id);

  const now = new Date().toISOString();
  return {
    schemaVersion: SCHEMA_VERSION,
    meta: {
      name: String(p.meta?.name ?? 'Untitled diagram'),
      createdAt: p.meta?.createdAt ?? now,
      modifiedAt: p.meta?.modifiedAt ?? now,
    },
    settings,
    categories,
    categoryOrder: catOrder,
    nodes,
    nodeOrder: order,
    connections,
  };
}
