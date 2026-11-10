import { nanoid } from 'nanoid';
import type { BubbleNode, Category, Connection, ConnectionType, Id, Project } from './types';
import { SCHEMA_VERSION } from './types';
import {
  CATEGORY_PALETTE,
  DEFAULT_CATEGORIES,
  DEFAULT_LABEL,
  DEFAULT_NODE_STYLE,
  DEFAULT_RADIUS_FT,
  DEFAULT_SETTINGS,
} from './defaults';

export const newId = (): Id => nanoid(10);

export function createCategory(name: string, color: string): Category {
  return { id: newId(), name, color };
}

export function createProject(name = 'Untitled diagram'): Project {
  const now = new Date().toISOString();
  const cats = DEFAULT_CATEGORIES.map((c) => createCategory(c.name, c.color));
  return {
    schemaVersion: SCHEMA_VERSION,
    meta: { name, createdAt: now, modifiedAt: now },
    settings: structuredClone(DEFAULT_SETTINGS),
    categories: Object.fromEntries(cats.map((c) => [c.id, c])),
    categoryOrder: cats.map((c) => c.id),
    nodes: {},
    nodeOrder: [],
    connections: {},
  };
}

export function createNode(partial: Partial<Omit<BubbleNode, 'id'>> = {}): BubbleNode {
  return {
    id: newId(),
    name: partial.name ?? 'Space',
    x: partial.x ?? 0,
    y: partial.y ?? 0,
    shape: partial.shape ?? { kind: 'circle', radiusFt: DEFAULT_RADIUS_FT },
    categoryId: partial.categoryId ?? null,
    style: { ...DEFAULT_NODE_STYLE, ...partial.style },
    label: { ...DEFAULT_LABEL, ...partial.label },
  };
}

export function createConnection(from: Id, to: Id, type: ConnectionType = 'near'): Connection {
  return { id: newId(), from, to, type };
}

/** Next palette color not already used by a category (cycles if all used). */
export function nextCategoryColor(project: Project): string {
  const used = new Set(Object.values(project.categories).map((c) => c.color.toLowerCase()));
  return (
    CATEGORY_PALETTE.find((c) => !used.has(c.toLowerCase())) ??
    CATEGORY_PALETTE[project.categoryOrder.length % CATEGORY_PALETTE.length]
  );
}
