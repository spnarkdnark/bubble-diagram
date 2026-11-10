import { doc, expect, nodes, test } from './helpers';

test('copy/paste at the cursor, paste style, and pasting table rows', async ({ page, canvas }) => {
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  await canvas.bubble(300, 300);
  await canvas.bubble(600, 300);
  await page.keyboard.press('c');
  await canvas.click(300, 300);
  await canvas.click(600, 300);
  await page.keyboard.press('v');
  await page.keyboard.press('Control+a');
  await page.keyboard.press('Control+c');
  await page.mouse.move(canvas.x + 450, canvas.y + 650);
  await page.keyboard.press('Control+v');
  await expect.poll(async () => (await nodes(page)).length).toBe(4);
  expect(Object.keys((await doc(page)).connections)).toHaveLength(2);

  await canvas.click(300, 300);
  await page.locator('.sidebar .field:has-text("Opacity") input[type=range]').first().fill('0.3');
  await page.keyboard.press('Control+c');
  await canvas.click(600, 300);
  await page.keyboard.press('Control+Shift+v');
  await expect.poll(async () => (await nodes(page))[1].style.fillOpacity).toBe(0.3);

  await page.evaluate(() =>
    navigator.clipboard.writeText('name\tarea\tcategory\nKitchen\t400\tService\nPatio\t900\tExterior'),
  );
  await canvas.click(1000, 120);
  await page.keyboard.press('Control+v');
  await expect.poll(async () => (await nodes(page)).length).toBe(6);
});
