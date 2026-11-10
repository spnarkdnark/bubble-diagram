/** Per-element style overrides. */
import type { Id, StyleKey, StyleProps } from '../../model/types';
import { resolveStyle } from '../../model/selectors';
import { getDoc } from '../documentStore';
import { commit } from './shared';
import { updateNodes } from './nodes';

export function setNodeStyle<K extends StyleKey>(ids: Id[], key: K, value: StyleProps[K], coalesce = true) {
  updateNodes(
    ids,
    (n) => {
      (n.style as StyleProps)[key] = value;
    },
    coalesce ? `style:${key}` : undefined,
  );
}

export function resetNodeStyle(ids: Id[], keys?: StyleKey[]) {
  updateNodes(ids, (n) => {
    if (!keys) n.style = {};
    else for (const k of keys) delete n.style[k];
  });
}

/** Push one node's resolved look up to its category and clear that node's overrides. */
export function makeCategoryStyle(nodeId: Id) {
  const doc = getDoc();
  const node = doc.nodes[nodeId];
  if (!node?.categoryId) return;
  const style = resolveStyle(node, doc);
  const catId = node.categoryId;
  commit((d) => {
    const s: StyleProps = { ...style };
    if (node.style.stroke === undefined) s.stroke = d.categories[catId].style.stroke;
    d.categories[catId].style = s;
    d.nodes[nodeId].style = {};
  });
}
