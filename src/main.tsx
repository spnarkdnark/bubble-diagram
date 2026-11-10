import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import './styles/app.css';
import { loadAutosave } from './io/autosave';
import { useDocument } from './store/documentStore';

const saved = loadAutosave();
if (saved) useDocument.getState().replace(saved, true);

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
