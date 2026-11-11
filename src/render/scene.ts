/**
 * Scene builder: turns a Project into renderer-neutral primitives in WORLD FEET.
 * The canvas (render/drawCanvas.ts) and the SVG/PDF/PNG exporter
 * (io/export/svg.ts) both draw from this, so they always match.
 *
 * Everything visual about an element (category style, overrides, sketch
 * character, overlap treatment) is decided here or in overlapScene.ts.
 */
import type { BubbleNode, GraphicSettings, Id, Project } from '../model/types';
import { resolveStyle, type ResolvedStyle } from '../model/selectors';
import { connectionSegment, nodeCenter, nodeOutline } from '../model/geometry';
import { blobGeometry } from '../model/blob';
import { CONNECTION_COLOR, CONNECTION_STYLES, dashPatternPt, LABEL_FONT_FAMILY } from '../model/defaults';
import { darken } from '../model/color';
import { ptToFt } from '../model/units';
import { findOverlaps, type Overlap } from '../model/overlaps';
import { layoutLabel, measureEpoch, type LabelLayout } from '../canvas/textLayout';
import { isClean, sampleCircle, scaleParams, sketchClosedStroke, sketchFill, type SketchParams } from './sketch';
import {
  circleSamples,
  opsToPrims,
  openStrokePrims,
  resample,
  seeded,
  subdivide,
  type Prim,
  type StrokeP,
} from './primitives';
import { buildOverlays } from './overlapScene';

export type { Paint, Prim, StrokeP } from './primitives';

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

// Cache sketched geometry per node so unchanged bubbles are not recomputed while dragging others.
// The key is the node's full visual input as JSON (not object identity): a shape's geometry
// depends on the bubbles it hugs, so identity alone would miss changes.
const nodeCache = new Map<Id, { key: string; scene: NodeScene }>();

function nodeScene(
  node: BubbleNode,
  project: Project,
  style: ResolvedStyle,
  base: SketchParams,
  suppressOutline: boolean,
): NodeScene {
  const ftPerPt = ptToFt(1, project.settings.scale);
  const g = project.settings.graphic;
  const blob = node.shape.kind === 'blob' ? blobGeometry(node, project) : null;
  const key = JSON.stringify([
    node,
    style,
    base,
    suppressOutline,
    ftPerPt,
    g.labelFont,
    g.seed,
    measureEpoch(),
    blob?.ctrl,
  ]);
  const hit = nodeCache.get(node.id);
  if (hit && hit.key === key) return hit.scene;

  const params = scaleParams(base, style.sketchAmount);
  const clean = isClean(params);
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
  const fillPaint = { color: style.fill, alpha: style.fillOpacity };

  // circles are exact; every other shape is its outline polygon
  const poly = blob ? blob.poly : nodeOutline(node, project);
  let fill: Prim[];
  let outline: Prim[];
  if (clean) {
    if (!poly && node.shape.kind === 'circle') {
      const r = node.shape.radiusFt;
      fill = [{ t: 'circle', cx: node.x, cy: node.y, r, fill: fillPaint }];
      outline = stroke ? [{ t: 'circle', cx: node.x, cy: node.y, r, stroke }] : [];
    } else {
      const pts = poly ?? [];
      fill = [{ t: 'path', pts, closed: true, fill: fillPaint }];
      outline = stroke ? [{ t: 'path', pts, closed: true, stroke }] : [];
    }
  } else {
    const ring =
      !poly && node.shape.kind === 'circle'
        ? sampleCircle(node.x, node.y, node.shape.radiusFt, circleSamples(node.shape.radiusFt, ftPerPt))
        : node.shape.kind === 'blob'
          ? resample(poly ?? [], 1.5 * ftPerPt) // smooth outline
          : subdivide(poly ?? [], 1.5 * ftPerPt); // sharp corners
    const colors = { fill: style.fill, fillDark: darken(style.fill, 0.28), stroke: style.stroke };
    const opts = { params, seed: seeded(node.id, g.seed), unitsPerPt: ftPerPt };
    fill = opsToPrims(sketchFill(ring, opts), colors, style.fillOpacity);
    outline = stroke
      ? opsToPrims(sketchClosedStroke(ring, { width: stroke.width, dash: stroke.dash }, opts), colors, 1).map((p) =>
          p.t === 'path' && p.stroke
            ? { ...p, stroke: { ...p.stroke, cap: stroke.cap === 'round' ? 'round' : p.stroke.cap } }
            : p,
        )
      : [];
  }

  const font = LABEL_FONTS[g.labelFont] ?? LABEL_FONTS.clean;
  const layout = layoutLabel(node, project, style, font);
  const scene: NodeScene = {
    id: node.id,
    fill,
    outline,
    label: layout.lines.length ? { ...nodeCenter(node, project), layout, fontFamily: font.family } : null,
  };
  nodeCache.set(node.id, { key, scene });
  if (nodeCache.size > 5000) nodeCache.clear();
  return scene;
}

export function buildScene(project: Project): Scene {
  const ftPerPt = ptToFt(1, project.settings.scale);
  const seed = (key: string) => seeded(key, project.settings.graphic.seed);
  const base = graphicParams(project.settings.graphic);
  const overlaps = findOverlaps(project);
  const styles = new Map<Id, ResolvedStyle>();
  const styleOf = (id: Id) => {
    let s = styles.get(id);
    if (!s) styles.set(id, (s = resolveStyle(project.nodes[id], project)));
    return s;
  };

  const { prims: overlays, merged } = buildOverlays({ project, overlaps, styleOf, base, seed, ftPerPt });
  const nodes = project.nodeOrder.map((id) => nodeScene(project.nodes[id], project, styleOf(id), base, merged.has(id)));

  // connections, sketched with the drawing's own character
  const connections: Prim[] = [];
  for (const c of Object.values(project.connections)) {
    const a = project.nodes[c.from];
    const b = project.nodes[c.to];
    const seg = a && b ? connectionSegment(a, b, project) : null;
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
    connections.push(...openStrokePrims(seg, stroke, base, seed(c.id), ftPerPt));
  }

  return { connections, nodes, overlays, overlaps, ftPerPt };
}

/** World-space box (feet) around a label's name lines (or its secondary line); null when it has none. */
export function labelRect(
  label: LabelPrim | null,
  ftPerPt: number,
  secondary = false,
): { minX: number; minY: number; maxX: number; maxY: number } | null {
  if (!label) return null;
  const lines = label.layout.lines.filter((l) => l.secondary === secondary);
  if (lines.length === 0) return null;
  const w = Math.max(...lines.map((l) => l.wPt), lines[0].sizePt * 2);
  const top = lines[0].topPt;
  const bottom = lines[lines.length - 1].topPt + lines[lines.length - 1].heightPt;
  return {
    minX: label.x - (w / 2) * ftPerPt,
    maxX: label.x + (w / 2) * ftPerPt,
    minY: label.y + top * ftPerPt,
    maxY: label.y + bottom * ftPerPt,
  };
}
