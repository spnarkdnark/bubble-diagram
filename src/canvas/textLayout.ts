/**
 * Label layout shared by the canvas renderer and the SVG/PDF/PNG exporter so
 * they wrap identically. All values are in PAPER POINTS relative to the
 * bubble center. Uses a 2D canvas for text measurement (browser only).
 */
import type { BubbleNode, ScaleId } from '../model/types';
import { shapeSize } from '../model/geometry';
import { secondaryLabel } from '../model/selectors';
import { ftToPt } from '../model/units';
import { LABEL_FONT_FAMILY } from '../model/defaults';

export interface LabelLine {
  text: string;
  sizePt: number;
  weight: 400 | 600;
  secondary: boolean;
  /** baseline-free: top of the line box relative to bubble center, pt */
  topPt: number;
  heightPt: number;
}

export interface LabelLayout {
  lines: LabelLine[];
  widthPt: number;
}

export const LINE_HEIGHT = 1.2;
const SECONDARY_RATIO = 0.85;

let ctx: CanvasRenderingContext2D | null = null;
function measure(text: string, sizePt: number, weight: number): number {
  if (!ctx) ctx = document.createElement('canvas').getContext('2d');
  if (!ctx) return text.length * sizePt * 0.55;
  ctx.font = `${weight} ${sizePt}px ${LABEL_FONT_FAMILY}`;
  return ctx.measureText(text).width;
}

function wrap(text: string, sizePt: number, weight: number, maxWidth: number): string[] {
  const out: string[] = [];
  for (const para of text.split('\n')) {
    const words = para.split(/\s+/).filter(Boolean);
    if (words.length === 0) continue;
    let line = words[0];
    for (const w of words.slice(1)) {
      const test = `${line} ${w}`;
      if (measure(test, sizePt, weight) <= maxWidth) line = test;
      else {
        out.push(line);
        line = w;
      }
    }
    out.push(line);
  }
  return out;
}

export function layoutLabel(node: BubbleNode, scale: ScaleId): LabelLayout {
  const size = node.label.fontSizePt;
  // wrap width: ~80% of the diameter on paper, but never narrower than a few characters
  const widthPt = Math.max(ftToPt(shapeSize(node.shape) * 2 * 0.8, scale), size * 4);
  const rows: Omit<LabelLine, 'topPt'>[] = [];
  for (const t of wrap(node.name, size, 600, widthPt))
    rows.push({ text: t, sizePt: size, weight: 600, secondary: false, heightPt: size * LINE_HEIGHT });
  const sec = secondaryLabel(node);
  if (sec) {
    const s = size * SECONDARY_RATIO;
    rows.push({ text: sec, sizePt: s, weight: 400, secondary: true, heightPt: s * LINE_HEIGHT });
  }
  const total = rows.reduce((a, r) => a + r.heightPt, 0);
  let y = -total / 2;
  const lines = rows.map((r) => {
    const l = { ...r, topPt: y };
    y += r.heightPt;
    return l;
  });
  return { lines, widthPt };
}
