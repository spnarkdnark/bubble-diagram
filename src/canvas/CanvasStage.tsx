/** The drawing surface: Konva stage, grid, the rendered scene, overlays and the name editor. */
import { useEffect, useMemo, useRef } from 'react';
import { Layer, Shape, Stage } from 'react-konva';
import type { Paper } from '../model/types';
import { pxPerFt } from '../model/units';
import { getDoc, useDoc } from '../store/documentStore';
import { useUi } from '../store/uiStore';
import * as A from '../store/actions';
import { buildScene, type Scene } from '../render/scene';
import { drawLabels, drawPrims } from '../render/drawCanvas';
import { loadWebFont } from '../render/fonts';
import { PAPER_COLORS, paperTileUrl } from '../render/paper';
import { GridLayer } from './layers/GridLayer';
import { LabelEditor } from './LabelEditor';
import { OverlayLayer } from './OverlayLayer';
import { useCanvasInput } from './input/useCanvasInput';
import { setLatestScene } from './query';

function paperStyle(paper: Paper): React.CSSProperties {
  const url = paperTileUrl(paper);
  return { backgroundColor: PAPER_COLORS[paper], backgroundImage: url ? `url(${url})` : undefined };
}

function drawScene(ctx: CanvasRenderingContext2D, scene: Scene, k: number, hideLabelOf: string | null) {
  drawPrims(ctx, scene.connections);
  for (const n of scene.nodes) {
    drawPrims(ctx, n.fill);
    drawPrims(ctx, n.outline);
  }
  drawPrims(ctx, scene.overlays);
  const labels = scene.nodes.flatMap((n) => (n.label && n.id !== hideLabelOf ? [n.label] : []));
  drawLabels(ctx, labels, k, scene.ftPerPt);
}

export function CanvasStage() {
  const containerRef = useRef<HTMLDivElement>(null);
  const doc = useDoc();
  const view = useUi((s) => s.view);
  const size = useUi((s) => s.stageSize);
  const tool = useUi((s) => s.tool);
  const shapeDraft = useUi((s) => s.shapeDraft);
  const editingLabel = useUi((s) => s.editingLabel);
  const fontEpoch = useUi((s) => s.fontEpoch);
  const input = useCanvasInput(containerRef);

  const k = pxPerFt(doc.settings.scale, view.zoom);
  // fontEpoch: rebuild once a web font loads so labels are re-measured
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const scene = useMemo(() => buildScene(doc), [doc, fontEpoch]);
  setLatestScene(scene);

  const labelFont = doc.settings.graphic.labelFont;
  useEffect(() => {
    let alive = true;
    loadWebFont(labelFont).then(() => alive && useUi.getState().bumpFontEpoch());
    return () => {
      alive = false;
    };
  }, [labelFont]);

  // track the container size; on first mount center the origin or frame the drawing
  useEffect(() => {
    const el = containerRef.current!;
    const ro = new ResizeObserver(() => useUi.getState().setStageSize(el.clientWidth, el.clientHeight));
    ro.observe(el);
    const ui = useUi.getState();
    ui.setStageSize(el.clientWidth, el.clientHeight);
    if (ui.view.panX === 0 && ui.view.panY === 0) {
      if (getDoc().nodeOrder.length) requestAnimationFrame(() => A.zoomToFit());
      else ui.setView({ panX: el.clientWidth / 2, panY: el.clientHeight / 2 });
    }
    return () => ro.disconnect();
  }, []);

  const editingNode = editingLabel ? doc.nodes[editingLabel] : undefined;
  const editingPrim = editingLabel ? scene.nodes.find((n) => n.id === editingLabel)?.label : undefined;
  const closeEditor = () => useUi.getState().setEditingLabel(null);

  return (
    <div
      ref={containerRef}
      className="canvas"
      style={paperStyle(doc.settings.graphic.paper)}
      onMouseDown={input.onMouseDown}
      onDoubleClick={input.onDoubleClick}
      onMouseLeave={input.onMouseLeave}
      onContextMenu={(e) => e.preventDefault()}
    >
      <Stage
        width={size.width}
        height={size.height}
        x={view.panX}
        y={view.panY}
        scaleX={k}
        scaleY={k}
        listening={false}
      >
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
            sceneFunc={(c) => drawScene(c._context as CanvasRenderingContext2D, scene, k, editingLabel)}
          />
        </Layer>
        <OverlayLayer doc={doc} scene={scene} k={k} />
      </Stage>

      {editingNode && editingPrim && (
        <LabelEditor
          key={editingLabel}
          name={editingNode.name}
          label={editingPrim}
          k={k}
          panX={view.panX}
          panY={view.panY}
          ftPerPt={scene.ftPerPt}
          onCommit={(text) => {
            A.renameNode(editingNode.id, text);
            closeEditor();
          }}
          onCancel={closeEditor}
        />
      )}

      {tool === 'shape' && (
        <div className="canvas-tip">
          {shapeDraft?.length
            ? 'Click to add points · click the first point, double-click or press Enter to close · Backspace removes the last point · Esc cancels'
            : 'Drag to draw a shape freehand, or click to place points. Edges near a bubble snap to it. Double-click in a gap between bubbles to fill it.'}
        </div>
      )}
      {doc.nodeOrder.length === 0 && (
        <div className="canvas-hint">
          Press <kbd>B</kbd> and click to place a bubble, or import a CSV.
        </div>
      )}
    </div>
  );
}
