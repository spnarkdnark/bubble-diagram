import { doc, expect, field, nodes, test } from './helpers';

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

test('category styles are shared standards across tabs, and undo elsewhere cannot revert them', async ({
  page,
  canvas,
}) => {
  const publicStyle = async () => {
    const d = await doc(page);
    return (Object.values(d.categories) as any[]).find((c) => c.name === 'Public').style;
  };
  const setPublicWeight = async (pt: string) => {
    const row = page.locator('.category-list > li').nth(0);
    if ((await page.locator('.category-style').count()) === 0) await row.locator('.chev').click();
    const weight = page.locator('.category-style .field:has-text("Weight") input');
    await weight.fill(pt);
    await weight.press('Enter');
  };
  await canvas.bubble(400, 300); // tab 1 has an undoable edit in its history
  await canvas.click(1000, 700);
  await setPublicWeight('3');
  // a new tab starts with the standard
  await page.locator('.tab-new').click();
  expect((await publicStyle()).strokeWeightPt).toBe(3);
  // change it in tab 2 ...
  await setPublicWeight('5');
  // ... tab 1 follows, and undoing tab 1's own edits never brings back 3 pt
  await page.locator('.tab').nth(0).click();
  expect((await publicStyle()).strokeWeightPt).toBe(5);
  await page.keyboard.press('Control+z');
  await page.keyboard.press('Control+z');
  await page.keyboard.press('Control+z');
  expect((await publicStyle()).strokeWeightPt).toBe(5);
  // standards survive a reload
  await page.waitForTimeout(700);
  await page.reload();
  await page.waitForSelector('.canvas canvas');
  expect((await publicStyle()).strokeWeightPt).toBe(5);
  await page.locator('.tab-new').click();
  expect((await publicStyle()).strokeWeightPt).toBe(5);
});

test('the graphic style is a shared standard across tabs', async ({ page, canvas }) => {
  await canvas.bubble(400, 300); // something in tab 1's undo history
  const graphic = async () => (await doc(page)).settings.graphic;
  const preset = page.locator('label[title="Graphic style"] select');
  await preset.selectOption('pencil');
  await page.locator('.tab-new').click();
  expect((await graphic()).preset).toBe('pencil');
  await preset.selectOption('marker');
  await page.locator('.tab').nth(0).click();
  expect((await graphic()).preset).toBe('marker');
  // undo in the first tab cannot bring back an older graphic style
  await page.keyboard.press('Control+z');
  expect((await graphic()).preset).toBe('marker');
  await page.waitForTimeout(700);
  await page.reload();
  await page.waitForSelector('.canvas canvas');
  expect((await graphic()).preset).toBe('marker');
});
