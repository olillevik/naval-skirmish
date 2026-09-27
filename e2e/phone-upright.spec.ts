import { expect, test } from '@playwright/test';
import { openGame } from './helpers';

test('the rotate message covers the game', async ({ page }) => {
  await openGame(page);

  await expect(page.getByTestId('rotate-message')).toBeVisible();
});
