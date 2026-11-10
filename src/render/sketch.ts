/**
 * Hand-drawn ("sketch") geometry. Pure functions, no DOM.
 *
 * Input: an exact path (dense polyline, closed or open) in any length unit.
 * Output: renderer-neutral draw ops that both the Konva canvas and the SVG/PDF
 * exporter draw identically. Character amounts are specified in PAPER POINTS
 * and converted with `unitsPerPt`, so the look is the same at every scale.
 *
 * Randomness is seeded (usually by element id), so a drawing never "boils".
 */

export interface Pt {
  x: number;
  y: number;
}

export type FillStyle = 'flat' | 'wash' | 'hatch' | 'pencil';

export interface SketchParams {
  /** 0..1 out-of-roundness / low-frequency hand wobble */
  wobble: number;
  /** 0..1 stroke runs past its closing point (and past line ends) */
  overshoot: number;
  /** 1..3 re-traced strokes */
  passes: number;
  /** 0..1 line weight swell & taper */
  pressure: number;
  fillStyle: FillStyle;
  /** 0..1 misregistration between fill and outline */
  fillOffset: number;
}

export const CLEAN: SketchParams = {
  wobble: 0,
  overshoot: 0,
  passes: 1,
  pressure: 0,
  fillStyle: 'flat',
  fillOffset: 0,
};

/** True when the params produce exact (non-sketched) geometry. */
export function isClean(p: SketchParams): boolean {
  return (
    p.wobble <= 0 && p.overshoot <= 0 && p.passes <= 1 && p.pressure <= 0 && p.fillStyle === 'flat' && p.fillOffset <= 0
  );
}

/** Scale the "hand" amounts of a param set (per-category sketch amount). */
export function scaleParams(p: SketchParams, amount: number): SketchParams {
  if (amount === 1) return p;
  const a = Math.max(0, amount);
  return {
    ...p,
    wobble: Math.min(1.5, p.wobble * a),
    overshoot: Math.min(1.5, p.overshoot * a),
    pressure: Math.min(1, p.pressure * a),
    fillOffset: Math.min(1.5, p.fillOffset * a),
    passes: a === 0 ? 1 : p.passes,
    fillStyle: a === 0 ? 'flat' : p.fillStyle,
  };
}

/** Color slot a renderer should use for an op. */
export type ColorSlot = 'fill' | 'fillDark' | 'stroke';

export type Op =
  /** closed polygon filled with `color` */
  | { t: 'poly'; pts: Pt[]; color: ColorSlot; alpha: number }
  /** polyline stroked with constant width */
  | { t: 'line'; pts: Pt[]; width: number; color: ColorSlot; alpha: number };

export interface StrokeOpts {
  /** stroke width in units */
  width: number;
  /** dash pattern [on, off] in units */
  dash?: [number, number];
  /** stroke color slot (default 'stroke') */
  color?: ColorSlot;
}

export interface SketchOpts {
  params: SketchParams;
  seed: string | number;
  /** units per paper point (ft-per-pt in the app, 1 when working in pt) */
  unitsPerPt: number;
}

// ---------------------------------------------------------------- random

function hashSeed(s: string | number): number {
  const str = String(s);
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function rng(seed: string | number): () => number {
  let a = hashSeed(seed) || 1;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Smooth 1D noise on u in [0,1); periodic when `periodic` (integer frequencies). */
function makeNoise(r: () => number, periodic: boolean): (u: number) => number {
  const terms = [1, 2, 3, 5].map((k) => ({
    f: periodic ? k : k * (0.7 + r() * 0.6),
    a: (r() * 0.6 + 0.4) / k,
    ph: r() * Math.PI * 2,
  }));
  const norm = terms.reduce((s, t) => s + t.a, 0);
  return (u) => terms.reduce((s, t) => s + t.a * Math.sin(u * Math.PI * 2 * t.f + t.ph), 0) / norm;
}

// ---------------------------------------------------------------- path helpers

export function sampleCircle(cx: number, cy: number, r: number, n = 96): Pt[] {
  const pts: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    pts.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r });
  }
  return pts;
}

export function sampleArc(cx: number, cy: number, r: number, a0: number, a1: number, stepRad = 0.06): Pt[] {
  const n = Math.max(2, Math.ceil(Math.abs(a1 - a0) / stepRad) + 1);
  const pts: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const a = a0 + ((a1 - a0) * i) / (n - 1);
    pts.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r });
  }
  return pts;
}

interface Measured {
  pts: Pt[];
  cum: number[];
  total: number;
}

function measure(pts: Pt[], closed: boolean): Measured {
  const cum = [0];
  const n = pts.length;
  const segs = closed ? n : n - 1;
  for (let i = 0; i < segs; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % n];
    cum.push(cum[i] + Math.hypot(b.x - a.x, b.y - a.y));
  }
  return { pts, cum, total: cum[cum.length - 1] };
}

/** Point and unit normal at arc length s (wraps when closed, extrapolates when open). */
function at(m: Measured, s: number, closed: boolean): { p: Pt; n: Pt; tan: Pt } {
  const { pts, cum, total } = m;
  const n = pts.length;
  if (closed) s = ((s % total) + total) % total;
  let i: number;
  if (s <= 0) i = 0;
  else if (s >= total) i = cum.length - 2;
  else {
    let lo = 0;
    let hi = cum.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (cum[mid] <= s) lo = mid;
      else hi = mid;
    }
    i = lo;
  }
  const a = pts[i];
  const b = pts[(i + 1) % n];
  const len = cum[i + 1] - cum[i] || 1e-9;
  const t = (s - cum[i]) / len; // may be <0 or >1 for open extrapolation
  const tx = (b.x - a.x) / len;
  const ty = (b.y - a.y) / len;
  return { p: { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }, n: { x: -ty, y: tx }, tan: { x: tx, y: ty } };
}

/** Turn a polyline with per-point widths into a filled outline polygon. */
export function strokeOutline(pts: Pt[], widths: number[]): Pt[] {
  const n = pts.length;
  if (n < 2) return [];
  const left: Pt[] = [];
  const right: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const a = pts[Math.max(0, i - 1)];
    const b = pts[Math.min(n - 1, i + 1)];
    let dx = b.x - a.x;
    let dy = b.y - a.y;
    const l = Math.hypot(dx, dy) || 1;
    dx /= l;
    dy /= l;
    const w = widths[i] / 2;
    left.push({ x: pts[i].x - dy * w, y: pts[i].y + dx * w });
    right.push({ x: pts[i].x + dy * w, y: pts[i].y - dx * w });
  }
  return left.concat(right.reverse());
}

/** Split a polyline into dash pieces by arc length. */
export function dashSplit(pts: Pt[], on: number, off: number): Pt[][] {
  const out: Pt[][] = [];
  let cur: Pt[] = [pts[0]];
  let drawing = true;
  let remain = on;
  for (let i = 1; i < pts.length; i++) {
    let a = pts[i - 1];
    const b = pts[i];
    let seg = Math.hypot(b.x - a.x, b.y - a.y);
    while (seg > remain) {
      const t = remain / seg;
      const mid = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
      if (drawing) {
        cur.push(mid);
        out.push(cur);
        cur = [];
      } else cur = [mid];
      drawing = !drawing;
      seg -= remain;
      a = mid;
      remain = drawing ? on : off;
    }
    remain -= seg;
    if (drawing) cur.push(b);
  }
  if (drawing && cur.length > 1) out.push(cur);
  return out;
}

export function polygonArea(pts: Pt[]): number {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const q = pts[(i + 1) % pts.length];
    a += p.x * q.y - q.x * p.y;
  }
  return a / 2;
}

/** Even-odd intervals where the infinite line p + t*d is inside the polygon(s). */
function clipLine(p: Pt, d: Pt, polys: Pt[][]): [number, number][] {
  const ts: number[] = [];
  for (const poly of polys) {
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i];
      const b = poly[(i + 1) % poly.length];
      const ex = b.x - a.x;
      const ey = b.y - a.y;
      const den = d.x * ey - d.y * ex;
      if (Math.abs(den) < 1e-12) continue;
      const t = ((a.x - p.x) * ey - (a.y - p.y) * ex) / den;
      const u = ((a.x - p.x) * d.y - (a.y - p.y) * d.x) / den;
      if (u >= 0 && u < 1) ts.push(t);
    }
  }
  ts.sort((x, y) => x - y);
  const out: [number, number][] = [];
  for (let i = 0; i + 1 < ts.length; i += 2) out.push([ts[i], ts[i + 1]]);
  return out;
}

// ---------------------------------------------------------------- strokes

function widthProfile(n: number, base: number, pressure: number, r: () => number, taper: boolean): number[] {
  const w: number[] = [];
  const swellPhase = r() * Math.PI * 2;
  for (let i = 0; i < n; i++) {
    const u = n > 1 ? i / (n - 1) : 0;
    let k = 1 + pressure * 0.35 * Math.sin(u * Math.PI * 2 * 1.5 + swellPhase);
    if (taper && pressure > 0) {
      const e = Math.min(u, 1 - u) / 0.08;
      k *= e < 1 ? 1 - pressure * 0.7 * (1 - e) * (1 - e) : 1;
    }
    w.push(Math.max(base * 0.15, base * k));
  }
  return w;
}

function emitStroke(ops: Op[], pts: Pt[], opts: StrokeOpts, pressure: number, alpha: number, r: () => number) {
  const color = opts.color ?? 'stroke';
  const pieces = opts.dash ? dashSplit(pts, opts.dash[0], opts.dash[1]) : [pts];
  for (const piece of pieces) {
    if (piece.length < 2) continue;
    if (pressure <= 0) {
      ops.push({ t: 'line', pts: piece, width: opts.width, color, alpha });
    } else {
      ops.push({
        t: 'poly',
        pts: strokeOutline(piece, widthProfile(piece.length, opts.width, pressure, r, true)),
        color,
        alpha,
      });
    }
  }
}

/** Hand-drawn amplitude in units for a path of characteristic size `sizeUnits`. */
function amplitude(params: SketchParams, sizeUnits: number, unitsPerPt: number): number {
  const sizePt = sizeUnits / unitsPerPt;
  return params.wobble * Math.min(7, 0.5 + 0.013 * sizePt) * unitsPerPt;
}

/** Re-sample a closed path with hand noise (no overshoot). Used for fills. */
function noisyLoop(m: Measured, amp: number, r: () => number, step: number, inset = 0): Pt[] {
  const noise = makeNoise(r, true);
  const n = Math.max(24, Math.ceil(m.total / step));
  const out: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const s = (i / n) * m.total;
    const { p, n: nn } = at(m, s, true);
    const d = noise(i / n) * amp - inset;
    out.push({ x: p.x + nn.x * d, y: p.y + nn.y * d });
  }
  return out;
}

/**
 * Sketch a CLOSED path's outline. `pts` must be a dense polygon.
 */
export function sketchClosedStroke(pts: Pt[], stroke: StrokeOpts, o: SketchOpts): Op[] {
  const ops: Op[] = [];
  const P = o.params;
  if (pts.length < 3) return ops;
  if (isClean(P)) {
    emitStroke(ops, [...pts, pts[0]], stroke, 0, 1, () => 0.5);
    return ops;
  }
  const m = measure(pts, true);
  const size = m.total / (Math.PI * 2);
  const amp = amplitude(P, size, o.unitsPerPt);
  const step = Math.max(m.total / 160, 1.2 * o.unitsPerPt);
  const passes = Math.max(1, Math.round(P.passes));

  for (let k = 0; k < passes; k++) {
    const r = rng(`${o.seed}:stroke:${k}`);
    const noise = makeNoise(r, true);
    const s0 = r() * m.total;
    // overshoot: mostly a small overlap, sometimes a tiny gap
    const ovFrac = P.overshoot * (r() < 0.2 ? -0.015 : 0.03 + r() * 0.07);
    const ov = Math.max(-m.total * 0.03, Math.min(ovFrac * m.total, 26 * o.unitsPerPt * Math.max(P.overshoot, 0.2)));
    const run = m.total + ov;
    const drift =
      (amp * 1.4 + stroke.width * 1.2 + 1.1 * o.unitsPerPt * P.overshoot) *
      (r() < 0.5 ? 1 : -1) *
      Math.min(1, P.overshoot + P.wobble);
    // the pen lifts off at the end of the stroke: a small outward flick
    const flick = P.overshoot * (1 + r() * 1.5) * o.unitsPerPt * (drift > 0 ? 1 : -1);
    const passJitter = k === 0 ? 0 : (r() - 0.5) * (amp + stroke.width * 1.5);
    const n = Math.max(24, Math.ceil(run / step));
    const out: Pt[] = [];
    for (let i = 0; i <= n; i++) {
      const s = s0 + (run * i) / n;
      const { p, n: nn } = at(m, s, true);
      const u = (s - s0) / m.total;
      const v = i / n;
      const tail = v > 0.88 ? ((v - 0.88) / 0.12) ** 2 : 0;
      const d = noise(u) * amp + drift * (v - 0.5) + flick * tail + passJitter;
      out.push({ x: p.x + nn.x * d, y: p.y + nn.y * d });
    }
    emitStroke(ops, out, stroke, P.pressure, k === 0 ? 1 : 0.5, r);
  }
  return ops;
}

/** Sketch an OPEN path (connection line, arc). */
export function sketchOpenStroke(pts: Pt[], stroke: StrokeOpts, o: SketchOpts): Op[] {
  const ops: Op[] = [];
  const P = o.params;
  if (pts.length < 2) return ops;
  if (isClean(P)) {
    emitStroke(ops, pts, stroke, 0, 1, () => 0.5);
    return ops;
  }
  const m = measure(pts, false);
  const amp = amplitude(P, m.total * 0.35, o.unitsPerPt) * 0.8;
  const step = Math.max(m.total / 80, 1.2 * o.unitsPerPt);
  const passes = Math.max(1, Math.round(P.passes));
  for (let k = 0; k < passes; k++) {
    const r = rng(`${o.seed}:open:${k}`);
    const noise = makeNoise(r, false);
    const ovA = P.overshoot * (2 + r() * 5) * o.unitsPerPt;
    const ovB = P.overshoot * (2 + r() * 5) * o.unitsPerPt;
    const start = -ovA;
    const end = m.total + ovB;
    const passJitter = k === 0 ? 0 : (r() - 0.5) * (amp + stroke.width * 1.5);
    const n = Math.max(8, Math.ceil((end - start) / step));
    const out: Pt[] = [];
    for (let i = 0; i <= n; i++) {
      const s = start + ((end - start) * i) / n;
      const { p, n: nn } = at(m, s, false);
      const u = i / n;
      // pin the ends a little so lines still meet their targets
      const env = Math.sin(Math.PI * Math.min(1, Math.max(0, u))) * 0.85 + 0.15;
      const d = noise(u) * amp * env + passJitter;
      out.push({ x: p.x + nn.x * d, y: p.y + nn.y * d });
    }
    emitStroke(ops, out, stroke, P.pressure, k === 0 ? 1 : 0.5, r);
  }
  return ops;
}

// ---------------------------------------------------------------- fills

function hatchLines(
  polys: Pt[][],
  angle: number,
  spacing: number,
  r: () => number,
  unitsPerPt: number,
  breakup: number,
): Pt[][] {
  const d = { x: Math.cos(angle), y: Math.sin(angle) };
  const nrm = { x: -d.y, y: d.x };
  let min = Infinity;
  let max = -Infinity;
  for (const poly of polys)
    for (const p of poly) {
      const c = p.x * nrm.x + p.y * nrm.y;
      min = Math.min(min, c);
      max = Math.max(max, c);
    }
  const lines: Pt[][] = [];
  for (let c = min + spacing * (0.3 + r() * 0.4); c < max; c += spacing * (0.85 + r() * 0.3)) {
    const origin = { x: nrm.x * c, y: nrm.y * c };
    for (const [t0, t1] of clipLine(origin, d, polys)) {
      // pull back from the edge a little, irregularly
      const a = t0 + r() * 1.2 * unitsPerPt;
      const b = t1 - r() * 1.2 * unitsPerPt;
      if (b - a < unitsPerPt) continue;
      if (breakup > 0) {
        let s = a;
        while (s < b) {
          const len = (6 + r() * 18) * unitsPerPt;
          const e = Math.min(b, s + len);
          if (r() > breakup * 0.3)
            lines.push([
              { x: origin.x + d.x * s, y: origin.y + d.y * s },
              { x: origin.x + d.x * e, y: origin.y + d.y * e },
            ]);
          s = e + r() * 2 * breakup * unitsPerPt;
        }
      } else {
        const mid = (a + b) / 2;
        const bow = (r() - 0.5) * 0.8 * unitsPerPt;
        lines.push([
          { x: origin.x + d.x * a, y: origin.y + d.y * a },
          { x: origin.x + d.x * mid + nrm.x * bow, y: origin.y + d.y * mid + nrm.y * bow },
          { x: origin.x + d.x * b, y: origin.y + d.y * b },
        ]);
      }
    }
  }
  return lines;
}

/**
 * Sketch a closed region's fill. Alphas are relative; the renderer multiplies
 * by the element's fill opacity.
 */
export function sketchFill(pts: Pt[], o: SketchOpts): Op[] {
  const P = o.params;
  const u = o.unitsPerPt;
  if (pts.length < 3) return [];
  if (isClean(P)) return [{ t: 'poly', pts, color: 'fill', alpha: 1 }];
  const m = measure(pts, true);
  const size = m.total / (Math.PI * 2);
  const amp = amplitude(P, size, u);
  const step = Math.max(m.total / 140, 1.5 * u);
  const r = rng(`${o.seed}:fill`);
  const offA = r() * Math.PI * 2;
  const off = P.fillOffset * (1.5 + (size / u) * 0.02) * u;
  const shift = (poly: Pt[]) => poly.map((p) => ({ x: p.x + Math.cos(offA) * off, y: p.y + Math.sin(offA) * off }));
  const base = shift(noisyLoop(m, amp * 0.8, r, step));
  const ops: Op[] = [];

  switch (P.fillStyle) {
    case 'flat':
      ops.push({ t: 'poly', pts: base, color: 'fill', alpha: 1 });
      break;
    case 'wash': {
      // layered translucent blooms + darker pigment rim
      for (let i = 0; i < 4; i++) {
        const loop = shift(noisyLoop(m, amp * 1.6 + 1.2 * u, r, step, (r() - 0.3) * 2.5 * u));
        ops.push({ t: 'poly', pts: loop, color: 'fill', alpha: 0.3 });
      }
      const rim = shift(noisyLoop(m, amp * 1.2 + 0.8 * u, r, step, 1.4 * u));
      ops.push({ t: 'line', pts: [...rim, rim[0]], width: 2.6 * u, color: 'fillDark', alpha: 0.16 });
      break;
    }
    case 'hatch': {
      ops.push({ t: 'poly', pts: base, color: 'fill', alpha: 0.35 });
      const angle = ((38 + r() * 14) * Math.PI) / 180;
      for (const l of hatchLines([base], angle, 3.2 * u, r, u, 0))
        ops.push({ t: 'line', pts: l, width: 0.9 * u, color: 'fillDark', alpha: 0.75 });
      break;
    }
    case 'pencil': {
      ops.push({ t: 'poly', pts: base, color: 'fill', alpha: 0.22 });
      const a1 = ((40 + r() * 10) * Math.PI) / 180;
      for (const l of hatchLines([base], a1, 1.4 * u, r, u, 0.6))
        ops.push({ t: 'line', pts: l, width: 0.45 * u, color: 'fill', alpha: 0.85 });
      for (const l of hatchLines([base], a1 + 0.22, 2.2 * u, r, u, 0.8))
        ops.push({ t: 'line', pts: l, width: 0.35 * u, color: 'fillDark', alpha: 0.35 });
      break;
    }
  }
  return ops;
}

/** Hatch a region with straight lines (used for overlap "shared zone" fills). */
export function hatchRegion(
  pts: Pt[],
  angleDeg: number,
  spacing: number,
  width: number,
  seed: string,
  unitsPerPt: number,
): Op[] {
  const r = rng(seed);
  return hatchLines([pts], (angleDeg * Math.PI) / 180, spacing, r, unitsPerPt, 0).map((l) => ({
    t: 'line' as const,
    pts: l,
    width,
    color: 'stroke' as const,
    alpha: 0.8,
  }));
}

// ---------------------------------------------------------------- presets

export interface Preset {
  id: string;
  label: string;
  params: SketchParams;
  paper: Paper;
}

export type Paper = 'none' | 'trace' | 'warm';

export const PRESETS: Preset[] = [
  { id: 'clean', label: 'Clean', paper: 'none', params: CLEAN },
  {
    id: 'fine-pen',
    label: 'Fine pen',
    paper: 'none',
    params: { wobble: 0.35, overshoot: 0.55, passes: 1, pressure: 0.45, fillStyle: 'flat', fillOffset: 0.35 },
  },
  {
    id: 'pencil',
    label: 'Pencil on trace',
    paper: 'trace',
    params: { wobble: 0.5, overshoot: 0.7, passes: 2, pressure: 0.55, fillStyle: 'pencil', fillOffset: 0.5 },
  },
  {
    id: 'marker',
    label: 'Marker',
    paper: 'none',
    params: { wobble: 0.4, overshoot: 0.8, passes: 1, pressure: 0.25, fillStyle: 'hatch', fillOffset: 0.6 },
  },
  {
    id: 'watercolor',
    label: 'Watercolor',
    paper: 'warm',
    params: { wobble: 0.45, overshoot: 0.6, passes: 2, pressure: 0.5, fillStyle: 'wash', fillOffset: 0.7 },
  },
];
