import type { BubbleNode, Connection, Project } from './types';
import { AUTO_STROKE_DARKEN, UNCATEGORIZED_FILL } from './defaults';
import { darken } from './color';
import { shapeArea, shapeSize } from './geometry';
import { formatArea, formatLengthShort } from './units';

/** Effective fill: explicit override, else category color, else neutral gray. */
export function resolveFill(node: BubbleNode, project: Project): string {
  if (node.style.fill) return node.style.fill;
  const cat = node.categoryId ? project.categories[node.categoryId] : undefined;
  return cat?.color ?? UNCATEGORIZED_FILL;
}

export function resolveStroke(node: BubbleNode, project: Project): string {
  return node.style.stroke ?? darken(resolveFill(node, project), AUTO_STROKE_DARKEN);
}

export function secondaryLabel(node: BubbleNode): string | null {
  switch (node.label.secondary) {
    case 'radius':
      return `R ${formatLengthShort(shapeSize(node.shape))}`;
    case 'area':
      return formatArea(shapeArea(node.shape));
    default:
      return null;
  }
}

export function orderedNodes(project: Project): BubbleNode[] {
  return project.nodeOrder.map((id) => project.nodes[id]).filter(Boolean);
}

export function connectionsList(project: Project): Connection[] {
  return Object.values(project.connections);
}

export function totalArea(project: Project, ids?: string[]): number {
  const list = ids ? ids.map((id) => project.nodes[id]).filter(Boolean) : Object.values(project.nodes);
  return list.reduce((sum, n) => sum + shapeArea(n.shape), 0);
}

export function findConnection(project: Project, a: string, b: string): Connection | undefined {
  return Object.values(project.connections).find(
    (c) => (c.from === a && c.to === b) || (c.from === b && c.to === a),
  );
}
