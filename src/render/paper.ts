/** Procedural paper textures (raster). Used behind the canvas and in exports. */
import type { Paper } from '../model/types';
import { rng } from './sketch';

export const PAPER_COLORS: Record<Paper, string> = {
  none: '#ffffff',
  trace: '#f5f6f3',
  warm: '#f3ecdf',
};

export const PAPER_LABELS: Record<Paper, string> = {
  none: 'White',
  trace: 'Tracing paper',
  warm: 'Warm sketch paper',
};

/** Draw a paper texture into a new canvas of the given pixel size. */
export function paperCanvas(paper: Paper, w: number, h: number, seed = 'paper'): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = PAPER_COLORS[paper];
  ctx.fillRect(0, 0, c.width, c.height);
  if (paper === 'none') return c;
  const r = rng(seed + paper);
  // fine grain
  const img = ctx.getImageData(0, 0, c.width, c.height);
  const d = img.data;
  const amp = paper === 'warm' ? 9 : 6;
  for (let i = 0; i < d.length; i += 4) {
    const g = (r() - 0.5) * amp;
    d[i] += g;
    d[i + 1] += g;
    d[i + 2] += g * (paper === 'warm' ? 1.2 : 0.9);
  }
  ctx.putImageData(img, 0, 0);
  // fibers and soft mottling
  const fibers = Math.round((c.width * c.height) / (paper === 'warm' ? 900 : 2200));
  ctx.lineCap = 'round';
  for (let i = 0; i < fibers; i++) {
    const x = r() * c.width;
    const y = r() * c.height;
    const len = 3 + r() * (paper === 'warm' ? 14 : 8);
    const a = r() * Math.PI;
    ctx.strokeStyle = paper === 'warm' ? `rgba(120,95,60,${0.04 + r() * 0.06})` : `rgba(90,100,110,${0.03 + r() * 0.04})`;
    ctx.lineWidth = 0.4 + r() * 0.6;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(x + Math.cos(a) * len * 0.5 + (r() - 0.5) * 3, y + Math.sin(a) * len * 0.5 + (r() - 0.5) * 3, x + Math.cos(a) * len, y + Math.sin(a) * len);
    ctx.stroke();
  }
  const blobs = Math.round((c.width * c.height) / 40000);
  for (let i = 0; i < blobs; i++) {
    const x = r() * c.width;
    const y = r() * c.height;
    const rad = 30 + r() * 120;
    const grd = ctx.createRadialGradient(x, y, 0, x, y, rad);
    const tone = paper === 'warm' ? '140,110,70' : '120,130,140';
    grd.addColorStop(0, `rgba(${tone},${0.01 + r() * 0.014})`);
    grd.addColorStop(1, `rgba(${tone},0)`);
    ctx.fillStyle = grd;
    ctx.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
  return c;
}

const tileCache = new Map<Paper, string>();

/** A tileable-enough 512px texture as a data URL for CSS backgrounds. */
export function paperTileUrl(paper: Paper): string | null {
  if (paper === 'none') return null;
  let url = tileCache.get(paper);
  if (!url) {
    url = paperCanvas(paper, 512, 512, 'tile').toDataURL('image/png');
    tileCache.set(paper, url);
  }
  return url;
}
