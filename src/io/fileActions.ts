/** High-level file commands used by the toolbar and shortcuts. */
import { createProject } from '../model/factory';
import { getDoc, useDocument } from '../store/documentStore';
import { useUi } from '../store/uiStore';
import { zoomToFit } from '../store/actions';
import { openProjectFile, saveProjectFile } from './projectFile';

const toast = (m: string) => useUi.getState().showToast(m);

export function newProject() {
  if (getDoc().nodeOrder.length && !confirm('Start a new diagram? (You can undo this.)')) return;
  useDocument.getState().replace(createProject());
  useUi.getState().clearSelection();
  zoomToFit();
}

export async function openProject() {
  try {
    const p = await openProjectFile();
    if (!p) return;
    useDocument.getState().replace(p);
    useUi.getState().clearSelection();
    requestAnimationFrame(zoomToFit);
    toast(`Opened “${p.meta.name}”`);
  } catch (e) {
    toast(`Could not open file: ${(e as Error).message}`);
  }
}

export function saveProject() {
  saveProjectFile(getDoc());
  toast('Project saved');
}
