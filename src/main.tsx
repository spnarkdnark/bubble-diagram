import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import './styles/app.css';
import { restoreAutosave } from './io/autosave';

restoreAutosave();

// test hook for the Playwright suite (development builds only)
if (import.meta.env.DEV) {
  void Promise.all([import('./store/documentStore'), import('./store/uiStore'), import('./store/workspaceStore')]).then(([d, u, w]) => {
    (window as unknown as { __bd: unknown }).__bd = { doc: d.useDocument, ui: u.useUi, ws: w.useWorkspace };
  });
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
