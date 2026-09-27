import { expect, test } from '@playwright/test';
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
