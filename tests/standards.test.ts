import { describe, expect, it } from 'vitest';
import { createCategory, createNode, createProject } from '../src/model/factory';
import { adoptProject, applyStandards, standardsOf } from '../src/model/standards';

describe('category standards', () => {
  it('applying standards restyles categories and keeps orphaned looks', () => {
    const lib = createProject();
    const pub = lib.categoryOrder[0];
    lib.categories[pub] = { ...lib.categories[pub], style: { ...lib.categories[pub].style, strokeWeightPt: 3 } };
    const s = standardsOf(lib);
    const p = createProject();
    p.categories = lib.categories; // same ids, as in tabs that share standards
    const extra = createCategory('Gone', '#123456');
    p.categories = { ...p.categories, [extra.id]: extra };
    p.categoryOrder = [...lib.categoryOrder, extra.id];
    const a = createNode({ categoryId: pub });
    const b = createNode({ categoryId: extra.id });
    p.nodes = { [a.id]: a, [b.id]: b };
    const out = applyStandards(p, s);
    expect(out.categories).toBe(s.categories);
    expect(out.nodes[a.id].categoryId).toBe(pub);
    expect(out.nodes[b.id].categoryId).toBeNull();
    expect(out.nodes[b.id].style.fill).toBe('#123456');
    expect(applyStandards(out, s)).toBe(out);
  });

  it('adopting a file maps categories by name, library styles win, new ones join', () => {
    const lib = createProject();
    const s = standardsOf(lib);
    const file = createProject(); // different ids, same default names
    const service = file.categoryOrder.find((id) => file.categories[id].name === 'Service')!;
    file.categories[service] = {
      ...file.categories[service],
      style: { ...file.categories[service].style, fill: '#ff0000' },
    };
    const lab = createCategory('Lab', '#00ff00');
    file.categories[lab.id] = lab;
    file.categoryOrder.push(lab.id);
    const n1 = createNode({ categoryId: service });
    const n2 = createNode({ categoryId: lab.id });
    file.nodes = { [n1.id]: n1, [n2.id]: n2 };
    const { project, standards, restyled } = adoptProject(file, s);
    const libService = lib.categoryOrder.find((id) => lib.categories[id].name === 'Service')!;
    expect(project.nodes[n1.id].categoryId).toBe(libService);
    expect(project.categories[libService].style.fill).not.toBe('#ff0000');
    expect(restyled).toBe(1);
    expect(standards.categoryOrder).toHaveLength(lib.categoryOrder.length + 1);
    expect(project.categories[project.nodes[n2.id].categoryId!].name).toBe('Lab');
  });
});
