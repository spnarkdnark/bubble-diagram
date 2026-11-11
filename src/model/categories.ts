/**
 * Matching categories by name. One rule everywhere (opening files, paste,
 * paste style, CSV import, reset): the same id with the same name, otherwise
 * the same name ignoring case and surrounding spaces.
 */
import type { Category, Id, Project, StyleProps } from './types';
import { createCategory, nextCategoryColor } from './factory';

export const categoryKey = (name: string) => name.trim().toLowerCase();

/** The existing category that `incoming` corresponds to, if any. */
export function matchCategory(categories: Record<Id, Category>, incoming: { id?: Id; name: string }): Id | undefined {
  const key = categoryKey(incoming.name);
  const same = incoming.id ? categories[incoming.id] : undefined;
  if (same && categoryKey(same.name) === key) return same.id;
  return Object.values(categories).find((c) => categoryKey(c.name) === key)?.id;
}

/**
 * Resolve incoming categories against a project, creating each missing one once
 * (with its own style, or the next palette color). `added` lists the created ones,
 * in order, for the caller to commit.
 */
export function categoryResolver(project: Project) {
  const working = { ...project, categories: { ...project.categories }, categoryOrder: [...project.categoryOrder] };
  const added: Category[] = [];
  const resolve = (incoming: { id?: Id; name: string; style?: StyleProps }): Id => {
    const hit = matchCategory(working.categories, incoming);
    if (hit) return hit;
    const c = createCategory(incoming.name.trim(), incoming.style ?? nextCategoryColor(working));
    working.categories[c.id] = c;
    working.categoryOrder.push(c.id);
    added.push(c);
    return c.id;
  };
  return { resolve, added };
}
