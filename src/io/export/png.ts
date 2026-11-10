import type { SvgResult } from './svg';
import { PT_PER_IN } from '../../model/units';

const MAX_SIDE = 16000;
const MAX_PIXELS = 120_000_000;

/** Effective DPI after clamping to browser canvas limits. */
export function clampDpi(svg: SvgResult, dpi: number): number {
  const wIn = svg.widthPt / PT_PER_IN;
  const hIn = svg.heightPt / PT_PER_IN;
  let d = dpi;
  d = Math.min(d, MAX_SIDE / wIn, MAX_SIDE / hIn, Math.sqrt(MAX_PIXELS / (wIn * hIn)));
  return Math.floor(d);
}

export async function svgToPng(svg: SvgResult, dpi: number): Promise<Blob> {
  const d = clampDpi(svg, dpi);
  const w = Math.round((svg.widthPt / PT_PER_IN) * d);
  const h = Math.round((svg.heightPt / PT_PER_IN) * d);
  const url = URL.createObjectURL(new Blob([svg.svg], { type: 'image/svg+xml' }));
  try {
    const img = new Image();
    img.decoding = 'sync';
    await new Promise<void>((res, rej) => {
      img.onload = () => res();
      img.onerror = () => rej(new Error('Could not rasterize SVG'));
      img.src = url;
    });
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);
    return await new Promise<Blob>((res, rej) =>
      canvas.toBlob((b) => (b ? res(b) : rej(new Error('PNG encode failed'))), 'image/png'),
    );
  } finally {
    URL.revokeObjectURL(url);
  }
}
