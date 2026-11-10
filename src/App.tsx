import { useEffect } from 'react';
import { CanvasStage } from './canvas/CanvasStage';
import { Toolbar } from './ui/Toolbar';
import { PropertiesPanel } from './ui/panels/PropertiesPanel';
import { ScaleBar } from './ui/ScaleBar';
import { Toast } from './ui/Toast';
import { ExportDialog } from './ui/ExportDialog';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { installSelectionPruning } from './store/actions';
import { installAutosave } from './io/autosave';
import { installClipboard } from './io/clipboardActions';
import { openProject, saveProject } from './io/fileActions';

const shortcutHandlers = { save: saveProject, open: openProject };

export function App() {
  useEffect(() => installSelectionPruning(), []);
  useEffect(() => installAutosave(), []);
  useEffect(() => installClipboard(), []);
  useKeyboardShortcuts(shortcutHandlers);
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
      <ExportDialog />
      <Toast />
    </div>
  );
}
