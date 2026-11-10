/**
 * CSV import: columns name, radius, category, area (header names are
 * case-insensitive; radius OR area is required per row). Radius accepts
 * 12.5 / 12' / 12'-6"; area accepts 1200 / 1,200 sf. Radius wins when both.
 */
import Papa from 'papaparse';
import type { BubbleNode, Category, Point, Project } from '../model/types';
import { createCategory, createNode, nextCategoryColor } from '../model/factory';
import { nodeBounds, radiusFromArea, unionBounds } from '../model/geometry';
import { MIN_RADIUS_FT } from '../model/defaults';
import { parseArea, parseLength } from '../model/units';
import { gridLayout, gridSize } from './autoLayout';

export interface CsvRow {
  name: string;
  radiusFt: number;
  category: string | null;
}

export interface CsvParseResult {
  rows: CsvRow[];
  errors: string[];
}

const ALIASES: Record<string, string[]> = {
  name: ['name', 'room', 'space', 'label', 'program'],
  radius: ['radius', 'r'],
  category: ['category', 'type', 'group', 'zone'],
  area: ['area', 'sf', 'sqft', 'size', 'square feet'],
};

function canonicalHeader(h: string): string | null {
  const clean = h.toLowerCase().replace(/\(.*?\)/g, '').replace(/[^a-z ]/g, '').trim();
  for (const [key, names] of Object.entries(ALIASES)) if (names.includes(clean)) return key;
  return null;
}

export function parseCsv(text: string): CsvParseResult {
  const parsed = Papa.parse<Record<string, string>>(text.trim(), {
    header: true,
    skipEmptyLines: 'greedy',
    transformHeader: (h) => canonicalHeader(h) ?? `__${h}`,
  });
  const errors: string[] = [];
  const fields = parsed.meta.fields ?? [];
  if (!fields.includes('name')) errors.push('Missing a "name" column.');
  if (!fields.includes('radius') && !fields.includes('area')) errors.push('Need a "radius" or "area" column.');
  if (errors.length) return { rows: [], errors };

  const rows: CsvRow[] = [];
  parsed.data.forEach((r, i) => {
    const line = i + 2; // header is line 1
    const name = (r.name ?? '').trim();
    const rad = r.radius?.trim() ? parseLength(r.radius) : null;
    const area = r.area?.trim() ? parseArea(r.area) : null;
    let radiusFt: number | null = null;
    if (rad !== null && rad > 0) radiusFt = rad;
    else if (area !== null && area > 0) radiusFt = radiusFromArea(area);
    if (!name && radiusFt === null) return; // blank-ish row
    if (radiusFt === null) {
      errors.push(`Line ${line}: no valid radius or area for “${name || '(unnamed)'}”.`);
      return;
    }
    rows.push({
      name: name || `Space ${rows.length + 1}`,
      radiusFt: Math.max(MIN_RADIUS_FT, Math.round(radiusFt * 1000) / 1000),
      category: r.category?.trim() || null,
    });
  });
  return { rows, errors };
}

/**
 * Build new nodes/categories for the rows, laid out in a grid below existing
 * content (or centered on `fallbackCenter` for an empty drawing).
 */
export function buildImport(project: Project, rows: CsvRow[], fallbackCenter: Point): { nodes: BubbleNode[]; categories: Category[] } {
  const byName = new Map(Object.values(project.categories).map((c) => [c.name.trim().toLowerCase(), c.id]));
  const newCats: Category[] = [];
  const working = { ...project, categories: { ...project.categories } };
  const catId = (name: string | null): string | null => {
    if (!name) return null;
    const key = name.toLowerCase();
    let id = byName.get(key);
    if (!id) {
      const c = createCategory(name, nextCategoryColor(working));
      working.categories[c.id] = c;
      newCats.push(c);
      byName.set(key, c.id);
      id = c.id;
    }
    return id;
  };

  const radii = rows.map((r) => r.radiusFt);
  const size = gridSize(radii);
  const existing = unionBounds(Object.values(project.nodes).map((n) => nodeBounds(n, project)));
  const origin = existing
    ? { x: existing.minX, y: existing.maxY + Math.max(10, Math.max(...radii) * 0.5) }
    : { x: fallbackCenter.x - size.width / 2, y: fallbackCenter.y - size.height / 2 };
  const pos = gridLayout(radii, origin);

  const nodes = rows.map((r, i) =>
    createNode({ name: r.name, x: pos[i].x, y: pos[i].y, shape: { kind: 'circle', radiusFt: r.radiusFt }, categoryId: catId(r.category) }),
  );
  return { nodes, categories: newCats };
}
