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
  await expect(page.getByTestId('fireball-button')).toBeHidden();
});

for (const key of ['Digit1', 'Space']) {
  test(`pressing ${key} with an enemy in range throws a Fireball and starts the cooldown`, async ({ page }) => {
    // The Wave arrives after 5 s, and the enemies sail into Fireball range within a few more.
    test.setTimeout(60_000);
    await startRun(page);
    await expect(page.getByTestId('fireball')).toHaveText('Fireball ready');
    await page.waitForFunction(() => window.navalSkirmishTest!.state.fireballTargetId !== null, null, { timeout: 30_000 });

    await page.keyboard.press(key);
    await page.waitForFunction(() => window.navalSkirmishTest!.state.fireballs.length > 0);

    const { player, fireballs } = await page.evaluate(() => window.navalSkirmishTest!.state);
    expect(fireballs).toHaveLength(1);
    expect(player.fireballTicks).toBeGreaterThan(0);
    await expect(page.getByTestId('fireball')).toHaveText(/^Fireball in [56]$/);
  });
}

test('the HUD counts down to Wave 1, which then spawns', async ({ page }) => {
  await startRun(page);
  const countdown = page.getByTestId('countdown');
  await expect(page.getByTestId('health')).toHaveText('Health 100');
  await expect(page.getByTestId('gold')).toHaveText('Gold 0');

  await expect(page.getByTestId('wave')).toHaveText('Wave 1');
  await expect(countdown).toHaveText(/^starts in [45]$/);
  await page.waitForFunction(() => window.navalSkirmishTest!.state.waveStatus === 'fighting', null, { timeout: 10_000 });

  await expect(countdown).toBeHidden();
  await expect(page.getByTestId('wave')).toHaveText('Wave 1');
  expect((await page.evaluate(() => window.navalSkirmishTest!.state.enemies)).length).toBe(3);
});

test('sailing over the Edge ends the Run, and a new Run resets the dinghy and the Waves', async ({ page }) => {
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
  await expect(page.getByTestId('end-cause')).toHaveText('The dinghy fell off the Edge');
  await expect(page.getByTestId('cabin-mark')).toBeHidden();
  await page.keyboard.press('KeyE');
  await expect(page.getByTestId('cabin')).toBeHidden();
  expect(await page.evaluate(() => window.navalSkirmishTest!.state)).toMatchObject({ run: 'ended', endCause: 'fell off the Edge' });

  await page.getByTestId('new-run').click();

  await expect(gameOver).toBeHidden();
  await expect(warning).toBeHidden();
  const state = await page.evaluate(() => window.navalSkirmishTest!.state);
  expect(state).toMatchObject({ run: 'sailing', wave: 1, waveStatus: 'countdown', enemies: [], gold: 0, score: 0 });
  await expect(page.getByTestId('countdown')).toBeVisible();
  expect(state.player).toMatchObject({ x: 0, y: 0, heading: 0, speed: 0, throttle: 0 });
});

test('a dinghy that sits still sinks under enemy Arrows, and the game-over screen says it sank', async ({ page }) => {
  // The Wave arrives after 5 s, and three enemy Crews take about 7 s to sink a dinghy with 100 health.
  test.setTimeout(90_000);
  await startRun(page);
  const health = page.getByTestId('health');

  await expect(health).not.toHaveText('Health 100', { timeout: 30_000 });
  await expect(page.getByTestId('game-over')).toBeVisible({ timeout: 60_000 });

  await expect(page.getByTestId('end-cause')).toHaveText('The dinghy sank');
  await expect(health).toHaveText('Health 0');
  expect(await page.evaluate(() => window.navalSkirmishTest!.state)).toMatchObject({ run: 'ended', endCause: 'sank' });
});

test('the game-over screen shows the Score and a Best score from local storage, which survives a reload', async ({ page }) => {
  // Two Runs, each about 12 s at full throttle to the Edge and 1 s to fall.
  test.setTimeout(90_000);
  await openGame(page);
  await page.evaluate(() => localStorage.setItem('naval-skirmish.bestScore', '7'));

  for (const load of ['first', 'after reload']) {
    await startRun(page);
    await page.keyboard.down('KeyW');
    await expect(page.getByTestId('game-over')).toBeVisible({ timeout: 30_000 });
    await page.keyboard.up('KeyW');

    await expect(page.getByTestId('score'), load).toHaveText('Score 0');
    await expect(page.getByTestId('best-score'), load).toHaveText('Best score 7');
  }
  expect(await page.evaluate(() => localStorage.getItem('naval-skirmish.bestScore'))).toBe('7');
});

for (const key of ['KeyE', 'Escape']) {
  test(`${key} opens the Cabin, which freezes the world until ${key} closes it`, async ({ page }) => {
    await startRun(page);
    const cabin = page.getByTestId('cabin');
    const state = () => page.evaluate(() => window.navalSkirmishTest!.state);
    await expect(page.getByTestId('cabin-mark')).toBeVisible();
    await page.keyboard.down('KeyW');
    await page.waitForTimeout(500);

    await page.keyboard.press(key);
    await expect(cabin).toBeVisible();
    const opened = await state();
    await page.waitForTimeout(500);
    const frozen = await state();
    await page.keyboard.press(key);
    await expect(cabin).toBeHidden();
    await page.waitForTimeout(300);
    await page.keyboard.up('KeyW');
    const resumed = await state();

    expect(frozen).toEqual(opened);
    expect(opened.player.speed).toBeGreaterThan(0);
    expect(resumed.player.y).toBeLessThan(opened.player.y);
    expect(resumed.countdown).toBeLessThan(opened.countdown);
  });
}

test('at the start of a Run the Cabin shows Gold, health and the dinghy, and Repair is disabled', async ({ page }) => {
  await startRun(page);

  await page.keyboard.press('KeyE');

  await expect(page.getByTestId('cabin-gold')).toHaveText('Gold 0');
  await expect(page.getByTestId('cabin-health')).toHaveText('Health 100 / 100');
  await expect(page.getByTestId('cabin-vessel')).toHaveText('small dinghy');
  await expect(page.getByTestId('cabin-item-repair')).toContainText('Repair');
  await expect(page.getByTestId('cabin-item-repair')).toContainText('10 Gold');
  await expect(page.getByTestId('cabin-item-volleySize')).toContainText('0 / 4');
  await expect(page.getByTestId('cabin-item-volleySize')).toContainText('30 Gold');
  await expect(page.getByTestId('cabin-item-smallShip')).toContainText('Small ship');
  await expect(page.getByTestId('cabin-item-smallShip')).toContainText('150 Gold');
  // The medium ship is offered only once the small ship is owned.
  await expect(page.getByTestId('cabin-item-mediumShip')).toHaveCount(0);
  await expect(page.getByTestId('cabin-item-moreCannons')).toContainText('a bigger ship can carry more');
  const buttons = page.getByTestId('cabin-items').getByRole('button');
  await expect(buttons).not.toHaveCount(0);
  for (const button of await buttons.all()) await expect(button).toBeDisabled();
  await page.getByTestId('cabin-close').click();
  await expect(page.getByTestId('cabin')).toBeHidden();
});

test('the Cabin shows the Targeting rule section above the section for sale, each with a heading', async ({ page }) => {
  await startRun(page);

  await page.keyboard.press('KeyE');

  const rulesSection = page.getByTestId('cabin-rules-section');
  const shop = page.getByTestId('cabin-shop');
  await expect(rulesSection.getByRole('heading')).toHaveText('Targeting rule');
  await expect(shop.getByRole('heading')).toHaveText('For sale');
  // All four rules are free from the start, and none is sold.
  await expect(rulesSection.getByRole('button')).toHaveText(['closest', 'farthest', 'lowest health', 'highest health']);
  await expect(page.getByTestId('rule-closest')).toHaveAttribute('aria-pressed', 'true');
  await expect(shop.getByText('farthest')).toHaveCount(0);
  const rulesBox = (await rulesSection.boundingBox())!;
  const shopBox = (await shop.boundingBox())!;
  expect(rulesBox.y + rulesBox.height).toBeLessThanOrEqual(shopBox.y);

  await page.getByTestId('rule-farthest').click();
  await expect(page.getByTestId('rule-farthest')).toHaveAttribute('aria-pressed', 'true');
  expect(await page.evaluate(() => window.navalSkirmishTest!.state)).toMatchObject({ targetingRule: 'farthest', gold: 0 });
});
