/**
 * Hand-lettering fonts, bundled locally (no network). The canvas uses them as
 * web fonts; exports convert them to vector outlines with opentype.js so PDFs
 * and SVGs look right without the font installed.
 */
import '@fontsource/architects-daughter/400.css';
import '@fontsource/kalam/400.css';
import '@fontsource/kalam/700.css';
import architect400 from '@fontsource/architects-daughter/files/architects-daughter-latin-400-normal.woff?url';
import kalam400 from '@fontsource/kalam/files/kalam-latin-400-normal.woff?url';
import kalam700 from '@fontsource/kalam/files/kalam-latin-700-normal.woff?url';
import type { LabelFont } from '../model/types';
import { clearTextMeasureCache } from '../canvas/textLayout';

type OtFont = import('opentype.js').Font;

const FILES: Record<Exclude<LabelFont, 'clean'>, { regular: string; bold?: string; css: string }> = {
  architect: { regular: architect400, css: "'Architects Daughter'" },
  pen: { regular: kalam400, bold: kalam700, css: "'Kalam'" },
};

/** Wait for the browser to load a hand font, then invalidate text measurements. */
export async function loadWebFont(font: LabelFont): Promise<void> {
  if (font === 'clean' || typeof document === 'undefined' || !document.fonts) return;
  const f = FILES[font];
  await Promise.all([document.fonts.load(`400 20px ${f.css}`), document.fonts.load(`700 20px ${f.css}`)]).catch(() => undefined);
  clearTextMeasureCache();
}

const parsed = new Map<string, OtFont>();

/** Parse the font files needed to outline labels for export. */
export async function loadOutlineFont(font: LabelFont): Promise<void> {
  if (font === 'clean') return;
  const { parse } = await import('opentype.js');
  const f = FILES[font];
  for (const url of [f.regular, f.bold].filter(Boolean) as string[]) {
    if (parsed.has(url)) continue;
    const buf = await (await fetch(url)).arrayBuffer();
    parsed.set(url, parse(buf));
  }
}

/** Outline font for a label line, or null (use <text>) for the clean font or if not loaded. */
export function outlineFont(font: LabelFont, bold: boolean): { font: OtFont; fakeBold: boolean } | null {
  if (font === 'clean') return null;
  const f = FILES[font];
  const url = bold && f.bold ? f.bold : f.regular;
  const ot = parsed.get(url);
  return ot ? { font: ot, fakeBold: bold && !f.bold } : null;
}
