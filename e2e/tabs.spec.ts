import { expect, nodes, test } from './helpers';

test('tabs keep separate diagrams and undo; restore after reload; reopen after close', async ({ page, canvas }) => {
  const names = async () => (await page.locator('.tab .tab-name').allTextContents()).join(' | ');
  await canvas.bubble(300, 300);
  await canvas.bubble(600, 300);
  await page.locator('.tab-new').click();
  await canvas.bubble(400, 300);
  await page.locator('.tab').nth(1).dblclick();
  await page.keyboard.type('Scheme B');
  await page.keyboard.press('Enter');
  expect(await names()).toBe('Untitled diagram | Scheme B');
  await page.locator('.tab').nth(0).click();
  expect(await nodes(page)).toHaveLength(2);
  await page.keyboard.press('Control+z');
  expect(await nodes(page)).toHaveLength(1);
  await page.locator('.tab').nth(1).click();
  expect(await nodes(page)).toHaveLength(1);
  await page.waitForTimeout(700); // autosave debounce
  await page.reload();
  await page.waitForSelector('.canvas canvas');
  expect(await names()).toBe('Untitled diagram | Scheme B');
  await page.locator('.tab.active .tab-close').click();
  expect(await names()).toBe('Untitled diagram');
  await page.locator('.toast-action').click();
  expect(await names()).toBe('Untitled diagram | Scheme B');
});
