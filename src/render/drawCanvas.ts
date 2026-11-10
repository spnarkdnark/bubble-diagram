/** Draw scene primitives onto a 2D canvas context already transformed to world feet. */
import type { LabelPrim, Prim, StrokeP } from './scene';
import { hexToRgb } from '../model/color';

function rgba(hex: string, a: number): string {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r},${g},${b},${a})`;
}

function applyStroke(ctx: CanvasRenderingContext2D, s: StrokeP) {
  ctx.strokeStyle = rgba(s.color, s.alpha);
  ctx.lineWidth = s.width;
  ctx.lineCap = s.cap;
  ctx.lineJoin = 'round';
  ctx.setLineDash(s.dash ?? []);
}

export function drawPrims(ctx: CanvasRenderingContext2D, prims: Prim[]) {
  for (const p of prims) {
    ctx.beginPath();
    switch (p.t) {
      case 'circle':
        ctx.arc(p.cx, p.cy, p.r, 0, Math.PI * 2);
        break;
      case 'arc':
        ctx.arc(p.cx, p.cy, p.r, p.a0, p.a1);
        break;
      case 'path':
        if (p.pts.length === 0) continue;
        ctx.moveTo(p.pts[0].x, p.pts[0].y);
        for (let i = 1; i < p.pts.length; i++) ctx.lineTo(p.pts[i].x, p.pts[i].y);
        if (p.closed) ctx.closePath();
        break;
    }
    if (p.t !== 'arc' && p.fill) {
      ctx.fillStyle = rgba(p.fill.color, p.fill.alpha);
      ctx.fill();
    }
    if (p.stroke) {
      applyStroke(ctx, p.stroke);
      ctx.stroke();
    }
  }
  ctx.setLineDash([]);
}

/**
 * Labels are drawn in screen pixels (counter-scaled) for crisp text.
 * @param k stage scale (px per ft); ftPerPt converts paper points to feet
 */
export function drawLabels(ctx: CanvasRenderingContext2D, labels: LabelPrim[], k: number, ftPerPt: number) {
  const pxPerPt = ftPerPt * k;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  for (const l of labels) {
    ctx.save();
    ctx.translate(l.x, l.y);
    ctx.scale(1 / k, 1 / k);
    for (const line of l.layout.lines) {
      ctx.font = `${line.weight} ${line.sizePt * pxPerPt}px ${l.fontFamily}`;
      ctx.fillStyle = line.color;
      ctx.fillText(line.text, 0, (line.topPt + line.heightPt / 2 + line.sizePt * 0.35) * pxPerPt);
    }
    ctx.restore();
  }
}
