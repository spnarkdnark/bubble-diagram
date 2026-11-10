import { statSync } from 'node:fs';
import { expect, importSampleCsv, nodes, test } from './helpers';

// `canvas: _app` requests the fixture that opens a fresh app; the test itself drives the menus
test('CSV import, then export PDF, PNG and SVG with sketch style on', async ({ page, canvas: _app }) => {
  await importSampleCsv(page);
  expect(await nodes(page)).toHaveLength(11);
  await page.locator('.toolbar label:has-text("Style") select').selectOption('watercolor');
  for (const fmt of ['PDF', 'PNG', 'SVG']) {
    await page.getByRole('button', { name: 'Export', exact: true }).click();
    await page.locator(`.dialog .seg:has-text("${fmt}")`).click();
    const [dl] = await Promise.all([
      page.waitForEvent('download'),
      page.locator(`.dialog button:has-text("Export ${fmt}")`).click(),
    ]);
    expect(dl.suggestedFilename()).toMatch(new RegExp(`\\.${fmt.toLowerCase()}$`));
    // a real drawing, not an empty file
    expect(statSync(await dl.path()).size).toBeGreaterThan(5_000);
  }
});
