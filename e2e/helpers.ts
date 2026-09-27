import { expect, type Page } from '@playwright/test';

/** Opens the game with the test hook on, and waits until it is ready. */
export async function openGame(page: Page): Promise<void> {
  await page.goto('?test');
  await page.waitForFunction(() => window.navalSkirmishTest !== undefined);
}

/** Opens the game and starts a Run from the start screen, by click or by tap. */
export async function startRun(page: Page, how: 'click' | 'tap' = 'click'): Promise<void> {
  await openGame(page);
  const startScreen = page.getByTestId('start-screen');
  await (how === 'tap' ? startScreen.tap() : startScreen.click());
  await expect(startScreen).toBeHidden();
}
