# Naval Skirmish

A top-down browser game about steering a small dinghy across a round magical sea that ends in open space. The latest build of `main` is live at <https://olillevik.github.io/naval-skirmish/>.

Right now you can sail the dinghy around the Arena with the keyboard or, on a phone, by touch. Tap or click the start screen to begin a Run. On a phone, the tap also asks the browser for fullscreen, and the game asks you to turn the phone to landscape. W or ↑ raises the throttle, S or ↓ lowers it, and A/D or ←/→ turn. The throttle stays where you leave it. A ring on the water marks where the Rim current starts pulling the dinghy toward the Edge. A warning shows once the pull is too strong to row against, and a dinghy that crosses the Edge falls into space and ends the Run. On a touch screen, a throttle lever on the right edge sets the throttle directly and shows its value. Dragging sideways anywhere on the left half steers, harder the further you drag, and the dinghy goes straight again when you lift your thumb. Both thumbs work at once.

A Run starts with a 5-second countdown, and then Wave 1 arrives. Wave n has 2 + n enemy dinghies, drawn over a red ring. They sail at your dinghy and circle it just inside Arrow range, and they turn back before the Rim current. Every Crew fires an Arrow once a second at the closest vessel on the other side within 350 px. An Arrow flies straight to where its target was, so a moving vessel can dodge it. A vessel with no health left sinks and fades away. An enemy you push over the Edge is lost too, the same as one you sink. When your dinghy and an enemy start touching, both take damage in proportion to how fast they close, 10 each for two dinghies meeting head-on at full speed. Enemies that bump into each other only push apart. Your dinghy has 100 health, shows fire when it is badly damaged, and starts to regenerate 3 s after the last hit. Its health carries over from one Wave to the next. When a Wave has no enemies left, the next countdown starts. Each enemy you lose, sunk or over the Edge, credits you 5 Gold. The Wave number, the countdown, your health and your Gold show at the top left, and each enemy has a health bar. Press 1 or Space, or tap the Fireball button at the foot of the throttle lever on a phone, and the Captain throws a Fireball at the closest enemy within 600 px. It curves after its target at up to 90° a second, explodes for 40 damage on its first hit, and burns out after 3 s if it misses. The cooldown is 6 s, and a press with no enemy in range does nothing and costs nothing. The HUD shows the cooldown, and the phone button shows the cooldown or "No target". The Run ends when your dinghy sinks or falls off the Edge, and enemies lost after that credit nothing. The game-over screen says which way the Run ended, and shows your Score (the Waves you defeated) and the Best score on this device, which the browser keeps in local storage.

## Run it

You need Node.js 22.12 or newer (CI uses Node.js 24). Install the dependencies once with `npm install`, then run `npm run dev` and open the URL Vite prints (it ends in `/naval-skirmish/`).

## Test it

`npm test` runs the Vitest unit tests against the game core, with no browser. `npm run test:e2e` builds the game and runs the Playwright smoke tests against that build. Before the first browser run, install Chromium with `npx playwright install chromium`. `npm run typecheck` runs the TypeScript compiler.

The browser tests read the game state through a read-only test hook, `window.navalSkirmishTest.state`. The hook exists only when the page URL has the `?test` flag. Each Playwright project runs the spec file with its name: `desktop`, `phone-landscape` and `phone-upright`.

## How the code is laid out

All game rules live in `src/core`, which is plain TypeScript that never imports Phaser (see [ADR 0001](docs/adr/0001-pure-game-core-with-phaser-view.md)). The core has three operations: `createWorld(seed, config)`, `step(world, commands)` and `readState(world)`. The Phaser view in `src/view` draws the core's state and calls `step` once per fixed tick of 1/60 s. Domain words such as dinghy, Arena and Edge are defined in [CONTEXT.md](CONTEXT.md).

GitHub Actions runs the type check and both test suites on every push and pull request. When they pass on `main`, it deploys the build to GitHub Pages.

## Credits

The art is from the [Pirate Pack](https://kenney.nl/assets/pirate-pack) by Kenney (www.kenney.nl), released under CC0.
