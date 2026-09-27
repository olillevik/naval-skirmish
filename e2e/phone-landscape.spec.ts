import { expect, test, type Page } from '@playwright/test';
import { openGame, startRun } from './helpers';

test('the rotate message is hidden', async ({ page }) => {
  await openGame(page);

  await expect(page.getByTestId('start-screen')).toBeVisible();
  await expect(page.getByTestId('rotate-message')).toBeHidden();
});

test('the start tap asks for fullscreen', async ({ page }) => {
  await page.addInitScript(() => {
    Element.prototype.requestFullscreen = () => {
      document.body.dataset.fullscreenRequested = 'yes';
      return Promise.resolve();
    };
  });

  await startRun(page, 'tap');

  await expect(page.locator('body')).toHaveAttribute('data-fullscreen-requested', 'yes');
});

test('a refused fullscreen request does not stop the Run from starting', async ({ page }) => {
  await page.addInitScript(() => {
    Element.prototype.requestFullscreen = () => Promise.reject(new TypeError('Fullscreen request denied'));
  });

  await startRun(page, 'tap');
  await page.keyboard.down('KeyW');
  await page.waitForTimeout(300);
  await page.keyboard.up('KeyW');

  expect((await page.evaluate(() => window.navalSkirmishTest!.state.dinghy)).throttle).toBeGreaterThan(0);
});

type Point = { x: number; y: number };

/**
 * Real multi-touch through the Chrome DevTools Protocol. Each call sends every finger still down,
 * as the protocol expects. Playwright's own touchscreen only taps.
 */
async function touchscreen(page: Page) {
  const cdp = await page.context().newCDPSession(page);
  const fingers = new Map<number, Point>();
  const send = (type: 'touchStart' | 'touchMove' | 'touchEnd') =>
    cdp.send('Input.dispatchTouchEvent', {
      type,
      touchPoints: [...fingers].map(([id, { x, y }]) => ({ id, x, y })),
    });
  return {
    down: (id: number, point: Point) => (fingers.set(id, point), send('touchStart')),
    /** Moves in small steps, as a real thumb does. */
    async move(id: number, to: Point) {
      const from = fingers.get(id)!;
      for (let i = 1; i <= 5; i++) {
        fingers.set(id, { x: from.x + ((to.x - from.x) * i) / 5, y: from.y + ((to.y - from.y) * i) / 5 });
        await send('touchMove');
      }
    },
    up: (id: number) => (fingers.delete(id), send('touchEnd')),
  };
}

const dinghy = (page: Page) => page.evaluate(() => window.navalSkirmishTest!.state.dinghy);

async function box(page: Page, testId: string) {
  const found = await page.getByTestId(testId).boundingBox();
  if (!found) throw new Error(`${testId} is not visible`);
  return found;
}

test('the throttle lever and the steering area show on a touch screen', async ({ page }) => {
  await startRun(page, 'tap');

  await expect(page.getByTestId('throttle-lever')).toBeVisible();
  await expect(page.getByTestId('steering-area')).toBeVisible();
  await expect(page.getByTestId('throttle-value')).toHaveText('0%');
});

test('dragging the lever up sets the throttle, and it stays after the thumb lifts', async ({ page }) => {
  await startRun(page, 'tap');
  const lever = await box(page, 'throttle-lever');
  const touch = await touchscreen(page);
  const x = lever.x + lever.width / 2;

  await touch.down(1, { x, y: lever.y + lever.height - 30 });
  await touch.move(1, { x, y: lever.y + lever.height / 2 });
  await touch.up(1);
  await page.waitForTimeout(300);
  const lifted = await dinghy(page);
  await page.waitForTimeout(300);

  expect(lifted.throttle).toBeGreaterThan(0.3);
  expect(lifted.throttle).toBeLessThan(0.8);
  expect((await dinghy(page)).throttle).toBe(lifted.throttle);
  await expect(page.getByTestId('throttle-value')).toHaveText(`${Math.round(lifted.throttle * 100)}%`);
});

test('a long sideways drag turns faster than a short one, and lifting stops the turn', async ({ page }) => {
  await startRun(page, 'tap');
  const steering = await box(page, 'steering-area');
  const touch = await touchscreen(page);
  const start = { x: steering.x + steering.width / 2, y: steering.y + steering.height / 2 };

  /** Holds a drag of this many px to the right for half a second, and returns how far the Dinghy turned. */
  async function turnWithDrag(distance: number): Promise<number> {
    await touch.down(1, start);
    await touch.move(1, { x: start.x + distance, y: start.y });
    const before = (await dinghy(page)).heading;
    await page.waitForTimeout(500);
    const turned = (await dinghy(page)).heading - before;
    await touch.up(1);
    return turned;
  }

  const short = await turnWithDrag(20);
  const long = await turnWithDrag(150);
  const lifted = (await dinghy(page)).heading;
  await page.waitForTimeout(300);

  expect(short).toBeGreaterThan(0);
  expect(long).toBeGreaterThan(short * 2);
  expect((await dinghy(page)).heading).toBe(lifted);
});

test('two thumbs steer and set the throttle at the same time', async ({ page }) => {
  await startRun(page, 'tap');
  const lever = await box(page, 'throttle-lever');
  const steering = await box(page, 'steering-area');
  const touch = await touchscreen(page);
  const leverX = lever.x + lever.width / 2;
  const steerStart = { x: steering.x + steering.width / 2, y: steering.y + steering.height / 2 };

  await touch.down(1, steerStart);
  await touch.move(1, { x: steerStart.x - 150, y: steerStart.y });
  await touch.down(2, { x: leverX, y: lever.y + lever.height - 30 });
  await touch.move(2, { x: leverX, y: lever.y + 10 });
  await page.waitForTimeout(500);
  const bothHeld = await dinghy(page);
  await touch.up(1);
  await touch.up(2);

  expect(bothHeld.throttle).toBe(1);
  expect(bothHeld.heading).toBeLessThan(0);
});

test('tapping New Run after falling off the Edge starts a fresh Run', async ({ page }) => {
  // Full throttle reaches the Edge in about 11 s, then the fall takes 1 s.
  test.setTimeout(60_000);
  await startRun(page, 'tap');
  const lever = await box(page, 'throttle-lever');
  const touch = await touchscreen(page);
  await touch.down(1, { x: lever.x + lever.width / 2, y: lever.y + 10 });
  await touch.up(1);
  await expect(page.getByTestId('game-over')).toBeVisible({ timeout: 30_000 });

  await page.getByTestId('new-run').tap();

  await expect(page.getByTestId('game-over')).toBeHidden();
  expect(await dinghy(page)).toEqual({ x: 0, y: 0, heading: 0, speed: 0, throttle: 0 });
  await expect(page.getByTestId('throttle-value')).toHaveText('0%');
});
