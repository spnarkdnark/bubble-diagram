import { useEffect, useRef, useState } from 'react';
import { Circle, Layer, Line, Rect, Stage, Label, Tag, Text } from 'react-konva';
import type { Bounds, Id, Point } from '../model/types';
import { orderedNodes, resolveFill, resolveStroke } from '../model/selectors';
import { boundaryPoint, shapeSize, withSize } from '../model/geometry';
import { MIN_RADIUS_FT } from '../model/defaults';
import { formatFeetInches, pxPerFt, snap } from '../model/units';
import { getDoc, useDoc, useDocument } from '../store/documentStore';
import { useUi } from '../store/uiStore';
import * as A from '../store/actions';
import { BubbleShape } from './shapes/BubbleShape';
import { ConnectionLine } from './shapes/ConnectionLine';
import { GridLayer } from './layers/GridLayer';
import { handlePosition, hitTest, topNodeAt } from './hitTest';

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
  | { kind: 'connect'; from: Id };

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
  const interaction = useRef<Interaction>({ kind: 'none' });
  const wheelAcc = useRef(0);
  const readoutTimer = useRef<number>(0);

  const k = pxPerFt(doc.settings.scale, view.zoom);
  const selectedNodes = new Set(selection.nodes);
  const selectedConns = new Set(selection.connections);
  const handleFor = tool === 'select' && selection.nodes.length === 1 ? selection.nodes[0] : null;

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
    return ui.tool === 'select' && ui.selection.nodes.length === 1 ? ui.selection.nodes[0] : null;
  };

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
    const hit = hitTest(doc, p, HIT_TOL_PX / currentK(), currentHandleFor());

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
        case 'marquee':
          setMarquee({
            minX: Math.min(it.start.x, p.x),
            minY: Math.min(it.start.y, p.y),
            maxX: Math.max(it.start.x, p.x),
            maxY: Math.max(it.start.y, p.y),
          });
          return;
      }
      if (ui.tool === 'connect' && ui.connectFrom) setPointerWorld(p);
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

  // ---- cursor feedback ----
  const updateCursor = (e: MouseEvent) => {
    const el = containerRef.current;
    if (!el) return;
    const ui = useUi.getState();
    if (ui.spaceDown) return void (el.style.cursor = 'grab');
    if (ui.tool === 'bubble') return void (el.style.cursor = 'copy');
    const r = el.getBoundingClientRect();
    if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) return;
    const hit = hitTest(getDoc(), toWorld(e.clientX, e.clientY), HIT_TOL_PX / currentK(), currentHandleFor());
    el.style.cursor =
      ui.tool === 'connect'
        ? hit.kind === 'node' ? 'crosshair' : 'default'
        : hit.kind === 'handle' ? 'ew-resize' : hit.kind === 'node' ? 'move' : hit.kind === 'connection' ? 'pointer' : 'default';
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
      if (over && ui.tool === 'select' && ui.selection.nodes.includes(over)) {
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
        A.stepRadius(ui.selection.nodes, dir, inc);
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
      onMouseDown={onMouseDown}
      onContextMenu={(e) => e.preventDefault()}
      onMouseLeave={() => setPointerWorld(null)}
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
          {Object.values(doc.connections).map((c) => {
            const a = doc.nodes[c.from];
            const b = doc.nodes[c.to];
            if (!a || !b) return null;
            return (
              <ConnectionLine key={c.id} a={a} b={b} type={c.type} scale={doc.settings.scale} selected={selectedConns.has(c.id)} k={k} />
            );
          })}
        </Layer>
        <Layer listening={false}>
          {nodes.map((n) => (
            <BubbleShape key={n.id} node={n} fill={resolveFill(n, doc)} stroke={resolveStroke(n, doc)} scale={doc.settings.scale} k={k} />
          ))}
        </Layer>
        <Layer listening={false}>
          {nodes
            .filter((n) => selectedNodes.has(n.id) || n.id === connectFrom)
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
            const p = boundaryPoint(fromNode, pointerWorld);
            return <Line points={[p.x, p.y, pointerWorld.x, pointerWorld.y]} stroke={ACCENT} strokeWidth={1.5 / k} dash={[6 / k, 4 / k]} />;
          })()}
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
      {nodes.length === 0 && (
        <div className="canvas-hint">
          Press <kbd>B</kbd> and click to place a bubble, or import a CSV.
        </div>
      )}
    </div>
  );
}
