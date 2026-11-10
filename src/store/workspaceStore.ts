/**
 * Tabs. Each tab is an independent diagram with its own undo history, view and
 * selection. The ACTIVE tab lives in useDocument / useUi as before (so the rest
 * of the app is tab-unaware); inactive tabs are parked in `parked`.
 */
import { create } from 'zustand';
import type { Id, Project } from '../model/types';
import { createProject, newId } from '../model/factory';
import * as H from './history';
import { useDocument } from './documentStore';
import { useUi, type Selection, type View } from './uiStore';
import { zoomToFit } from './actions';

export interface TabState {
  history: H.HistoryState<Project>;
  view: View;
  selection: Selection;
}

interface WorkspaceState {
  /** tab ids in display order */
  order: Id[];
  activeId: Id;
  /** state of every tab except the active one */
  parked: Record<Id, TabState>;
  /** most recently closed tab, for "Reopen" */
  lastClosed: { state: TabState; index: number } | null;
}

const EMPTY_SELECTION: Selection = { nodes: [], connections: [], overlaps: [] };

export const useWorkspace = create<WorkspaceState>(() => ({
  order: [newId()],
  activeId: '',
  parked: {},
  lastClosed: null,
}));
// the first tab is the document that useDocument starts with
useWorkspace.setState((s) => ({ activeId: s.order[0] }));

/** Snapshot of the active tab from the live stores. */
function captureActive(): TabState {
  const ui = useUi.getState();
  return { history: useDocument.getState().history, view: { ...ui.view }, selection: ui.selection };
}

/** Load a tab's state into the live stores. */
function activate(t: TabState) {
  const ui = useUi.getState();
  ui.setTool('select');
  ui.setEditingLabel(null);
  ui.setReadout(null);
  useDocument.setState({ history: t.history, gestureBase: null });
  ui.setView(t.view);
  ui.select(t.selection);
}

/** A centered starting view for a new tab. */
function freshView(): View {
  const { width, height } = useUi.getState().stageSize;
  return { zoom: 1, panX: width / 2, panY: height / 2 };
}

/** "Untitled 2", "Untitled 3"... skipping names already open. */
function nextUntitledName(): string {
  const names = new Set(useWorkspace.getState().order.map((id) => tabName(id)));
  for (let i = 2; ; i++) if (!names.has(`Untitled ${i}`)) return `Untitled ${i}`;
}

export function tabName(id: Id): string {
  const ws = useWorkspace.getState();
  const p = id === ws.activeId ? useDocument.getState().history.present : ws.parked[id]?.history.present;
  return p?.meta.name || 'Untitled';
}

export function tabProject(id: Id): Project | undefined {
  const ws = useWorkspace.getState();
  return id === ws.activeId ? useDocument.getState().history.present : ws.parked[id]?.history.present;
}

export function switchTab(id: Id) {
  const ws = useWorkspace.getState();
  if (id === ws.activeId || !ws.parked[id]) return;
  useDocument.getState().cancelGesture();
  const current = captureActive();
  const target = ws.parked[id];
  const parked = { ...ws.parked, [ws.activeId]: current };
  delete parked[id];
  useWorkspace.setState({ activeId: id, parked });
  activate(target);
  // tabs restored without a saved view get framed on first visit
  if (target.view.panX === 0 && target.view.panY === 0) requestAnimationFrame(zoomToFit);
}

/** Open a new tab (after the active one) with `project`, or a blank diagram. */
export function newTab(project: Project = createProject(nextUntitledName()), view: View = freshView()): Id {
  const ws = useWorkspace.getState();
  useDocument.getState().cancelGesture();
  const id = newId();
  const at = ws.order.indexOf(ws.activeId) + 1;
  const order = [...ws.order.slice(0, at), id, ...ws.order.slice(at)];
  useWorkspace.setState({ order, activeId: id, parked: { ...ws.parked, [ws.activeId]: captureActive() } });
  activate({ history: H.initHistory(project), view, selection: EMPTY_SELECTION });
  return id;
}

export function closeTab(id: Id) {
  const ws = useWorkspace.getState();
  const index = ws.order.indexOf(id);
  if (index < 0) return;
  if (ws.order.length === 1) {
    // never zero tabs: closing the last one leaves a fresh blank diagram
    const state = captureActive();
    const fresh = newId();
    useWorkspace.setState({ order: [fresh], activeId: fresh, parked: {}, lastClosed: { state, index: 0 } });
    activate({ history: H.initHistory(createProject()), view: freshView(), selection: EMPTY_SELECTION });
    return;
  }
  if (id === ws.activeId) switchTab(ws.order[index + 1] ?? ws.order[index - 1]);
  const after = useWorkspace.getState();
  const state = after.parked[id];
  const parked = { ...after.parked };
  delete parked[id];
  useWorkspace.setState({ order: after.order.filter((t) => t !== id), parked, lastClosed: { state, index } });
}

export function reopenClosedTab() {
  const { lastClosed } = useWorkspace.getState();
  if (!lastClosed) return;
  const id = newTab(lastClosed.state.history.present, lastClosed.state.view);
  // restore its undo history and place it back where it was
  useDocument.setState({ history: lastClosed.state.history });
  const ws = useWorkspace.getState();
  const order = ws.order.filter((t) => t !== id);
  order.splice(Math.min(lastClosed.index, order.length), 0, id);
  useWorkspace.setState({ order, lastClosed: null });
}

export function moveTab(id: Id, toIndex: number) {
  const ws = useWorkspace.getState();
  const order = ws.order.filter((t) => t !== id);
  order.splice(Math.max(0, Math.min(toIndex, order.length)), 0, id);
  useWorkspace.setState({ order });
}

export function renameTab(id: Id, name: string) {
  const ws = useWorkspace.getState();
  if (id === ws.activeId) {
    useDocument.getState().commit((d) => {
      d.meta.name = name;
    });
    return;
  }
  const t = ws.parked[id];
  if (!t) return;
  const present = { ...t.history.present, meta: { ...t.history.present.meta, name } };
  useWorkspace.setState({ parked: { ...ws.parked, [id]: { ...t, history: H.push(t.history, present) } } });
}

/** Replace all tabs (used when restoring the saved workspace at startup). */
export function restoreWorkspace(tabs: { project: Project; view?: View }[], activeIndex: number) {
  if (tabs.length === 0) return;
  const ids = tabs.map(() => newId());
  const a = Math.max(0, Math.min(activeIndex, tabs.length - 1));
  const parked: Record<Id, TabState> = {};
  tabs.forEach((t, i) => {
    if (i !== a)
      parked[ids[i]] = {
        history: H.initHistory(t.project),
        view: t.view ?? { zoom: 1, panX: 0, panY: 0 },
        selection: EMPTY_SELECTION,
      };
  });
  useWorkspace.setState({ order: ids, activeId: ids[a], parked, lastClosed: null });
  useDocument.setState({ history: H.initHistory(tabs[a].project), gestureBase: null });
  if (tabs[a].view) useUi.getState().setView(tabs[a].view);
}
