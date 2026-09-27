import { expect, test } from '@playwright/test';
import { openGame, startRun } from './helpers';

test('the dinghy starts in the centre of the Arena', async ({ page }) => {
  await startRun(page);

  const dinghy = await page.evaluate(() => window.navalSkirmishTest!.state.player);

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

  await openGame(page);

  expect(failed).toEqual([]);
});

for (const [name, throttleKey, rightKey] of [
  ['WASD', 'KeyW', 'KeyD'],
  ['arrow keys', 'ArrowUp', 'ArrowRight'],
] as const) {
  test(`holding throttle then right with the ${name} moves and turns the dinghy`, async ({ page }) => {
    await startRun(page);

    await page.keyboard.down(throttleKey);
    await page.waitForTimeout(500);
    await page.keyboard.up(throttleKey);
    const afterThrottle = await page.evaluate(() => window.navalSkirmishTest!.state.player);
    await page.keyboard.down(rightKey);
    await page.waitForTimeout(500);
    await page.keyboard.up(rightKey);
    const afterTurn = await page.evaluate(() => window.navalSkirmishTest!.state.player);

    expect(afterThrottle.throttle).toBeGreaterThan(0);
    expect(afterThrottle.y).toBeLessThan(0);
    expect(afterTurn.heading).toBeGreaterThan(0);
    expect(afterTurn.throttle).toBe(afterThrottle.throttle);
  });
}

test('the dinghy ignores the keyboard until the start screen is clicked', async ({ page }) => {
  await openGame(page);
  await expect(page.getByTestId('start-screen')).toBeVisible();

  await page.keyboard.down('KeyW');
  await page.waitForTimeout(300);
  await page.keyboard.up('KeyW');
  const beforeStart = await page.evaluate(() => window.navalSkirmishTest!.state.player);
  await page.getByTestId('start-screen').click();
  await expect(page.getByTestId('start-screen')).toBeHidden();
  await page.keyboard.down('KeyW');
  await page.waitForTimeout(300);
  await page.keyboard.up('KeyW');
  const afterStart = await page.evaluate(() => window.navalSkirmishTest!.state.player);

  expect(beforeStart.throttle).toBe(0);
  expect(afterStart.throttle).toBeGreaterThan(0);
});

test('the game fills the window and follows a resize', async ({ page }) => {
  await startRun(page);
  const canvas = page.locator('canvas');

  await page.setViewportSize({ width: 900, height: 500 });

  await expect.poll(() => canvas.boundingBox()).toEqual({ x: 0, y: 0, width: 900, height: 500 });
});

test('there is no rotate message on desktop', async ({ page }) => {
  await openGame(page);

  await expect(page.getByTestId('rotate-message')).toBeHidden();
});

test('there are no touch controls on desktop', async ({ page }) => {
  await startRun(page);

  await expect(page.getByTestId('throttle-lever')).toBeHidden();
  await expect(page.getByTestId('steering-area')).toBeHidden();
});

test('sailing over the Edge ends the Run, and a new Run resets the dinghy', async ({ page }) => {
  // Full throttle reaches the Edge in about 11 s, then the fall takes 1 s.
  test.setTimeout(60_000);
  await startRun(page);
  const warning = page.getByTestId('edge-warning');
  const gameOver = page.getByTestId('game-over');
  await expect(warning).toBeHidden();

  await page.keyboard.down('KeyW');
  await page.waitForFunction(() => window.navalSkirmishTest!.state.player.pastPointOfNoReturn, null, { timeout: 30_000 });
  await expect(warning).toBeVisible();
  await expect(gameOver).toBeVisible({ timeout: 10_000 });
  await page.keyboard.up('KeyW');
  await expect(gameOver).toContainText('The dinghy fell off the Edge');
  expect((await page.evaluate(() => window.navalSkirmishTest!.state)).run).toBe('ended');

  await page.getByTestId('new-run').click();

  await expect(gameOver).toBeHidden();
  await expect(warning).toBeHidden();
  const state = await page.evaluate(() => window.navalSkirmishTest!.state);
  expect(state.run).toBe('sailing');
  expect(state.player).toMatchObject({ x: 0, y: 0, heading: 0, speed: 0, throttle: 0 });
});
