import type { ConnectionType, DrawingSettings, NodeLabel, NodeStyle, StrokeStyle } from './types';
import { DEFAULT_SCALE } from './units';

/** Light, muted palette for categories (cycled for new categories). */
export const CATEGORY_PALETTE = [
  '#a8c5da', // muted blue
  '#e8c9a0', // sand
  '#b9d3b0', // sage
  '#d9b8c4', // dusty rose
  '#c9c1dd', // lavender
  '#e3dca0', // pale ochre
  '#a9d4cf', // seafoam
  '#d6b9a3', // clay
];

export const DEFAULT_CATEGORIES: { name: string; color: string }[] = [
  { name: 'Public', color: CATEGORY_PALETTE[0] },
  { name: 'Private', color: CATEGORY_PALETTE[2] },
  { name: 'Service', color: CATEGORY_PALETTE[1] },
  { name: 'Staff', color: CATEGORY_PALETTE[3] },
];

/** Fill used when a bubble has no category and follows category color. */
export const UNCATEGORIZED_FILL = '#dcdcdc';

export const DEFAULT_RADIUS_FT = 10;
export const MIN_RADIUS_FT = 0.5;
export const RADIUS_SNAP_FT = 0.5; // 6"
export const NUDGE_FT = 1;
export const NUDGE_BIG_FT = 10;
export const DUPLICATE_OFFSET_FT = 5;

export const DEFAULT_SETTINGS: DrawingSettings = {
  scale: DEFAULT_SCALE,
  unitSystem: 'imperial',
  grid: { visible: true, spacingFt: 10 },
  snap: { radiusIncrementFt: RADIUS_SNAP_FT },
};

export const GRID_SPACINGS_FT = [1, 2, 5, 10, 20, 25, 50];

export const DEFAULT_NODE_STYLE: NodeStyle = {
  fill: null,
  fillOpacity: 0.85,
  stroke: null,
  strokeWeightPt: 0.75,
  strokeStyle: 'solid',
};

export const DEFAULT_LABEL: NodeLabel = { fontSizePt: 9, secondary: 'area' };

/** Darkening applied to fill to derive an "auto" outline. */
export const AUTO_STROKE_DARKEN = 0.35;

export const CONNECTION_COLOR = '#555555';

export const CONNECTION_STYLES: Record<
  ConnectionType,
  { label: string; weightPt: number; style: StrokeStyle }
> = {
  strong: { label: 'Strong adjacency', weightPt: 3, style: 'solid' },
  near: { label: 'Near', weightPt: 1, style: 'solid' },
  visual: { label: 'Visual / indirect', weightPt: 1, style: 'dashed' },
};

/** Dash pattern in paper points, scaled by stroke weight for legibility. */
export function dashPatternPt(weightPt: number): [number, number] {
  const w = Math.max(weightPt, 0.5);
  return [Math.max(4, w * 4), Math.max(3, w * 3)];
}

export const LABEL_FONT_FAMILY = 'Helvetica, Arial, sans-serif';
export const LABEL_COLOR = '#2b2b2b';
