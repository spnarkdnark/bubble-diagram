/**
 * Copy/paste payloads. The clipboard carries plain-text JSON so it works
 * between tabs (and two different diagrams) via native copy/paste events.
 */
import type { BubbleNode, Category, Connection, Id, OverlapMode, Point, Project, StyleOverrides } from '../model/types';
import { boundsCenter, nodeBounds, unionBounds } from '../model/geometry';
import { createCategory, newId } from '../model/factory';
import { overlapKey } from '../model/overlaps';
export { overlapKey };

export const CLIP_TYPE = 'bubble-diagram/clip';

export interface ClipPayload {
  type: typeof CLIP_TYPE;
  v: 2;
  nodes: BubbleNode[];
  connections: Connection[];
  categories: Category[];
  overlaps: Record<string, { mode: OverlapMode }>;
  /** center of the copied content, feet */
  center: Point;
}

export function buildClip(project: Project, nodeIds: Id[]): ClipPayload | null {
  const ids = project.nodeOrder.filter((id) => nodeIds.includes(id));
  if (ids.length === 0) return null;
  const set = new Set(ids);
  const nodes = ids.map((id) => structuredClone(project.nodes[id]));
  const connections = Object.values(project.connections).filter((c) => set.has(c.from) && set.has(c.to));
  const catIds = new Set(nodes.map((n) => n.categoryId).filter(Boolean) as Id[]);
  const categories = [...catIds].map((id) => project.categories[id]).filter(Boolean);
  const overlaps: ClipPayload['overlaps'] = {};
  for (const [k, v] of Object.entries(project.overlaps)) {
    const [a, b] = k.split('|');
    if (set.has(a) && set.has(b)) overlaps[k] = v;
  }
  const b = unionBounds(nodes.map((n) => nodeBounds(n, project)))!;
  return { type: CLIP_TYPE, v: 2, nodes, connections, categories, overlaps, center: boundsCenter(b) };
}

export function parseClip(text: string): ClipPayload | null {
  if (!text || text[0] !== '{') return null;
  try {
    const c = JSON.parse(text);
    if (c?.type !== CLIP_TYPE || !Array.isArray(c.nodes)) return null;
    return c as ClipPayload;
  } catch {
    return null;
  }
}

export interface PastePlan {
  categories: Category[];
  nodes: BubbleNode[];
  connections: Connection[];
  overlaps: Record<string, { mode: OverlapMode }>;
}

/** Map a clip into new elements for `project`, centered on `at`. */
export function planPaste(project: Project, clip: ClipPayload, at: Point): PastePlan {
  const byName = new Map(Object.values(project.categories).map((c) => [c.name.trim().toLowerCase(), c.id]));
  const catMap = new Map<Id, Id>();
  const newCats: Category[] = [];
  for (const c of clip.categories) {
    const same = project.categories[c.id];
    if (same && same.name === c.name) catMap.set(c.id, c.id);
    else if (byName.has(c.name.trim().toLowerCase())) catMap.set(c.id, byName.get(c.name.trim().toLowerCase())!);
    else {
      const nc = createCategory(c.name, c.style);
      newCats.push(nc);
      catMap.set(c.id, nc.id);
      byName.set(c.name.trim().toLowerCase(), nc.id);
    }
  }
  const idMap = new Map<Id, Id>();
  clip.nodes.forEach((n) => idMap.set(n.id, newId()));
  const dx = at.x - clip.center.x;
  const dy = at.y - clip.center.y;
  const nodes = clip.nodes.map((n) => ({
    ...structuredClone(n),
    id: idMap.get(n.id)!,
    x: n.x + dx,
    y: n.y + dy,
    categoryId: n.categoryId ? catMap.get(n.categoryId) ?? null : null,
  }));
  const connections = clip.connections
    .filter((c) => idMap.has(c.from) && idMap.has(c.to))
    .map((c) => ({ ...c, id: newId(), from: idMap.get(c.from)!, to: idMap.get(c.to)! }));
  const overlaps: PastePlan['overlaps'] = {};
  for (const [k, v] of Object.entries(clip.overlaps ?? {})) {
    const [a, b] = k.split('|');
    if (idMap.has(a) && idMap.has(b)) overlaps[overlapKey(idMap.get(a)!, idMap.get(b)!)] = v;
  }
  return { categories: newCats, nodes, connections, overlaps };
}

/** The "look" of the first copied element: its category (mapped by name) and overrides. */
export function clipStyle(project: Project, clip: ClipPayload): { categoryId: Id | null; style: StyleOverrides; newCategory?: Category } | null {
  const n = clip.nodes[0];
  if (!n) return null;
  if (!n.categoryId) return { categoryId: null, style: { ...n.style } };
  const c = clip.categories.find((x) => x.id === n.categoryId);
  if (!c) return { categoryId: null, style: { ...n.style } };
  if (project.categories[c.id]?.name === c.name) return { categoryId: c.id, style: { ...n.style } };
  const match = Object.values(project.categories).find((x) => x.name.trim().toLowerCase() === c.name.trim().toLowerCase());
  if (match) return { categoryId: match.id, style: { ...n.style } };
  const nc = createCategory(c.name, c.style);
  return { categoryId: nc.id, style: { ...n.style }, newCategory: nc };
}
