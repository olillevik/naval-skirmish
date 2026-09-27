# Pure TypeScript game core with a Phaser view

The game is built with Phaser, TypeScript and Vite, tested with Vitest and Playwright, and deployed to GitHub Pages. The code is written almost entirely by AI agents, and fully automated tests are how we know a change works. All game rules live in plain TypeScript modules that never import Phaser: movement, the Rim current, collisions and ramming, Targeting rules, damage, Gold, regen and Waves. The core advances by a fixed time step and takes a seeded random generator, so a test can play any situation in a few milliseconds with no browser. Phaser only draws the core's state and turns keyboard and touch input into commands for the core.

## Considered options

Phaser's own Arcade Physics and scene logic were rejected for game rules. Phaser can run headless, but testing through it needs a browser-like environment, real timers and a booted game, so tests are slow and flaky. That is the opposite of what an agent needs to check its own work. PixiJS and bare canvas were rejected for the view, because we would have to write scaling, multi-touch input, mobile audio unlock and scenes ourselves.

## Consequences

Do not use Phaser physics bodies, `this.time` timers or Phaser random numbers inside game rules, even where it looks shorter. Collisions are circle checks inside the core. Playwright smoke tests read the core's state through a test hook on `window`, and do not read pixels.
