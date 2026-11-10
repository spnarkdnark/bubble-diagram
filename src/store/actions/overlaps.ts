/** Overlap treatment: drawing default and per-overlap overrides. */
import type { OverlapMode, OverlapSettings } from '../../model/types';
import { commit } from './shared';

/** Override the treatment of specific overlaps; null returns them to the drawing default. */
export function setOverlapMode(keys: string[], mode: OverlapMode | null) {
  commit((d) => {
    for (const k of keys) {
      if (mode === null) delete d.overlaps[k];
      else d.overlaps[k] = { mode };
    }
  });
}

export function setOverlapSettings(patch: Partial<OverlapSettings>) {
  commit(
    (d) => {
      Object.assign(d.settings.overlap, patch);
    },
    { coalesceKey: `overlap:${Object.keys(patch).join(',')}` },
  );
}
