import type { Project } from '../model/types';
import { migrateProject } from '../model/migrate';
import { useDocument } from '../store/documentStore';

export const AUTOSAVE_KEY = 'bubble-diagram:autosave:v1';
const DEBOUNCE_MS = 500;

export function loadAutosave(): Project | null {
  try {
    const raw = localStorage.getItem(AUTOSAVE_KEY);
    return raw ? migrateProject(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

/** Subscribe to document changes and persist them (debounced). Returns unsubscribe. */
export function installAutosave(): () => void {
  let timer: number | undefined;
  const flush = () => {
    try {
      localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(useDocument.getState().history.present));
    } catch {
      /* quota or privacy mode: ignore */
    }
  };
  const unsub = useDocument.subscribe((s, prev) => {
    if (s.history.present === prev.history.present || s.gestureBase) return;
    window.clearTimeout(timer);
    timer = window.setTimeout(flush, DEBOUNCE_MS);
  });
  window.addEventListener('beforeunload', flush);
  return () => {
    unsub();
    window.clearTimeout(timer);
    window.removeEventListener('beforeunload', flush);
  };
}
