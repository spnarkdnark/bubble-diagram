import { expect, nodes, test } from './helpers';

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

test('shape points: drag off a ring frees it, double-click deletes it', async ({ page, canvas }) => {
  await canvas.bubble(400, 400);
  await page.keyboard.press('Escape');
  await page.keyboard.press('s');
  // click-place a triangle: first point on the ring (r + gap = 12 ft = 144 px right of center)
  await canvas.click(544, 400);
  await canvas.click(700, 250);
  await canvas.click(700, 550);
  await page.keyboard.press('Enter');
  const shapeOf = async () => (await nodes(page)).find((n) => n.shape.kind === 'blob');
  expect((await shapeOf()).shape.points[0].t).toBe('anchor');
  // drag the anchored point well away from the ring: it becomes free
  await canvas.drag([544, 400], [620, 400]);
  expect((await shapeOf()).shape.points[0].t).toBe('free');
  // drag it back near the ring: it re-attaches
  await canvas.drag([620, 400], [546, 402]);
  expect((await shapeOf()).shape.points[0].t).toBe('anchor');
  // double-click on the outline (between points 2 and 3) adds a point; double-click on it deletes it
  const onEdge = await page.evaluate(() => {
    const bd = (window as any).__bd;
    const s = bd.doc.getState().history.present;
    const v = bd.ui.getState().view;
    const k = 12 * v.zoom; // px per ft at 1/8" = 1'-0"
    const n = Object.values(s.nodes).find((x: any) => x.shape.kind === 'blob');
    const geo = bd.blobGeometry(n, s);
    const idx =
      geo.seg.findIndex((sg: number) => sg === 1) + Math.floor(geo.seg.filter((sg: number) => sg === 1).length / 2);
    return { x: geo.poly[idx].x * k + v.panX, y: geo.poly[idx].y * k + v.panY };
  });
  await canvas.dblclick(onEdge.x, onEdge.y);
  expect((await shapeOf()).shape.points).toHaveLength(4);
  await canvas.dblclick(onEdge.x, onEdge.y);
  expect((await shapeOf()).shape.points).toHaveLength(3);
});
