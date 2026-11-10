/**
 * Single source of truth for exports. Builds an SVG directly from the data
 * model at TRUE PAPER SCALE (independent of on-screen zoom). User units are
 * paper points (1/72"), so stroke weights and font sizes map 1:1.
 */
import type { Bounds, Project } from '../../model/types';
import { connectionSegment, nodeBounds, unionBounds } from '../../model/geometry';
import { connectionsList, orderedNodes, resolveFill, resolveStroke } from '../../model/selectors';
import { CONNECTION_COLOR, CONNECTION_STYLES, dashPatternPt, LABEL_COLOR, LABEL_FONT_FAMILY } from '../../model/defaults';
import { ftToPt, getScale, niceScaleBarFt, PT_PER_IN, scaleBarSegments } from '../../model/units';
import { layoutLabel } from '../../canvas/textLayout';

export interface ExportOptions {
  includeGrid: boolean;
  /** scale bar + project name + scale note under the drawing */
  includeScaleBar: boolean;
  marginIn: number;
  /** only these node ids (and connections between them); all when undefined */
  nodeIds?: string[];
}

export const DEFAULT_EXPORT_OPTIONS: ExportOptions = { includeGrid: false, includeScaleBar: true, marginIn: 0.5 };

export interface SvgResult {
  svg: string;
  widthPt: number;
  heightPt: number;
}

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const n = (v: number) => +v.toFixed(3);
const FOOTER_PT = 40;

export function contentBounds(project: Project, nodeIds?: string[]): Bounds | null {
  const ids = nodeIds ?? project.nodeOrder;
  return unionBounds(ids.map((id) => project.nodes[id]).filter(Boolean).map(nodeBounds));
}

export function buildSvg(project: Project, opts: ExportOptions = DEFAULT_EXPORT_OPTIONS): SvgResult | null {
  const bounds = contentBounds(project, opts.nodeIds);
  if (!bounds) return null;
  const scale = project.settings.scale;
  const m = opts.marginIn * PT_PER_IN;
  const toPt = (ft: number) => ftToPt(ft, scale);
  const X = (ft: number) => m + toPt(ft - bounds.minX);
  const Y = (ft: number) => m + toPt(ft - bounds.minY);
  const drawW = toPt(bounds.maxX - bounds.minX);
  const drawH = toPt(bounds.maxY - bounds.minY);
  const footer = opts.includeScaleBar ? FOOTER_PT : 0;
  const W = drawW + m * 2;
  const H = drawH + m * 2 + footer;

  const ids = new Set(opts.nodeIds ?? project.nodeOrder);
  const nodes = orderedNodes(project).filter((nd) => ids.has(nd.id));
  const out: string[] = [];
  out.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${n(W / PT_PER_IN)}in" height="${n(H / PT_PER_IN)}in" viewBox="0 0 ${n(W)} ${n(H)}">`,
    `<rect x="0" y="0" width="${n(W)}" height="${n(H)}" fill="#ffffff"/>`,
  );

  if (opts.includeGrid) {
    const s = project.settings.grid.spacingFt;
    const gx0 = Math.floor(bounds.minX / s) * s;
    const gy0 = Math.floor(bounds.minY / s) * s;
    const parts: string[] = [];
    for (let x = gx0; x <= bounds.maxX + 1e-9; x += s)
      if (x >= bounds.minX - 1e-9) parts.push(`M${n(X(x))} ${n(Y(bounds.minY))}V${n(Y(bounds.maxY))}`);
    for (let y = gy0; y <= bounds.maxY + 1e-9; y += s)
      if (y >= bounds.minY - 1e-9) parts.push(`M${n(X(bounds.minX))} ${n(Y(y))}H${n(X(bounds.maxX))}`);
    out.push(`<path d="${parts.join('')}" fill="none" stroke="#e3e5e8" stroke-width="0.25"/>`);
  }

  out.push('<g id="connections">');
  for (const c of connectionsList(project)) {
    const a = project.nodes[c.from];
    const b = project.nodes[c.to];
    if (!a || !b || !ids.has(a.id) || !ids.has(b.id)) continue;
    const seg = connectionSegment(a, b);
    if (!seg) continue;
    const st = CONNECTION_STYLES[c.type];
    const dash = st.style === 'dashed' ? ` stroke-dasharray="${dashPatternPt(st.weightPt).join(' ')}"` : '';
    out.push(
      `<line x1="${n(X(seg[0].x))}" y1="${n(Y(seg[0].y))}" x2="${n(X(seg[1].x))}" y2="${n(Y(seg[1].y))}" stroke="${CONNECTION_COLOR}" stroke-width="${st.weightPt}"${dash}/>`,
    );
  }
  out.push('</g>');

  out.push('<g id="bubbles">');
  for (const nd of nodes) {
    const cx = X(nd.x);
    const cy = Y(nd.y);
    const st = nd.style;
    const stroke =
      st.strokeWeightPt > 0
        ? ` stroke="${resolveStroke(nd, project)}" stroke-width="${st.strokeWeightPt}"${
            st.strokeStyle === 'dashed' ? ` stroke-dasharray="${dashPatternPt(st.strokeWeightPt).join(' ')}"` : ''
          }`
        : '';
    out.push(`<g id="bubble-${esc(nd.id)}">`);
    out.push(
      `<circle cx="${n(cx)}" cy="${n(cy)}" r="${n(toPt(nd.shape.radiusFt))}" fill="${resolveFill(nd, project)}" fill-opacity="${st.fillOpacity}"${stroke}/>`,
    );
    for (const l of layoutLabel(nd, scale).lines) {
      // approximate vertical centering of the glyphs within the line box
      const baseline = cy + l.topPt + l.heightPt / 2 + l.sizePt * 0.35;
      out.push(
        `<text x="${n(cx)}" y="${n(baseline)}" text-anchor="middle" font-family="${LABEL_FONT_FAMILY}" font-size="${n(l.sizePt)}"${
          l.weight === 600 ? ' font-weight="bold"' : ''
        } fill="${l.secondary ? '#555555' : LABEL_COLOR}">${esc(l.text)}</text>`,
      );
    }
    out.push('</g>');
  }
  out.push('</g>');

  if (opts.includeScaleBar) out.push(scaleBarSvg(project, m, m + drawH + 14));
  out.push('</svg>');
  return { svg: out.join('\n'), widthPt: W, heightPt: H };
}

function scaleBarSvg(project: Project, x: number, y: number): string {
  const ptPerFt = ftToPt(1, project.settings.scale);
  const len = niceScaleBarFt(ptPerFt, 108);
  const segs = scaleBarSegments(len);
  const w = len * ptPerFt;
  const parts: string[] = ['<g id="scale-bar">'];
  for (let i = 0; i < segs; i++)
    parts.push(
      `<rect x="${n(x + (i * w) / segs)}" y="${n(y)}" width="${n(w / segs)}" height="4" fill="${i % 2 ? '#ffffff' : '#333333'}" stroke="#333333" stroke-width="0.5"/>`,
    );
  const t = (tx: number, label: string) =>
    `<text x="${n(tx)}" y="${n(y + 13)}" text-anchor="middle" font-family="${LABEL_FONT_FAMILY}" font-size="7" fill="#333333">${label}</text>`;
  parts.push(t(x, '0'), t(x + w / 2, `${len / 2}'`), t(x + w, `${len}'`));
  parts.push(
    `<text x="${n(x + w + 16)}" y="${n(y + 4)}" font-family="${LABEL_FONT_FAMILY}" font-size="8" font-weight="bold" fill="#222222">${esc(project.meta.name)}</text>`,
    `<text x="${n(x + w + 16)}" y="${n(y + 14)}" font-family="${LABEL_FONT_FAMILY}" font-size="7" fill="#555555">Scale: ${esc(getScale(project.settings.scale).label)}</text>`,
  );
  parts.push('</g>');
  return parts.join('\n');
}
