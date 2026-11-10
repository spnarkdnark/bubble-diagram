import { useEffect, useMemo, useRef, useState } from 'react';
import { Circle, Layer, Line, Rect, Stage, Label, Tag, Text, Shape } from 'react-konva';
import type { Bounds, Id, Point } from '../model/types';
import { orderedNodes } from '../model/selectors';
import { boundaryPoint, connectionSegment, shapeSize, withSize } from '../model/geometry';
import { MIN_RADIUS_FT } from '../model/defaults';
import { formatFeetInches, pxPerFt, snap } from '../model/units';
import { getDoc, useDoc, useDocument } from '../store/documentStore';
import { useUi } from '../store/uiStore';
import * as A from '../store/actions';
import { buildScene } from '../render/scene';
import { drawLabels, drawPrims } from '../render/drawCanvas';
import { GridLayer } from './layers/GridLayer';
import { handlePosition, hitTest, topNodeAt } from './hitTest';
import { pointer } from './pointer';
import { loadWebFont } from '../render/fonts';
import { PAPER_COLORS, paperTileUrl } from '../render/paper';
import { blobFromClicks, blobFromStroke, blobGeometry, circleRings, movePoint, snapToRing, toBlobShape } from '../model/blob';
import type { BubbleNode } from '../model/types';

const ACCENT = '#2f7de1';
const HIT_TOL_PX = 7;
const DRAG_THRESHOLD_PX = 3;
const WHEEL_STEP_THRESHOLD = 40;

type Interaction =
  | { kind: 'none' }
  | { kind: 'pan'; sx: number; sy: number; panX: number; panY: number }
  | { kind: 'move'; sx: number; sy: number; start: Point; origins: Map<Id, Point>; moved: boolean; clicked: Id }
  | { kind: 'resize'; id: Id }
  | { kind: 'marquee'; start: Point; additive: boolean }
  | { kind: 'connect'; from: Id }
  | { kind: 'draw'; pts: Point[]; sx: number; sy: number; lx: number; ly: number; len: number }
  | { kind: 'blobPoint'; id: Id; index: number; moved: boolean };

type SnapHint = { x: number; y: number; R: number; at: Point } | null;

/** Single selected blob (select tool) whose control points are editable. */
function blobHandleTarget(): Id | null {
  const ui = useUi.getState();
  if (ui.tool !== 'select' || ui.selection.nodes.length !== 1) return null;
  const n = getDoc().nodes[ui.selection.nodes[0]];
  return n?.shape.kind === 'blob' ? n.id : null;
}

function paperStyle(paper: Parameters<typeof paperTileUrl>[0]): React.CSSProperties {
  const url = paperTileUrl(paper);
  return { backgroundColor: PAPER_COLORS[paper], backgroundImage: url ? `url(${url})` : undefined };
}

function flat(pts: Point[]): number[] {
  const out: number[] = [];
  for (const p of pts) out.push(p.x, p.y);
  return out;
}

/** Live outline of the click-drawn shape so far (including the cursor position). */
function draftOutline(draft: Point[], cursor: Point | null): Point[] {
  const pts = cursor ? [...draft, cursor] : draft;
  if (pts.length < 3) return pts;
  const doc = getDoc();
  const k = currentK();
  const rings = circleRings(doc);
  const { shape, origin } = toBlobShape(blobFromClicks(pts, rings, doc.settings.shapeGapFt, A.SNAP_PX / k), doc.settings.shapeGapFt, rings);
  const temp = { id: '__draft', name: '', x: origin.x, y: origin.y, shape, categoryId: null, style: {} } as BubbleNode;
  return blobGeometry(temp, doc).poly;
}

/** Stage scale (px per ft) from fresh store state. */
const currentK = () => pxPerFt(getDoc().settings.scale, useUi.getState().view.zoom);

export function CanvasStage() {
  const containerRef = useRef<HTMLDivElement>(null);
  const doc = useDoc();
  const view = useUi((s) => s.view);
  const size = useUi((s) => s.stageSize);
  const selection = useUi((s) => s.selection);
  const tool = useUi((s) => s.tool);
  const connectFrom = useUi((s) => s.connectFrom);
  const spaceDown = useUi((s) => s.spaceDown);
  const readout = useUi((s) => s.readout);

  const [marquee, setMarquee] = useState<Bounds | null>(null);
  const [pointerWorld, setPointerWorld] = useState<Point | null>(null);
  const [drawPreview, setDrawPreview] = useState<Point[] | null>(null);
  const [snapHint, setSnapHint] = useState<SnapHint>(null);
  const shapeDraft = useUi((s) => s.shapeDraft);
  const interaction = useRef<Interaction>({ kind: 'none' });
  const sceneRef = useRef<ReturnType<typeof buildScene> | null>(null);
  const wheelAcc = useRef(0);
  const readoutTimer = useRef<number>(0);

  const k = pxPerFt(doc.settings.scale, view.zoom);
  const selectedNodes = new Set(selection.nodes);
  const selectedConns = new Set(selection.connections);
  const selectedOverlaps = new Set(selection.overlaps);
  const fontEpoch = useUi((s) => s.fontEpoch);
  const scene = useMemo(() => buildScene(doc), [doc, fontEpoch]);
  sceneRef.current = scene;
  const handleFor =
    tool === 'select' && selection.nodes.length === 1 && doc.nodes[selection.nodes[0]]?.shape.kind === 'circle' ? selection.nodes[0] : null;
  const blobTarget = tool === 'select' && selection.nodes.length === 1 && doc.nodes[selection.nodes[0]]?.shape.kind === 'blob' ? selection.nodes[0] : null;

  // ---- hand fonts: re-measure labels once the web font is ready ----
  const labelFont = doc.settings.graphic.labelFont;
  useEffect(() => {
    let alive = true;
    loadWebFont(labelFont).then(() => alive && useUi.getState().bumpFontEpoch());
    return () => {
      alive = false;
    };
  }, [labelFont]);

  // ---- sizing ----
  useEffect(() => {
    const el = containerRef.current!;
    const ro = new ResizeObserver(() => useUi.getState().setStageSize(el.clientWidth, el.clientHeight));
    ro.observe(el);
    const ui = useUi.getState();
    ui.setStageSize(el.clientWidth, el.clientHeight);
    // initial view: world origin at center
    if (ui.view.panX === 0 && ui.view.panY === 0) {
      if (getDoc().nodeOrder.length) requestAnimationFrame(() => A.zoomToFit());
      else ui.setView({ panX: el.clientWidth / 2, panY: el.clientHeight / 2 });
    }
    return () => ro.disconnect();
  }, []);

  // ---- coordinate helpers (always read fresh state) ----
  const toScreen = (clientX: number, clientY: number): Point => {
    const r = containerRef.current!.getBoundingClientRect();
    return { x: clientX - r.left, y: clientY - r.top };
  };
  const toWorld = (clientX: number, clientY: number): Point => {
    const s = toScreen(clientX, clientY);
    const { panX, panY } = useUi.getState().view;
    const kk = currentK();
    return { x: (s.x - panX) / kk, y: (s.y - panY) / kk };
  };
  const currentHandleFor = () => {
    const ui = useUi.getState();
    if (ui.tool !== 'select' || ui.selection.nodes.length !== 1) return null;
    const id = ui.selection.nodes[0];
    return getDoc().nodes[id]?.shape.kind === 'circle' ? id : null;
  };
  /** overlap markers currently shown (either bubble or the overlap itself selected) */
  const visibleMarkers = () => {
    const sel = useUi.getState().selection;
    return (sceneRef.current?.overlaps ?? []).filter(
      (o) => sel.overlaps.includes(o.key) || sel.nodes.includes(o.a) || sel.nodes.includes(o.b),
    );
  };
  const hitAt = (p: Point) => hitTest(getDoc(), p, HIT_TOL_PX / currentK(), currentHandleFor(), visibleMarkers());
  /** control point of the selected blob under the cursor */
  const blobPointAt = (p: Point): { id: Id; index: number } | null => {
    const id = blobHandleTarget();
    if (!id) return null;
    const ctrl = blobGeometry(getDoc().nodes[id], getDoc()).ctrl;
    const tol = (HIT_TOL_PX * 1.2) / currentK();
    for (let i = 0; i < ctrl.length; i++) if (Math.hypot(p.x - ctrl[i].x, p.y - ctrl[i].y) <= tol) return { id, index: i };
    return null;
  };
  const snapAt = (p: Point, exclude?: Id) => {
    const doc = getDoc();
    const gap = exclude && doc.nodes[exclude]?.shape.kind === 'blob' ? (doc.nodes[exclude].shape as any).gapFt : doc.settings.shapeGapFt;
    return { snap: snapToRing(p, circleRings(doc), gap, A.SNAP_PX / currentK()), gap };
  };
  const hintFor = (snap: ReturnType<typeof snapToRing>, gap: number): SnapHint =>
    snap
      ? {
          x: snap.ring.x,
          y: snap.ring.y,
          R: snap.ring.r + gap,
          at: { x: snap.ring.x + Math.cos(snap.angle) * (snap.ring.r + gap), y: snap.ring.y + Math.sin(snap.angle) * (snap.ring.r + gap) },
        }
      : null;

  // ---- mouse down ----
  const onMouseDown = (e: React.MouseEvent) => {
    const ui = useUi.getState();
    (document.activeElement as HTMLElement | null)?.blur?.();
    if (e.button === 1 || (e.button === 0 && ui.spaceDown)) {
      e.preventDefault();
      interaction.current = { kind: 'pan', sx: e.clientX, sy: e.clientY, panX: ui.view.panX, panY: ui.view.panY };
      return;
    }
    if (e.button !== 0) return;
    const doc = getDoc();
    const p = toWorld(e.clientX, e.clientY);
    const hit = hitAt(p);

    if (ui.tool === 'shape') {
      interaction.current = { kind: 'draw', pts: [p], sx: e.clientX, sy: e.clientY, lx: e.clientX, ly: e.clientY, len: 0 };
      return;
    }

    if (ui.tool === 'select') {
      const bp = blobPointAt(p);
      if (bp) {
        interaction.current = { kind: 'blobPoint', id: bp.id, index: bp.index, moved: false };
        return;
      }
    }

    if (ui.tool === 'bubble') {
      A.addNode(p);
      if (!e.shiftKey) ui.setTool('select');
      return;
    }

    if (ui.tool === 'connect') {
      if (hit.kind === 'node') {
        if (ui.connectFrom && ui.connectFrom !== hit.id) {
          A.addConnection(ui.connectFrom, hit.id);
          ui.setConnectFrom(null);
        } else {
          ui.setConnectFrom(hit.id);
          interaction.current = { kind: 'connect', from: hit.id };
        }
      } else if (hit.kind === 'connection') {
        A.selectConnection(hit.id);
      } else ui.setConnectFrom(null);
      return;
    }

    switch (hit.kind) {
      case 'handle':
        useDocument.getState().beginGesture();
        interaction.current = { kind: 'resize', id: hit.id };
        break;
      case 'node': {
        const isSel = ui.selection.nodes.includes(hit.id);
        if (e.shiftKey) {
          A.toggleNodeSelection(hit.id);
          if (isSel) return; // deselected: no drag
        } else if (!isSel) A.selectNodes([hit.id]);
        const ids = useUi.getState().selection.nodes;
        interaction.current = {
          kind: 'move',
          sx: e.clientX,
          sy: e.clientY,
          start: p,
          origins: new Map(ids.map((id) => [id, { x: doc.nodes[id].x, y: doc.nodes[id].y }])),
          moved: false,
          clicked: hit.id,
        };
        break;
      }
      case 'connection':
        A.selectConnection(hit.id, e.shiftKey);
        break;
      case 'overlap':
        ui.select({ overlaps: [hit.key] });
        break;
      case 'empty':
        if (!e.shiftKey) ui.clearSelection();
        interaction.current = { kind: 'marquee', start: p, additive: e.shiftKey };
        break;
    }
  };

  // ---- window move / up (so drags continue outside the canvas) ----
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const it = interaction.current;
      const ui = useUi.getState();
      const p = toWorld(e.clientX, e.clientY);
      const rect = containerRef.current!.getBoundingClientRect();
      pointer.world = p;
      pointer.inside = e.clientX >= rect.left && e.clientX <= rect.right && e.clientY >= rect.top && e.clientY <= rect.bottom;
      switch (it.kind) {
        case 'pan':
          ui.setView({ panX: it.panX + e.clientX - it.sx, panY: it.panY + e.clientY - it.sy });
          return;
        case 'move': {
          if (!it.moved) {
            if (Math.hypot(e.clientX - it.sx, e.clientY - it.sy) < DRAG_THRESHOLD_PX) return;
            it.moved = true;
            useDocument.getState().beginGesture();
          } else if (!useDocument.getState().gestureBase) {
            interaction.current = { kind: 'none' }; // cancelled with Esc
            return;
          }
          const dx = p.x - it.start.x;
          const dy = p.y - it.start.y;
          useDocument.getState().preview((d) => {
            for (const [id, o] of it.origins) {
              if (!d.nodes[id]) continue;
              d.nodes[id].x = o.x + dx;
              d.nodes[id].y = o.y + dy;
            }
          });
          return;
        }
        case 'resize': {
          const n = getDoc().nodes[it.id];
          if (!n || !useDocument.getState().gestureBase) {
            interaction.current = { kind: 'none' };
            ui.setReadout(null);
            return;
          }
          let r = Math.hypot(p.x - n.x, p.y - n.y);
          if (!e.shiftKey) r = snap(r, getDoc().settings.snap.radiusIncrementFt);
          r = Math.max(MIN_RADIUS_FT, r);
          useDocument.getState().preview((d) => {
            d.nodes[it.id].shape = withSize(d.nodes[it.id].shape, r);
          });
          ui.setReadout({ text: `R ${formatFeetInches(r)}`, at: { x: n.x + r, y: n.y } });
          return;
        }
        case 'draw': {
          const step = Math.hypot(e.clientX - it.lx, e.clientY - it.ly);
          if (step < 2) return;
          it.len += step;
          it.lx = e.clientX;
          it.ly = e.clientY;
          it.pts.push(p);
          if (it.len > 6) setDrawPreview(it.pts.slice());
          const { snap, gap } = snapAt(p);
          setSnapHint(hintFor(snap, gap));
          return;
        }
        case 'blobPoint': {
          const node = getDoc().nodes[it.id];
          if (!node || node.shape.kind !== 'blob') return;
          if (!it.moved) {
            it.moved = true;
            useDocument.getState().beginGesture();
          } else if (!useDocument.getState().gestureBase) {
            interaction.current = { kind: 'none' };
            setSnapHint(null);
            return;
          }
          const { snap, gap } = e.altKey ? { snap: null, gap: 0 } : snapAt(p, it.id);
          setSnapHint(hintFor(snap, gap));
          const shape = movePoint(node, it.index, p, snap);
          useDocument.getState().preview((d) => {
            d.nodes[it.id].shape = shape;
          });
          return;
        }
        case 'marquee':
          setMarquee({
            minX: Math.min(it.start.x, p.x),
            minY: Math.min(it.start.y, p.y),
            maxX: Math.max(it.start.x, p.x),
            maxY: Math.max(it.start.y, p.y),
          });
          return;
      }
      if ((ui.tool === 'connect' && ui.connectFrom) || ui.tool === 'shape') setPointerWorld(p);
      if (ui.tool === 'shape') {
        const { snap, gap } = snapAt(p);
        setSnapHint(hintFor(snap, gap));
      }
      updateCursor(e);
    };

    const onUp = (e: MouseEvent) => {
      const it = interaction.current;
      interaction.current = { kind: 'none' };
      const ui = useUi.getState();
      switch (it.kind) {
        case 'move':
          if (it.moved) useDocument.getState().endGesture();
          else if (!e.shiftKey && ui.selection.nodes.length > 1) A.selectNodes([it.clicked]);
          break;
        case 'resize':
          useDocument.getState().endGesture();
          ui.setReadout(null);
          break;
        case 'blobPoint':
          if (it.moved) useDocument.getState().endGesture();
          setSnapHint(null);
          break;
        case 'draw': {
          setDrawPreview(null);
          const doc = getDoc();
          const kk = currentK();
          if (it.len < 6) {
            // a click: add a point to the draft, or close it on the first point
            const draft = ui.shapeDraft ?? [];
            const first = draft[0];
            if (first && draft.length >= 3 && Math.hypot(first.x - it.pts[0].x, first.y - it.pts[0].y) * kk < 10) A.finishShapeDraft();
            else ui.setShapeDraft([...draft, it.pts[0]]);
            break;
          }
          // freehand stroke
          ui.setShapeDraft(null);
          const pts = blobFromStroke(it.pts, circleRings(doc), doc.settings.shapeGapFt, A.SNAP_PX / kk, 4 / kk);
          if (A.createBlob(pts)) ui.setTool('select');
          setSnapHint(null);
          break;
        }
        case 'marquee': {
          setMarquee(null);
          const p = toWorld(e.clientX, e.clientY);
          const kk = currentK();
          if (Math.hypot(p.x - it.start.x, p.y - it.start.y) * kk < DRAG_THRESHOLD_PX) break;
          const rect = {
            minX: Math.min(it.start.x, p.x),
            minY: Math.min(it.start.y, p.y),
            maxX: Math.max(it.start.x, p.x),
            maxY: Math.max(it.start.y, p.y),
          };
          A.selectNodes(A.nodesInRect(rect), it.additive);
          break;
        }
        case 'connect': {
          // drag-to-connect: release over a different bubble
          const target = topNodeAt(getDoc(), toWorld(e.clientX, e.clientY));
          if (target && target !== it.from) {
            A.addConnection(it.from, target);
            ui.setConnectFrom(null);
            setPointerWorld(null);
          }
          break;
        }
      }
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, []);

  // ---- double click: finish a shape, fill a pocket, edit blob points ----
  const onDoubleClick = (e: React.MouseEvent) => {
    const ui = useUi.getState();
    const p = toWorld(e.clientX, e.clientY);
    const kk = currentK();
    if (ui.tool === 'shape') {
      const draft = ui.shapeDraft ?? [];
      // the two clicks of the double-click each added a point: drop them
      const near = (q: Point) => Math.hypot(q.x - p.x, q.y - p.y) * kk < 8;
      const kept = draft.filter((q, i) => !(i >= draft.length - 2 && near(q)));
      if (kept.length >= 3) {
        ui.setShapeDraft(kept);
        A.finishShapeDraft();
        ui.setTool('select');
      } else if (kept.length === 0) {
        ui.setShapeDraft(null);
        if (A.fillPocket(p)) ui.setTool('select');
      } else ui.setShapeDraft(kept);
      return;
    }
    const target = blobHandleTarget();
    if (ui.tool === 'select' && target) {
      const bp = blobPointAt(p);
      if (bp) return A.deleteBlobPoint(bp.id, bp.index);
      // on the edge: insert a point
      const geo = blobGeometry(getDoc().nodes[target], getDoc());
      let best = -1;
      let bd = Infinity;
      geo.poly.forEach((q, i) => {
        const d = Math.hypot(q.x - p.x, q.y - p.y);
        if (d < bd) {
          bd = d;
          best = i;
        }
      });
      if (best >= 0 && bd * kk < 10) A.insertBlobPoint(target, geo.seg[best], p);
    }
  };

  // ---- cursor feedback ----
  const updateCursor = (e: MouseEvent) => {
    const el = containerRef.current;
    if (!el) return;
    const ui = useUi.getState();
    if (ui.spaceDown) return void (el.style.cursor = 'grab');
    if (ui.tool === 'bubble') return void (el.style.cursor = 'copy');
    if (ui.tool === 'shape') return void (el.style.cursor = 'crosshair');
    const r = el.getBoundingClientRect();
    if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) return;
    const wp = toWorld(e.clientX, e.clientY);
    if (blobPointAt(wp)) return void (el.style.cursor = 'grab');
    const hit = hitAt(wp);
    el.style.cursor =
      ui.tool === 'connect'
        ? hit.kind === 'node' ? 'crosshair' : 'default'
        : hit.kind === 'handle' ? 'ew-resize' : hit.kind === 'node' ? 'move' : hit.kind === 'connection' || hit.kind === 'overlap' ? 'pointer' : 'default';
  };
  useEffect(() => {
    const el = containerRef.current;
    if (el && spaceDown) el.style.cursor = 'grab';
    else if (el) el.style.cursor = 'default';
  }, [spaceDown]);

  // ---- wheel: zoom, or resize a selected bubble under the cursor ----
  useEffect(() => {
    const el = containerRef.current!;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const scaleFactor = e.deltaMode === 1 ? 33 : e.deltaMode === 2 ? 400 : 1;
      // Shift+wheel is reported as horizontal scroll in some browsers
      const delta = (e.deltaY || e.deltaX) * scaleFactor;
      const screen = toScreen(e.clientX, e.clientY);

      if (e.ctrlKey || e.metaKey) {
        A.zoomAt(screen, Math.exp(-delta * 0.01));
        return;
      }
      const ui = useUi.getState();
      const doc = getDoc();
      const over = topNodeAt(doc, toWorld(e.clientX, e.clientY));
      if (over && ui.tool === 'select' && ui.selection.nodes.includes(over) && doc.nodes[over].shape.kind === 'circle') {
        // discrete mouse wheels step once per notch; trackpads accumulate
        let dir: 1 | -1 | 0 = 0;
        if (Math.abs(delta) >= WHEEL_STEP_THRESHOLD) {
          dir = delta < 0 ? 1 : -1;
          wheelAcc.current = 0;
        } else {
          wheelAcc.current += delta;
          if (Math.abs(wheelAcc.current) >= WHEEL_STEP_THRESHOLD) {
            dir = wheelAcc.current < 0 ? 1 : -1;
            wheelAcc.current = 0;
          }
        }
        if (!dir) return;
        const inc = e.shiftKey ? 1 / 12 : doc.settings.snap.radiusIncrementFt;
        A.stepRadius(ui.selection.nodes.filter((id) => doc.nodes[id]?.shape.kind === 'circle'), dir, inc);
        const n = getDoc().nodes[over];
        const r = shapeSize(n.shape);
        ui.setReadout({ text: `R ${formatFeetInches(r)}`, at: { x: n.x + r, y: n.y } });
        window.clearTimeout(readoutTimer.current);
        readoutTimer.current = window.setTimeout(() => useUi.getState().setReadout(null), 900);
        return;
      }
      A.zoomAt(screen, Math.exp(-delta * 0.0015));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  // ---- render ----
  const nodes = orderedNodes(doc);
  const handlePos = handleFor ? handlePosition(doc, handleFor) : null;
  const fromNode = connectFrom ? doc.nodes[connectFrom] : null;

  return (
    <div
      ref={containerRef}
      className="canvas"
      style={paperStyle(doc.settings.graphic.paper)}
      onMouseDown={onMouseDown}
      onContextMenu={(e) => e.preventDefault()}
      onDoubleClick={onDoubleClick}
      onMouseLeave={() => {
        setPointerWorld(null);
        pointer.inside = false;
      }}
    >
      <Stage width={size.width} height={size.height} x={view.panX} y={view.panY} scaleX={k} scaleY={k} listening={false}>
        {doc.settings.grid.visible && (
          <GridLayer
            spacingFt={doc.settings.grid.spacingFt}
            k={k}
            panX={view.panX}
            panY={view.panY}
            width={size.width}
            height={size.height}
          />
        )}
        <Layer listening={false}>
          <Shape
            listening={false}
            sceneFunc={(c) => {
              const ctx = c._context as CanvasRenderingContext2D;
              drawPrims(ctx, scene.connections);
              for (const n of scene.nodes) {
                drawPrims(ctx, n.fill);
                drawPrims(ctx, n.outline);
              }
              drawPrims(ctx, scene.overlays);
              drawLabels(ctx, scene.nodes.flatMap((n) => (n.label ? [n.label] : [])), k, scene.ftPerPt);
            }}
          />
        </Layer>
        <Layer listening={false}>
          {Object.values(doc.connections)
            .filter((c) => selectedConns.has(c.id))
            .map((c) => {
              const seg = doc.nodes[c.from] && doc.nodes[c.to] ? connectionSegment(doc.nodes[c.from], doc.nodes[c.to], doc) : null;
              return seg ? (
                <Line key={c.id} points={[seg[0].x, seg[0].y, seg[1].x, seg[1].y]} stroke={ACCENT} opacity={0.45} strokeWidth={6 / k} lineCap="round" />
              ) : null;
            })}
          {scene.overlaps
            .filter((o) => selectedOverlaps.has(o.key) || selectedNodes.has(o.a) || selectedNodes.has(o.b))
            .map((o) => (
              <Rect
                key={o.key}
                x={o.marker.x}
                y={o.marker.y}
                offsetX={5 / k}
                offsetY={5 / k}
                width={10 / k}
                height={10 / k}
                rotation={45}
                fill={selectedOverlaps.has(o.key) ? ACCENT : '#fff'}
                stroke={ACCENT}
                strokeWidth={1.5 / k}
              />
            ))}
          {nodes
            .filter((n) => n.shape.kind === 'blob' && (selectedNodes.has(n.id) || n.id === connectFrom))
            .map((n) => (
              <Line key={n.id} points={flat(blobGeometry(n, doc).poly)} closed stroke={ACCENT} strokeWidth={1.5 / k} dash={n.id === connectFrom ? [4 / k, 3 / k] : undefined} />
            ))}
          {nodes
            .filter((n) => n.shape.kind === 'circle' && (selectedNodes.has(n.id) || n.id === connectFrom))
            .map((n) => (
              <Circle
                key={n.id}
                x={n.x}
                y={n.y}
                radius={shapeSize(n.shape) + 3 / k}
                stroke={ACCENT}
                strokeWidth={1.5 / k}
                dash={n.id === connectFrom ? [4 / k, 3 / k] : undefined}
              />
            ))}
          {handlePos && (
            <Rect
              x={handlePos.x - 4.5 / k}
              y={handlePos.y - 4.5 / k}
              width={9 / k}
              height={9 / k}
              fill="#fff"
              stroke={ACCENT}
              strokeWidth={1.5 / k}
            />
          )}
          {fromNode && pointerWorld && (() => {
            const p = boundaryPoint(fromNode, pointerWorld, doc);
            return <Line points={[p.x, p.y, pointerWorld.x, pointerWorld.y]} stroke={ACCENT} strokeWidth={1.5 / k} dash={[6 / k, 4 / k]} />;
          })()}
          {blobTarget &&
            blobGeometry(doc.nodes[blobTarget], doc).ctrl.map((c, i) => {
              const pt = (doc.nodes[blobTarget].shape as any).points[i];
              return (
                <Circle
                  key={i}
                  x={c.x}
                  y={c.y}
                  radius={4.5 / k}
                  fill={pt?.t === 'anchor' ? ACCENT : '#fff'}
                  stroke={ACCENT}
                  strokeWidth={1.5 / k}
                />
              );
            })}
          {snapHint && (
            <>
              <Circle x={snapHint.x} y={snapHint.y} radius={snapHint.R} stroke={ACCENT} strokeWidth={1 / k} dash={[5 / k, 4 / k]} opacity={0.8} />
              <Circle x={snapHint.at.x} y={snapHint.at.y} radius={3.5 / k} fill={ACCENT} />
            </>
          )}
          {drawPreview && <Line points={flat(drawPreview)} stroke="#3a3a3a" strokeWidth={1.4 / k} lineCap="round" lineJoin="round" opacity={0.85} />}
          {shapeDraft && shapeDraft.length > 0 && (
            <>
              <Line points={flat(draftOutline(shapeDraft, pointerWorld))} closed stroke={ACCENT} strokeWidth={1.5 / k} fill="rgba(47,125,225,0.06)" />
              {shapeDraft.map((q, i) => (
                <Circle key={i} x={q.x} y={q.y} radius={(i === 0 ? 5 : 3.5) / k} fill={i === 0 ? '#fff' : ACCENT} stroke={ACCENT} strokeWidth={1.5 / k} />
              ))}
            </>
          )}
          {marquee && (
            <Rect
              x={marquee.minX}
              y={marquee.minY}
              width={marquee.maxX - marquee.minX}
              height={marquee.maxY - marquee.minY}
              fill="rgba(47,125,225,0.06)"
              stroke={ACCENT}
              strokeWidth={1 / k}
            />
          )}
          {readout && (
            <Label x={readout.at.x + 10 / k} y={readout.at.y - 10 / k} scaleX={1 / k} scaleY={1 / k}>
              <Tag fill="#1f2328" cornerRadius={3} />
              <Text text={readout.text} fill="#fff" fontSize={12} padding={5} fontFamily="system-ui, sans-serif" />
            </Label>
          )}
        </Layer>
      </Stage>
      {tool === 'shape' && (
        <div className="canvas-tip">
          {shapeDraft?.length
            ? 'Click to add points · click the first point, double-click or press Enter to close · Backspace removes the last point · Esc cancels'
            : 'Drag to draw a shape freehand, or click to place points. Edges near a bubble snap to it. Double-click in a gap between bubbles to fill it.'}
        </div>
      )}
      {nodes.length === 0 && (
        <div className="canvas-hint">
          Press <kbd>B</kbd> and click to place a bubble, or import a CSV.
        </div>
      )}
    </div>
  );
}
