import type { ScaleId } from './types';

/** Screen assumption: at 100% zoom, 96 CSS px = 1 paper inch. */
export const PX_PER_IN = 96;
export const PT_PER_IN = 72;

export interface ScaleDef {
  id: ScaleId;
  label: string;
  /** paper inches per real-world foot */
  paperInPerFt: number;
}

export const SCALES: ScaleDef[] = [
  { id: '1/32', label: '1/32" = 1\'-0"', paperInPerFt: 1 / 32 },
  { id: '1/16', label: '1/16" = 1\'-0"', paperInPerFt: 1 / 16 },
  { id: '1/8', label: '1/8" = 1\'-0"', paperInPerFt: 1 / 8 },
  { id: '3/16', label: '3/16" = 1\'-0"', paperInPerFt: 3 / 16 },
  { id: '1/4', label: '1/4" = 1\'-0"', paperInPerFt: 1 / 4 },
  { id: '1/2', label: '1/2" = 1\'-0"', paperInPerFt: 1 / 2 },
];

export const DEFAULT_SCALE: ScaleId = '1/8';

export function getScale(id: ScaleId): ScaleDef {
  return SCALES.find((s) => s.id === id) ?? SCALES[2];
}

export function paperInPerFt(id: ScaleId): number {
  return getScale(id).paperInPerFt;
}

/** Screen pixels per real-world foot for a given drawing scale and zoom. */
export function pxPerFt(id: ScaleId, zoom = 1): number {
  return PX_PER_IN * paperInPerFt(id) * zoom;
}

/** Convert a paper-space length in points to model-space feet at the drawing scale. */
export function ptToFt(pt: number, id: ScaleId): number {
  return pt / PT_PER_IN / paperInPerFt(id);
}

/** Model feet -> paper points. */
export function ftToPt(ft: number, id: ScaleId): number {
  return ft * paperInPerFt(id) * PT_PER_IN;
}

/** Round to nearest multiple of `inc` (inc <= 0 disables). */
export function snap(value: number, inc: number): number {
  if (!(inc > 0)) return value;
  return Math.round(value / inc) * inc;
}

/** Next increment up/down from value, landing on the increment grid. */
export function stepToIncrement(value: number, inc: number, dir: 1 | -1): number {
  const eps = 1e-9;
  return dir > 0
    ? Math.floor(value / inc + eps) * inc + inc
    : Math.ceil(value / inc - eps) * inc - inc;
}

/** 12.5 -> 12'-6"  ;  0.5 -> 0'-6"  ; rounds to nearest inch. */
export function formatFeetInches(ft: number): string {
  const sign = ft < 0 ? '-' : '';
  let totalIn = Math.round(Math.abs(ft) * 12);
  const feet = Math.floor(totalIn / 12);
  totalIn -= feet * 12;
  return `${sign}${feet}'-${totalIn}"`;
}

/** Compact length for labels: whole feet show as 12', otherwise 12'-6". */
export function formatLengthShort(ft: number): string {
  const inches = Math.round(Math.abs(ft) * 12);
  return inches % 12 === 0 ? `${(ft < 0 ? -1 : 1) * (inches / 12)}'` : formatFeetInches(ft);
}

export function formatArea(sf: number): string {
  return `${Math.round(sf).toLocaleString('en-US')} sf`;
}

/**
 * Parse a length into feet. Accepts:
 *   12   12.5   12'   12'-6"   12' 6"   12'6   6"   12-6
 * Returns null when unparseable.
 */
export function parseLength(input: string | number): number | null {
  if (typeof input === 'number') return Number.isFinite(input) ? input : null;
  const s = input.trim().replace(/[′’]/g, "'").replace(/[″”]/g, '"');
  if (s === '') return null;
  if (/^-?\d*\.?\d+$/.test(s)) return parseFloat(s);
  let m = s.match(/^(-?\d*\.?\d+)\s*'\s*(?:-?\s*(\d*\.?\d+)\s*"?)?$/);
  if (m) return parseFloat(m[1]) + (m[2] ? parseFloat(m[2]) / 12 : 0);
  m = s.match(/^(\d*\.?\d+)\s*"$/);
  if (m) return parseFloat(m[1]) / 12;
  m = s.match(/^(\d+)\s*-\s*(\d*\.?\d+)$/);
  if (m) return parseFloat(m[1]) + parseFloat(m[2]) / 12;
  return null;
}

/** Parse an area string like "1,200", "1200 sf", "1200sf". */
export function parseArea(input: string | number): number | null {
  if (typeof input === 'number') return Number.isFinite(input) ? input : null;
  const s = input.trim().toLowerCase().replace(/,/g, '').replace(/\s*(sf|sq\.?\s*ft\.?|ft2|ft²)$/, '');
  if (!/^\d*\.?\d+$/.test(s)) return null;
  return parseFloat(s);
}

const NICE_BAR_FT = [1, 2, 4, 5, 8, 10, 16, 20, 25, 32, 40, 50, 64, 100, 200, 250, 500, 1000];

/** Largest "nice" scale-bar length (ft) whose drawn length stays within `maxUnits`. */
export function niceScaleBarFt(unitsPerFt: number, maxUnits: number): number {
  let best = NICE_BAR_FT[0];
  for (const f of NICE_BAR_FT) if (f * unitsPerFt <= maxUnits) best = f;
  return best;
}

/** Scale bar segment count: 4 for lengths divisible by 4 or not by 5, else 5. */
export function scaleBarSegments(lenFt: number): number {
  return lenFt % 4 === 0 || lenFt % 5 !== 0 ? 4 : 5;
}
