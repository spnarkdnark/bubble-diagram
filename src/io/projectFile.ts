import type { Project } from '../model/types';
import { migrateProject } from '../model/migrate';
import { downloadBlob, pickFile, safeFilename } from './download';

export const PROJECT_EXT = '.bubbles.json';

export function serializeProject(p: Project): string {
  return JSON.stringify({ ...p, meta: { ...p.meta, modifiedAt: new Date().toISOString() } }, null, 2);
}

export function parseProject(text: string): Project {
  return migrateProject(JSON.parse(text));
}

export function saveProjectFile(p: Project) {
  downloadBlob(new Blob([serializeProject(p)], { type: 'application/json' }), safeFilename(p.meta.name) + PROJECT_EXT);
}

/** Returns null when the user cancels; throws on invalid files. */
export async function openProjectFile(): Promise<Project | null> {
  const file = await pickFile('.json,application/json');
  if (!file) return null;
  return parseProject(await file.text());
}
