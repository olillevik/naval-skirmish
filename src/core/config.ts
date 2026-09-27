import type { Config } from './world';

/** Starting tuning numbers. Change these, not the rules, after playtesting. */
export const defaultConfig: Config = {
  arenaRadius: 1500,
  topSpeed: 150,
  throttleRate: 1 / 1.5,
  acceleration: 100,
  turnRate: Math.PI / 2,
  rimCurrentStart: 0.8,
  pointOfNoReturn: 0.95,
  fallSeconds: 1,
};
