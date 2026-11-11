import type {
  ConnectionType,
  DrawingSettings,
  GraphicSettings,
  OverlapSettings,
  StrokeStyle,
  StyleProps,
} from './types';
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

/** Fill used for elements without a category. */
export const UNCATEGORIZED_FILL = '#dcdcdc';

export const DEFAULT_STYLE: StyleProps = {
  fill: UNCATEGORIZED_FILL,
  fillOpacity: 0.85,
  stroke: null,
  strokeWeightPt: 0.75,
  strokeStyle: 'solid',
  labelSizePt: 9,
  labelColor: '#2b2b2b',
  labelBold: true,
  labelSecondary: 'area',
  sketchAmount: 1,
};

export function styleWithFill(fill: string, extra: Partial<StyleProps> = {}): StyleProps {
  return { ...DEFAULT_STYLE, fill, ...extra };
}

export const EXTERIOR_CATEGORY = 'Exterior';

/** Firm category look: auto outline (darker fill) at 3 pt, 10 pt dark gray labels. */
function firmStyle(fill: string, extra: Partial<StyleProps> = {}): StyleProps {
  return styleWithFill(fill, { stroke: null, strokeWeightPt: 3, labelSizePt: 10, labelColor: '#333333', ...extra });
}

/** The firm's standard categories, in this order, for a fresh workspace (and "Reset to firm defaults"). */
export const DEFAULT_CATEGORIES: { name: string; style: StyleProps }[] = [
  { name: 'Garage', style: firmStyle('#baffc9') },
  { name: 'Public', style: firmStyle('#ffffba') },
  { name: 'Bedroom', style: firmStyle('#bae1ff') },
  { name: 'Service', style: firmStyle('#ffb3ba') },
  { name: EXTERIOR_CATEGORY, style: firmStyle('#ffdfba', { strokeStyle: 'dashed' }) },
];

export const DEFAULT_RADIUS_FT = 10;
export const MIN_RADIUS_FT = 0.5;
export const RADIUS_SNAP_FT = 0.5; // 6"
export const NUDGE_FT = 1;
export const NUDGE_BIG_FT = 10;
export const DUPLICATE_OFFSET_FT = 5;

export const DEFAULT_GRAPHIC: GraphicSettings = {
  preset: 'clean',
  wobble: 0,
  overshoot: 0,
  passes: 1,
  pressure: 0,
  fillStyle: 'flat',
  fillOffset: 0,
  paper: 'none',
  labelFont: 'clean',
  seed: 0,
};

export const DEFAULT_OVERLAP: OverlapSettings = {
  mode: 'merge',
  weightPt: 2.5,
  color: 'largest',
  innerArcs: 'hidden',
};

export const DEFAULT_SETTINGS: DrawingSettings = {
  scale: DEFAULT_SCALE,
  unitSystem: 'imperial',
  grid: { visible: true, spacingFt: 10 },
  snap: { radiusIncrementFt: RADIUS_SNAP_FT },
  shapeGapFt: 2,
  defaultStyle: DEFAULT_STYLE,
  graphic: DEFAULT_GRAPHIC,
  overlap: DEFAULT_OVERLAP,
};

export const GRID_SPACINGS_FT = [1, 2, 5, 10, 20, 25, 50];

/** Darkening applied to fill to derive an "auto" outline. */
export const AUTO_STROKE_DARKEN = 0.35;

export const CONNECTION_COLOR = '#555555';

export const CONNECTION_STYLES: Record<ConnectionType, { label: string; weightPt: number; style: StrokeStyle }> = {
  strong: { label: 'Strong adjacency', weightPt: 3, style: 'solid' },
  near: { label: 'Near', weightPt: 1, style: 'solid' },
  visual: { label: 'Visual / indirect', weightPt: 1, style: 'dashed' },
};

/** Dash pattern [on, off] in paper points for a stroke style and weight; null = solid. */
export function dashPatternPt(style: StrokeStyle, weightPt: number): [number, number] | null {
  const w = Math.max(weightPt, 0.5);
  if (style === 'dashed') return [Math.max(4, w * 4), Math.max(3, w * 3)];
  if (style === 'dotted') return [0.01, Math.max(2, w * 2.5)];
  return null;
}

export const LABEL_FONT_FAMILY = 'Helvetica, Arial, sans-serif';
export const SECONDARY_LABEL_COLOR = '#555555';
