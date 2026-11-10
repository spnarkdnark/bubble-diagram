/** Helpers shared by the action modules. */
import { useDocument } from '../documentStore';
import { useUi } from '../uiStore';

/** Apply an undoable change to the active document. */
export const commit = (...args: Parameters<ReturnType<typeof useDocument.getState>['commit']>) =>
  useDocument.getState().commit(...args);

export const ui = () => useUi.getState();
