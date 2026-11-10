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

export async function importCsv() {
  const { pickFile } = await import('./download');
  const { parseCsv, buildImport } = await import('./csvImport');
  const { viewCenterWorld, selectNodes } = await import('../store/actions');
  const file = await pickFile('.csv,text/csv');
  if (!file) return;
  const { rows, errors } = parseCsv(await file.text());
  if (rows.length === 0) {
    toast(`CSV import failed: ${errors[0] ?? 'no rows found.'}`);
    return;
  }
  const { nodes, categories } = buildImport(getDoc(), rows, viewCenterWorld());
  useDocument.getState().commit((d) => {
    for (const c of categories) {
      d.categories[c.id] = c;
      d.categoryOrder.push(c.id);
    }
    for (const n of nodes) {
      d.nodes[n.id] = n;
      d.nodeOrder.push(n.id);
    }
  });
  selectNodes(nodes.map((n) => n.id));
  requestAnimationFrame(zoomToFit);
  const skipped = errors.length ? ` (${errors.length} row${errors.length > 1 ? 's' : ''} skipped)` : '';
  toast(`Imported ${nodes.length} bubbles${skipped}`);
  if (errors.length) console.warn('CSV import warnings:\n' + errors.join('\n'));
}
