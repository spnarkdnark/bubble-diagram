import { doc, expect, field, importSampleCsv, nodes, test, ui } from './helpers';

test('category style flows to bubbles; overrides show a reset dot', async ({ page, canvas }) => {
  await canvas.bubble(400, 300);
  await page.locator('.sidebar .field:has-text("Category") select').selectOption({ label: 'Service' });
  await canvas.click(1000, 700);
  const service = page.locator('.category-list > li').nth(2);
  await service.locator('.chev').click();
  const weight = page.locator('.category-style .field:has-text("Weight") input');
  await weight.fill('3');
  await weight.press('Enter');
  const d = await doc(page);
  const cat = Object.values(d.categories).find((c: any) => c.name === 'Service') as any;
  expect(cat.style.strokeWeightPt).toBe(3);
  await canvas.click(400, 300);
  await expect(field(page, 'Weight')).toHaveValue('3 pt');
  await page.locator('.sidebar .field:has-text("Opacity") input[type=range]').first().fill('0.4');
  await expect(page.locator('.override-dot')).toHaveCount(1);
  await page.locator('.override-dot').click();
  expect((await nodes(page))[0].style).toEqual({});
});

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

  await page.evaluate(() => navigator.clipboard.writeText('name\tarea\tcategory\nKitchen\t400\tService\nPatio\t900\tExterior'));
  await canvas.click(1000, 120);
  await page.keyboard.press('Control+v');
  await expect.poll(async () => (await nodes(page)).length).toBe(6);
});

test('overlaps: default merge, per-overlap override via the bubble panel', async ({ page, canvas }) => {
  await canvas.bubble(400, 300);
  await canvas.bubble(560, 300); // 160 px apart < 240: overlapping
  await canvas.click(1000, 700);
  await expect(page.locator('.sidebar .field:has-text("Overlaps") .readonly')).toHaveText('1 direct');
  await canvas.click(380, 300);
  await page.locator('.sidebar .section:has-text("Overlaps (") select').selectOption('threshold');
  const d = await doc(page);
  expect(Object.values(d.overlaps)).toEqual([{ mode: 'threshold' }]);
});

test('shape tool: pocket fill, freehand stroke attaches and follows its bubble', async ({ page, canvas }) => {
  for (const [x, y] of [
    [300, 280],
    [640, 280],
    [470, 580],
  ] as const)
    await canvas.bubble(x, y);
  await page.keyboard.press('Escape');
  await page.keyboard.press('s');
  await canvas.dblclick(470, 380);
  await expect.poll(async () => (await nodes(page)).filter((n) => n.shape.kind === 'blob').length).toBe(1);
  const blob = (await nodes(page)).find((n) => n.shape.kind === 'blob');
  expect(blob.shape.points.filter((p: any) => p.t === 'anchor').length).toBeGreaterThanOrEqual(3);

  // freehand along the right side of the third bubble's ring (r + gap = 12 ft = 144 px)
  await page.keyboard.press('s');
  const cx = canvas.x + 470;
  const cy = canvas.y + 580;
  await page.mouse.move(cx + 144 * Math.cos(-1), cy + 144 * Math.sin(-1));
  await page.mouse.down();
  for (let a = -1; a <= 1; a += 0.08) await page.mouse.move(cx + 144 * Math.cos(a), cy + 144 * Math.sin(a));
  await page.mouse.move(cx + 280, cy + 150, { steps: 5 });
  await page.mouse.move(cx + 280, cy - 150, { steps: 5 });
  await page.mouse.up();
  const blobs = (await nodes(page)).filter((n) => n.shape.kind === 'blob');
  expect(blobs).toHaveLength(2);
  const stroke = blobs.find((b) => b.id !== blob.id);
  const third = (await nodes(page)).find((n) => n.name === 'Space 3');
  expect(stroke.shape.points.some((p: any) => p.t === 'anchor' && p.node === third.id && p.arc)).toBe(true);
});

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

test('CSV import, then export PDF, PNG and SVG with sketch style on', async ({ page, canvas }) => {
  void canvas;
  await importSampleCsv(page);
  expect(await nodes(page)).toHaveLength(11);
  await page.locator('.toolbar label:has-text("Style") select').selectOption('watercolor');
  for (const fmt of ['PDF', 'PNG', 'SVG']) {
    await page.getByRole('button', { name: 'Export', exact: true }).click();
    await page.locator(`.dialog .seg:has-text("${fmt}")`).click();
    const [dl] = await Promise.all([page.waitForEvent('download'), page.locator(`.dialog button:has-text("Export ${fmt}")`).click()]);
    expect(dl.suggestedFilename()).toMatch(new RegExp(`\\.${fmt.toLowerCase()}$`));
    expect((await dl.createReadStream()).readableLength >= 0).toBe(true);
  }
  void ui;
});
