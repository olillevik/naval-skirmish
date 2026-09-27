/**
 * Renders the Pirate Kit models in art/pirate-kit into the sprite sheets in public/assets/kit, one frame per
 * heading, plus a water tile to match, and writes the sheets' frame sizes to src/view/kitSheets.json. Run it
 * with `npm run render-sprites` after changing a model, a spec or the water, and commit what it writes.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { chromium } from '@playwright/test';
import { createServer } from 'vite';
import type { Sheet, SheetSpec } from './render.ts';

/** The old pack's sprites were 52 px long for the dinghy and 113 px for the ship, and these keep about that. */
const DINGHY_PIXELS_PER_UNIT = 22;
const SHIP_PIXELS_PER_UNIT = 13;

const SPECS: Record<string, SheetSpec> = {
  dinghy: { model: 'boat-row-small', pixelsPerUnit: DINGHY_PIXELS_PER_UNIT },
  'ship-black': { model: 'ship-small', pixelsPerUnit: SHIP_PIXELS_PER_UNIT, sailColour: 0x3a3a3a },
  'ship-red': { model: 'ship-small', pixelsPerUnit: SHIP_PIXELS_PER_UNIT, sailColour: 0xd64040 },
  'ship-green': { model: 'ship-small', pixelsPerUnit: SHIP_PIXELS_PER_UNIT, sailColour: 0x44a852 },
  'ship-blue': { model: 'ship-small', pixelsPerUnit: SHIP_PIXELS_PER_UNIT, sailColour: 0x4070d8 },
  'ship-yellow': { model: 'ship-small', pixelsPerUnit: SHIP_PIXELS_PER_UNIT, sailColour: 0xe8c43a },
};

const server = await createServer({ root: process.cwd(), base: '/', logLevel: 'warn', server: { port: 0 } });
await server.listen();
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
try {
  const page = await browser.newPage();
  page.on('pageerror', (error) => console.error(error));
  await page.goto(`${server.resolvedUrls!.local[0]}scripts/render-sprites/index.html`);
  await page.waitForFunction(() => 'renderSheet' in window);
  mkdirSync('public/assets/kit', { recursive: true });
  const frameSizes: Record<string, Omit<Sheet, 'png'>> = {};
  for (const [name, spec] of Object.entries(SPECS)) {
    const { png, ...frameSize } = await page.evaluate((spec) => window.renderSheet(spec), spec);
    writeFileSync(`public/assets/kit/${name}.png`, Buffer.from(png.split(',')[1], 'base64'));
    frameSizes[name] = frameSize;
    console.log(`${name}: ${frameSize.frameWidth}×${frameSize.frameHeight} px frames`);
  }
  const water = await page.evaluate(() => window.renderWater());
  writeFileSync('public/assets/kit/water.png', Buffer.from(water.split(',')[1], 'base64'));
  writeFileSync('src/view/kitSheets.json', `${JSON.stringify(frameSizes, null, 2)}\n`);
} finally {
  await browser.close();
  await server.close();
}
