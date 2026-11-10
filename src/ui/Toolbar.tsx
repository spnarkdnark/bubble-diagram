import type { ReactNode } from 'react';
import { useDoc, useDocument } from '../store/documentStore';
import { useUi, type Tool } from '../store/uiStore';
import * as A from '../store/actions';
import { SCALES } from '../model/units';
import { GRID_SPACINGS_FT } from '../model/defaults';
import type { ScaleId } from '../model/types';
import { FileMenu } from './FileMenu';
import { PRESET_OPTIONS } from './panels/GraphicPanel';

function ToolButton({ tool, label, shortcut, icon }: { tool: Tool; label: string; shortcut: string; icon: ReactNode }) {
  const active = useUi((s) => s.tool === tool);
  return (
    <button className={`tool ${active ? 'active' : ''}`} title={`${label} (${shortcut})`} onClick={() => useUi.getState().setTool(tool)}>
      {icon}
      <span>{label}</span>
    </button>
  );
}

const Icons = {
  select: (
    <svg width="16" height="16" viewBox="0 0 16 16"><path d="M3 2l9 5-4 1-1.5 4z" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" /></svg>
  ),
  bubble: (
    <svg width="16" height="16" viewBox="0 0 16 16"><circle cx="8" cy="8" r="5.5" fill="none" stroke="currentColor" strokeWidth="1.3" /><path d="M8 5.5v5M5.5 8h5" stroke="currentColor" strokeWidth="1.3" /></svg>
  ),
  shape: (
    <svg width="16" height="16" viewBox="0 0 16 16"><path d="M3 9c-1-3 1.5-6 4.5-5.5S11 2 13 4.5s.5 5.5-1.5 7.5-6 2.5-8.5-3z" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" /></svg>
  ),
  connect: (
    <svg width="16" height="16" viewBox="0 0 16 16"><circle cx="3.5" cy="12.5" r="2" fill="none" stroke="currentColor" strokeWidth="1.3" /><circle cx="12.5" cy="3.5" r="2" fill="none" stroke="currentColor" strokeWidth="1.3" /><path d="M5 11l6-6" stroke="currentColor" strokeWidth="1.3" /></svg>
  ),
};

export function Toolbar() {
  const doc = useDoc();
  const canUndo = useDocument((s) => s.history.past.length > 0);
  const canRedo = useDocument((s) => s.history.future.length > 0);
  const zoom = useUi((s) => s.view.zoom);
  const grid = doc.settings.grid;

  return (
    <header className="toolbar">
      <div className="brand">Bubble Diagram</div>
      <div className="group">
        <ToolButton tool="select" label="Select" shortcut="V" icon={Icons.select} />
        <ToolButton tool="bubble" label="Bubble" shortcut="B" icon={Icons.bubble} />
        <ToolButton tool="connect" label="Connect" shortcut="C" icon={Icons.connect} />
        <ToolButton tool="shape" label="Shape" shortcut="S" icon={Icons.shape} />
      </div>
      <div className="group">
        <button className="btn ghost" disabled={!canUndo} title="Undo (Ctrl+Z)" onClick={() => useDocument.getState().undo()}>↶</button>
        <button className="btn ghost" disabled={!canRedo} title="Redo (Ctrl+Shift+Z)" onClick={() => useDocument.getState().redo()}>↷</button>
      </div>
      <div className="group">
        <label className="inline-field" title="Drawing scale">
          <span>Scale</span>
          <select className="input" value={doc.settings.scale} onChange={(e) => A.setScale(e.target.value as ScaleId)}>
            {SCALES.map((s) => (
              <option key={s.id} value={s.id}>{s.label}</option>
            ))}
          </select>
        </label>
        <label className="inline-field checkbox">
          <input type="checkbox" checked={grid.visible} onChange={(e) => A.setGrid({ visible: e.target.checked })} />
          <span>Grid</span>
        </label>
        <select className="input narrow" value={grid.spacingFt} disabled={!grid.visible} title="Grid spacing" onChange={(e) => A.setGrid({ spacingFt: parseFloat(e.target.value) })}>
          {GRID_SPACINGS_FT.map((g) => (
            <option key={g} value={g}>{g}'</option>
          ))}
        </select>
      </div>
      <div className="group">
        <label className="inline-field" title="Graphic style">
          <span>Style</span>
          <select className="input" value={doc.settings.graphic.preset} onChange={(e) => e.target.value !== 'custom' && A.applyPreset(e.target.value)}>
            {PRESET_OPTIONS.map((o) => (
              <option key={o.value} value={o.value} disabled={o.value === 'custom'}>{o.label}</option>
            ))}
          </select>
        </label>
      </div>
      <div className="group">
        <button className="btn ghost" title="Zoom out" onClick={() => A.setZoom(zoom / 1.25)}>−</button>
        <button className="btn ghost zoom-label" title="100% = true paper size (Ctrl+0)" onClick={() => A.setZoom(1)}>{Math.round(zoom * 100)}%</button>
        <button className="btn ghost" title="Zoom in" onClick={() => A.setZoom(zoom * 1.25)}>+</button>
        <button className="btn ghost" title="Zoom to fit (F)" onClick={A.zoomToFit}>Fit</button>
      </div>
      <div className="spacer" />
      <FileMenu />
    </header>
  );
}
