/**
 * Label layout shared by the canvas renderer and the SVG/PDF/PNG exporter so
 * they wrap identically. All values are in PAPER POINTS relative to the
 * bubble center. Uses a 2D canvas for text measurement (browser only).
 */
import type { BubbleNode, Project } from '../model/types';
import { nodeSize } from '../model/geometry';
import { resolveStyle, secondaryLabel, type ResolvedStyle } from '../model/selectors';
import { ftToPt } from '../model/units';
import { LABEL_FONT_FAMILY, SECONDARY_LABEL_COLOR } from '../model/defaults';

export interface LabelLine {
  text: string;
  sizePt: number;
  weight: 400 | 600;
  secondary: boolean;
  color: string;
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

export interface LabelFont {
  family: string;
  upper: boolean;
}

const CLEAN_FONT: LabelFont = { family: LABEL_FONT_FAMILY, upper: false };

let ctx: CanvasRenderingContext2D | null = null;
const widthCache = new Map<string, number>();
let family = LABEL_FONT_FAMILY;

/** Forget cached text widths (call after a web font finishes loading). */
let epoch = 0;
export function clearTextMeasureCache() {
  widthCache.clear();
  epoch++;
}
/** Bumps whenever cached measurements are invalidated. */
export function measureEpoch(): number {
  return epoch;
}

function measure(text: string, sizePt: number, weight: number): number {
  const key = `${family}|${weight}|${text}`;
  let w = widthCache.get(key);
  if (w === undefined) {
    if (!ctx && typeof document !== 'undefined') ctx = document.createElement('canvas').getContext('2d');
    if (ctx) {
      ctx.font = `${weight} 100px ${family}`;
      w = ctx.measureText(text).width / 100;
    } else w = text.length * 0.55;
    if (widthCache.size > 20000) widthCache.clear();
    widthCache.set(key, w);
  }
  return w * sizePt;
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

export function layoutLabel(
  node: BubbleNode,
  project: Project,
  style: ResolvedStyle = resolveStyle(node, project),
  font: LabelFont = CLEAN_FONT,
): LabelLayout {
  const scale = project.settings.scale;
  family = font.family;
  const name = font.upper ? node.name.toUpperCase() : node.name;
  const size = style.labelSizePt;
  const weight = style.labelBold ? 600 : 400;
  // wrap width: ~80% of the diameter on paper, but never narrower than a few characters
  const widthPt = Math.max(ftToPt(nodeSize(node, project) * 2 * (node.shape.kind === 'circle' ? 0.8 : 0.6), scale), size * 4);
  const rows: Omit<LabelLine, 'topPt'>[] = [];
  for (const t of wrap(name, size, weight, widthPt))
    rows.push({ text: t, sizePt: size, weight, secondary: false, color: style.labelColor, heightPt: size * LINE_HEIGHT });
  const sec = secondaryLabel(node, project, style);
  family = font.family;
  if (sec) {
    const s = size * SECONDARY_RATIO;
    rows.push({ text: sec, sizePt: s, weight: 400, secondary: true, color: SECONDARY_LABEL_COLOR, heightPt: s * LINE_HEIGHT });
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
