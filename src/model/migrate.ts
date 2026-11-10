import type { BlobPoint, OverlapMode, Project, Shape, StyleOverrides, StyleProps } from './types';
import { SCHEMA_VERSION } from './types';
import { DEFAULT_GRAPHIC, DEFAULT_OVERLAP, DEFAULT_SETTINGS, DEFAULT_STYLE } from './defaults';
import { SCALES } from './units';

export class ProjectFormatError extends Error {}

const STYLE_KEYS = Object.keys(DEFAULT_STYLE) as (keyof StyleProps)[];
const OVERLAP_MODES: OverlapMode[] = ['none', 'merge', 'lens', 'lensFill', 'threshold'];

/** Keep only known style keys with values of the right type. */
function cleanOverrides(raw: any): StyleOverrides {
  const out: StyleOverrides = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const k of STYLE_KEYS) {
    const v = raw[k];
    if (v === undefined) continue;
    const def = DEFAULT_STYLE[k];
    if (k === 'stroke' ? v === null || typeof v === 'string' : typeof v === typeof def) (out as any)[k] = v;
  }
  return out;
}

function fullStyle(raw: any, base: StyleProps = DEFAULT_STYLE): StyleProps {
  return { ...base, ...cleanOverrides(raw) };
}

function cleanShape(raw: any): Shape | null {
  if (raw?.kind === 'circle')
    return typeof raw.radiusFt === 'number' && raw.radiusFt > 0 ? { kind: 'circle', radiusFt: raw.radiusFt } : null;
  if (raw?.kind === 'blob' && Array.isArray(raw.points)) {
    const points: BlobPoint[] = [];
    for (const p of raw.points) {
      if (p?.t === 'free' && typeof p.x === 'number' && typeof p.y === 'number')
        points.push({ t: 'free', x: p.x, y: p.y });
      else if (p?.t === 'anchor' && typeof p.node === 'string' && typeof p.angle === 'number')
        points.push({ t: 'anchor', node: p.node, angle: p.angle, dir: p.dir === -1 ? -1 : 1, arc: !!p.arc });
    }
    return points.length >= 3 ? { kind: 'blob', points, gapFt: typeof raw.gapFt === 'number' ? raw.gapFt : 2 } : null;
  }
  return null;
}

/** v1 → v2: category.color becomes a full style; node fill/label become sparse overrides. */
function upgradeV1(p: any): any {
  const V1_STYLE = { fillOpacity: 0.85, strokeWeightPt: 0.75, strokeStyle: 'solid' };
  const V1_LABEL = { fontSizePt: 9, secondary: 'area' };
  const categories: any = {};
  for (const [id, c] of Object.entries<any>(p.categories ?? {}))
    categories[id] = { id, name: c?.name, style: { ...DEFAULT_STYLE, fill: String(c?.color ?? '#cccccc') } };
  const nodes: any = {};
  for (const [id, n] of Object.entries<any>(p.nodes ?? {})) {
    const st = n?.style ?? {};
    const lb = n?.label ?? {};
    const o: any = {};
    if (st.fill) o.fill = st.fill;
    if (st.stroke) o.stroke = st.stroke;
    if (st.fillOpacity !== undefined && st.fillOpacity !== V1_STYLE.fillOpacity) o.fillOpacity = st.fillOpacity;
    if (st.strokeWeightPt !== undefined && st.strokeWeightPt !== V1_STYLE.strokeWeightPt)
      o.strokeWeightPt = st.strokeWeightPt;
    if (st.strokeStyle && st.strokeStyle !== V1_STYLE.strokeStyle) o.strokeStyle = st.strokeStyle;
    if (lb.fontSizePt !== undefined && lb.fontSizePt !== V1_LABEL.fontSizePt) o.labelSizePt = lb.fontSizePt;
    if (lb.secondary && lb.secondary !== V1_LABEL.secondary) o.labelSecondary = lb.secondary;
    nodes[id] = { ...n, style: o };
    delete nodes[id].label;
  }
  return { ...p, schemaVersion: 2, categories, nodes };
}

/**
 * Validate an unknown JSON value and upgrade it to the current schema.
 * Add an upgrade step per old schemaVersion when the format changes.
 */
export function migrateProject(raw: unknown): Project {
  if (!raw || typeof raw !== 'object') throw new ProjectFormatError('Not a project file.');
  let p = raw as any;
  if (typeof p.schemaVersion !== 'number') throw new ProjectFormatError('Missing schemaVersion.');
  if (p.schemaVersion > SCHEMA_VERSION)
    throw new ProjectFormatError('This file was made with a newer version of the app.');
  if (!p.nodes || typeof p.nodes !== 'object') throw new ProjectFormatError('Missing nodes.');
  if (p.schemaVersion === 1) p = upgradeV1(p);

  // v2: normalize missing/partial fields defensively.
  const s = p.settings ?? {};
  const settings = {
    ...DEFAULT_SETTINGS,
    ...s,
    grid: { ...DEFAULT_SETTINGS.grid, ...s.grid },
    snap: { ...DEFAULT_SETTINGS.snap, ...s.snap },
    defaultStyle: fullStyle(s.defaultStyle),
    graphic: { ...DEFAULT_GRAPHIC, ...s.graphic },
    overlap: { ...DEFAULT_OVERLAP, ...s.overlap },
  };
  if (!SCALES.some((x) => x.id === settings.scale)) settings.scale = DEFAULT_SETTINGS.scale;

  const nodes: Project['nodes'] = {};
  for (const [id, n] of Object.entries<any>(p.nodes)) {
    if (!n || typeof n.x !== 'number' || typeof n.y !== 'number') continue;
    const shape = cleanShape(n.shape);
    if (!shape) continue;
    nodes[id] = {
      id,
      name: String(n.name ?? ''),
      x: n.x,
      y: n.y,
      shape,
      categoryId: n.categoryId ?? null,
      style: cleanOverrides(n.style),
    };
  }
  const categories: Project['categories'] = {};
  for (const [id, c] of Object.entries<any>(p.categories ?? {})) {
    categories[id] = { id, name: String(c?.name ?? 'Category'), style: fullStyle(c?.style) };
  }
  for (const n of Object.values(nodes)) if (n.categoryId && !categories[n.categoryId]) n.categoryId = null;
  // blob anchors must point at existing circles
  for (const n of Object.values(nodes)) {
    if (n.shape.kind !== 'blob') continue;
    n.shape.points = n.shape.points.filter((pt) => pt.t === 'free' || nodes[pt.node]?.shape.kind === 'circle');
    if (n.shape.points.length < 3) delete nodes[n.id];
  }

  const connections: Project['connections'] = {};
  for (const [id, c] of Object.entries<any>(p.connections ?? {})) {
    if (!c || !nodes[c.from] || !nodes[c.to] || c.from === c.to) continue;
    const type = ['strong', 'near', 'visual'].includes(c.type) ? c.type : 'near';
    connections[id] = { id, from: c.from, to: c.to, type };
  }

  const overlaps: Project['overlaps'] = {};
  for (const [key, o] of Object.entries<any>(p.overlaps ?? {})) {
    const [a, b] = key.split('|');
    if (nodes[a] && nodes[b] && OVERLAP_MODES.includes(o?.mode)) overlaps[key] = { mode: o.mode };
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
    overlaps,
  };
}
