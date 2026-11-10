/** Drawing-wide settings: scale, grid, snapping, name. */
import type { Project, ScaleId } from '../../model/types';
import { pxPerFt } from '../../model/units';
import { getDoc } from '../documentStore';
import { commit, ui } from './shared';

/** Change scale while keeping the view center fixed on the same world point. */
export function setScale(scale: ScaleId) {
  const doc = getDoc();
  const { view, stageSize } = ui();
  const kOld = pxPerFt(doc.settings.scale, view.zoom);
  const cx = (stageSize.width / 2 - view.panX) / kOld;
  const cy = (stageSize.height / 2 - view.panY) / kOld;
  commit((d) => {
    d.settings.scale = scale;
  });
  const kNew = pxPerFt(scale, view.zoom);
  ui().setView({ panX: stageSize.width / 2 - cx * kNew, panY: stageSize.height / 2 - cy * kNew });
}

export function setGrid(patch: Partial<Project['settings']['grid']>) {
  commit((d) => {
    Object.assign(d.settings.grid, patch);
  });
}

export function renameProject(name: string) {
  commit(
    (d) => {
      d.meta.name = name;
    },
    { coalesceKey: 'project-name' },
  );
}

export function setSnapIncrement(ft: number) {
  commit((d) => {
    d.settings.snap.radiusIncrementFt = ft;
  });
}
