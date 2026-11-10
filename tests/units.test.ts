import { describe, expect, it } from 'vitest';
import { formatFeetInches, parseArea, parseLength, ptToFt, pxPerFt, snap, stepToIncrement } from '../src/model/units';

describe('scale math', () => {
  it('10ft radius at 1/8" = 1.25" on paper at 100% zoom', () => {
    expect(10 * pxPerFt('1/8')).toBe(120);
    expect((10 * pxPerFt('1/8')) / 96).toBe(1.25);
  });
  it('zoom multiplies px per ft', () => {
    expect(pxPerFt('1/4', 2)).toBe(48);
  });
  it('pt to ft at 1/8 scale', () => {
    // 72pt = 1 paper inch = 8 ft at 1/8"
    expect(ptToFt(72, '1/8')).toBe(8);
  });
});

describe('lengths', () => {
  it('formats feet-inches', () => {
    expect(formatFeetInches(12.5)).toBe(`12'-6"`);
    expect(formatFeetInches(0.5)).toBe(`0'-6"`);
    expect(formatFeetInches(9.999)).toBe(`10'-0"`);
  });
  it('parses many forms', () => {
    expect(parseLength('12.5')).toBe(12.5);
    expect(parseLength(`12'`)).toBe(12);
    expect(parseLength(`12'-6"`)).toBe(12.5);
    expect(parseLength(`12' 6"`)).toBe(12.5);
    expect(parseLength(`6"`)).toBe(0.5);
    expect(parseLength('12-6')).toBe(12.5);
    expect(parseLength('abc')).toBeNull();
  });
  it('parses areas', () => {
    expect(parseArea('1,200 sf')).toBe(1200);
    expect(parseArea('350')).toBe(350);
    expect(parseArea('x')).toBeNull();
  });
  it('snaps and steps', () => {
    expect(snap(10.3, 0.5)).toBe(10.5);
    expect(stepToIncrement(10, 0.5, 1)).toBe(10.5);
    expect(stepToIncrement(10.3, 0.5, 1)).toBe(10.5);
    expect(stepToIncrement(10.3, 0.5, -1)).toBe(10);
    expect(stepToIncrement(10, 0.5, -1)).toBe(9.5);
  });
});
