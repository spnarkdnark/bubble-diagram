/** High-level file commands used by the toolbar and shortcuts. */
import { getDoc, useDocument } from '../store/documentStore';
import { useUi } from '../store/uiStore';
import { newTab } from '../store/workspaceStore';
import { selectNodes, viewCenterWorld, zoomToFit } from '../store/actions';
import { pickFile } from './download';
import { buildImport, parseCsv } from './csvImport';
import { openProjectFile, saveProjectFile } from './projectFile';

const toast = (m: string) => useUi.getState().showToast(m);

/** New diagram in a new tab. */
export function newProject() {
  newTab();
}

export async function openProject() {
  try {
    const p = await openProjectFile();
    if (!p) return;
    // like a browser: reuse the current tab only when it is still empty
    if (getDoc().nodeOrder.length === 0) {
      useDocument.getState().replace(p, true);
      useUi.getState().clearSelection();
    } else newTab(p);
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
