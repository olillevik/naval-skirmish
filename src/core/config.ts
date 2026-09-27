import type { Config } from './world';

/** Starting tuning numbers. Change these, not the rules, after playtesting. */
export const defaultConfig: Config = {
  arenaRadius: 1500,
  throttleRate: 1 / 1.5,
  rimCurrentStart: 0.8,
  pointOfNoReturn: 0.95,
  fallSeconds: 1,
  vesselClasses: {
    // The sprite is 16 x 26 px, drawn at 2x.
    smallDinghy: { topSpeed: 150, acceleration: 100, turnRate: Math.PI / 2, radius: 20 },
  },
};
