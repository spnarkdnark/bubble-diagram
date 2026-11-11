import type { BubbleNode, Connection, Project, Shape, StyleProps } from './types';
import { AUTO_STROKE_DARKEN } from './defaults';
import { darken } from './color';
import { nodeArea } from './geometry';
import { formatArea, formatFeetInches, formatLengthShort } from './units';

export type ResolvedStyle = StyleProps & { stroke: string };

/** Base style an element inherits: its category's, or the project default. */
export function baseStyle(node: Pick<BubbleNode, 'categoryId'>, project: Project): StyleProps {
  const cat = node.categoryId ? project.categories[node.categoryId] : undefined;
  return cat?.style ?? project.settings.defaultStyle;
}

/** Category/default style with the element's overrides applied; stroke resolved. */
export function resolveStyle(node: BubbleNode, project: Project): ResolvedStyle {
  const overrides = Object.fromEntries(Object.entries(node.style).filter(([, v]) => v !== undefined));
  const s: StyleProps = { ...baseStyle(node, project), ...overrides };
  return { ...s, stroke: s.stroke ?? darken(s.fill, AUTO_STROKE_DARKEN) };
}

/**
 * A shape's dimensions as text: "R 12'-6"" for circles, "20' × 30'" for rectangles,
 * null for shapes without simple dimensions. `exact` uses feet-inches throughout
 * (readouts and the editor) instead of the shortest form (labels).
 */
export function dimensionText(shape: Shape, exact = false): string | null {
  const f = exact ? formatFeetInches : formatLengthShort;
  switch (shape.kind) {
    case 'circle':
      return `R ${f(shape.radiusFt)}`;
    case 'rect':
      return `${f(shape.widthFt)} × ${f(shape.heightFt)}`;
    case 'blob':
      return null;
  }
}

export function secondaryLabel(node: BubbleNode, project: Project, style = resolveStyle(node, project)): string | null {
  switch (style.labelSecondary) {
    case 'radius':
      return dimensionText(node.shape) ?? formatArea(nodeArea(node, project));
    case 'area':
      return formatArea(nodeArea(node, project));
    default:
      return null;
  }
}

export function orderedNodes(project: Project): BubbleNode[] {
  return project.nodeOrder.map((id) => project.nodes[id]).filter(Boolean);
}

export function totalArea(project: Project, ids?: string[]): number {
  const list = ids ? ids.map((id) => project.nodes[id]).filter(Boolean) : Object.values(project.nodes);
  return list.reduce((sum, n) => sum + nodeArea(n, project), 0);
}

export function findConnection(project: Project, a: string, b: string): Connection | undefined {
  return Object.values(project.connections).find((c) => (c.from === a && c.to === b) || (c.from === b && c.to === a));
}
