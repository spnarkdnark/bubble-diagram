import { getDoc, useDocument } from '../store/documentStore';
import { useUi } from '../store/uiStore';
import { deleteSelection, selectNodes, viewCenterWorld } from '../store/actions';
import { pointer } from '../canvas/pointer';
import { DUPLICATE_OFFSET_FT } from '../model/defaults';
import { buildClip, clipStyle, parseClip, planPaste, type ClipPayload } from './clipboard';
import { buildImport, parseCsv } from './csvImport';

/** In-memory fallback when the system clipboard is unavailable. */
let lastClip: { text: string; pastes: number } | null = null;
let pasteStyleArmedAt = 0;

export function armPasteStyle() {
  pasteStyleArmedAt = Date.now();
}

function isTyping(): boolean {
  const t = document.activeElement as HTMLElement | null;
  if (!t) return false;
  if (t.tagName === 'TEXTAREA' || t.isContentEditable) return true;
  return t.tagName === 'INPUT' && !['checkbox', 'radio', 'range', 'color', 'button'].includes((t as HTMLInputElement).type);
}

function copyText(): string | null {
  const clip = buildClip(getDoc(), useUi.getState().selection.nodes);
  return clip ? JSON.stringify(clip) : null;
}

function onCopy(e: ClipboardEvent, cut: boolean) {
  if (isTyping() || useUi.getState().exportOpen) return;
  const text = copyText();
  if (!text) return;
  e.preventDefault();
  e.clipboardData?.setData('text/plain', text);
  lastClip = { text, pastes: 0 };
  const n = useUi.getState().selection.nodes.length;
  if (cut) deleteSelection();
  useUi.getState().showToast(`${cut ? 'Cut' : 'Copied'} ${n} element${n > 1 ? 's' : ''}`);
}

function pasteClip(clip: ClipPayload, text: string) {
  const doc = getDoc();
  const ui = useUi.getState();

  if (Date.now() - pasteStyleArmedAt < 1000) {
    pasteStyleArmedAt = 0;
    const look = clipStyle(doc, clip);
    const ids = ui.selection.nodes;
    if (!look || ids.length === 0) return ui.showToast('Select bubbles to paste a style onto');
    useDocument.getState().commit((d) => {
      if (look.newCategory) {
        d.categories[look.newCategory.id] = look.newCategory;
        d.categoryOrder.push(look.newCategory.id);
      }
      for (const id of ids)
        if (d.nodes[id]) {
          d.nodes[id].categoryId = look.categoryId;
          d.nodes[id].style = { ...look.style };
        }
    });
    return ui.showToast(`Pasted style onto ${ids.length} element${ids.length > 1 ? 's' : ''}`);
  }

  // where: at the cursor; otherwise offset from the original (further for repeated pastes)
  if (!lastClip || lastClip.text !== text) lastClip = { text, pastes: 0 };
  lastClip.pastes++;
  const at =
    pointer.inside && pointer.world
      ? pointer.world
      : { x: clip.center.x + DUPLICATE_OFFSET_FT * lastClip.pastes, y: clip.center.y + DUPLICATE_OFFSET_FT * lastClip.pastes };
  const plan = planPaste(doc, clip, at);
  useDocument.getState().commit((d) => {
    for (const c of plan.categories) {
      d.categories[c.id] = c;
      d.categoryOrder.push(c.id);
    }
    for (const n of plan.nodes) {
      d.nodes[n.id] = n;
      d.nodeOrder.push(n.id);
    }
    for (const c of plan.connections) d.connections[c.id] = c;
    Object.assign(d.overlaps, plan.overlaps);
  });
  selectNodes(plan.nodes.map((n) => n.id));
}

/** Rows copied from a spreadsheet (tab or comma separated with a header) become bubbles. */
function pasteTable(text: string): boolean {
  if (!/\n/.test(text.trim())) return false;
  const { rows } = parseCsv(text);
  if (rows.length === 0) return false;
  const doc = getDoc();
  const { nodes, categories } = buildImport(doc, rows, pointer.inside && pointer.world ? pointer.world : viewCenterWorld());
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
  useUi.getState().showToast(`Pasted ${nodes.length} bubbles from table`);
  return true;
}

function onPaste(e: ClipboardEvent) {
  if (isTyping() || useUi.getState().exportOpen) return;
  const text = e.clipboardData?.getData('text/plain') || lastClip?.text || '';
  const clip = parseClip(text);
  if (clip) {
    e.preventDefault();
    pasteClip(clip, text);
  } else if (pasteTable(text)) e.preventDefault();
}

export function installClipboard(): () => void {
  const copy = (e: ClipboardEvent) => onCopy(e, false);
  const cut = (e: ClipboardEvent) => onCopy(e, true);
  document.addEventListener('copy', copy);
  document.addEventListener('cut', cut);
  document.addEventListener('paste', onPaste);
  return () => {
    document.removeEventListener('copy', copy);
    document.removeEventListener('cut', cut);
    document.removeEventListener('paste', onPaste);
  };
}
