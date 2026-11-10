import { useEffect } from 'react';
import { useDocument } from '../store/documentStore';
import { useUi } from '../store/uiStore';
import * as A from '../store/actions';
import { NUDGE_BIG_FT, NUDGE_FT } from '../model/defaults';

export interface ShortcutHandlers {
  save?: () => void;
  open?: () => void;
}

function isTyping(e: KeyboardEvent): boolean {
  const t = e.target as HTMLElement | null;
  if (!t) return false;
  const tag = t.tagName;
  if (tag === 'TEXTAREA' || t.isContentEditable) return true;
  if (tag === 'SELECT') return true;
  if (tag === 'INPUT') {
    const type = (t as HTMLInputElement).type;
    return !['checkbox', 'radio', 'range', 'color', 'button'].includes(type);
  }
  return false;
}

export function useKeyboardShortcuts(handlers: ShortcutHandlers = {}) {
  useEffect(() => {
    const onDown = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();
      const doc = useDocument.getState();
      const ui = useUi.getState();

      // Undo/redo/save work even while typing? Only outside text fields (let inputs undo text).
      if (isTyping(e)) return;
      if (ui.exportOpen) {
        if (e.key === 'Escape') ui.setExportOpen(false);
        return;
      }

      if (mod && key === 'z') {
        e.preventDefault();
        e.shiftKey ? doc.redo() : doc.undo();
        return;
      }
      if (mod && key === 'y') {
        e.preventDefault();
        doc.redo();
        return;
      }
      if (mod && key === 's') {
        e.preventDefault();
        handlers.save?.();
        return;
      }
      if (mod && key === 'o') {
        e.preventDefault();
        handlers.open?.();
        return;
      }
      if (mod && key === 'd') {
        e.preventDefault();
        A.duplicateSelection();
        return;
      }
      if (mod && key === 'a') {
        e.preventDefault();
        A.selectAll();
        return;
      }
      if (mod && key === '0') {
        e.preventDefault();
        A.setZoom(1);
        return;
      }
      if (mod && (key === '=' || key === '+')) {
        e.preventDefault();
        A.setZoom(ui.view.zoom * 1.25);
        return;
      }
      if (mod && key === '-') {
        e.preventDefault();
        A.setZoom(ui.view.zoom / 1.25);
        return;
      }
      if (mod) return;

      switch (e.key) {
        case ' ':
          e.preventDefault();
          if (!ui.spaceDown) ui.setSpaceDown(true);
          return;
        case 'Delete':
        case 'Backspace':
          e.preventDefault();
          A.deleteSelection();
          return;
        case 'Escape':
          if (doc.gestureBase) doc.cancelGesture();
          else if (ui.connectFrom) ui.setConnectFrom(null);
          else if (ui.tool !== 'select') ui.setTool('select');
          else ui.clearSelection();
          ui.setReadout(null);
          return;
        case 'ArrowUp':
        case 'ArrowDown':
        case 'ArrowLeft':
        case 'ArrowRight': {
          if (ui.selection.nodes.length === 0) return;
          e.preventDefault();
          const d = e.shiftKey ? NUDGE_BIG_FT : NUDGE_FT;
          const dx = e.key === 'ArrowLeft' ? -d : e.key === 'ArrowRight' ? d : 0;
          const dy = e.key === 'ArrowUp' ? -d : e.key === 'ArrowDown' ? d : 0;
          A.nudge(ui.selection.nodes, dx, dy);
          return;
        }
      }
      switch (key) {
        case 'v':
          ui.setTool('select');
          return;
        case 'b':
          ui.setTool('bubble');
          return;
        case 'c':
          ui.setTool('connect');
          return;
        case 'f':
          A.zoomToFit();
          return;
      }
    };
    const onUp = (e: KeyboardEvent) => {
      if (e.key === ' ') useUi.getState().setSpaceDown(false);
    };
    const onBlur = () => useUi.getState().setSpaceDown(false);
    window.addEventListener('keydown', onDown);
    window.addEventListener('keyup', onUp);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onDown);
      window.removeEventListener('keyup', onUp);
      window.removeEventListener('blur', onBlur);
    };
  }, [handlers]);
}
