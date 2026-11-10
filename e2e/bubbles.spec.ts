import { doc, expect, field, nodes, test, ui } from './helpers';

test('a 10 ft bubble is 120 px across its radius at 1/8" and 100%', async ({ page, canvas }) => {
  await canvas.bubble(400, 300);
  const [n] = await nodes(page);
  expect(n.shape.radiusFt).toBe(10);
  // clicking 119 px below center still hits it; 125 px does not (below avoids the resize handle)
  await page.keyboard.press('Escape');
  await canvas.click(400, 300 + 119);
  expect((await ui(page)).selection.nodes).toEqual([n.id]);
  await canvas.click(400, 300 + 125);
  expect((await ui(page)).selection.nodes).toEqual([]);
});

test('drag moves, resize handle snaps to 6", wheel steps 6"', async ({ page, canvas }) => {
  await canvas.bubble(400, 300);
  const before = (await nodes(page))[0];
  await canvas.drag([400, 300], [460, 300]);
  const moved = (await nodes(page))[0];
  expect(moved.x - before.x).toBeCloseTo(5, 1); // 60 px / 12 px per ft
  // handle sits on the right edge of the selected bubble (center now at 460)
  await canvas.drag([580, 300], [607, 300]);
  expect((await nodes(page))[0].shape.radiusFt).toBe(12.5); // 147 px -> 12.25 ft -> snapped
  await page.mouse.move(canvas.x + 460, canvas.y + 300);
  for (let i = 0; i < 3; i++) await page.mouse.wheel(0, -100);
  await expect.poll(async () => (await nodes(page))[0].shape.radiusFt).toBe(14);
  await page.mouse.wheel(0, 100);
  await expect.poll(async () => (await nodes(page))[0].shape.radiusFt).toBe(13.5);
});

test('wheel over empty canvas zooms', async ({ page, canvas }) => {
  await page.mouse.move(canvas.x + 200, canvas.y + 200);
  await page.mouse.wheel(0, -300);
  await expect.poll(async () => (await ui(page)).view.zoom).toBeGreaterThan(1.2);
});

test('selection: marquee, shift-click, select all, duplicate, nudge, delete, undo/redo', async ({ page, canvas }) => {
  await canvas.bubble(250, 250);
  await canvas.bubble(550, 250);
  await canvas.bubble(850, 250);
  await canvas.click(1000, 700);
  await canvas.drag([60, 80], [700, 450]);
  expect((await ui(page)).selection.nodes).toHaveLength(2);
  await canvas.click(250, 250);
  await page.keyboard.down('Shift');
  await canvas.click(850, 250);
  await page.keyboard.up('Shift');
  expect((await ui(page)).selection.nodes).toHaveLength(2);
  await page.keyboard.press('Control+a');
  await page.keyboard.press('Control+d');
  expect(await nodes(page)).toHaveLength(6);
  const x0 = (await nodes(page))[5].x;
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Shift+ArrowRight');
  expect((await nodes(page))[5].x - x0).toBeCloseTo(11);
  await page.keyboard.press('Delete');
  expect(await nodes(page)).toHaveLength(3);
  await page.keyboard.press('Control+z'); // undo delete
  expect(await nodes(page)).toHaveLength(6);
  await page.keyboard.press('Control+z'); // undo both nudges (one coalesced step)
  expect((await nodes(page))[5].x).toBeCloseTo(x0);
  await page.keyboard.press('Control+Shift+z');
  expect((await nodes(page))[5].x - x0).toBeCloseTo(11);
});

test('connect tool links two bubbles; connection type can change', async ({ page, canvas }) => {
  await canvas.bubble(300, 300);
  await canvas.bubble(700, 300);
  await page.keyboard.press('c');
  await canvas.click(300, 300);
  await canvas.click(700, 300);
  await page.keyboard.press('v');
  const d = await doc(page);
  const conns = Object.values(d.connections) as any[];
  expect(conns).toHaveLength(1);
  await canvas.click(500, 300); // the line between them
  await page.getByRole('button', { name: /Strong adjacency/ }).click();
  expect(((Object.values((await doc(page)).connections) as any[])[0]).type).toBe('strong');
});

test('size by radius, diameter or area', async ({ page, canvas }) => {
  await canvas.bubble(400, 300);
  await field(page, 'Area').fill('1,200 sf');
  await field(page, 'Area').press('Enter');
  await expect(field(page, 'Radius')).toHaveValue(`19'-7"`);
  expect((await nodes(page))[0].shape.radiusFt).toBeCloseTo(Math.sqrt(1200 / Math.PI), 6);
  await field(page, 'Diameter').fill(`30'`);
  await field(page, 'Diameter').press('Enter');
  await expect(field(page, 'Area')).toHaveValue('707 sf');
});

test('names edit in place only on the selected bubble', async ({ page, canvas }) => {
  await canvas.bubble(400, 300);
  await canvas.click(1000, 700);
  await canvas.click(400, 297); // selects
  await expect(page.locator('.label-editor')).toHaveCount(0);
  await canvas.click(400, 297); // edits
  await expect(page.locator('.label-editor')).toHaveCount(1);
  await page.keyboard.type('Reading Room');
  await page.keyboard.press('Enter');
  expect((await nodes(page))[0].name).toBe('Reading Room');
  await canvas.dblclick(400, 297);
  await page.keyboard.type('Nope');
  await page.keyboard.press('Escape');
  expect((await nodes(page))[0].name).toBe('Reading Room');
});
