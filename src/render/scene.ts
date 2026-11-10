/**
 * Scene builder: turns a Project into renderer-neutral primitives in WORLD FEET.
 * The canvas (render/drawCanvas.ts) and the SVG/PDF/PNG exporter
 * (io/export/svg.ts) both draw from this, so they always match.
 *
 * Everything visual about an element (category style, overrides, sketch
 * character, overlap treatment) is decided here.
 */
import type { BubbleNode, GraphicSettings, Id, Project } from '../model/types';
import { resolveStyle, type ResolvedStyle } from '../model/selectors';
import { connectionSegment } from '../model/geometry';
import { CONNECTION_COLOR, CONNECTION_STYLES, dashPatternPt, LABEL_FONT_FAMILY } from '../model/defaults';
import { darken, hexToRgb, rgbToHex } from '../model/color';
import { ptToFt } from '../model/units';
import { findOverlaps, hiddenInterval, mergeClusters, visibleArcs, type Interval, type Overlap } from '../model/overlaps';
import { layoutLabel, measureEpoch, type LabelLayout } from '../canvas/textLayout';
import {
  hatchRegion,
  isClean,
  sampleArc,
  sampleCircle,
  scaleParams,
  sketchClosedStroke,
  sketchFill,
  sketchOpenStroke,
  type ColorSlot,
  type Op,
  type Pt,
  type SketchParams,
} from './sketch';

export interface Paint {
  color: string;
  alpha: number;
}

export interface StrokeP {
  color: string;
  alpha: number;
  /** feet */
  width: number;
  /** feet */
  dash?: [number, number];
  cap: 'butt' | 'round';
}

export type Prim =
  | { t: 'circle'; cx: number; cy: number; r: number; fill?: Paint; stroke?: StrokeP }
  /** exact arc from angle a0 to a1 (radians, a1 > a0, y-down) */
  | { t: 'arc'; cx: number; cy: number; r: number; a0: number; a1: number; stroke: StrokeP }
  | { t: 'path'; pts: Pt[]; closed: boolean; fill?: Paint; stroke?: StrokeP };

export interface LabelPrim {
  /** center, feet */
  x: number;
  y: number;
  layout: LabelLayout;
  fontFamily: string;
}

export interface NodeScene {
  id: Id;
  fill: Prim[];
  outline: Prim[];
  label: LabelPrim | null;
}

export interface Scene {
  connections: Prim[];
  nodes: NodeScene[];
  /** overlap treatments, drawn above all bubbles */
  overlays: Prim[];
  overlaps: Overlap[];
  /** feet per paper point at the drawing scale */
  ftPerPt: number;
}

export function graphicParams(g: GraphicSettings): SketchParams {
  return {
    wobble: g.wobble,
    overshoot: g.overshoot,
    passes: g.passes,
    pressure: g.pressure,
    fillStyle: g.fillStyle,
    fillOffset: g.fillOffset,
  };
}

export const LABEL_FONTS: Record<GraphicSettings['labelFont'], { family: string; upper: boolean; label: string }> = {
  clean: { family: LABEL_FONT_FAMILY, upper: false, label: 'Clean' },
  architect: { family: "'Architects Daughter', Helvetica, Arial, sans-serif", upper: true, label: 'Architect caps' },
  pen: { family: "'Kalam', Helvetica, Arial, sans-serif", upper: false, label: 'Pen hand' },
};

function seeded(id: string, seed: number): string {
  return seed ? `${id}~${seed}` : id;
}

function mix(a: string, b: string): string {
  const [r1, g1, b1] = hexToRgb(a);
  const [r2, g2, b2] = hexToRgb(b);
  return rgbToHex((r1 + r2) / 2, (g1 + g2) / 2, (b1 + b2) / 2);
}

/** Convert sketch ops into primitives with concrete colors. */
function opsToPrims(ops: Op[], colors: Record<ColorSlot, string>, fillAlpha: number): Prim[] {
  return ops.map((o): Prim => {
    const color = colors[o.color];
    const alpha = o.color === 'stroke' ? o.alpha : o.alpha * fillAlpha;
    return o.t === 'poly'
      ? { t: 'path', pts: o.pts, closed: true, fill: { color, alpha } }
      : { t: 'path', pts: o.pts, closed: false, stroke: { color, alpha, width: o.width, cap: 'round' } };
  });
}

function circleSamples(r: number, ftPerPt: number): number {
  const rPt = r / ftPerPt;
  return Math.max(48, Math.min(240, Math.round(rPt * 1.2)));
}

// cache sketched geometry per node so unchanged bubbles are not recomputed while dragging others
const nodeCache = new Map<Id, { key: string; scene: NodeScene }>();

function nodeScene(node: BubbleNode, project: Project, style: ResolvedStyle, base: SketchParams, suppressOutline: boolean): NodeScene {
  const ftPerPt = ptToFt(1, project.settings.scale);
  const g = project.settings.graphic;
  const key = JSON.stringify([node, style, base, suppressOutline, ftPerPt, g.labelFont, g.seed, measureEpoch()]);
  const hit = nodeCache.get(node.id);
  if (hit && hit.key === key) return hit.scene;

  const params = scaleParams(base, style.sketchAmount);
  const clean = isClean(params);
  const r = node.shape.radiusFt;
  const dashPt = dashPatternPt(style.strokeStyle, style.strokeWeightPt);
  const stroke: StrokeP | undefined =
    style.strokeWeightPt > 0 && !suppressOutline
      ? {
          color: style.stroke,
          alpha: 1,
          width: ptToFt(style.strokeWeightPt, project.settings.scale),
          dash: dashPt ? [dashPt[0] * ftPerPt, dashPt[1] * ftPerPt] : undefined,
          cap: style.strokeStyle === 'dotted' ? 'round' : 'butt',
        }
      : undefined;

  let fill: Prim[];
  let outline: Prim[];
  if (clean) {
    fill = [{ t: 'circle', cx: node.x, cy: node.y, r, fill: { color: style.fill, alpha: style.fillOpacity } }];
    outline = stroke ? [{ t: 'circle', cx: node.x, cy: node.y, r, stroke }] : [];
  } else {
    const ring = sampleCircle(node.x, node.y, r, circleSamples(r, ftPerPt));
    const colors = { fill: style.fill, fillDark: darken(style.fill, 0.28), stroke: style.stroke };
    const opts = { params, seed: seeded(node.id, g.seed), unitsPerPt: ftPerPt };
    fill = opsToPrims(sketchFill(ring, opts), colors, style.fillOpacity);
    outline = stroke
      ? opsToPrims(sketchClosedStroke(ring, { width: stroke.width, dash: stroke.dash }, opts), colors, 1).map((p) =>
          p.t === 'path' && p.stroke ? { ...p, stroke: { ...p.stroke, cap: stroke.cap === 'round' ? 'round' : p.stroke.cap } } : p,
        )
      : [];
  }

  const font = LABEL_FONTS[g.labelFont] ?? LABEL_FONTS.clean;
  const layout = layoutLabel(node, project, style, font);
  const scene: NodeScene = {
    id: node.id,
    fill,
    outline,
    label: layout.lines.length ? { x: node.x, y: node.y, layout, fontFamily: font.family } : null,
  };
  nodeCache.set(node.id, { key, scene });
  if (nodeCache.size > 5000) nodeCache.clear();
  return scene;
}

function arcPrims(
  cx: number,
  cy: number,
  r: number,
  [a0, a1]: Interval,
  stroke: StrokeP,
  params: SketchParams,
  seed: string,
  ftPerPt: number,
): Prim[] {
  if (isClean(params)) return [{ t: 'arc', cx, cy, r, a0, a1, stroke }];
  const pts = sampleArc(cx, cy, r, a0, a1, Math.min(0.05, (3 * ftPerPt) / r));
  return opsToPrims(sketchOpenStroke(pts, { width: stroke.width, dash: stroke.dash }, { params, seed, unitsPerPt: ftPerPt }), {
    fill: stroke.color,
    fillDark: stroke.color,
    stroke: stroke.color,
  }, 1);
}

function lensPolygon(A: { x: number; y: number; r: number }, B: { x: number; y: number; r: number }, ftPerPt: number): Pt[] {
  const ha = hiddenInterval(A, B);
  const hb = hiddenInterval(B, A);
  if (ha === 'all') return sampleCircle(A.x, A.y, A.r, circleSamples(A.r, ftPerPt));
  if (hb === 'all') return sampleCircle(B.x, B.y, B.r, circleSamples(B.r, ftPerPt));
  if (!ha || !hb) return [];
  const step = (r: number) => Math.min(0.05, (2 * ftPerPt) / r);
  return [...sampleArc(A.x, A.y, A.r, ha[0], ha[1], step(A.r)), ...sampleArc(B.x, B.y, B.r, hb[0], hb[1], step(B.r))];
}

export function buildScene(project: Project): Scene {
  const ftPerPt = ptToFt(1, project.settings.scale);
  const sd = (id: string) => seeded(id, project.settings.graphic.seed);
  const base = graphicParams(project.settings.graphic);
  const ov = project.settings.overlap;
  const overlaps = findOverlaps(project);
  const styles = new Map<Id, ResolvedStyle>();
  const styleOf = (id: Id) => {
    let s = styles.get(id);
    if (!s) styles.set(id, (s = resolveStyle(project.nodes[id], project)));
    return s;
  };
  const circle = (id: Id) => {
    const n = project.nodes[id];
    return { x: n.x, y: n.y, r: n.shape.radiusFt };
  };
  const overlapWidth = ptToFt(ov.weightPt, project.settings.scale);
  const colorFor = (ids: Id[]): string => {
    if (ov.color === 'dark') return '#333333';
    if (ov.color === 'blend') return ids.map((id) => styleOf(id).stroke).reduce((a, b) => mix(a, b));
    const largest = ids.reduce((a, b) => (circle(b).r > circle(a).r ? b : a));
    return styleOf(largest).stroke;
  };
  const paramsFor = (ids: Id[]) => scaleParams(base, Math.max(...ids.map((id) => styleOf(id).sketchAmount)));

  // ---- overlap treatments
  const overlays: Prim[] = [];
  const merged = new Set<Id>();
  for (const members of mergeClusters(overlaps).values()) {
    const color = colorFor(members);
    const params = paramsFor(members);
    const thick: StrokeP = { color, alpha: 1, width: overlapWidth, cap: 'round' };
    const inner: StrokeP | null =
      ov.innerArcs === 'hidden'
        ? null
        : {
            color,
            alpha: 0.8,
            width: 0.5 * ftPerPt,
            cap: 'butt',
            dash: ov.innerArcs === 'dashed' ? [3 * ftPerPt, 2.5 * ftPerPt] : undefined,
          };
    const memberSet = new Set(members);
    for (const id of members) {
      merged.add(id);
      const A = circle(id);
      const hidden: Interval[] = [];
      let all = false;
      for (const o of overlaps) {
        if (o.mode !== 'merge' || (o.a !== id && o.b !== id)) continue;
        const other = o.a === id ? o.b : o.a;
        if (!memberSet.has(other)) continue;
        const h = hiddenInterval(A, circle(other));
        if (h === 'all') all = true;
        else if (h) hidden.push(h);
      }
      const vis = all ? [] : visibleArcs(hidden);
      vis.forEach((arc, i) => overlays.push(...arcPrims(A.x, A.y, A.r, arc, thick, params, sd(`${id}:m${i}`), ftPerPt)));
      if (inner) {
        const innerArcs: Interval[] = all ? [[0, Math.PI * 2]] : hidden;
        innerArcs.forEach((arc, i) => overlays.push(...arcPrims(A.x, A.y, A.r, arc, inner, { ...params, overshoot: 0 }, sd(`${id}:i${i}`), ftPerPt)));
      }
    }
  }

  for (const o of overlaps) {
    if (o.mode === 'merge' || o.mode === 'none') continue;
    const ids = [o.a, o.b];
    const color = colorFor(ids);
    const params = paramsFor(ids);
    const thick: StrokeP = { color, alpha: 1, width: overlapWidth, cap: 'round' };
    const A = circle(o.a);
    const B = circle(o.b);
    if (o.mode === 'threshold') {
      if (!o.p1 || !o.p2) continue;
      if (isClean(params)) overlays.push({ t: 'path', pts: [o.p1, o.p2], closed: false, stroke: thick });
      else
        overlays.push(
          ...opsToPrims(sketchOpenStroke([o.p1, o.p2], { width: thick.width }, { params, seed: sd(`${o.key}:t`), unitsPerPt: ftPerPt }), {
            fill: color,
            fillDark: color,
            stroke: color,
          }, 1),
        );
      continue;
    }
    if (o.mode === 'lensFill') {
      const poly = lensPolygon(A, B, ftPerPt);
      if (poly.length < 3) continue;
      const fill = darken(mix(styleOf(o.a).fill, styleOf(o.b).fill), 0.12);
      overlays.push({ t: 'path', pts: poly, closed: true, fill: { color: fill, alpha: 0.6 } });
      const hatch = hatchRegion(poly, 45, 3 * ftPerPt, 0.5 * ftPerPt, sd(`${o.key}:h`), ftPerPt);
      overlays.push(...opsToPrims(hatch, { fill: color, fillDark: color, stroke: color }, 1));
    }
    // lens outline (also a thin edge for lensFill)
    const edge: StrokeP = o.mode === 'lens' ? thick : { ...thick, width: Math.max(0.75 * ftPerPt, overlapWidth * 0.4) };
    const ha = hiddenInterval(A, B);
    const hb = hiddenInterval(B, A);
    if (ha === 'all') overlays.push(...arcPrims(A.x, A.y, A.r, [0, Math.PI * 2], edge, params, sd(`${o.key}:la`), ftPerPt));
    else if (hb === 'all') overlays.push(...arcPrims(B.x, B.y, B.r, [0, Math.PI * 2], edge, params, sd(`${o.key}:lb`), ftPerPt));
    else {
      if (ha) overlays.push(...arcPrims(A.x, A.y, A.r, ha, edge, params, sd(`${o.key}:la`), ftPerPt));
      if (hb) overlays.push(...arcPrims(B.x, B.y, B.r, hb, edge, params, sd(`${o.key}:lb`), ftPerPt));
    }
  }

  // ---- nodes
  const nodes = project.nodeOrder.map((id) => nodeScene(project.nodes[id], project, styleOf(id), base, merged.has(id)));

  // ---- connections (sketched with the global character)
  const connections: Prim[] = [];
  for (const c of Object.values(project.connections)) {
    const a = project.nodes[c.from];
    const b = project.nodes[c.to];
    if (!a || !b) continue;
    const seg = connectionSegment(a, b, project);
    if (!seg) continue;
    const st = CONNECTION_STYLES[c.type];
    const dp = dashPatternPt(st.style, st.weightPt);
    const stroke: StrokeP = {
      color: CONNECTION_COLOR,
      alpha: 1,
      width: st.weightPt * ftPerPt,
      dash: dp ? [dp[0] * ftPerPt, dp[1] * ftPerPt] : undefined,
      cap: 'butt',
    };
    if (isClean(base)) connections.push({ t: 'path', pts: seg, closed: false, stroke });
    else
      connections.push(
        ...opsToPrims(sketchOpenStroke(seg, { width: stroke.width, dash: stroke.dash }, { params: base, seed: sd(c.id), unitsPerPt: ftPerPt }), {
          fill: CONNECTION_COLOR,
          fillDark: CONNECTION_COLOR,
          stroke: CONNECTION_COLOR,
        }, 1),
      );
  }

  return { connections, nodes, overlays, overlaps, ftPerPt };
}
