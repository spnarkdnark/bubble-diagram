/**
 * Category standards: the categories (and the uncategorized default style) are
 * shared by every open diagram. Each Project still stores a copy so saved files
 * are self-contained; these pure functions keep copies in line with the library.
 */
import type { Category, Id, Project, StyleProps } from './types';
import { createCategory } from './factory';

export interface Standards {
  categories: Record<Id, Category>;
  categoryOrder: Id[];
  defaultStyle: StyleProps;
}

export function standardsOf(p: Project): Standards {
  return { categories: p.categories, categoryOrder: p.categoryOrder, defaultStyle: p.settings.defaultStyle };
}

/** True when the project's categories and default style are exactly these standards. */
export function hasStandards(p: Project, s: Standards): boolean {
  return (
    p.categories === s.categories && p.categoryOrder === s.categoryOrder && p.settings.defaultStyle === s.defaultStyle
  );
}

/**
 * Replace a project's categories and default style with the standards. Elements
 * whose category no longer exists lose it but keep their look (style baked in).
 */
export function applyStandards(p: Project, s: Standards): Project {
  if (hasStandards(p, s)) return p;
  let nodes = p.nodes;
  for (const n of Object.values(p.nodes)) {
    if (!n.categoryId || s.categories[n.categoryId]) continue;
    const old = p.categories[n.categoryId];
    if (nodes === p.nodes) nodes = { ...p.nodes };
    nodes[n.id] = { ...n, categoryId: null, style: { ...(old?.style ?? {}), ...n.style } };
  }
  return {
    ...p,
    nodes,
    categories: s.categories,
    categoryOrder: s.categoryOrder,
    settings: { ...p.settings, defaultStyle: s.defaultStyle },
  };
}

const key = (name: string) => name.trim().toLowerCase();

/**
 * Bring an incoming project (opened file, restored tab) under the standards:
 * its categories are matched to the library by id, then by name, and the
 * library's styles win. Categories the library lacks are added to it.
 */
export function adoptProject(p: Project, s: Standards): { project: Project; standards: Standards; restyled: number } {
  const byName = new Map(s.categoryOrder.map((id) => [key(s.categories[id].name), id]));
  const map = new Map<Id, Id>();
  let categories = s.categories;
  let categoryOrder = s.categoryOrder;
  let restyled = 0;
  for (const id of p.categoryOrder) {
    const c = p.categories[id];
    const same = s.categories[id];
    const match = same && key(same.name) === key(c.name) ? same.id : byName.get(key(c.name));
    if (match) {
      map.set(id, match);
      if (JSON.stringify(s.categories[match].style) !== JSON.stringify(c.style)) restyled++;
    } else {
      const added = s.categories[id] ? createCategory(c.name, c.style) : { ...c };
      categories = { ...categories, [added.id]: added };
      categoryOrder = [...categoryOrder, added.id];
      byName.set(key(c.name), added.id);
      map.set(id, added.id);
    }
  }
  const standards = categories === s.categories ? s : { ...s, categories, categoryOrder };
  const nodes: Project['nodes'] = {};
  for (const n of Object.values(p.nodes))
    nodes[n.id] = n.categoryId && map.has(n.categoryId) ? { ...n, categoryId: map.get(n.categoryId)! } : n;
  return { project: applyStandards({ ...p, nodes }, standards), standards, restyled };
}
