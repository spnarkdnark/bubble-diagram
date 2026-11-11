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

test('pasting a category the standards lack adds it to every tab', async ({ page, canvas }) => {
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  const catNames = async () => (Object.values((await doc(page)).categories) as any[]).map((c) => c.name);
  await canvas.bubble(400, 300);
  await page.locator('.sidebar .field:has(.field-label:text-is("Category")) select').selectOption({ label: 'Public' });
  await page.keyboard.press('Control+c');
  // the same bubble as if copied from a file whose category is "Lab"
  await page.evaluate(async () => {
    const clip = JSON.parse(await navigator.clipboard.readText());
    clip.categories = [{ ...clip.categories[0], name: 'Lab' }];
    clip.nodes[0].categoryId = clip.categories[0].id;
    await navigator.clipboard.writeText(JSON.stringify(clip));
  });
  await page.locator('.tab-new').click();
  await page.mouse.move(canvas.x + 400, canvas.y + 300);
  await page.keyboard.press('Control+v');
  await expect.poll(async () => (await nodes(page)).length).toBe(1);
  expect(await catNames()).toContain('Lab');
  await page.locator('.tab').nth(0).click();
  expect(await catNames()).toContain('Lab');
});
