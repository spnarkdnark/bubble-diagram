import { useEffect } from 'react';
import { CanvasStage } from './canvas/CanvasStage';
import { Toolbar } from './ui/Toolbar';
import { PropertiesPanel } from './ui/panels/PropertiesPanel';
import { ScaleBar } from './ui/ScaleBar';
import { Toast } from './ui/Toast';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { installSelectionPruning } from './store/actions';

export function App() {
  useEffect(() => installSelectionPruning(), []);
  useKeyboardShortcuts();
  return (
    <div className="app">
      <Toolbar />
      <main className="workspace">
        <div className="canvas-wrap">
          <CanvasStage />
          <ScaleBar />
        </div>
        <PropertiesPanel />
      </main>
      <Toast />
    </div>
  );
}
