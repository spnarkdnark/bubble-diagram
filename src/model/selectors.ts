import type { BubbleNode, Connection, Project, StyleKey, StyleProps } from './types';
import { AUTO_STROKE_DARKEN } from './defaults';
import { darken } from './color';
import { nodeArea, shapeSize } from './geometry';
import { formatArea, formatLengthShort } from './units';

export type ResolvedStyle = StyleProps & { stroke: string };

/** Base style an element inherits: its category's, or the project default. */
export function baseStyle(node: Pick<BubbleNode, 'categoryId'>, project: Project): StyleProps {
  const cat = node.categoryId ? project.categories[node.categoryId] : undefined;
  return cat?.style ?? project.settings.defaultStyle;
}

/** Category/default style with the element's overrides applied; stroke resolved. */
export function resolveStyle(node: BubbleNode, project: Project): ResolvedStyle {
  const s: StyleProps = { ...baseStyle(node, project) };
  for (const k of Object.keys(node.style) as StyleKey[]) {
    const v = node.style[k];
    if (v !== undefined) (s as any)[k] = v;
  }
  return { ...s, stroke: s.stroke ?? darken(s.fill, AUTO_STROKE_DARKEN) };
}

export function resolveFill(node: BubbleNode, project: Project): string {
  return resolveStyle(node, project).fill;
}

export function resolveStroke(node: BubbleNode, project: Project): string {
  return resolveStyle(node, project).stroke;
}

export function isOverridden(node: BubbleNode, key: StyleKey): boolean {
  return node.style[key] !== undefined;
}

export function secondaryLabel(node: BubbleNode, project: Project, style = resolveStyle(node, project)): string | null {
  switch (style.labelSecondary) {
    case 'radius':
      return node.shape.kind === 'circle'
        ? `R ${formatLengthShort(shapeSize(node.shape))}`
        : formatArea(nodeArea(node, project));
    case 'area':
      return formatArea(nodeArea(node, project));
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
  return list.reduce((sum, n) => sum + nodeArea(n, project), 0);
}

export function findConnection(project: Project, a: string, b: string): Connection | undefined {
  return Object.values(project.connections).find((c) => (c.from === a && c.to === b) || (c.from === b && c.to === a));
}
