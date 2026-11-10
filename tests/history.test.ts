import { describe, expect, it } from 'vitest';
import { initHistory, push, pushFrom, redo, undo } from '../src/store/history';

describe('history', () => {
  it('undo/redo', () => {
    let h = initHistory(1);
    h = push(h, 2);
    h = push(h, 3);
    h = undo(h);
    expect(h.present).toBe(2);
    h = redo(h);
    expect(h.present).toBe(3);
    h = undo(undo(h));
    expect(h.present).toBe(1);
    h = push(h, 9);
    expect(h.future).toEqual([]);
  });
  it('coalesces same key within window', () => {
    let h = initHistory(0);
    h = push(h, 1, { coalesceKey: 'k', now: 0 });
    h = push(h, 2, { coalesceKey: 'k', now: 100 });
    h = push(h, 3, { coalesceKey: 'k', now: 200 });
    expect(h.past).toEqual([0]);
    h = push(h, 4, { coalesceKey: 'k', now: 5000 });
    expect(h.past).toEqual([0, 3]);
  });
  it('gesture commit uses base', () => {
    let h = initHistory('a');
    h = { ...h, present: 'c' }; // previews
    h = pushFrom(h, 'a', 'c');
    expect(h.past).toEqual(['a']);
    expect(undo(h).present).toBe('a');
  });
});
