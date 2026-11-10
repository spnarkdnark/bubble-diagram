import type { SvgResult } from './svg';
import { PT_PER_IN } from '../../model/units';

export type SheetId = 'fit' | 'letter' | 'tabloid' | 'archC' | 'archD' | 'archE1';
export type Orientation = 'auto' | 'portrait' | 'landscape';

/** Sheet sizes in inches, portrait (w <= h). */
export const SHEETS: { id: SheetId; label: string; w: number; h: number }[] = [
  { id: 'fit', label: 'Fit to drawing', w: 0, h: 0 },
  { id: 'letter', label: 'Letter (8.5 × 11)', w: 8.5, h: 11 },
  { id: 'tabloid', label: 'Tabloid (11 × 17)', w: 11, h: 17 },
  { id: 'archC', label: 'ARCH C (18 × 24)', w: 18, h: 24 },
  { id: 'archD', label: 'ARCH D (24 × 36)', w: 24, h: 36 },
  { id: 'archE1', label: 'ARCH E1 (30 × 42)', w: 30, h: 42 },
];

export interface PageLayout {
  pageWPt: number;
  pageHPt: number;
  x: number;
  y: number;
  fits: boolean;
}

/** Page size and centered placement for an SVG at true scale. */
export function pageLayout(svg: SvgResult, sheet: SheetId, orientation: Orientation): PageLayout {
  if (sheet === 'fit') return { pageWPt: svg.widthPt, pageHPt: svg.heightPt, x: 0, y: 0, fits: true };
  const s = SHEETS.find((x) => x.id === sheet)!;
  const landscape = orientation === 'landscape' || (orientation === 'auto' && svg.widthPt > svg.heightPt);
  const pageWPt = (landscape ? s.h : s.w) * PT_PER_IN;
  const pageHPt = (landscape ? s.w : s.h) * PT_PER_IN;
  return {
    pageWPt,
    pageHPt,
    x: (pageWPt - svg.widthPt) / 2,
    y: (pageHPt - svg.heightPt) / 2,
    fits: svg.widthPt <= pageWPt + 0.5 && svg.heightPt <= pageHPt + 0.5,
  };
}

export async function svgToPdf(svg: SvgResult, sheet: SheetId, orientation: Orientation): Promise<Blob> {
  const [{ jsPDF }] = await Promise.all([import('jspdf'), import('svg2pdf.js')]);
  const L = pageLayout(svg, sheet, orientation);
  const doc = new jsPDF({
    unit: 'pt',
    format: [L.pageWPt, L.pageHPt],
    orientation: L.pageWPt > L.pageHPt ? 'landscape' : 'portrait',
  });
  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;left:-99999px;top:0;visibility:hidden';
  host.innerHTML = svg.svg;
  document.body.appendChild(host);
  try {
    await doc.svg(host.querySelector('svg')!, { x: L.x, y: L.y, width: svg.widthPt, height: svg.heightPt });
  } finally {
    host.remove();
  }
  return doc.output('blob');
}
