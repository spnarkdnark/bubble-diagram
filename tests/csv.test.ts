import { describe, expect, it } from 'vitest';
import { buildImport, parseCsv } from '../src/io/csvImport';
import { createProject } from '../src/model/factory';
import { radiusFromArea } from '../src/model/geometry';

describe('csv import', () => {
  it('parses radius, area and categories', () => {
    const { rows, errors } = parseCsv(`Name,Radius,Category,Area
Lobby,15,Public,
Office,,Private,"1,200 sf"
Storage,8'-6",Service,
Bad,,Service,
`);
    expect(rows).toHaveLength(3);
    expect(rows[0]).toEqual({ name: 'Lobby', radiusFt: 15, category: 'Public' });
    expect(rows[1].radiusFt).toBeCloseTo(radiusFromArea(1200), 2);
    expect(rows[2].radiusFt).toBe(8.5);
    expect(errors).toHaveLength(1);
  });
  it('requires columns', () => {
    expect(parseCsv('foo,bar\n1,2').errors.length).toBeGreaterThan(0);
  });
  it('creates missing categories and lays out without overlap', () => {
    const p = createProject();
    const { rows } = parseCsv('name,radius,category\nA,10,Public\nB,12,Lab\nC,5,\nD,10,lab');
    const { nodes, categories } = buildImport(p, rows, { x: 0, y: 0 });
    expect(categories.map((c) => c.name)).toEqual(['Lab']);
    expect(nodes[3].categoryId).toBe(categories[0].id);
    expect(nodes[0].categoryId).toBe(p.categoryOrder[0]);
    for (let i = 0; i < nodes.length; i++)
      for (let j = i + 1; j < nodes.length; j++) {
        const d = Math.hypot(nodes[i].x - nodes[j].x, nodes[i].y - nodes[j].y);
        expect(d).toBeGreaterThan((nodes[i].shape as any).radiusFt + (nodes[j].shape as any).radiusFt);
      }
  });
});
