/** Categories and the uncategorized default style. */
import type { Id, StyleKey, StyleProps } from '../../model/types';
import { createCategory, nextCategoryColor } from '../../model/factory';
import { getDoc } from '../documentStore';
import { commit } from './shared';

export function addCategory(name = 'New category'): Id {
  const c = createCategory(name, nextCategoryColor(getDoc()));
  commit((d) => {
    d.categories[c.id] = c;
    d.categoryOrder.push(c.id);
  });
  return c.id;
}

export function renameCategory(id: Id, name: string) {
  commit(
    (d) => {
      if (d.categories[id]) d.categories[id].name = name;
    },
    { coalesceKey: `cat-name:${id}` },
  );
}

/** Set one style property on a category, or on the uncategorized default when id is null. */
export function setCategoryStyle<K extends StyleKey>(id: Id | null, key: K, value: StyleProps[K]) {
  commit(
    (d) => {
      const target = id ? d.categories[id]?.style : d.settings.defaultStyle;
      if (target) (target as StyleProps)[key] = value;
    },
    { coalesceKey: `cat-style:${id}:${key}` },
  );
}

/** Deleting a category un-assigns its bubbles but keeps their look (style baked in as overrides). */
export function deleteCategory(id: Id) {
  commit((d) => {
    const cat = d.categories[id];
    if (!cat) return;
    for (const n of Object.values(d.nodes)) {
      if (n.categoryId === id) {
        n.categoryId = null;
        n.style = { ...cat.style, ...n.style };
      }
    }
    delete d.categories[id];
    d.categoryOrder = d.categoryOrder.filter((c) => c !== id);
  });
}
