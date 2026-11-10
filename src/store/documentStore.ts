import { create } from 'zustand';
import { produce, type Draft } from 'immer';
import type { Project } from '../model/types';
import { createProject } from '../model/factory';
import * as H from './history';

export type Recipe = (draft: Draft<Project>) => void;

interface DocumentState {
  history: H.HistoryState<Project>;
  /** document as it was when the current gesture began (null when no gesture) */
  gestureBase: Project | null;

  /** Apply an undoable change. */
  commit: (recipe: Recipe, opts?: H.PushOptions) => void;
  /** Replace the whole document (load/new). Undoable unless resetHistory. */
  replace: (doc: Project, resetHistory?: boolean) => void;

  /** Continuous interactions (drag/resize): many previews -> one undo step. */
  beginGesture: () => void;
  preview: (recipe: Recipe) => void;
  endGesture: () => void;
  cancelGesture: () => void;

  undo: () => void;
  redo: () => void;
}

export const useDocument = create<DocumentState>((set, get) => ({
  history: H.initHistory(createProject()),
  gestureBase: null,

  commit: (recipe, opts) => {
    const { history, gestureBase } = get();
    if (gestureBase) return get().preview(recipe);
    const next = produce(history.present, recipe);
    set({ history: H.push(history, next, opts) });
  },

  replace: (doc, resetHistory = false) => {
    const { history } = get();
    set({ history: resetHistory ? H.initHistory(doc) : H.push(history, doc), gestureBase: null });
  },

  beginGesture: () => {
    if (get().gestureBase) return;
    set({ gestureBase: get().history.present });
  },

  preview: (recipe) => {
    const { history } = get();
    set({ history: { ...history, present: produce(history.present, recipe) } });
  },

  endGesture: () => {
    const { history, gestureBase } = get();
    if (!gestureBase) return;
    set({ history: H.pushFrom(history, gestureBase, history.present), gestureBase: null });
  },

  cancelGesture: () => {
    const { history, gestureBase } = get();
    if (!gestureBase) return;
    set({ history: { ...history, present: gestureBase }, gestureBase: null });
  },

  undo: () => {
    if (get().gestureBase) return;
    set({ history: H.undo(get().history) });
  },
  redo: () => {
    if (get().gestureBase) return;
    set({ history: H.redo(get().history) });
  },
}));

/** Current document (non-reactive accessor). */
export const getDoc = (): Project => useDocument.getState().history.present;

/** Reactive hook for the current document. */
export const useDoc = (): Project => useDocument((s) => s.history.present);
