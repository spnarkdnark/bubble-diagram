import { describe, expect, it } from 'vitest';
import { createCategory, createNode, createProject } from '../src/model/factory';
import { adoptProject, applyStandards, standardsOf, withFirmDefaults } from '../src/model/standards';
import { categoryResolver, matchCategory } from '../src/model/categories';

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

describe('graphic standards', () => {
  it('the graphic style is part of the standards and wins over a file', () => {
    const lib = createProject();
    lib.settings.graphic = { ...lib.settings.graphic, preset: 'pencil', paper: 'trace', seed: 42 };
    const s = standardsOf(lib);
    const file = createProject();
    expect(applyStandards(file, s).settings.graphic).toBe(s.graphic);
    const { project } = adoptProject(file, s);
    expect(project.settings.graphic).toEqual(lib.settings.graphic);
    expect(applyStandards(project, s)).toBe(project);
  });
});

describe('firm defaults', () => {
  it('a new diagram starts with the firm categories', () => {
    const p = createProject();
    const cats = p.categoryOrder.map((id) => p.categories[id]);
    expect(cats.map((c) => c.name)).toEqual(['Garage', 'Public', 'Bedroom', 'Service', 'Exterior']);
    expect(cats.map((c) => c.style.fill)).toEqual(['#baffc9', '#ffffba', '#bae1ff', '#ffb3ba', '#ffdfba']);
    for (const c of cats) {
      expect(c.style).toMatchObject({ stroke: null, strokeWeightPt: 3, labelSizePt: 10, labelColor: '#333333' });
      expect(c.style.strokeStyle).toBe(c.name === 'Exterior' ? 'dashed' : 'solid');
    }
  });

  it('overlap defaults are part of the standards', () => {
    const lib = createProject();
    lib.settings.overlap = { ...lib.settings.overlap, mode: 'lens', weightPt: 1 };
    const out = applyStandards(createProject(), standardsOf(lib));
    expect(out.settings.overlap).toEqual(lib.settings.overlap);
  });
});

describe('category matching', () => {
  it('matches by id and name, then by name ignoring case; creates missing ones once', () => {
    const p = createProject();
    const pub = p.categoryOrder.find((id) => p.categories[id].name === 'Public')!;
    expect(matchCategory(p.categories, { id: pub, name: 'Public' })).toBe(pub);
    expect(matchCategory(p.categories, { id: 'other', name: '  public ' })).toBe(pub);
    expect(matchCategory(p.categories, { id: pub, name: 'Lab' })).toBeUndefined(); // same id, renamed
    const cats = categoryResolver(p);
    const lab = cats.resolve({ name: 'Lab' });
    expect(cats.resolve({ name: 'LAB' })).toBe(lab);
    expect(cats.added.map((c) => c.name)).toEqual(['Lab']);
    expect(cats.added[0].style.fill).toMatch(/^#/); // next palette color
  });

  it('firm defaults keep matching categories and drop unused extras', () => {
    const p = createProject();
    const pub = p.categoryOrder.find((id) => p.categories[id].name === 'Public')!;
    p.categories[pub] = { ...p.categories[pub], style: { ...p.categories[pub].style, fill: '#000000' } };
    const used = createCategory('Lab', '#00ff00');
    const unused = createCategory('Old', '#0000ff');
    p.categories = { ...p.categories, [used.id]: used, [unused.id]: unused };
    p.categoryOrder = [...p.categoryOrder, used.id, unused.id];
    const n = createNode({ categoryId: used.id });
    p.nodes = { [n.id]: n };
    p.settings.graphic = { ...p.settings.graphic, preset: 'pencil' };
    const out = withFirmDefaults(p, createProject());
    expect(out.categories[pub].style.fill).toBe('#ffffba');
    expect(out.categories[used.id]).toBeDefined();
    expect(out.categories[unused.id]).toBeUndefined();
    expect(out.settings.graphic.preset).toBe('clean');
  });
});
