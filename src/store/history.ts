/**
 * Pure snapshot-based undo history. Documents are immutable (Immer), so
 * snapshots share structure and are cheap.
 */
export interface HistoryState<T> {
  past: T[];
  present: T;
  future: T[];
  /** last commit's coalesce key + timestamp, used to merge rapid edits */
  last: { key: string; time: number } | null;
}

export const HISTORY_LIMIT = 200;
export const COALESCE_MS = 800;

export function initHistory<T>(present: T): HistoryState<T> {
  return { past: [], present, future: [], last: null };
}

export interface PushOptions {
  /** consecutive commits with the same key within COALESCE_MS merge into one undo step */
  coalesceKey?: string;
  now?: number;
}

export function push<T>(h: HistoryState<T>, next: T, opts: PushOptions = {}): HistoryState<T> {
  if (next === h.present) return h;
  const now = opts.now ?? Date.now();
  const key = opts.coalesceKey;
  if (key && h.last && h.last.key === key && now - h.last.time < COALESCE_MS) {
    return { ...h, present: next, future: [], last: { key, time: now } };
  }
  const past = [...h.past, h.present];
  if (past.length > HISTORY_LIMIT) past.shift();
  return { past, present: next, future: [], last: key ? { key, time: now } : null };
}

/** Commit `next` with an explicit base (used to end gestures: base is the pre-gesture doc). */
export function pushFrom<T>(h: HistoryState<T>, base: T, next: T): HistoryState<T> {
  if (base === next) return { ...h, present: next };
  const past = [...h.past, base];
  if (past.length > HISTORY_LIMIT) past.shift();
  return { past, present: next, future: [], last: null };
}

export function undo<T>(h: HistoryState<T>): HistoryState<T> {
  if (h.past.length === 0) return h;
  const prev = h.past[h.past.length - 1];
  return { past: h.past.slice(0, -1), present: prev, future: [h.present, ...h.future], last: null };
}

export function redo<T>(h: HistoryState<T>): HistoryState<T> {
  if (h.future.length === 0) return h;
  const [next, ...rest] = h.future;
  return { past: [...h.past, h.present], present: next, future: rest, last: null };
}
