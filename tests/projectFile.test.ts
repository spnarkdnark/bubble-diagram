import { describe, expect, it } from 'vitest';
import { createConnection, createNode, createProject } from '../src/model/factory';
import { parseProject, serializeProject } from '../src/io/projectFile';
import { ProjectFormatError, migrateProject } from '../src/model/migrate';

describe('project file', () => {
  it('round-trips', () => {
    const p = createProject('Test');
    const a = createNode({ name: 'A', x: 1, y: 2 });
    const b = createNode({ name: 'B', x: 30, y: 2, categoryId: p.categoryOrder[0] });
    const c = createConnection(a.id, b.id, 'strong');
    p.nodes[a.id] = a;
    p.nodes[b.id] = b;
    p.nodeOrder.push(a.id, b.id);
    p.connections[c.id] = c;
    const back = parseProject(serializeProject(p));
    expect(back.nodes).toEqual(p.nodes);
    expect(back.connections).toEqual(p.connections);
    expect(back.categories).toEqual(p.categories);
  });
  it('rejects junk and drops dangling refs', () => {
    expect(() => migrateProject({})).toThrow(ProjectFormatError);
    const p = createProject();
    const a = createNode({ categoryId: 'missing' });
    p.nodes[a.id] = a;
    p.connections.x = { id: 'x', from: a.id, to: 'gone', type: 'near' };
    const m = migrateProject(JSON.parse(JSON.stringify(p)));
    expect(m.nodes[a.id].categoryId).toBeNull();
    expect(m.connections.x).toBeUndefined();
    expect(m.nodeOrder).toEqual([a.id]);
  });
});

describe('v1 migration', () => {
  it('upgrades category colors and node overrides', () => {
    const v1 = {
      schemaVersion: 1,
      meta: { name: 'Old' },
      settings: { scale: '1/8', grid: { visible: true, spacingFt: 10 } },
      categories: { c1: { id: 'c1', name: 'Public', color: '#112233' } },
      categoryOrder: ['c1'],
      nodes: {
        a: {
          id: 'a',
          name: 'A',
          x: 0,
          y: 0,
          shape: { kind: 'circle', radiusFt: 5 },
          categoryId: 'c1',
          style: { fill: null, fillOpacity: 0.85, stroke: null, strokeWeightPt: 2, strokeStyle: 'solid' },
          label: { fontSizePt: 9, secondary: 'radius' },
        },
        b: {
          id: 'b',
          name: 'B',
          x: 30,
          y: 0,
          shape: { kind: 'circle', radiusFt: 5 },
          categoryId: 'c1',
          style: { fill: '#ff0000', fillOpacity: 0.85, stroke: null, strokeWeightPt: 0.75, strokeStyle: 'solid' },
          label: { fontSizePt: 9, secondary: 'area' },
        },
      },
      nodeOrder: ['a', 'b'],
      connections: {},
    };
    const p = migrateProject(v1);
    expect(p.schemaVersion).toBe(2);
    expect(p.categories.c1.style.fill).toBe('#112233');
    expect(p.nodes.a.style).toEqual({ strokeWeightPt: 2, labelSecondary: 'radius' });
    expect(p.nodes.b.style).toEqual({ fill: '#ff0000' });
    expect(p.overlaps).toEqual({});
  });
});
