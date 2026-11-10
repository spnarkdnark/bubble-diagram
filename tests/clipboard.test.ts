import { describe, expect, it } from 'vitest';
import { createCategory, createConnection, createNode, createProject } from '../src/model/factory';
import { buildClip, clipStyle, parseClip, planPaste } from '../src/io/clipboard';
import { overlapKey } from '../src/model/overlaps';

function setup() {
  const p = createProject();
  const cat = p.categories[p.categoryOrder[0]];
  const a = createNode({ name: 'A', x: 0, y: 0, categoryId: cat.id, style: { fill: '#ff0000' } });
  const b = createNode({ name: 'B', x: 30, y: 0 });
  const c = createConnection(a.id, b.id, 'strong');
  p.nodes[a.id] = a;
  p.nodes[b.id] = b;
  p.nodeOrder.push(a.id, b.id);
  p.connections[c.id] = c;
  p.overlaps[overlapKey(a.id, b.id)] = { mode: 'lens' };
  return { p, a, b, cat };
}

describe('clipboard', () => {
  it('round-trips through text and pastes with new ids at a point', () => {
    const { p, a, b } = setup();
    const clip = parseClip(JSON.stringify(buildClip(p, [a.id, b.id])))!;
    const plan = planPaste(p, clip, { x: 100, y: 100 });
    expect(plan.nodes).toHaveLength(2);
    expect(plan.nodes[0].id).not.toBe(a.id);
    expect(plan.nodes[0].x).toBeCloseTo(100 - 15);
    expect(plan.connections[0].from).toBe(plan.nodes[0].id);
    expect(plan.categories).toHaveLength(0); // same doc: category reused
    expect(Object.values(plan.overlaps)[0].mode).toBe('lens');
  });
  it('maps categories by name into another diagram, creating missing ones', () => {
    const { p, a } = setup();
    const clip = buildClip(p, [a.id])!;
    const other = createProject();
    const plan = planPaste(other, clip, { x: 0, y: 0 });
    expect(plan.categories).toHaveLength(0);
    expect(other.categories[plan.nodes[0].categoryId!].name).toBe('Public');
    const empty = { ...createProject(), categories: {}, categoryOrder: [] };
    const plan2 = planPaste(empty, clip, { x: 0, y: 0 });
    expect(plan2.categories.map((c) => c.name)).toEqual(['Public']);
  });
  it('drops connections to nodes not copied; paste style keeps look', () => {
    const { p, a, cat } = setup();
    const clip = buildClip(p, [a.id])!;
    expect(clip.connections).toHaveLength(0);
    const look = clipStyle(p, clip)!;
    expect(look.categoryId).toBe(cat.id);
    expect(look.style.fill).toBe('#ff0000');
    expect(parseClip('hello')).toBeNull();
    void createCategory;
  });
});
