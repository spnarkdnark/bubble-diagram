import { create } from 'zustand';
import type { Id, Point } from '../model/types';

export type Tool = 'select' | 'bubble' | 'connect' | 'shape';

export interface Selection {
  nodes: Id[];
  connections: Id[];
  /** overlap keys (see model/overlaps.overlapKey) */
  overlaps: string[];
}

export interface View {
  zoom: number;
  /** stage translation in screen px */
  panX: number;
  panY: number;
}

interface UiState {
  tool: Tool;
  selection: Selection;
  connectFrom: Id | null;
  view: View;
  stageSize: { width: number; height: number };
  spaceDown: boolean;
  /** live dimension readout while resizing, anchored in world feet */
  readout: { text: string; at: Point } | null;
  exportOpen: boolean;
  toast: { message: string; id: number } | null;
  /** bumps when a web font finishes loading so the canvas re-measures labels */
  fontEpoch: number;
  bumpFontEpoch: () => void;
  /** points clicked so far with the shape tool (world feet) */
  shapeDraft: Point[] | null;
  setShapeDraft: (pts: Point[] | null) => void;

  setTool: (t: Tool) => void;
  select: (sel: Partial<Selection>) => void;
  clearSelection: () => void;
  setConnectFrom: (id: Id | null) => void;
  setView: (v: Partial<View>) => void;
  setStageSize: (w: number, h: number) => void;
  setSpaceDown: (v: boolean) => void;
  setReadout: (r: UiState['readout']) => void;
  setExportOpen: (v: boolean) => void;
  showToast: (message: string) => void;
}

export const MIN_ZOOM = 0.05;
export const MAX_ZOOM = 32;

export const useUi = create<UiState>((set) => ({
  tool: 'select',
  selection: { nodes: [], connections: [], overlaps: [] },
  connectFrom: null,
  view: { zoom: 1, panX: 0, panY: 0 },
  stageSize: { width: 800, height: 600 },
  spaceDown: false,
  readout: null,
  exportOpen: false,
  toast: null,
  fontEpoch: 0,
  shapeDraft: null,
  setShapeDraft: (shapeDraft) => set({ shapeDraft }),
  bumpFontEpoch: () => set((s) => ({ fontEpoch: s.fontEpoch + 1 })),

  setTool: (tool) => set({ tool, connectFrom: null, shapeDraft: null }),
  select: (sel) =>
    set({ selection: { nodes: sel.nodes ?? [], connections: sel.connections ?? [], overlaps: sel.overlaps ?? [] } }),
  clearSelection: () => set({ selection: { nodes: [], connections: [], overlaps: [] } }),
  setConnectFrom: (connectFrom) => set({ connectFrom }),
  setView: (v) =>
    set((s) => {
      const view = { ...s.view, ...v };
      view.zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, view.zoom));
      return { view };
    }),
  setStageSize: (width, height) => set({ stageSize: { width, height } }),
  setSpaceDown: (spaceDown) => set({ spaceDown }),
  setReadout: (readout) => set({ readout }),
  setExportOpen: (exportOpen) => set({ exportOpen }),
  showToast: (message) => set({ toast: { message, id: Date.now() } }),
}));
