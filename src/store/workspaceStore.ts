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
import { adoptProject, applyStandards, hasStandards, standardsOf, type Standards } from '../model/standards';
import { getStandards, setStandards } from './standardsStore';

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
export function newTab(incoming: Project = createProject(nextUntitledName()), view: View = freshView()): Id {
  const { project } = adoptIntoStandards(incoming);
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
export function restoreWorkspace(
  saved: { project: Project; view?: View }[],
  activeIndex: number,
  standards?: Standards,
) {
  if (saved.length === 0) return;
  const ids = saved.map(() => newId());
  const a = Math.max(0, Math.min(activeIndex, saved.length - 1));
  // every tab follows one set of standards: the saved ones, or (first run) the active tab's
  let s = standards ?? standardsOf(saved[a].project);
  const tabs = saved.map((t) => {
    const adopted = adoptProject(t.project, s);
    s = adopted.standards;
    return { ...t, project: adopted.project };
  });
  setStandards(s);
  tabs.forEach((t, i) => (tabs[i] = { ...t, project: applyStandards(t.project, s) }));
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

// ------------------------------------------------------------------ standards (categories, default + graphic style)

function mapHistory(h: H.HistoryState<Project>, s: Standards): H.HistoryState<Project> {
  const f = (p: Project) => applyStandards(p, s);
  return { ...h, past: h.past.map(f), present: f(h.present), future: h.future.map(f) };
}

/**
 * Make `s` the standards in every tab. Other tabs get their whole undo history
 * rewritten, so undoing there can never bring back an old category or graphic style.
 * The active tab keeps its history when the change came from it (its own undo
 * should still be able to revert the edit it made).
 */
export function setStandardsEverywhere(s: Standards, { fromActiveTab = false } = {}) {
  setStandards(s);
  const ws = useWorkspace.getState();
  const parked: Record<Id, TabState> = {};
  for (const [id, t] of Object.entries(ws.parked)) parked[id] = { ...t, history: mapHistory(t.history, s) };
  const lastClosed = ws.lastClosed && {
    ...ws.lastClosed,
    state: { ...ws.lastClosed.state, history: mapHistory(ws.lastClosed.state.history, s) },
  };
  useWorkspace.setState({ parked, lastClosed });
  const doc = useDocument.getState();
  if (!fromActiveTab && !hasStandards(doc.history.present, s))
    useDocument.setState({ history: mapHistory(doc.history, s) });
}

/** Bring an incoming project under the standards (adding any categories it brings). */
export function adoptIntoStandards(p: Project): { project: Project; restyled: number } {
  const before = getStandards();
  const { project, standards, restyled } = adoptProject(p, before);
  if (standards !== before) setStandardsEverywhere(standards);
  return { project, restyled };
}

/** Category / default style / graphic style edits in the active tab become the standards for all tabs. */
export function installStandardsSync(): () => void {
  return useDocument.subscribe((st, prev) => {
    const p = st.history.present;
    if (st.gestureBase || p === prev.history.present || hasStandards(p, getStandards())) return;
    const q = prev.history.present;
    const changed = !hasStandards(p, standardsOf(q));
    // a tab switch swaps in a document that already carries the standards (handled above)
    if (changed) setStandardsEverywhere(standardsOf(p), { fromActiveTab: true });
  });
}
