/** The shared category standards (see model/standards.ts). Plain module state; not undoable by itself. */
import { standardsOf, type Standards } from '../model/standards';
import { useDocument } from './documentStore';

let current: Standards | null = null;

/** Current standards; before any are set, those of the active diagram. */
export function getStandards(): Standards {
  return current ?? standardsOf(useDocument.getState().history.present);
}

export function setStandards(s: Standards) {
  current = s;
}
