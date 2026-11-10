/**
 * Autosave: every open tab (document + view) is written to localStorage,
 * debounced. Undo history is not persisted.
 */
import { SCHEMA_VERSION, type Project } from '../model/types';
import { standardsOf, type Standards } from '../model/standards';
import { getStandards } from '../store/standardsStore';
import { migrateProject } from '../model/migrate';
import { useDocument } from '../store/documentStore';
import { useUi, type View } from '../store/uiStore';
import { restoreWorkspace, tabProject, useWorkspace } from '../store/workspaceStore';

export const WORKSPACE_KEY = 'bubble-diagram:workspace:v1';
/** single-document autosave from before tabs existed */
const LEGACY_KEY = 'bubble-diagram:autosave:v1';
const DEBOUNCE_MS = 500;

interface SavedWorkspace {
  active: number;
  tabs: { project: unknown; view?: View }[];
  /** shared category standards (absent in saves from before standards existed) */
  standards?: unknown;
}

/** Validate saved standards by running them through the project migrator. */
function readStandards(raw: unknown): Standards | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const r = raw as Partial<Standards>;
  try {
    const p = migrateProject({
      schemaVersion: SCHEMA_VERSION,
      nodes: {},
      categories: r.categories,
      categoryOrder: r.categoryOrder,
      settings: { defaultStyle: r.defaultStyle },
    });
    return standardsOf(p);
  } catch {
    return undefined;
  }
}

/** Restore saved tabs into the stores. Returns true when something was restored. */
export function restoreAutosave(): boolean {
  try {
    const raw = localStorage.getItem(WORKSPACE_KEY);
    if (raw) {
      const saved = JSON.parse(raw) as SavedWorkspace;
      const tabs: { project: Project; view?: View }[] = [];
      for (const t of saved.tabs ?? []) {
        try {
          tabs.push({ project: migrateProject(t.project), view: t.view });
        } catch {
          /* skip a damaged tab rather than losing all of them */
        }
      }
      if (tabs.length) {
        restoreWorkspace(tabs, saved.active ?? 0, readStandards(saved.standards));
        return true;
      }
    }
    const legacy = localStorage.getItem(LEGACY_KEY);
    if (legacy) {
      restoreWorkspace([{ project: migrateProject(JSON.parse(legacy)) }], 0);
      return true;
    }
  } catch {
    /* unreadable storage: start fresh */
  }
  return false;
}

function snapshot(): SavedWorkspace {
  const ws = useWorkspace.getState();
  const ui = useUi.getState();
  return {
    active: ws.order.indexOf(ws.activeId),
    standards: getStandards(),
    tabs: ws.order.map((id) => ({
      project: tabProject(id),
      view: id === ws.activeId ? ui.view : ws.parked[id]?.view,
    })),
  };
}

/** Persist the workspace whenever a document, the tab list or a view changes. */
export function installAutosave(): () => void {
  let timer: number | undefined;
  let warned = false;
  const flush = () => {
    try {
      localStorage.setItem(WORKSPACE_KEY, JSON.stringify(snapshot()));
      localStorage.removeItem(LEGACY_KEY);
    } catch {
      if (!warned) {
        warned = true;
        useUi.getState().showToast('Autosave failed (browser storage is full). Use File → Save to keep your work.');
      }
    }
  };
  const schedule = () => {
    if (useDocument.getState().gestureBase) return;
    window.clearTimeout(timer);
    timer = window.setTimeout(flush, DEBOUNCE_MS);
  };
  const unsubs = [
    useDocument.subscribe((s, prev) => s.history.present !== prev.history.present && schedule()),
    useWorkspace.subscribe(schedule),
    useUi.subscribe((s, prev) => s.view !== prev.view && schedule()),
  ];
  window.addEventListener('beforeunload', flush);
  return () => {
    unsubs.forEach((u) => u());
    window.clearTimeout(timer);
    window.removeEventListener('beforeunload', flush);
  };
}
