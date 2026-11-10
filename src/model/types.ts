/**
 * Core document types. ALL geometry is in real-world FEET (model space).
 * Line weights and font sizes are in paper POINTS (paper space, 1pt = 1/72").
 * Never store pixels in the document.
 */

export type Id = string;

export type ScaleId = '1/32' | '1/16' | '1/8' | '3/16' | '1/4' | '1/2';

/** Reserved for future metric support; only 'imperial' is implemented. */
export type UnitSystem = 'imperial';

export interface DrawingSettings {
  scale: ScaleId;
  unitSystem: UnitSystem;
  grid: { visible: boolean; spacingFt: number };
  snap: { radiusIncrementFt: number };
}

export interface Category {
  id: Id;
  name: string;
  color: string; // hex #rrggbb
}

/**
 * Tagged union so new shape kinds (ellipse, roundedRect) can be added later.
 * Every function that switches on `kind` lives in model/geometry.ts.
 */
export type Shape = CircleShape;
// Future: | { kind: 'ellipse'; rxFt: number; ryFt: number }
//         | { kind: 'roundedRect'; widthFt: number; heightFt: number; cornerFt: number }

export interface CircleShape {
  kind: 'circle';
  radiusFt: number;
}

export type StrokeStyle = 'solid' | 'dashed';
export type LabelSecondary = 'none' | 'radius' | 'area';

export interface NodeStyle {
  /** null = follow category color */
  fill: string | null;
  fillOpacity: number; // 0..1
  /** null = auto (derived darker tint of the effective fill) */
  stroke: string | null;
  strokeWeightPt: number;
  strokeStyle: StrokeStyle;
}

export interface NodeLabel {
  fontSizePt: number;
  secondary: LabelSecondary;
}

export interface BubbleNode {
  id: Id;
  name: string;
  /** center, feet */
  x: number;
  y: number;
  shape: Shape;
  categoryId: Id | null;
  style: NodeStyle;
  label: NodeLabel;
  // Future: layerId?: Id; locked?: boolean;
}

export type ConnectionType = 'strong' | 'near' | 'visual';

export interface Connection {
  id: Id;
  from: Id;
  to: Id;
  type: ConnectionType;
}

export interface ProjectMeta {
  name: string;
  createdAt: string;
  modifiedAt: string;
}

export const SCHEMA_VERSION = 1 as const;

export interface Project {
  schemaVersion: typeof SCHEMA_VERSION;
  meta: ProjectMeta;
  settings: DrawingSettings;
  categories: Record<Id, Category>;
  categoryOrder: Id[];
  nodes: Record<Id, BubbleNode>;
  /** z-order, back to front */
  nodeOrder: Id[];
  connections: Record<Id, Connection>;
}

export interface Point {
  x: number;
  y: number;
}

export interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}
