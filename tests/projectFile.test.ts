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
    p.nodes[a.id] = a; p.nodes[b.id] = b; p.nodeOrder.push(a.id, b.id); p.connections[c.id] = c;
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
