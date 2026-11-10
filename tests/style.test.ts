import { describe, expect, it } from 'vitest';
import { createNode, createProject } from '../src/model/factory';
import { resolveStyle } from '../src/model/selectors';

describe('style resolution', () => {
  it('inherits category style and applies overrides', () => {
    const p = createProject();
    const cat = p.categories[p.categoryOrder[0]];
    cat.style.strokeWeightPt = 3;
    const n = createNode({ categoryId: cat.id, style: { fill: '#000000' } });
    const s = resolveStyle(n, p);
    expect(s.strokeWeightPt).toBe(3);
    expect(s.fill).toBe('#000000');
    expect(s.stroke).toMatch(/^#/); // auto resolved
  });
  it('uncategorized uses project default', () => {
    const p = createProject();
    p.settings.defaultStyle.labelSizePt = 14;
    expect(resolveStyle(createNode(), p).labelSizePt).toBe(14);
  });
});
