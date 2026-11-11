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
  /** default gap for new shapes drawn against bubbles, feet */
  shapeGapFt: number;
  /** style for elements without a category */
  defaultStyle: StyleProps;
  graphic: GraphicSettings;
  overlap: OverlapSettings;
}

export type FillStyle = 'flat' | 'wash' | 'hatch' | 'pencil';
export type Paper = 'none' | 'trace' | 'warm';
export type LabelFont = 'clean' | 'architect' | 'pen';

/** Global hand-drawn character (see render/sketch.ts). */
export interface GraphicSettings {
  preset: string;
  wobble: number;
  overshoot: number;
  passes: number;
  pressure: number;
  fillStyle: FillStyle;
  fillOffset: number;
  paper: Paper;
  labelFont: LabelFont;
  /** changes every random stroke without changing the settings ("redraw with new hand") */
  seed: number;
}

export type OverlapMode = 'none' | 'merge' | 'lens' | 'lensFill' | 'threshold';
export type OverlapColor = 'largest' | 'blend' | 'dark';

export interface OverlapSettings {
  mode: OverlapMode;
  weightPt: number;
  color: OverlapColor;
  /** merge mode: how the hidden inner arcs are drawn */
  innerArcs: 'hidden' | 'thin' | 'dashed';
}

export interface Category {
  id: Id;
  name: string;
  style: StyleProps;
}

/**
 * Tagged union so new shape kinds (ellipse, roundedRect) can be added later.
 * Every function that switches on `kind` lives in model/geometry.ts.
 */
/** Every element's outline. Add kinds here; TypeScript then flags each switch to complete. */
export type Shape = CircleShape | RectShape | BlobShape;

/** Shapes the bubble tool can place and an element can be converted between. */
export type SizableKind = 'circle' | 'rect';

export interface CircleShape {
  kind: 'circle';
  radiusFt: number;
}

/** Axis-aligned rectangle centered on the node (a square when width = height). */
export interface RectShape {
  kind: 'rect';
  widthFt: number;
  heightFt: number;
}

/** A control point of a blob: free (feet relative to the node's x/y) or anchored to a bubble's offset ring. */
export type BlobPoint =
  | { t: 'free'; x: number; y: number }
  /** `arc`: the segment to the next point follows this bubble's ring (next point must anchor the same bubble) */
  | { t: 'anchor'; node: Id; angle: number; dir: 1 | -1; arc: boolean };

/** Freeform closed spline that can hug bubbles at an offset (see model/blob.ts). */
export interface BlobShape {
  kind: 'blob';
  points: BlobPoint[];
  /** distance between anchored edges and their bubbles, feet */
  gapFt: number;
}

export type StrokeStyle = 'solid' | 'dashed' | 'dotted';
export type LabelSecondary = 'none' | 'radius' | 'area';

/**
 * The complete visual style of an element. Categories (and the project's
 * uncategorized default) hold a full StyleProps; elements hold only the
 * properties they override (StyleOverrides). Resolve with selectors.resolveStyle.
 */
export interface StyleProps {
  fill: string;
  fillOpacity: number; // 0..1
  /** null = auto (darkened fill) */
  stroke: string | null;
  strokeWeightPt: number;
  strokeStyle: StrokeStyle;
  labelSizePt: number;
  labelColor: string;
  labelBold: boolean;
  labelSecondary: LabelSecondary;
  /** multiplier on the global sketch character (1 = as set globally, 0 = clean) */
  sketchAmount: number;
}

export type StyleKey = keyof StyleProps;
export type StyleOverrides = Partial<StyleProps>;

export interface BubbleNode {
  id: Id;
  name: string;
  /** center, feet */
  x: number;
  y: number;
  shape: Shape;
  categoryId: Id | null;
  /** only the properties that differ from the category style */
  style: StyleOverrides;
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

export const SCHEMA_VERSION = 2 as const;

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
  /** per-overlap overrides keyed by overlapKey(a, b) */
  overlaps: Record<string, { mode: OverlapMode }>;
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
