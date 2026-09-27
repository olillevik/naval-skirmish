import { expect, test } from '@playwright/test';

test('the Dinghy starts in the centre of the Arena', async ({ page }) => {
  await page.goto('?test');
  await page.waitForFunction(() => window.navalSkirmishTest !== undefined);

  const dinghy = await page.evaluate(() => window.navalSkirmishTest!.state.dinghy);

  expect(dinghy).toMatchObject({ x: 0, y: 0, speed: 0, throttle: 0 });
});

test('there is no test hook without the test flag', async ({ page }) => {
  await page.goto('');
  await expect(page.locator('canvas')).toBeVisible();

  expect(await page.evaluate(() => window.navalSkirmishTest)).toBeUndefined();
});

test('every asset loads', async ({ page }) => {
  const failed: string[] = [];
  page.on('response', (response) => {
    if (!response.ok()) failed.push(response.url());
  });
  page.on('requestfailed', (request) => failed.push(request.url()));

  await page.goto('?test');
  await page.waitForFunction(() => window.navalSkirmishTest !== undefined);

  expect(failed).toEqual([]);
});

for (const [name, throttleKey, rightKey] of [
  ['WASD', 'KeyW', 'KeyD'],
  ['arrow keys', 'ArrowUp', 'ArrowRight'],
] as const) {
  test(`holding throttle then right with the ${name} moves and turns the Dinghy`, async ({ page }) => {
    await page.goto('?test');
    await page.waitForFunction(() => window.navalSkirmishTest !== undefined);

    await page.keyboard.down(throttleKey);
    await page.waitForTimeout(500);
    await page.keyboard.up(throttleKey);
    const afterThrottle = await page.evaluate(() => window.navalSkirmishTest!.state.dinghy);
    await page.keyboard.down(rightKey);
    await page.waitForTimeout(500);
    await page.keyboard.up(rightKey);
    const afterTurn = await page.evaluate(() => window.navalSkirmishTest!.state.dinghy);

    expect(afterThrottle.throttle).toBeGreaterThan(0);
    expect(afterThrottle.y).toBeLessThan(0);
    expect(afterTurn.heading).toBeGreaterThan(0);
    expect(afterTurn.throttle).toBe(afterThrottle.throttle);
  });
}
