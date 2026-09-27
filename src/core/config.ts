import type { Config } from './world';

/** Starting tuning numbers. Change these, not the rules, after playtesting. */
export const defaultConfig: Config = {
  arenaRadius: 1500,
  throttleRate: 1 / 1.5,
  rimCurrentStart: 0.8,
  pointOfNoReturn: 0.95,
  fallSeconds: 1,
  sinkingSeconds: 1.5,
  waveCountdownSeconds: 5,
  waveSizeBase: 2,
  spawnInner: 0.4,
  spawnOuter: 0.75,
  minSpawnDistance: 500,
  arrowRange: 350,
  arrowSpeed: 400,
  volleySeconds: 1,
  volleySpread: 0.1,
  regenRate: 0.01,
  regenDelaySeconds: 3,
  enemyCircleRange: 0.9,
  enemyTurnBack: 0.75,
  enemyCruiseThrottle: 0.6,
  vesselClasses: {
    // The sprite is 16 x 26 px, drawn at 2x.
    smallDinghy: { topSpeed: 150, acceleration: 100, turnRate: Math.PI / 2, radius: 20, health: 100, volleySize: 1, arrowDamage: 5 },
    // The same boat as the player's, but weaker.
    enemyDinghy: { topSpeed: 150, acceleration: 100, turnRate: Math.PI / 2, radius: 20, health: 30, volleySize: 1, arrowDamage: 5 },
  },
};
