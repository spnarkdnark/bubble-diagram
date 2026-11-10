import type { Point } from '../model/types';

/** Last known pointer position over the canvas (world feet). Not reactive. */
export const pointer: { world: Point | null; inside: boolean } = { world: null, inside: false };
