/** Graphic style (sketch character, paper, lettering). */
import type { GraphicSettings } from '../../model/types';
import { PRESETS } from '../../render/sketch';
import { commit } from './shared';

export function setGraphic(patch: Partial<GraphicSettings>, coalesce = true) {
  commit(
    (d) => {
      Object.assign(d.settings.graphic, patch);
    },
    coalesce ? { coalesceKey: `graphic:${Object.keys(patch).join(',')}` } : undefined,
  );
}

/** Slider/fill edits detach from the named preset. */
export function tuneGraphic(patch: Partial<GraphicSettings>) {
  setGraphic({ ...patch, preset: 'custom' });
}

export function applyPreset(id: string) {
  const p = PRESETS.find((x) => x.id === id);
  if (!p) return;
  setGraphic({ ...p.params, paper: p.paper, preset: p.id }, false);
}

export function redrawHand() {
  setGraphic({ seed: Math.floor(Math.random() * 1e6) + 1 }, false);
}
