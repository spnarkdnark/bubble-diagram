import { expect, test as base, type Page } from '@playwright/test';

/** Read app state through the dev-only window.__bd hook. */
export async function doc(page: Page) {
  return page.evaluate(() => (window as any).__bd.doc.getState().history.present);
}
export async function ui(page: Page) {
  return page.evaluate(() => {
    const s = (window as any).__bd.ui.getState();
    return { selection: s.selection, tool: s.tool, view: s.view, editingLabel: s.editingLabel };
  });
}
export async function nodes(page: Page): Promise<any[]> {
  const d = await doc(page);
  return d.nodeOrder.map((id: string) => d.nodes[id]);
}

export class Canvas {
  constructor(
    private page: Page,
    public x: number,
    public y: number,
  ) {}
  /** screen point relative to the canvas' top-left */
  at(dx: number, dy: number) {
    return { x: this.x + dx, y: this.y + dy };
  }
  async click(dx: number, dy: number) {
    await this.page.mouse.click(this.x + dx, this.y + dy);
  }
  async dblclick(dx: number, dy: number) {
    await this.page.mouse.dblclick(this.x + dx, this.y + dy);
  }
  async drag(from: [number, number], to: [number, number], steps = 6) {
    await this.page.mouse.move(this.x + from[0], this.y + from[1]);
    await this.page.mouse.down();
    await this.page.mouse.move(this.x + to[0], this.y + to[1], { steps });
    await this.page.mouse.up();
  }
  /** place a 10' bubble (B tool, one click) and return to select */
  async bubble(dx: number, dy: number) {
    await this.page.keyboard.press('b');
    await this.click(dx, dy);
  }
}

export const test = base.extend<{ canvas: Canvas }>({
  canvas: async ({ page }, use) => {
    await page.goto('/');
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await page.waitForSelector('.canvas canvas');
    await page.waitForFunction(() => (window as any).__bd);
    const box = (await page.locator('.canvas').boundingBox())!;
    await use(new Canvas(page, box.x, box.y));
  },
});

/** Sidebar input whose field label is exactly `label`. */
export function field(page: Page, label: string) {
  return page.locator(`.sidebar .field:has(.field-label:text-is("${label}")) input`).first();
}

export async function importSampleCsv(page: Page) {
  await page.getByRole('button', { name: 'File ▾' }).click();
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('menuitem', { name: /Import CSV/ }).click()]);
  await chooser.setFiles('examples/sample-program.csv');
  await expect(page.locator('.toast')).toContainText('Imported 11');
}

export { expect };
