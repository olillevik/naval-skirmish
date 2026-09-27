import { describe, expect, it } from 'vitest';
import { defaultConfig } from './config';
import {
  applyCabinAction,
  createWorld,
  readState,
  step,
  type CabinAction,
  type CabinItemName,
  type Commands,
  type Config,
  type TargetingRule,
  type VesselClass,
  type World,
  type WorldState,
} from './world';

/**
 * Round numbers so expectations are easy to work out by hand at 60 ticks per second.
 * The Arena is big enough that the movement tests never reach the Rim current, and the
 * first Wave is so far off that they never meet an enemy.
 */
const config: Config = {
  arenaRadius: 5000,
  throttleRate: 0.5,
  rimCurrentStart: 0.8,
  pointOfNoReturn: 0.95,
  fallSeconds: 0.5,
  sinkingSeconds: 1.5,
  waveCountdownSeconds: 1000,
  waveSizeBase: 2,
  shipsFromWave: 4,
  enemyHealthGrowth: 0.05,
  spawnInner: 0.4,
  spawnOuter: 0.75,
  minSpawnDistance: 500,
  arrowRange: 350,
  arrowSpeed: 400,
  volleySeconds: 1,
  volleySpread: 0.1,
  fireballDamage: 40,
  fireballSplashRadius: 80,
  fireballBurn: { damagePerSecond: 2, burnSeconds: 3 },
  fireballRange: 600,
  fireballSpeed: 300,
  fireballCooldownSeconds: 6,
  fireballTurnRate: Math.PI / 2,
  fireballBurnOutSeconds: 3,
  wizardVesselsFromWave: 3,
  wizardVesselChance: 0.05,
  wizardFireballDamage: 25,
  wizardFireballCooldownSeconds: 10,
  wizardVesselGoldMultiplier: 3,
  regenRate: 0.01,
  regenDelaySeconds: 3,
  enemyCircleRange: 0.9,
  enemyTurnBack: 0.75,
  enemyCruiseThrottle: 0.6,
  rammingDamage: 10,
  rammingSpeed: 240,
  vesselClasses: {
    smallDinghy: { topSpeed: 120, acceleration: 30, turnRate: Math.PI / 2, radius: 20, health: 100, volleySize: 1, arrowDamage: 5, gold: 0 },
    smallShip: { topSpeed: 150, acceleration: 24, turnRate: (Math.PI / 2) * 0.8, radius: 40, health: 160, volleySize: 1, arrowDamage: 5, gold: 0 },
    enemyDinghy: { topSpeed: 120, acceleration: 30, turnRate: Math.PI / 2, radius: 20, health: 30, volleySize: 1, arrowDamage: 5, gold: 5 },
    enemyShip: { topSpeed: 160, acceleration: 15, turnRate: Math.PI / 4, radius: 40, health: 120, volleySize: 3, arrowDamage: 5, gold: 20 },
  },
  cabin: {
    repair: { prices: [10], healShare: 0.25 },
    maxHealth: { prices: [30, 60, 120], healthShare: 0.25 },
    regen: { prices: [25, 50, 100], regenRate: 0.01 },
    arrowRate: { prices: [20, 40, 80], volleySeconds: [0.8, 0.65, 0.5] },
    volleySize: { prices: [30, 60, 120, 240], arrows: 1 },
    flamingArrows: { prices: [80], damagePerSecond: 2, burnSeconds: 3 },
    fireballDamage: { prices: [30, 60, 120], damage: [55, 70, 90] },
    fireballCooldown: { prices: [30, 60, 120], cooldownSeconds: [5, 4, 3] },
    smallShip: { prices: [150] },
  },
};
const noCommands: Commands = { throttleUp: false, throttleDown: false, rudder: 0 };
const up: Commands = { ...noCommands, throttleUp: true };
const down: Commands = { ...noCommands, throttleDown: true };

function run(world: World, commands: Commands, ticks: number): World {
  for (let i = 0; i < ticks; i++) world = step(world, commands);
  return world;
}

describe('createWorld', () => {
  it('puts a still small dinghy in the centre of the Arena, with no enemy vessels', () => {
    const { player, enemies, run } = readState(createWorld(1, config));

    expect(player).toMatchObject({ vesselClass: 'smallDinghy', x: 0, y: 0, heading: 0, speed: 0, throttle: 0 });
    expect(enemies).toEqual([]);
    expect(run).toBe('sailing');
  });

  it('starts a Run with 0 Gold and a Score of 0', () => {
    expect(readState(createWorld(1, config))).toMatchObject({ gold: 0, score: 0 });
  });

  it('accepts the default config', () => {
    expect(readState(createWorld(1, defaultConfig)).run).toBe('sailing');
  });
});

describe('throttle', () => {
  it('rises gradually while up is held', () => {
    const world = run(createWorld(1, config), up, 60);

    expect(readState(world).player.throttle).toBeCloseTo(0.5);
  });

  it('stays put when neither up nor down is held', () => {
    const world = run(run(createWorld(1, config), up, 60), noCommands, 60);

    expect(readState(world).player.throttle).toBeCloseTo(0.5);
  });

  it('falls gradually while down is held', () => {
    const world = run(run(createWorld(1, config), up, 120), down, 30);

    expect(readState(world).player.throttle).toBeCloseTo(0.75);
  });

  it('never goes above full', () => {
    const world = run(createWorld(1, config), up, 600);

    expect(readState(world).player.throttle).toBe(1);
  });

  it('never goes below 0', () => {
    const world = run(run(createWorld(1, config), up, 30), down, 600);

    expect(readState(world).player.throttle).toBe(0);
  });

  it('jumps to the value a set-throttle command asks for, and stays there', () => {
    const set = run(createWorld(1, config), { ...noCommands, setThrottle: 0.8 }, 1);
    const left = run(set, noCommands, 60);

    expect(readState(set).player.throttle).toBe(0.8);
    expect(readState(left).player.throttle).toBe(0.8);
  });

  it('keeps a set-throttle command between 0 and full', () => {
    expect(readState(step(createWorld(1, config), { ...noCommands, setThrottle: 3 })).player.throttle).toBe(1);
    expect(readState(step(createWorld(1, config), { ...up, setThrottle: -1 })).player.throttle).toBe(0);
  });

  it('does not change when up and down are held together', () => {
    const both = { ...noCommands, throttleUp: true, throttleDown: true };
    const world = run(run(createWorld(1, config), up, 60), both, 60);

    expect(readState(world).player.throttle).toBeCloseTo(0.5);
  });
});

describe('speed', () => {
  it('rises no faster than the configured acceleration', () => {
    // Throttle is full after 2 s, but speed only gains 30 px/s each second.
    const world = run(createWorld(1, config), up, 120);

    expect(readState(world).player.speed).toBeCloseTo(60);
  });

  it('settles at the throttle target and never exceeds top speed', () => {
    const half = run(run(createWorld(1, config), up, 60), noCommands, 600);
    const full = run(createWorld(1, config), up, 1200);

    expect(readState(half).player.speed).toBeCloseTo(60);
    expect(readState(full).player.speed).toBe(120);
  });

  it('falls gradually after the throttle is cut', () => {
    const atTopSpeed = run(createWorld(1, config), up, 600);
    const cut = run(atTopSpeed, down, 60);

    expect(readState(cut).player.speed).toBeCloseTo(90);
    expect(readState(run(cut, down, 600)).player.speed).toBe(0);
  });
});

describe('movement', () => {
  it('moves the dinghy along its heading, starting up the screen', () => {
    const atTopSpeed = run(createWorld(1, config), up, 600);
    const { x: x0, y: y0 } = readState(atTopSpeed).player;
    const { x, y } = readState(run(atTopSpeed, noCommands, 60)).player;

    expect(x - x0).toBeCloseTo(0);
    expect(y - y0).toBeCloseTo(-120);
  });

  it('moves along the new heading after a turn', () => {
    // Full right rudder for 1 s turns the bow 90 degrees, to point along +x.
    const turned = run(createWorld(1, config), { ...noCommands, rudder: 1 }, 60);
    const moving = run(turned, up, 600);
    const { x: x0, y: y0 } = readState(moving).player;
    const { x, y } = readState(run(moving, noCommands, 60)).player;

    expect(x - x0).toBeCloseTo(120);
    expect(y - y0).toBeCloseTo(0);
  });
});

describe('rudder', () => {
  const right = { ...noCommands, rudder: 1 };
  const left = { ...noCommands, rudder: -1 };

  it('turns right and left at the configured rate when stopped', () => {
    expect(readState(run(createWorld(1, config), right, 60)).player.heading).toBeCloseTo(Math.PI / 2);
    expect(readState(run(createWorld(1, config), left, 60)).player.heading).toBeCloseTo(-Math.PI / 2);
  });

  it('turns at the same rate at full speed', () => {
    const atTopSpeed = run(createWorld(1, config), up, 600);
    const turned = run(atTopSpeed, { ...right, throttleUp: true }, 60);

    expect(readState(atTopSpeed).player.speed).toBe(120);
    expect(readState(turned).player.heading).toBeCloseTo(Math.PI / 2);
  });

  it('turns at half rate with half rudder', () => {
    const world = run(createWorld(1, config), { ...noCommands, rudder: 0.5 }, 60);

    expect(readState(world).player.heading).toBeCloseTo(Math.PI / 4);
  });

  it('never turns faster than full rudder', () => {
    const world = run(createWorld(1, config), { ...noCommands, rudder: 5 }, 60);

    expect(readState(world).player.heading).toBeCloseTo(Math.PI / 2);
  });
});

describe('determinism', () => {
  const script: Commands[] = Array.from({ length: 60 }, (_, i) => ({
    throttleUp: i < 40,
    throttleDown: i >= 50,
    rudder: i % 20 < 10 ? 1 : -0.5,
  }));

  it('gives identical states for the same seed, config and commands', () => {
    const start = createWorld(7, config);
    const first = script.reduce(step, start);
    const second = script.reduce(step, start);

    expect(readState(second)).toEqual(readState(first));
  });

  it('gives the same result for 60 ticks however they are grouped into frames', () => {
    const inFrames = (ticksPerFrame: number[]): World => {
      let world = createWorld(7, config);
      let tick = 0;
      for (const count of ticksPerFrame) {
        for (let i = 0; i < count; i++) world = step(world, script[tick++]);
      }
      expect(tick).toBe(60);
      return world;
    };

    const oneAFrame = inFrames(Array(60).fill(1));
    expect(readState(inFrames([60]))).toEqual(readState(oneAFrame));
    expect(readState(inFrames(Array(30).fill(2)))).toEqual(readState(oneAFrame));
    expect(readState(inFrames([7, 0, 13, 1, 39]))).toEqual(readState(oneAFrame));
  });
});

describe('Rim current', () => {
  /** Reaches full throttle and top speed in one tick, and turns 180 degrees in one tick at full rudder. */
  const nimble: Config = {
    ...config,
    arenaRadius: 1000,
    throttleRate: 60,
    vesselClasses: {
      ...config.vesselClasses,
      smallDinghy: { ...config.vesselClasses.smallDinghy, acceleration: 120 * 60, turnRate: Math.PI * 60 },
    },
  };
  const turnAround: Commands = { ...up, rudder: 1 };
  const distance = (world: World) => Math.hypot(readState(world).player.x, readState(world).player.y);

  /** Sails at full throttle along the starting heading, or along +x, until this far out. */
  function sailOutTo(fraction: number, along: 'up' | 'right' = 'up'): World {
    let world = createWorld(1, nimble);
    if (along === 'right') world = step(world, { ...noCommands, rudder: 0.5 });
    while (distance(world) < fraction * nimble.arenaRadius) world = step(world, up);
    return world;
  }

  it('is zero inside 80% of the radius', () => {
    expect(readState(sailOutTo(0.79)).player.rimCurrent).toEqual({ x: 0, y: 0 });
  });

  it('points outward and grows toward the Edge', () => {
    const near = readState(sailOutTo(0.85)).player.rimCurrent;
    const far = readState(sailOutTo(0.9)).player.rimCurrent;
    const sideways = readState(sailOutTo(0.9, 'right')).player.rimCurrent;

    expect(near.x).toBeCloseTo(0);
    expect(near.y).toBeLessThan(0);
    expect(far.y).toBeLessThan(near.y);
    expect(sideways.x).toBeGreaterThan(0);
    expect(sideways.y).toBeCloseTo(0);
  });

  it('lets a dinghy at full throttle escape from just inside 95% of the radius', () => {
    const escaping = step(sailOutTo(0.94), turnAround);
    const escaped = run(escaping, up, 300);

    expect(distance(escaped)).toBeLessThan(0.8 * nimble.arenaRadius);
    expect(readState(escaped).player.rimCurrent).toEqual({ x: 0, y: 0 });
  });

  it('does not let a dinghy at full throttle escape from beyond 95% of the radius', () => {
    const rowingInward = step(sailOutTo(0.96), turnAround);

    expect(readState(rowingInward).player.heading).toBeCloseTo(Math.PI);
    expect(distance(run(rowingInward, up, 10))).toBeGreaterThan(distance(rowingInward));
  });

  it('marks the dinghy past the point of no return only beyond 95% of the radius', () => {
    expect(readState(createWorld(1, nimble)).player.pastPointOfNoReturn).toBe(false);
    expect(readState(sailOutTo(0.94)).player.pastPointOfNoReturn).toBe(false);
    expect(readState(sailOutTo(0.96)).player.pastPointOfNoReturn).toBe(true);
  });

  it('carries a dinghy at zero throttle to the Edge, and the Run ends', () => {
    const drifting = step(sailOutTo(0.85), down);

    expect(readState(drifting).player.speed).toBe(0);
    expect(readState(run(drifting, noCommands, 600)).run).toBe('ended');
  });
});

describe('the Run', () => {
  /** Sails 20 px a tick from the first tick, so the dinghy reaches the Edge in a few ticks. */
  const quick: Config = {
    ...config,
    arenaRadius: 100,
    throttleRate: 60,
    vesselClasses: {
      ...config.vesselClasses,
      smallDinghy: { ...config.vesselClasses.smallDinghy, topSpeed: 1200, acceleration: 1200 * 60 },
    },
  };

  it('goes from sailing to falling to ended once the dinghy crosses the Edge, and stays ended', () => {
    let world = createWorld(1, quick);
    expect(readState(world).endCause).toBeNull();
    while (readState(world).run === 'sailing') world = step(world, up);
    const fell = readState(world);

    expect(fell.run).toBe('falling');
    expect(fell.endCause).toBe('fell off the Edge');
    expect(fell.events).toContainEqual({ type: 'vesselOverEdge', vesselId: fell.player.id });
    expect(Math.hypot(fell.player.x, fell.player.y)).toBeGreaterThanOrEqual(100);
    // fallSeconds is 0.5 s, which is 30 ticks.
    expect(readState(run(world, up, 29)).run).toBe('falling');
    const ended = run(world, up, 30);
    expect(readState(ended).run).toBe('ended');
    expect(readState(run(ended, { ...up, rudder: 1 }, 600))).toEqual(readState(ended));
  });
});

/** Turns toward a heading as fast as the rudder allows, at the given throttle. */
function steerTo(world: World, heading: number, throttle: number): Commands {
  const { player } = readState(world);
  const turn = Math.atan2(Math.sin(heading - player.heading), Math.cos(heading - player.heading));
  return { ...noCommands, setThrottle: throttle, rudder: (turn * 60) / world.config.vesselClasses.smallDinghy.turnRate };
}

const distanceFromCentre = (vessel: { x: number; y: number }) => Math.hypot(vessel.x, vessel.y);
const distanceBetween = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);

/** Runs until the state passes the test, and returns the world on that tick. Gives up after 2 minutes of play. */
function until(world: World, done: (state: WorldState) => boolean, commands = (_: World) => noCommands): World {
  for (let tick = 0; tick < 60 * 120; tick++) {
    if (done(readState(world))) return world;
    world = step(world, commands(world));
  }
  throw new Error('Gave up waiting');
}

/** Runs until the Wave spawns, and returns the world on the tick it spawned. */
function untilSpawned(world: World, commands: Commands = noCommands): World {
  return until(world, (state) => state.waveStatus === 'fighting', () => commands);
}

const untilNoEnemies = (world: World) => until(world, (state) => state.enemies.length === 0);

/** The default config with Arrows and ramming that do no damage, so a test about sailing never sinks a vessel. */
const harmless: Config = {
  ...defaultConfig,
  rammingDamage: 0,
  vesselClasses: {
    smallDinghy: { ...defaultConfig.vesselClasses.smallDinghy, arrowDamage: 0 },
    smallShip: { ...defaultConfig.vesselClasses.smallShip, arrowDamage: 0 },
    enemyDinghy: { ...defaultConfig.vesselClasses.enemyDinghy, arrowDamage: 0 },
    enemyShip: { ...defaultConfig.vesselClasses.enemyShip, arrowDamage: 0 },
  },
};

describe('Waves', () => {
  /** The default Arena, with a 1 s countdown. */
  const waves: Config = { ...defaultConfig, waveCountdownSeconds: 1 };
  /** Every spawn point is past the point of no return, so the Rim current takes each Wave over the Edge. */
  const doomed: Config = { ...waves, rimCurrentStart: 0.2, pointOfNoReturn: 0.3 };

  it('starts a Run counting down to Wave 1, and spawns it when the countdown ends', () => {
    const start = readState(createWorld(1, waves));
    const almost = run(createWorld(1, waves), noCommands, 59);
    const spawned = run(almost, noCommands, 1);

    expect(start).toMatchObject({ wave: 1, waveStatus: 'countdown', countdown: 1, enemies: [] });
    expect(readState(almost)).toMatchObject({ wave: 1, waveStatus: 'countdown', enemies: [] });
    expect(readState(almost).countdown).toBeCloseTo(1 / 60);
    expect(readState(spawned)).toMatchObject({ wave: 1, waveStatus: 'fighting', countdown: 0 });
    expect(readState(spawned).enemies).toHaveLength(3);
  });

  it('counts down 5 s by default', () => {
    expect(readState(createWorld(1, defaultConfig)).countdown).toBe(5);
    expect(readState(run(createWorld(1, defaultConfig), noCommands, 299)).waveStatus).toBe('countdown');
    expect(readState(run(createWorld(1, defaultConfig), noCommands, 300)).waveStatus).toBe('fighting');
  });

  it('is defeated when no enemies are left, then counts down to the next Wave, which has one more enemy', () => {
    let world = untilSpawned(createWorld(1, doomed));
    const sizes = [readState(world).enemies.length];
    for (const wave of [2, 3]) {
      world = untilNoEnemies(world);
      expect(readState(world)).toMatchObject({ wave, waveStatus: 'countdown', countdown: 1 });
      world = untilSpawned(world);
      sizes.push(readState(world).enemies.length);
    }

    expect(sizes).toEqual([3, 4, 5]);
    expect(readState(world).run).toBe('sailing');
  });

  it('spawns the same Wave from the same seed, and a different one from another seed', () => {
    const spawnPoints = (seed: number) => readState(untilSpawned(createWorld(seed, waves))).enemies.map(({ x, y }) => ({ x, y }));

    expect(spawnPoints(3)).toEqual(spawnPoints(3));
    expect(spawnPoints(4)).not.toEqual(spawnPoints(3));
  });

  it('spawns every enemy between 40% and 75% of the radius, outside the Rim current, facing the player', () => {
    for (let seed = 1; seed <= 20; seed++) {
      let world = untilSpawned(createWorld(seed, doomed));
      for (let wave = 1; wave <= 3; wave++) {
        const { enemies, player } = readState(world);
        for (const enemy of enemies) {
          expect(distanceFromCentre(enemy)).toBeGreaterThanOrEqual(0.4 * 1500);
          expect(distanceFromCentre(enemy)).toBeLessThanOrEqual(0.75 * 1500);
          expect(Math.sin(enemy.heading) * (player.x - enemy.x) - Math.cos(enemy.heading) * (player.y - enemy.y)).toBeCloseTo(
            distanceBetween(enemy, player),
          );
        }
        world = untilNoEnemies(world);
        world = untilSpawned(world);
      }
    }
    for (let seed = 1; seed <= 20; seed++) {
      for (const enemy of readState(untilSpawned(createWorld(seed, waves))).enemies) {
        expect(distanceFromCentre(enemy)).toBeLessThan(waves.rimCurrentStart * 1500);
        expect(enemy.rimCurrent).toEqual({ x: 0, y: 0 });
      }
    }
  });

  it('spawns no enemy within 500 px of the player, wherever the player is', () => {
    // At full throttle through the countdown, the player reaches about 640 px up, inside the spawn ring.
    const slow: Config = { ...waves, waveCountdownSeconds: 5 };
    for (let seed = 1; seed <= 30; seed++) {
      const world = untilSpawned(createWorld(seed, slow), up);
      const { player, enemies } = readState(world);

      expect(distanceFromCentre(player)).toBeGreaterThan(0.4 * 1500);
      for (const enemy of enemies) expect(distanceBetween(enemy, player)).toBeGreaterThanOrEqual(500);
    }
  });

  it('has no enemy ships before Wave 4, then (n - 2) / 2 of them, rounded down, alongside the dinghies', () => {
    let world = untilSpawned(createWorld(1, doomed));
    const makeup = [];
    for (let wave = 1; wave <= 8; wave++) {
      const { enemies } = readState(world);
      const count = (vesselClass: string) => enemies.filter((enemy) => enemy.vesselClass === vesselClass).length;
      makeup.push([count('enemyDinghy'), count('enemyShip')]);
      world = untilSpawned(untilNoEnemies(world));
    }

    expect(makeup).toEqual([
      [3, 0],
      [4, 0],
      [5, 0],
      [6, 1],
      [7, 1],
      [8, 2],
      [9, 2],
      [10, 3],
    ]);
  });

  it('gives enemies 5% more max health each Wave, compounded, and spawns them at full health', () => {
    let world = untilSpawned(createWorld(1, doomed));
    for (let wave = 1; wave <= 6; wave++) {
      for (const enemy of readState(world).enemies) {
        const base = enemy.vesselClass === 'enemyShip' ? 120 : 30;
        expect(enemy.maxHealth).toBeCloseTo(base * 1.05 ** (wave - 1));
        expect(enemy.health).toBe(enemy.maxHealth);
      }
      world = untilSpawned(untilNoEnemies(world));
    }
  });

  it('never spawns two enemies on top of each other', () => {
    const crowded: Config = { ...waves, waveSizeBase: 40 };
    const { enemies } = readState(untilSpawned(createWorld(1, crowded)));

    expect(enemies).toHaveLength(41);
    for (const [i, a] of enemies.entries()) {
      for (const b of enemies.slice(i + 1)) expect(distanceBetween(a, b)).toBeGreaterThanOrEqual(40);
    }
  });
});

describe('enemy AI', () => {
  const waves: Config = { ...harmless, waveCountdownSeconds: 1 };

  it('closes in on the player, then circles just inside Arrow range', () => {
    for (let seed = 1; seed <= 5; seed++) {
      const spawned = untilSpawned(createWorld(seed, waves));
      const later = run(spawned, noCommands, 60 * 30);
      const { player, enemies } = readState(later);

      expect(enemies).toHaveLength(3);
      for (const [i, enemy] of enemies.entries()) {
        expect(distanceBetween(enemy, player)).toBeLessThan(distanceBetween(readState(spawned).enemies[i], player));
        // enemyCircleRange is 0.9, so about 220 px.
        expect(distanceBetween(enemy, player)).toBeGreaterThan(0.8 * 245);
        expect(distanceBetween(enemy, player)).toBeLessThan(245);
      }
      // Still circling, not parked.
      expect(distanceBetween(readState(run(later, noCommands, 60)).enemies[0], enemies[0])).toBeGreaterThan(30);
    }
  });

  it("sails an enemy ship by the ship class's stats, faster than a dinghy and turning as fast, but slower to get going", () => {
    const fleet: Config = { ...waves, shipsFromWave: 1 };
    const { topSpeed, acceleration, turnRate } = defaultConfig.vesselClasses.enemyShip;
    const shipIn = (world: World) => readState(world).enemies.find((enemy) => enemy.vesselClass === 'enemyShip')!;
    let world = untilSpawned(createWorld(1, fleet));
    let [fastest, sharpest, before] = [0, 0, shipIn(world)];
    for (let tick = 0; tick < 60 * 20; tick++) {
      world = step(world, noCommands);
      const ship = shipIn(world);
      expect(ship.speed - before.speed).toBeLessThanOrEqual(acceleration / 60 + 1e-9);
      fastest = Math.max(fastest, ship.speed);
      sharpest = Math.max(sharpest, Math.abs(turnBetween(before.heading, ship.heading)));
      before = ship;
    }

    expect(topSpeed).toBeGreaterThan(defaultConfig.vesselClasses.enemyDinghy.topSpeed);
    expect(acceleration).toBeLessThan(defaultConfig.vesselClasses.enemyDinghy.acceleration);
    expect(turnRate).toBe(defaultConfig.vesselClasses.enemyDinghy.turnRate);
    expect(fastest).toBeCloseTo(topSpeed);
    expect(sharpest).toBeCloseTo(turnRate / 60);
  });

  it('does not sail into the Rim current by itself, even to reach a player at its rim', () => {
    for (let seed = 1; seed <= 5; seed++) {
      let world = createWorld(seed, waves);
      world = until(world, ({ player }) => distanceFromCentre(player) >= 0.7 * 1500, () => ({ ...noCommands, setThrottle: 1 }));
      for (let tick = 0; tick < 60 * 40; tick++) {
        world = step(world, { ...noCommands, setThrottle: 0 });
        for (const enemy of readState(world).enemies) expect(distanceFromCentre(enemy)).toBeLessThan(0.8 * 1500);
      }
      expect(readState(world).enemies).toHaveLength(3);
      expect(distanceFromCentre(readState(world).player)).toBeGreaterThan(0.75 * 1500);
    }
  });

  it('can be pushed over the Edge, where it falls and is lost, and that defeats the Wave', () => {
    // One enemy that never rows, so the player can nose it along in a straight line.
    const adrift: Config = { ...waves, waveSizeBase: 0, enemyTurnBack: 0, enemyCruiseThrottle: 0 };
    let touched = false;
    const ramming = (world: World) => {
      const { player, enemies } = readState(world);
      if (distanceBetween(player, enemies[0]) < 40.01) touched = true;
      return steerTo(world, Math.atan2(enemies[0].x - player.x, player.y - enemies[0].y), 1);
    };
    const world = until(untilSpawned(createWorld(1, adrift)), (state) => state.enemies.length === 0, ramming);

    expect(touched).toBe(true);
    expect(readState(world)).toMatchObject({ enemies: [], wave: 2, waveStatus: 'countdown' });
    expect(readState(world).events).toContainEqual({ type: 'vesselOverEdge', vesselId: 1 });
  });
});

describe('contact', () => {
  it('pushes two touching vessels apart so they never overlap', () => {
    const homing: Config = { ...harmless, waveCountdownSeconds: 1, waveSizeBase: 0, enemyTurnBack: 0 };
    let world = untilSpawned(createWorld(2, homing));
    let closest = Infinity;
    for (let tick = 0; tick < 60 * 20; tick++) {
      world = step(world, noCommands);
      const { player, enemies } = readState(world);
      closest = Math.min(closest, distanceBetween(player, enemies[0]));
    }

    // The enemy rows into the still player for the whole time, and pushes it along.
    expect(closest).toBeGreaterThan(40 - 0.001);
    expect(closest).toBeLessThan(40.01);
    expect(distanceFromCentre(readState(world).player)).toBeGreaterThan(0);
  });

  it('keeps a crowd of circling enemies and the player from overlapping', () => {
    const crowd: Config = { ...harmless, waveCountdownSeconds: 1, waveSizeBase: 12 };
    let world = untilSpawned(createWorld(3, crowd));
    for (let tick = 0; tick < 60 * 30; tick++) {
      world = step(world, { ...noCommands, rudder: 0.3, setThrottle: 1 });
      const vessels = [readState(world).player, ...readState(world).enemies];
      for (const [i, a] of vessels.entries()) {
        for (const b of vessels.slice(i + 1)) expect(distanceBetween(a, b)).toBeGreaterThan(40 - 0.001);
      }
    }
  });
});

describe('determinism over a full Wave', () => {
  it('gives identical states for the same seed, config and commands', () => {
    const script = (tick: number): Commands => ({ ...noCommands, setThrottle: 1, rudder: Math.sin(tick / 90) });
    const play = () => {
      let world = createWorld(11, defaultConfig);
      for (let tick = 0; tick < 60 * 20; tick++) world = step(world, script(tick));
      return readState(world);
    };

    // The three enemies in Wave 1 have hit the player vessel, which is still afloat.
    expect(play().run).toBe('sailing');
    expect(play().enemies).toHaveLength(3);
    expect(play().player.health).toBeLessThan(100);
    expect(play()).toEqual(play());
  });
});

/** Changes some stats of the player's class and of the enemy class. */
function withClasses(base: Config, player: Partial<VesselClass>, enemy: Partial<VesselClass>): Config {
  return {
    ...base,
    vesselClasses: {
      smallDinghy: { ...base.vesselClasses.smallDinghy, ...player },
      smallShip: base.vesselClasses.smallShip,
      enemyDinghy: { ...base.vesselClasses.enemyDinghy, ...enemy },
      enemyShip: base.vesselClasses.enemyShip,
    },
  };
}

/**
 * One enemy per Wave from Wave 1, that never rows. Every spawn point is within Arrow range of the
 * player vessel at the centre, and the Waves are 1 s apart.
 */
const still: Config = {
  ...defaultConfig,
  waveCountdownSeconds: 1,
  waveSizeBase: 0,
  enemyTurnBack: 0,
  enemyCruiseThrottle: 0,
  arrowRange: 1200,
};

/** The turn from one heading to another, between -PI and PI. */
const turnBetween = (from: number, to: number) => Math.atan2(Math.sin(to - from), Math.cos(to - from));
const bearingTo = (from: { x: number; y: number }, to: { x: number; y: number }) => Math.atan2(to.x - from.x, from.y - to.y);
const arrowsOf = (state: WorldState, side: 'player' | 'enemy') => state.arrows.filter((arrow) => arrow.side === side);

describe('Arrows', () => {
  it('fire in a Volley on the Crew timer, at the closest vessel on the other side', () => {
    // Two enemies, and Arrows so slow that none lands during the test.
    const slow: Config = { ...still, waveSizeBase: 1, arrowSpeed: 10 };
    const fired = step(untilSpawned(createWorld(1, slow)), noCommands);
    const { player, enemies, arrows } = readState(fired);
    const closest = [...enemies].sort((a, b) => distanceBetween(a, player) - distanceBetween(b, player))[0];

    expect(arrows).toHaveLength(3);
    const [playerArrow] = arrowsOf(readState(fired), 'player');
    expect(turnBetween(playerArrow.heading, bearingTo(player, closest))).toBeCloseTo(0);
    for (const enemy of enemies) {
      const arrow = arrowsOf(readState(fired), 'enemy').find(({ x, y }) => x === enemy.x && y === enemy.y)!;
      expect(turnBetween(arrow.heading, bearingTo(enemy, player))).toBeCloseTo(0);
    }
    // volleySeconds is 1 s, which is 60 ticks.
    expect(readState(run(fired, noCommands, 59)).arrows).toHaveLength(3);
    expect(readState(run(fired, noCommands, 60)).arrows).toHaveLength(6);
  });

  it('are never fired at a vessel out of range, nor at a vessel on the same side', () => {
    // Every enemy spawns at least 600 px from the player, and the crowd has neighbours closer than 500 px.
    const short: Config = { ...still, waveSizeBase: 20, arrowRange: 500 };
    let world = untilSpawned(createWorld(1, short));
    const { enemies } = readState(world);
    expect(enemies.some((a) => enemies.some((b) => a !== b && distanceBetween(a, b) < 500))).toBe(true);

    for (let tick = 0; tick < 60 * 5; tick++) {
      world = step(world, noCommands);
      expect(readState(world).arrows).toEqual([]);
    }
  });

  it("match the class's Volley size and Arrow damage, and fan out around the aim", () => {
    const volleys = withClasses({ ...still, volleySeconds: 100 }, { volleySize: 3, arrowDamage: 7 }, { health: 100, arrowDamage: 0 });
    const fired = step(untilSpawned(createWorld(1, volleys)), noCommands);
    const { player, enemies } = readState(fired);
    const aim = bearingTo(player, enemies[0]);
    const headings = arrowsOf(readState(fired), 'player').map((arrow) => turnBetween(aim, arrow.heading));

    expect(headings.map((turn) => turn.toFixed(3))).toEqual(['-0.100', '0.000', '0.100']);
    expect(arrowsOf(readState(fired), 'player').map((arrow) => arrow.damage)).toEqual([7, 7, 7]);
    // At 600 px or more, only the middle Arrow reaches the enemy.
    const hit = until(fired, (state) => state.enemies[0].health < 100);
    expect(readState(hit).enemies[0].health).toBe(93);
    expect(readState(hit).events).toContainEqual({ type: 'arrowHit', vesselId: enemies[0].id });
    expect(arrowsOf(readState(hit), 'player')).toHaveLength(2);
  });

  it('come in Volleys of 3 from an enemy ship, fanned out around the aim', () => {
    // Wave 1 has one still dinghy and one still ship.
    const fleet: Config = { ...still, shipsFromWave: 1, volleySeconds: 100 };
    const fired = step(untilSpawned(createWorld(1, fleet)), noCommands);
    const { player, enemies } = readState(fired);
    const ship = enemies.find((enemy) => enemy.vesselClass === 'enemyShip')!;
    const shipArrows = arrowsOf(readState(fired), 'enemy').filter(({ x, y }) => x === ship.x && y === ship.y);
    const aim = bearingTo(ship, player);

    expect(shipArrows.map((arrow) => turnBetween(aim, arrow.heading).toFixed(3))).toEqual(['-0.100', '0.000', '0.100']);
    expect(shipArrows.map((arrow) => arrow.damage)).toEqual([5, 5, 5]);
  });

  it('are removed once they have flown the Arrow range', () => {
    const volleys = withClasses({ ...still, volleySeconds: 100 }, { volleySize: 3 }, { health: 100, arrowDamage: 0 });
    const fired = step(untilSpawned(createWorld(1, volleys)), noCommands);
    // 1200 px at 400 px/s is 3 s, which is 180 ticks. The two outer Arrows miss.
    const nearlyThere = readState(run(fired, noCommands, 178));

    expect(arrowsOf(nearlyThere, 'player')).toHaveLength(2);
    for (const arrow of arrowsOf(nearlyThere, 'player')) expect(distanceFromCentre(arrow)).toBeLessThanOrEqual(1200);
    expect(readState(run(fired, noCommands, 181)).arrows).toEqual([]);
  });

  it('miss a vessel that moves away after they are fired, and hit one that stays', () => {
    // One Volley only, and a player that turns on the spot and is at top speed in one tick.
    const dodging = withClasses(
      { ...still, volleySeconds: 100, throttleRate: 60 },
      { topSpeed: 300, acceleration: 300 * 60, turnRate: Math.PI * 60, arrowDamage: 0 },
      { arrowDamage: 10 },
    );
    const fired = step(untilSpawned(createWorld(1, dodging)), noCommands);
    const [arrow] = arrowsOf(readState(fired), 'enemy');
    const noEnemyArrows = (state: WorldState) => arrowsOf(state, 'enemy').length === 0;

    const stayed = until(fired, noEnemyArrows);
    const dodged = until(fired, noEnemyArrows, (world) => steerTo(world, arrow.heading + Math.PI / 2, 1));

    expect(readState(stayed).player.health).toBe(90);
    expect(readState(dodged).player.health).toBe(100);
    expect(distanceFromCentre(readState(dodged).player)).toBeGreaterThan(300);
  });

  describe('aimed where the target will be', () => {
    /**
     * One Volley only, from a still enemy always within Arrow range. The player vessel turns on the spot
     * and is at top speed in one tick, and on the tick the Volley is fired it sails side-on to the enemy.
     */
    const leading = (arrowSpeed: number, volleySize: number) =>
      withClasses(
        { ...still, volleySeconds: 100, arrowRange: 2000, arrowSpeed },
        { topSpeed: 150, acceleration: 150 * 60, turnRate: Math.PI * 60, arrowDamage: 0 },
        { volleySize, arrowDamage: 10 },
      );
    /** The world on the tick the Volley is fired, with the player vessel sailing at the turn from side-on. */
    const fire = (config: Config, turn = 0) => {
      const spawned = untilSpawned(createWorld(1, config));
      const { player, enemies } = readState(spawned);
      const heading = bearingTo(enemies[0], player) + Math.PI / 2 + turn;
      return { fired: step(spawned, steerTo(spawned, heading, 1)), heading };
    };
    const noEnemyArrows = (state: WorldState) => arrowsOf(state, 'enemy').length === 0;

    it('hit a vessel that keeps its course and speed, and miss one that turns after they are fired', () => {
      const { fired, heading } = fire(leading(400, 1));
      const { player, enemies } = readState(fired);
      const [arrow] = arrowsOf(readState(fired), 'enemy');
      // The Arrow leads the player vessel, well ahead of where it is now.
      expect(Math.abs(turnBetween(bearingTo(enemies[0], player), arrow.heading))).toBeGreaterThan(0.2);

      const kept = until(fired, noEnemyArrows, (world) => steerTo(world, heading, 1));
      const turned = until(fired, noEnemyArrows, (world) => steerTo(world, heading + Math.PI, 1));
      const slowed = until(fired, noEnemyArrows, (world) => steerTo(world, heading, 0));

      expect(readState(kept).player.health).toBe(90);
      expect(readState(kept).events).toContainEqual({ type: 'arrowHit', vesselId: player.id });
      expect(readState(turned).player.health).toBe(100);
      expect(readState(slowed).player.health).toBe(100);
    });

    it('fan a Volley out around the aim', () => {
      const [single] = arrowsOf(readState(fire(leading(400, 1)).fired), 'enemy');
      const volley = arrowsOf(readState(fire(leading(400, 3)).fired), 'enemy');

      expect(volley.map((arrow) => turnBetween(single.heading, arrow.heading).toFixed(3))).toEqual(['-0.100', '0.000', '0.100']);
    });

    it('go at where the target is now when no Arrow can catch it', () => {
      // Arrows slower than the player vessel, which sails away from the enemy at 45 degrees off straight away.
      const { fired } = fire(leading(100, 1), -Math.PI / 4);
      const { player, enemies } = readState(fired);
      const [arrow] = arrowsOf(readState(fired), 'enemy');

      expect(player.speed).toBe(150);
      expect(turnBetween(bearingTo(enemies[0], player), arrow.heading)).toBeCloseTo(0);
    });
  });
});

describe('the Fireball', () => {
  const throwing: Commands = { ...noCommands, throwFireball: true };
  /** The still enemy is always in Fireball range, Arrows do no harm, and the enemy survives a Fireball. */
  const inRange = withClasses({ ...still, fireballRange: 1200 }, { arrowDamage: 0 }, { health: 100, arrowDamage: 0 });
  /** One harmless enemy that sails in and circles the still player vessel, so it crosses a Fireball's path. */
  const circling: Config = withClasses({ ...harmless, waveCountdownSeconds: 1, waveSizeBase: 0 }, {}, { health: 100 });
  const whileCircling = () => run(untilSpawned(createWorld(1, circling)), noCommands, 60 * 20);
  const fireballEvents = (state: WorldState) => state.events.filter((event) => event.type.startsWith('fireball'));

  it('follows the "closest" Targeting rule', () => {
    const two: Config = { ...inRange, waveSizeBase: 1, fireballRange: 1500 };
    // The target is picked on the tick after the Wave spawns.
    const spawned = step(untilSpawned(createWorld(1, two)), noCommands);
    const state = readState(spawned);
    const closest = [...state.enemies].sort((a, b) => distanceBetween(a, state.player) - distanceBetween(b, state.player))[0];

    expect(readState(createWorld(1, config)).targetingRule).toBe('closest');
    expect(state.fireballTargetId).toBe(closest.id);
    const [fireball] = readState(step(spawned, throwing)).fireballs;
    expect(fireball).toMatchObject({ side: 'player', targetId: closest.id, damage: 20 });
  });

  it('launches one Fireball at the target in range and starts the cooldown, which blocks throws until it runs out', () => {
    const thrown = step(untilSpawned(createWorld(1, inRange)), throwing);
    const { player, enemies, fireballs } = readState(thrown);

    expect(fireballs).toHaveLength(1);
    expect(fireballs[0]).toMatchObject({ x: player.x, y: player.y });
    expect(turnBetween(fireballs[0].heading, bearingTo(player, enemies[0]))).toBeCloseTo(0);
    // fireballCooldownSeconds is 6 s, which is 360 ticks.
    expect(player.fireballTicks).toBe(360);
    // Held down through the cooldown, the throw never restarts it.
    expect(readState(run(thrown, throwing, 359)).player.fireballTicks).toBe(1);
    const ready = step(run(thrown, noCommands, 359), throwing);
    expect(readState(ready).player.fireballTicks).toBe(360);
    expect(readState(ready).fireballs).toHaveLength(1);
  });

  it('does nothing and keeps the cooldown ready when no enemy is in range', () => {
    const countdown = step(createWorld(1, inRange), throwing);
    const tooFar = step(untilSpawned(createWorld(1, { ...inRange, fireballRange: 500 })), throwing);

    for (const world of [countdown, tooFar]) {
      expect(readState(world)).toMatchObject({ fireballs: [], fireballTargetId: null, player: { fireballTicks: 0 } });
    }
    expect(readState(step(tooFar, throwing)).fireballs).toEqual([]);
  });

  it('curves toward a moving target no faster than the turn rate, and explodes on its first hit with the configured damage', () => {
    let world = step(whileCircling(), throwing);
    const [enemy] = readState(world).enemies;
    let heading = readState(world).fireballs[0].heading;
    let turned = 0;
    while (readState(world).fireballs.length > 0) {
      world = step(world, noCommands);
      const [fireball] = readState(world).fireballs;
      if (!fireball) break;
      const turn = turnBetween(heading, fireball.heading);
      // fireballTurnRate is 90 degrees a second.
      expect(Math.abs(turn)).toBeLessThanOrEqual(Math.PI / 2 / 60 + 1e-9);
      turned += turn;
      heading = fireball.heading;
    }
    const state = readState(world);

    expect(Math.abs(turned)).toBeGreaterThan(0.05);
    expect(fireballEvents(state)).toEqual([{ type: 'fireballHit', vesselIds: [enemy.id], x: state.enemies[0].x, y: state.enemies[0].y }]);
    expect(state.enemies[0].health).toBe(80);
    // Only the burn hurts it after that.
    expect(readState(step(world, noCommands)).enemies[0].health).toBeCloseTo(80 - 2 / 60);
  });

  it('sinks an enemy it takes to zero health, which credits Gold', () => {
    // Long enough in flight to reach the farthest spawn point.
    const fragile = withClasses({ ...inRange, fireballBurnOutSeconds: 10 }, {}, { health: 20 });
    const sunk = until(step(untilSpawned(createWorld(1, fragile)), throwing), (state) => state.enemies[0].health === 0);

    expect(readState(sunk).events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'fireballHit' }),
        expect.objectContaining({ type: 'vesselSunk' }),
        expect.objectContaining({ type: 'goldCredited', gold: 5 }),
      ]),
    );
  });

  it('hurts every enemy within the splash radius of the vessel it hits, none outside it, and sets them burning', () => {
    // Ten still enemies on a ring 300 px round the player vessel, and a splash wide enough to catch some of them but not all.
    const ring = 300 / defaultConfig.arenaRadius;
    const crowd: Config = { ...inRange, waveSizeBase: 9, minSpawnDistance: 0, spawnInner: ring, spawnOuter: ring, fireballSplashRadius: 200 };
    const exploded = until(step(untilSpawned(createWorld(1, crowd)), throwing), (state) => state.events.some((event) => event.type === 'fireballHit'));
    const state = readState(exploded);
    const [blast] = state.events.flatMap((event) => (event.type === 'fireballHit' ? [event] : []));
    const inSplash = state.enemies.filter((enemy) => distanceBetween(enemy, blast) <= 200);
    const outside = state.enemies.filter((enemy) => distanceBetween(enemy, blast) > 200);

    expect(inSplash.length).toBeGreaterThan(1);
    expect(outside.length).toBeGreaterThan(0);
    expect(blast.vesselIds).toEqual(inSplash.map((enemy) => enemy.id));
    // fireballBurn is 2 damage per second for 3 s, which is 180 ticks.
    for (const enemy of inSplash) expect(enemy).toMatchObject({ health: 80, burnTicks: 180, burnDamagePerSecond: 2 });
    for (const enemy of outside) expect(enemy).toMatchObject({ health: 100, burnTicks: 0 });
  });

  it('leaves a Wave 1 enemy dinghy afloat after one Fireball and its burn with the default config, and sinks it with two', () => {
    // One still enemy 300 px away, within Fireball range. Arrows do no harm, so only the Fireballs count.
    const near = withClasses(
      { ...still, minSpawnDistance: 0, spawnInner: 300 / defaultConfig.arenaRadius, spawnOuter: 300 / defaultConfig.arenaRadius },
      { arrowDamage: 0 },
      { arrowDamage: 0 },
    );
    const hit = until(step(untilSpawned(createWorld(1, near)), throwing), (state) => state.enemies[0].health < 30);
    expect(readState(hit)).toMatchObject({ wave: 1, enemies: [{ maxHealth: 30, health: 10, burnTicks: 180 }] });

    const burnedOut = until(hit, (state) => state.enemies[0].burnTicks === 0);
    expect(readState(burnedOut).enemies[0].health).toBeCloseTo(4);
    const sunk = until(burnedOut, (state) => state.enemies[0].health === 0, () => throwing);
    expect(readState(sunk).events).toContainEqual(expect.objectContaining({ type: 'fireballHit' }));
  });

  it('sinks an enemy with its burn, which credits Gold', () => {
    // The blast takes 20 of the enemy's 25 health, and the burn the last 5.
    const fragile = withClasses({ ...inRange, fireballBurnOutSeconds: 10 }, {}, { health: 25 });
    const hit = until(step(untilSpawned(createWorld(1, fragile)), throwing), (state) => state.enemies[0].health < 25);
    const { id } = readState(hit).enemies[0];
    const sunk = until(hit, (state) => state.enemies[0].health === 0);

    expect(readState(sunk).events).toEqual([
      { type: 'vesselSunk', vesselId: id },
      { type: 'goldCredited', vesselId: id, gold: 5 },
    ]);
  });

  it('credits no Gold for an enemy its burn sinks on the same tick as the player vessel', () => {
    // The Captain and an enemy Wizard throw at each other on the same tick, with the same damage and burn, so
    // both burns sink their vessels on the same tick.
    const trade = withClasses(
      {
        ...still,
        fireballRange: 1200,
        fireballBurnOutSeconds: 10,
        wizardVesselsFromWave: 1,
        wizardVesselChance: 1,
        fireballDamage: 50,
        wizardFireballDamage: 50,
        fireballBurn: { damagePerSecond: 100, burnSeconds: 3 },
      },
      { arrowDamage: 0 },
      { health: 100, arrowDamage: 0 },
    );
    // wizardFireballCooldownSeconds is 10 s, which is 600 ticks.
    const thrown = step(run(untilSpawned(createWorld(1, trade)), noCommands, 599), throwing);
    expect(readState(thrown).fireballs).toHaveLength(2);
    const sunk = until(thrown, (state) => state.run !== 'sailing');
    const { enemies, events } = readState(sunk);

    expect(readState(sunk)).toMatchObject({ run: 'sinking', gold: 0, player: { health: 0 }, enemies: [{ health: 0 }] });
    expect(events).toContainEqual({ type: 'vesselSunk', vesselId: enemies[0].id });
    expect(events.filter((event) => event.type === 'fireballHit' || event.type === 'goldCredited')).toEqual([]);
  });

  it('can miss a target that turns faster than it does, and then burns out after the set time', () => {
    const sluggish: Config = { ...circling, fireballTurnRate: 0.1 };
    let world = step(run(untilSpawned(createWorld(1, sluggish)), noCommands, 60 * 20), throwing);
    expect(readState(world).fireballs).toHaveLength(1);
    // fireballBurnOutSeconds is 2 s, which is 120 ticks.
    world = run(world, noCommands, 119);
    expect(readState(world).fireballs).toHaveLength(1);
    world = step(world, noCommands);

    expect(readState(world).fireballs).toEqual([]);
    expect(fireballEvents(readState(world))).toEqual([{ type: 'fireballBurnedOut', x: expect.any(Number), y: expect.any(Number) }]);
    expect(readState(world).enemies[0].health).toBe(100);
  });
});

describe('sinking', () => {
  it('sinks a vessel at zero health, which stops shooting and taking hits, and is removed after the sinking time', () => {
    const fragile = withClasses(still, { arrowDamage: 10 }, { health: 10, arrowDamage: 0 });
    const sunk = until(untilSpawned(createWorld(1, fragile)), (state) => state.enemies[0].health === 0);
    const [wreck] = readState(sunk).enemies;

    expect(readState(sunk).events).toContainEqual({ type: 'arrowHit', vesselId: wreck.id });
    expect(readState(sunk).events).toContainEqual({ type: 'vesselSunk', vesselId: wreck.id });
    // sinkingSeconds is 1.5 s, which is 90 ticks.
    let world = sunk;
    for (let tick = 1; tick < 90; tick++) {
      const before = readState(world);
      world = step(world, noCommands);
      const state = readState(world);
      // Arrows already in flight fly on, through the wreck, but no new ones are fired.
      expect(state.events.filter((event) => 'vesselId' in event && event.vesselId === wreck.id)).toEqual([]);
      expect(arrowsOf(state, 'player').length).toBeLessThanOrEqual(arrowsOf(before, 'player').length);
      expect(arrowsOf(state, 'enemy').length).toBeLessThanOrEqual(arrowsOf(before, 'enemy').length);
      expect(state.enemies).toEqual([{ ...wreck, sinkingTicks: wreck.sinkingTicks - tick }]);
      expect(state.waveStatus).toBe('fighting');
    }
    expect(readState(step(world, noCommands))).toMatchObject({ enemies: [], wave: 2, waveStatus: 'countdown' });
  });

  it('ends the Run with the cause "sank" when the player vessel sinks', () => {
    const fragile = withClasses(still, { health: 10, arrowDamage: 0 }, { arrowDamage: 10 });
    const sunk = until(untilSpawned(createWorld(1, fragile)), (state) => state.run !== 'sailing');

    expect(readState(sunk)).toMatchObject({ run: 'sinking', endCause: 'sank', player: { health: 0 } });
    expect(readState(sunk).events).toContainEqual({ type: 'vesselSunk', vesselId: 0 });
    expect(readState(run(sunk, noCommands, 89))).toMatchObject({ run: 'sinking', events: [] });
    expect(readState(run(sunk, noCommands, 90))).toMatchObject({ run: 'ended', endCause: 'sank' });
  });
});

describe('regen', () => {
  // A Volley every 3 s from a tough enemy, which lands on the still player vessel every 3 s.
  const regen: Config = withClasses(
    { ...still, volleySeconds: 3, regenDelaySeconds: 1, regenRate: 0.02 },
    { arrowDamage: 5 },
    { health: 1000, arrowDamage: 5 },
  );
  const firstHit = (config: Config) => until(untilSpawned(createWorld(1, config)), (state) => state.player.health < 100);

  it('starts only after the delay, runs at the configured rate, and restarts its delay on a new hit', () => {
    const hit = firstHit(regen);
    const health = (ticks: number) => readState(run(hit, noCommands, ticks)).player.health;

    expect(readState(hit).player.health).toBe(95);
    // The delay is 1 s, which is 60 ticks. Then 2% of 100 health a second.
    expect(health(60)).toBe(95);
    expect(health(61)).toBeCloseTo(95 + 2 / 60);
    expect(health(120)).toBeCloseTo(97);
    expect(health(179)).toBeCloseTo(95 + (2 * 119) / 60);
    // The next Volley lands 3 s after the first.
    expect(health(180)).toBeCloseTo(94);
    expect(health(240)).toBeCloseTo(94);
    expect(health(241)).toBeCloseTo(94 + 2 / 60);
  });

  it('never goes above max health', () => {
    const fast = { ...regen, regenRate: 1 };
    const hit = firstHit(fast);

    expect(readState(run(hit, noCommands, 70)).player.health).toBe(100);
    expect(readState(run(hit, noCommands, 179)).player.health).toBe(100);
  });

  it('never heals an enemy', () => {
    const hit = firstHit(regen);

    expect(readState(hit).enemies[0].health).toBe(995);
    expect(readState(run(hit, noCommands, 179)).enemies[0].health).toBe(995);
  });
});

describe('health between Waves', () => {
  it('carries over from one Wave to the next', () => {
    // One Volley each, and the player's sinks the enemy. The next Wave's enemies are no tougher.
    const lasting = withClasses({ ...still, volleySeconds: 100, regenRate: 0, sinkingSeconds: 0.5, enemyHealthGrowth: 0 }, { arrowDamage: 5 }, { health: 5, arrowDamage: 20 });
    const hit = until(untilSpawned(createWorld(1, lasting)), (state) => state.player.health < 100);
    const nextWave = until(hit, (state) => state.wave === 2 && state.waveStatus === 'fighting');

    expect(readState(hit).player.health).toBe(80);
    expect(readState(nextWave).player.health).toBe(80);
    expect(readState(nextWave).enemies.map((enemy) => enemy.health)).toEqual([5, 5]);
  });
});

describe('Gold and the Score', () => {
  const goldOf = (state: WorldState) => state.events.filter((event) => event.type === 'goldCredited');

  it("credits the enemy class's Gold the moment an enemy sinks", () => {
    const fragile = withClasses(still, { arrowDamage: 10 }, { health: 10, arrowDamage: 0, gold: 7 });
    const sunk = until(untilSpawned(createWorld(1, fragile)), (state) => state.enemies[0].health === 0);
    const [wreck] = readState(sunk).enemies;

    expect(readState(sunk).gold).toBe(7);
    expect(goldOf(readState(sunk))).toEqual([{ type: 'goldCredited', vesselId: wreck.id, gold: 7 }]);
    // Removing the wreck credits nothing more.
    expect(readState(until(sunk, (state) => state.enemies.length === 0)).gold).toBe(7);
  });

  it('credits Gold for each enemy lost over the Edge, and counts each Wave defeated in the Score', () => {
    // Every spawn point is past the point of no return, so the Rim current takes each Wave over the Edge.
    // No Wizard vessels, which would credit more.
    const doomed: Config = { ...defaultConfig, waveCountdownSeconds: 1, rimCurrentStart: 0.2, pointOfNoReturn: 0.3, wizardVesselChance: 0 };
    let world = untilSpawned(createWorld(1, doomed));
    const credited: number[] = [];
    for (const wave of [1, 2, 3]) {
      expect(readState(world)).toMatchObject({ wave, score: wave - 1 });
      world = until(world, (state) => state.enemies.length === 0, (next) => {
        credited.push(...goldOf(readState(next)).map((event) => event.gold));
        return noCommands;
      });
      credited.push(...goldOf(readState(world)).map((event) => event.gold));
      expect(readState(world)).toMatchObject({ wave: wave + 1, score: wave });
      world = untilSpawned(world);
    }

    // Waves of 3, 4 and 5 enemy dinghies at 5 Gold each.
    expect(credited).toEqual(Array(12).fill(5));
    expect(readState(world)).toMatchObject({ gold: 60, score: 3, run: 'sailing' });
  });

  it('credits no Gold for the player vessel, and none to enemies', () => {
    const fragile = withClasses(still, { health: 10, arrowDamage: 0, gold: 100 }, { arrowDamage: 10 });
    const sunk = until(untilSpawned(createWorld(1, fragile)), (state) => state.run !== 'sailing');

    expect(readState(sunk)).toMatchObject({ run: 'sinking', gold: 0 });
    expect(goldOf(readState(sunk))).toEqual([]);
  });

  it('credits no Gold and defeats no Wave once the player vessel has started sinking, even on the same tick', () => {
    // The player vessel and the one enemy fire at each other on the same tick, and each sinks the other.
    const trade = withClasses({ ...still, volleySeconds: 100 }, { health: 10, arrowDamage: 10 }, { health: 10, arrowDamage: 10 });
    const sunk = until(untilSpawned(createWorld(1, trade)), (state) => state.run !== 'sailing');
    const ended = run(sunk, noCommands, 600);

    expect(readState(sunk)).toMatchObject({ run: 'sinking', gold: 0, score: 0, player: { health: 0 }, enemies: [{ health: 0 }] });
    expect(readState(sunk).events).toContainEqual({ type: 'vesselSunk', vesselId: readState(sunk).enemies[0].id });
    expect(goldOf(readState(sunk))).toEqual([]);
    expect(readState(ended)).toMatchObject({ run: 'ended', gold: 0, score: 0, wave: 1 });
  });
});

describe('ramming', () => {
  /**
   * The player vessel sails at the one still enemy. Each Crew fires one Volley, as the Wave spawns, and its
   * Arrows do no damage.
   */
  const target = withClasses({ ...still, volleySeconds: 1000 }, { arrowDamage: 0 }, { health: 1000, arrowDamage: 0 });
  const chase = (throttle: number) => (world: World) => {
    const { player, enemies } = readState(world);
    return steerTo(world, bearingTo(player, enemies[0]), throttle);
  };
  const rammedIn = (state: WorldState) => state.events.filter((event) => event.type === 'rammed').map((event) => event.vesselId);
  /** Runs until the first ram, and returns the world on that tick and the damage each vessel took. */
  const firstRam = (config: Config, throttle = 1) => {
    const spawned = untilSpawned(createWorld(1, config));
    const world = until(spawned, (state) => rammedIn(state).length > 0, chase(throttle));
    const [before, after] = [readState(spawned), readState(world)];
    return { world, player: before.player.health - after.player.health, enemy: before.enemies[0].health - after.enemies[0].health };
  };

  it('damages both vessels when the player vessel and an enemy touch, more at a higher closing speed', () => {
    const full = firstRam(target);
    const half = firstRam(target, 0.5);

    expect(rammedIn(readState(full.world))).toEqual([0, 1]);
    // Full speed into a still dinghy closes at 150 px/s, half of the 300 px/s that does 10 damage.
    expect(full.player).toBeCloseTo(5, 0);
    expect(full.enemy).toBeCloseTo(full.player);
    expect(half.player).toBeCloseTo(2.5, 0);
    expect(half.enemy).toBeCloseTo(half.player);
  });

  it('does less damage to the bigger vessel', () => {
    const big = firstRam(withClasses(target, { radius: 40 }, {}));
    const small = firstRam(withClasses(target, {}, { radius: 40 }));

    // A vessel twice the other's size takes half the damage the other takes.
    expect(big.enemy).toBeCloseTo(2 * big.player);
    expect(small.player).toBeCloseTo(2 * small.enemy);
  });

  it('hurts only when a contact starts, not while one vessel keeps pushing the other', () => {
    const { world } = firstRam(target);
    let pushing = world;
    for (let tick = 0; tick < 60 * 3; tick++) {
      pushing = step(pushing, chase(1)(pushing));
      expect(distanceBetween(readState(pushing).player, readState(pushing).enemies[0])).toBeLessThan(40.01);
      expect(rammedIn(readState(pushing))).toEqual([]);
    }
  });

  it('restarts the regen delay', () => {
    const { world } = firstRam({ ...target, regenRate: 0.1 });
    const health = (ticks: number) => readState(run(world, noCommands, ticks)).player.health;

    // The delay is 3 s, which is 180 ticks.
    expect(health(180)).toBe(readState(world).player.health);
    expect(health(181)).toBeGreaterThan(readState(world).player.health);
  });

  it('sinks an enemy rammed to zero health, which credits Gold', () => {
    const { world } = firstRam(withClasses(target, {}, { health: 1 }));

    expect(readState(world).enemies[0].health).toBe(0);
    expect(readState(world).events).toContainEqual({ type: 'vesselSunk', vesselId: 1 });
    expect(readState(world).events).toContainEqual({ type: 'goldCredited', vesselId: 1, gold: 5 });
  });

  it('sinks the player vessel rammed to zero health, which ends the Run', () => {
    const { world } = firstRam(withClasses(target, { health: 1 }, {}));

    expect(readState(world)).toMatchObject({ run: 'sinking', endCause: 'sank', player: { health: 0 } });
    expect(readState(world).events).toContainEqual({ type: 'vesselSunk', vesselId: 0 });
  });

  it('never hurts two enemies that touch, which only push apart', () => {
    // Every enemy heads for the centre at full throttle, and the player vessel has sailed well clear of it.
    const pileUp = withClasses(
      { ...defaultConfig, waveSizeBase: 8, enemyTurnBack: 0, enemyCruiseThrottle: 1 },
      { arrowDamage: 0 },
      { arrowDamage: 0 },
    );
    let world = untilSpawned(createWorld(1, pileUp), up);
    let touched = false;
    for (let tick = 0; tick < 60 * 15; tick++) {
      world = step(world, { ...noCommands, setThrottle: 0 });
      const { player, enemies } = readState(world);
      for (const [i, a] of enemies.entries()) {
        expect(distanceBetween(a, player)).toBeGreaterThan(40);
        expect(a.health).toBe(a.maxHealth);
        for (const b of enemies.slice(i + 1)) {
          expect(distanceBetween(a, b)).toBeGreaterThan(40 - 0.001);
          if (distanceBetween(a, b) < 40.01) touched = true;
        }
      }
    }

    expect(touched).toBe(true);
  });
});

describe('Wizard vessels', () => {
  /** Every spawn point is past the point of no return, so the Rim current takes each Wave over the Edge. */
  const doomed: Config = { ...defaultConfig, waveCountdownSeconds: 1, rimCurrentStart: 0.2, pointOfNoReturn: 0.3 };
  const wizardsIn = (state: WorldState) => state.enemies.filter((enemy) => enemy.wizardVessel).map((enemy) => enemy.id);
  /** The ids of each Wave's Wizard vessels, from Wave 1. */
  const wizardsByWave = (seed: number, config: Config, waves: number) => {
    let world = untilSpawned(createWorld(seed, config));
    const wizards = [wizardsIn(readState(world))];
    for (let wave = 2; wave <= waves; wave++) {
      world = untilSpawned(untilNoEnemies(world));
      wizards.push(wizardsIn(readState(world)));
    }
    return wizards;
  };
  /**
   * One Wizard vessel in every Wave from Wave 1, that never rows and is always in Fireball range. Arrows do no
   * harm, and the Fireballs fly long enough to reach the farthest spawn point.
   */
  const wizard = withClasses(
    { ...still, fireballRange: 1200, fireballBurnOutSeconds: 10, wizardVesselsFromWave: 1, wizardVesselChance: 1 },
    { arrowDamage: 0 },
    { health: 1000, arrowDamage: 0 },
  );
  const enemyFireballs = (state: WorldState) => state.fireballs.filter((fireball) => fireball.side === 'enemy');

  it('never come in Waves 1 and 2, and come at most one to a Wave from Wave 3, the same for the same seed', () => {
    const seen = [];
    for (let seed = 1; seed <= 20; seed++) {
      const wizards = wizardsByWave(seed, doomed, 5);

      expect(wizards.slice(0, 2)).toEqual([[], []]);
      for (const wave of wizards) expect(wave.length).toBeLessThanOrEqual(1);
      expect(wizardsByWave(seed, doomed, 5)).toEqual(wizards);
      seen.push(...wizards.flat());
    }
    // A 5% chance for each of the 20 enemies in Waves 3 to 5 gives about 13 in 20 seeds a Wizard vessel.
    expect(seen.length).toBeGreaterThan(0);
  });

  it('come one to a Wave, never more, even when every enemy has the chance', () => {
    const wizards = wizardsByWave(1, { ...doomed, wizardVesselChance: 1 }, 5);

    expect(wizards.map((wave) => wave.length)).toEqual([0, 0, 1, 1, 1]);
  });

  it('spawn with their Fireball on a full cooldown, and throw once it has passed', () => {
    // wizardFireballCooldownSeconds is 10 s, which is 600 ticks. The player vessel is in range the whole time.
    const spawned = untilSpawned(createWorld(1, wizard));
    expect(readState(spawned).enemies[0].fireballTicks).toBe(600);
    expect(readState(spawned).player.fireballTicks).toBe(0);

    expect(enemyFireballs(readState(run(spawned, noCommands, 599)))).toEqual([]);
    expect(enemyFireballs(readState(run(spawned, noCommands, 600)))).toHaveLength(1);
  });

  it('throw Fireballs only at the player vessel, with their own damage, on their own cooldown', () => {
    // The Wizard throws once its cooldown from spawning has passed.
    const thrown = run(untilSpawned(createWorld(1, wizard)), noCommands, 600);
    const { player, enemies } = readState(thrown);

    expect(enemies[0].wizardVessel).toBe(true);
    expect(enemyFireballs(readState(thrown))).toEqual([
      expect.objectContaining({ side: 'enemy', targetId: 0, damage: 20, x: enemies[0].x, y: enemies[0].y }),
    ]);
    expect(turnBetween(readState(thrown).fireballs[0].heading, bearingTo(enemies[0], player))).toBeCloseTo(0);
    // wizardFireballCooldownSeconds is 10 s, which is 600 ticks. The Captain's cooldown is untouched.
    expect(enemies[0].fireballTicks).toBe(600);
    expect(player.fireballTicks).toBe(0);
    const hit = until(thrown, (state) => state.events.some((event) => event.type === 'fireballHit'));
    expect(readState(hit).events).toContainEqual({ type: 'fireballHit', vesselIds: [0], x: expect.any(Number), y: expect.any(Number) });
    expect(readState(hit).player).toMatchObject({ health: 80, burnTicks: 180, burnDamagePerSecond: 2 });
    const thrownAt = (world: World) => enemyFireballs(readState(world)).filter((fireball) => fireball.burnTicks === 600).length;
    expect(thrownAt(run(thrown, noCommands, 599))).toBe(0);
    expect(thrownAt(run(thrown, noCommands, 600))).toBe(1);
  });

  it('splash and burn only the player vessel, never their own side', () => {
    // Four enemies, one of them the Wizard vessel, and a splash that covers the whole Arena. Burns do no harm,
    // so each vessel's health shows only the blasts.
    const crowd: Config = { ...wizard, waveSizeBase: 3, fireballSplashRadius: 5000, fireballBurn: { damagePerSecond: 0, burnSeconds: 3 } };
    const blastOf = (state: WorldState) => state.events.find((event) => event.type === 'fireballHit');
    // The Captain throws first, and the Wizard once its cooldown from spawning has passed.
    const thrown = step(untilSpawned(createWorld(1, crowd)), { ...noCommands, throwFireball: true });
    const captains = until(thrown, (state) => blastOf(state) !== undefined);
    const ids = readState(captains).enemies.map((enemy) => enemy.id);
    expect(blastOf(readState(captains))).toMatchObject({ vesselIds: ids });
    expect(readState(captains).player.health).toBe(100);

    const wizards = until(step(captains, noCommands), (state) => blastOf(state) !== undefined);

    expect(blastOf(readState(wizards))).toMatchObject({ vesselIds: [0] });
    expect(readState(wizards).player).toMatchObject({ health: 80, burnTicks: 180 });
    expect(readState(wizards).enemies.map((enemy) => enemy.health)).toEqual([980, 980, 980, 980]);
  });

  it('throw nothing while the player vessel is out of Fireball range', () => {
    const tooFar = run(untilSpawned(createWorld(1, { ...wizard, fireballRange: 500 })), noCommands, 660);

    expect(readState(tooFar).fireballs).toEqual([]);
    expect(readState(tooFar).enemies[0].fireballTicks).toBe(0);
  });

  it('throw a default Fireball that a small dinghy fleeing at full speed escapes from more than 300 px away, and not from less', () => {
    /** A still Wizard vessel, spawned this far from the player vessel at the centre. Arrows do no harm. */
    const wizardAt = (distance: number) =>
      withClasses(
        { ...still, wizardVesselsFromWave: 1, wizardVesselChance: 1, minSpawnDistance: 0, spawnInner: distance / 1500, spawnOuter: distance / 1500 },
        { arrowDamage: 0 },
        { arrowDamage: 0 },
      );
    /**
     * Points the player vessel straight away from the Wizard, and sets off at full throttle 90 ticks before the
     * Wizard throws, which is how long a small dinghy takes to reach top speed. Gives the gap from the Fireball
     * to the dinghy's hull when it is thrown, and how the Fireball ended.
     */
    const flee = (config: Config) => {
      const { turnRate, radius, topSpeed } = defaultConfig.vesselClasses.smallDinghy;
      const away = (at: World, setThrottle: number): Commands => {
        const { player, enemies } = readState(at);
        const turn = turnBetween(player.heading, bearingTo(enemies[0], player)) / (turnRate / 60);
        return { ...noCommands, rudder: Math.max(-1, Math.min(1, turn)), setThrottle };
      };
      let world = untilSpawned(createWorld(1, config));
      // wizardFireballCooldownSeconds is 10 s, which is 600 ticks.
      for (let tick = 1; tick <= 600; tick++) world = step(world, away(world, tick > 510 ? 1 : 0));
      const { player, enemies, fireballs } = readState(world);
      expect(fireballs).toHaveLength(1);
      expect(player.speed).toBeCloseTo(topSpeed);
      expect(turnBetween(player.heading, bearingTo(enemies[0], player))).toBeCloseTo(0);
      const gap = distanceBetween(player, enemies[0]) - radius;
      const flown = until(world, (state) => state.fireballs.length === 0, (at) => away(at, 1));
      return { gap, ended: readState(flown).events.find((event) => event.type.startsWith('fireball'))?.type };
    };

    const far = flee(wizardAt(215));
    const near = flee(wizardAt(205));

    expect(far.gap).toBeGreaterThan(300);
    expect(far.gap).toBeLessThan(310);
    expect(far.ended).toBe('fireballBurnedOut');
    expect(near.gap).toBeGreaterThan(290);
    expect(near.gap).toBeLessThan(300);
    expect(near.ended).toBe('fireballHit');
  });

  it('are the only enemies that throw Fireballs', () => {
    const crowd = readState(run(untilSpawned(createWorld(1, { ...wizard, waveSizeBase: 3 })), noCommands, 600));
    const none = readState(run(untilSpawned(createWorld(1, { ...wizard, wizardVesselChance: 0 })), noCommands, 660));

    expect(crowd.enemies).toHaveLength(4);
    expect(crowd.enemies.filter((enemy) => enemy.wizardVessel)).toHaveLength(1);
    expect(crowd.enemies.filter((enemy) => enemy.fireballTicks > 0)).toEqual(crowd.enemies.filter((enemy) => enemy.wizardVessel));
    expect(enemyFireballs(crowd)).toHaveLength(1);
    expect(none.enemies[0].wizardVessel).toBe(false);
    expect(none.fireballs).toEqual([]);
  });

  it("credit 3x their class's Gold when lost", () => {
    const fragile = withClasses(wizard, { arrowDamage: 10 }, { health: 10, arrowDamage: 0, gold: 7 });
    const sunk = until(untilSpawned(createWorld(1, fragile)), (state) => state.enemies[0].health === 0);
    const [wreck] = readState(sunk).enemies;

    expect(wreck.wizardVessel).toBe(true);
    expect(readState(sunk).gold).toBe(21);
    expect(readState(sunk).events).toContainEqual({ type: 'goldCredited', vesselId: wreck.id, gold: 21 });
  });
});

/** The Cabin at the start of a Run, with the prices in the test config and no Gold. */
const noPurchases = [
  { item: 'repair', level: 0, highestLevel: null, nextPrice: 10, canBuy: false },
  { item: 'maxHealth', level: 0, highestLevel: 3, nextPrice: 30, canBuy: false },
  { item: 'regen', level: 0, highestLevel: 3, nextPrice: 25, canBuy: false },
  { item: 'arrowRate', level: 0, highestLevel: 3, nextPrice: 20, canBuy: false },
  { item: 'volleySize', level: 0, highestLevel: 4, nextPrice: 30, canBuy: false },
  { item: 'flamingArrows', level: 0, highestLevel: 1, nextPrice: 80, canBuy: false },
  { item: 'fireballDamage', level: 0, highestLevel: 3, nextPrice: 30, canBuy: false },
  { item: 'fireballCooldown', level: 0, highestLevel: 3, nextPrice: 30, canBuy: false },
  { item: 'smallShip', level: 0, highestLevel: 1, nextPrice: 150, canBuy: false },
];

describe('the Cabin', () => {
  const buyRepair: CabinAction = { type: 'buy', item: 'repair' };
  const repairOf = (world: World) => readState(world).cabin.find((item) => item.item === 'repair')!;
  /**
   * One still enemy per Wave, worth 50 Gold, that the player's first Arrow sinks. The enemy's Arrows take
   * off the given health each, so a test earns Gold and takes damage the way a player does.
   */
  const shop = (enemyArrowDamage: number) =>
    withClasses({ ...still, regenRate: 0 }, { arrowDamage: 10 }, { health: 10, arrowDamage: enemyArrowDamage, gold: 50 });
  /** Plays until the player has Gold and, if the enemy's Arrows hurt, has taken a hit. */
  const afterFight = (enemyArrowDamage: number) =>
    until(untilSpawned(createWorld(1, shop(enemyArrowDamage))), (state) => state.gold > 0 && state.player.health <= 100 - enemyArrowDamage);

  it('starts a Run with no purchases, listing every item at its first price', () => {
    expect(readState(createWorld(1, config)).cabin).toEqual(noPurchases);
  });

  it('shows the player vessel class', () => {
    expect(readState(createWorld(1, config)).player.vesselClass).toBe('smallDinghy');
  });

  it('sells a Repair that heals 25% of max health for 10 Gold, with no time passing', () => {
    const hurt = afterFight(30);
    const before = readState(hurt);
    expect(before).toMatchObject({ gold: 50, player: { health: 70 } });
    expect(repairOf(hurt)).toMatchObject({ canBuy: true, nextPrice: 10 });

    const repaired = applyCabinAction(hurt, buyRepair);

    // Everything else, positions, cooldowns and the Wave countdown included, is exactly as it was.
    expect(readState(repaired)).toEqual({
      ...before,
      gold: 40,
      player: { ...before.player, health: 95 },
      cabin: before.cabin.map((item) => (item.item === 'repair' ? { ...item, level: 1 } : item)),
    });
    expect(readState(step(repaired, noCommands)).countdown).toBe(readState(step(hurt, noCommands)).countdown);
  });

  it('can be bought again and again, and never heals above max health', () => {
    const hurt = afterFight(30);

    const once = applyCabinAction(hurt, buyRepair);
    const twice = applyCabinAction(once, buyRepair);

    expect(readState(twice)).toMatchObject({ gold: 30, player: { health: 100 } });
    expect(repairOf(twice)).toMatchObject({ level: 2, canBuy: false });
  });

  it('refuses a Repair at full health, and leaves the world unchanged', () => {
    const unhurt = afterFight(0);
    expect(readState(unhurt)).toMatchObject({ gold: 50, player: { health: 100 } });

    expect(repairOf(unhurt).canBuy).toBe(false);
    expect(applyCabinAction(unhurt, buyRepair)).toBe(unhurt);
  });

  it('refuses a Repair without enough Gold, and leaves the world unchanged', () => {
    const broke = until(untilSpawned(createWorld(1, withClasses(shop(30), { arrowDamage: 0 }, {}))), (state) => state.player.health < 100);
    expect(readState(broke).gold).toBe(0);

    expect(repairOf(broke).canBuy).toBe(false);
    expect(applyCabinAction(broke, buyRepair)).toBe(broke);
  });

  it('refuses a Repair once the player vessel is sinking, and after the Run ends', () => {
    // The player sinks the first enemy for Gold, and the next Waves' Arrows sink the player.
    const doomed = withClasses(shop(20), { health: 40 }, {});
    const sinking = until(untilSpawned(createWorld(1, doomed)), (state) => state.run === 'sinking');
    const ended = until(sinking, (state) => state.run === 'ended');
    expect(readState(sinking).gold).toBeGreaterThanOrEqual(10);

    for (const world of [sinking, ended]) {
      expect(repairOf(world).canBuy).toBe(false);
      expect(applyCabinAction(world, buyRepair)).toBe(world);
    }
  });

  it('has no purchases in a new Run', () => {
    const repaired = applyCabinAction(afterFight(30), buyRepair);
    expect(repairOf(repaired).level).toBe(1);

    expect(readState(createWorld(1, shop(30))).cabin).toEqual(noPurchases);
  });
});

describe('Upgrades', () => {
  const buy = (world: World, item: CabinItemName, times = 1) => {
    for (let i = 0; i < times; i++) world = applyCabinAction(world, { type: 'buy', item });
    return world;
  };
  const itemOf = (world: World, item: CabinItemName) => readState(world).cabin.find((entry) => entry.item === item)!;
  /**
   * One still enemy per Wave, worth the given Gold, that the player's first Arrow sinks. Its Arrows take off
   * the given health each. There is no regen unless it is bought.
   */
  const rich = (enemyArrowDamage: number, gold = 1000, base: Config = still) =>
    withClasses({ ...base, regenRate: 0 }, { arrowDamage: 10 }, { health: 10, arrowDamage: enemyArrowDamage, gold });
  /** Plays until the player has Gold and, if the enemy's Arrows hurt, has taken a hit. */
  const wealthy = (config: Config) =>
    until(untilSpawned(createWorld(1, config)), (state) => state.gold > 0 && state.player.health <= 100 - config.vesselClasses.enemyDinghy.arrowDamage);
  const { cabin } = defaultConfig;

  it('lower Gold by the price of each level in turn, go up one level and show the next price', () => {
    const start = wealthy(rich(0));
    const expected = {
      maxHealth: [30, 60, 120],
      regen: [25, 50, 100],
      arrowRate: [20, 40, 80],
      volleySize: [30, 60, 120, 240],
      flamingArrows: [80],
      fireballDamage: [30, 60, 120],
      fireballCooldown: [30, 60, 120],
    } satisfies Partial<Record<CabinItemName, number[]>>;

    for (const [item, prices] of Object.entries(expected) as [CabinItemName, number[]][]) {
      let world = start;
      for (const [level, price] of prices.entries()) {
        expect(itemOf(world, item)).toMatchObject({ level, highestLevel: prices.length, nextPrice: price, canBuy: true });
        const gold = readState(world).gold;
        world = buy(world, item);
        expect(readState(world).gold).toBe(gold - price);
      }
      expect(itemOf(world, item)).toMatchObject({ level: prices.length, nextPrice: null, canBuy: false });
    }
  });

  it('raise max and current health by 25% of the class max health per level', () => {
    const hurt = wealthy(rich(30));
    expect(readState(hurt).player).toMatchObject({ health: 70, maxHealth: 100 });

    for (const level of [1, 2, 3]) {
      expect(readState(buy(hurt, 'maxHealth', level)).player).toMatchObject({ health: 70 + 25 * level, maxHealth: 100 + 25 * level });
    }
  });

  it('let a Repair heal 25% of the upgraded max health', () => {
    const upgraded = buy(wealthy(rich(30)), 'maxHealth');
    const hurt = until(upgraded, (state) => state.player.health < 95);
    expect(readState(hurt).player).toMatchObject({ health: 65, maxHealth: 125 });

    expect(readState(buy(hurt, 'repair')).player.health).toBe(65 + 125 * 0.25);
  });

  it('add 1% of max health per second to regen per level', () => {
    // Regen starts straight after a hit, so the only difference between the two worlds is the Upgrade.
    const hurt = wealthy(rich(30, 1000, { ...still, regenDelaySeconds: 0 }));
    const healthAfterHalfASecond = (world: World) => readState(run(world, noCommands, 30)).player.health;

    for (const level of [1, 2, 3]) {
      const gained = healthAfterHalfASecond(buy(hurt, 'regen', level)) - healthAfterHalfASecond(hurt);
      expect(gained).toBeCloseTo(level * cabin.regen.regenRate * 100 * 0.5);
    }
  });

  /** The ticks, counted from the next Wave's spawn, on which the player Crew fires, and how many Arrows each time. */
  const volleysAfterSpawn = (world: World) => {
    const { wave } = readState(world);
    let next = until(world, (state) => state.wave > wave && state.waveStatus === 'fighting');
    const volleys: { tick: number; arrows: number }[] = [];
    for (let tick = 1; tick <= 120; tick++) {
      next = step(next, noCommands);
      const fired = arrowsOf(readState(next), 'player').filter((arrow) => arrow.flown === 0).length;
      if (fired > 0) volleys.push({ tick, arrows: fired });
    }
    return volleys;
  };

  it('shorten the time between Volleys to the configured time at each level', () => {
    const start = wealthy(rich(0));
    const gap = (world: World) => {
      const [first, second] = volleysAfterSpawn(world);
      return second.tick - first.tick;
    };

    expect(gap(start)).toBe(60);
    for (const level of [1, 2, 3]) {
      expect(gap(buy(start, 'arrowRate', level))).toBe(Math.round(cabin.arrowRate.volleySeconds[level - 1] * 60));
    }
  });

  it('add 1 Arrow to each Volley per level, from 1 up to 5', () => {
    const start = wealthy(rich(0));

    for (const level of [0, 1, 2, 3, 4]) {
      expect(volleysAfterSpawn(buy(start, 'volleySize', level))[0].arrows).toBe(1 + level);
    }
  });

  const throwing: Commands = { ...noCommands, throwFireball: true };
  /** The next Wave's enemies are always in Fireball range. */
  const inRange = rich(0, 1000, { ...still, fireballRange: 1200 });
  /** The world once the next Wave has spawned. The Captain has a target from the next tick. */
  const nextWave = (world: World) => {
    const { wave } = readState(world);
    return until(world, (state) => state.wave > wave && state.waveStatus === 'fighting');
  };

  it("set the damage of the Captain's Fireballs to the configured damage at each level", () => {
    const start = wealthy(inRange);

    expect(readState(step(nextWave(start), throwing)).fireballs[0].damage).toBe(20);
    for (const level of [1, 2, 3]) {
      const [fireball] = readState(step(nextWave(buy(start, 'fireballDamage', level)), throwing)).fireballs;
      expect(fireball).toMatchObject({ side: 'player', damage: cabin.fireballDamage.damage[level - 1] });
    }
  });

  it("set the Captain's cooldown after a throw to the configured time at each level", () => {
    const start = wealthy(inRange);
    const cooldownAfterThrow = (world: World) => readState(step(nextWave(world), throwing)).player.fireballTicks;

    expect(cooldownAfterThrow(start)).toBe(360);
    for (const level of [1, 2, 3]) {
      expect(cooldownAfterThrow(buy(start, 'fireballCooldown', level))).toBe(cabin.fireballCooldown.cooldownSeconds[level - 1] * 60);
    }
  });

  it('leave a cooldown already running with its time left, and shorten the next one', () => {
    // The Captain throws at the first enemy, and the Crew's Arrow sinks it for Gold while the cooldown runs.
    const thrown = step(untilSpawned(createWorld(1, inRange)), throwing);
    const cooling = until(thrown, (state) => state.gold > 0);
    const { fireballTicks } = readState(cooling).player;
    expect(fireballTicks).toBeGreaterThan(0);

    const upgraded = buy(cooling, 'fireballCooldown');

    expect(readState(upgraded).player.fireballTicks).toBe(fireballTicks);
    expect(readState(run(upgraded, noCommands, 10)).player.fireballTicks).toBe(fireballTicks - 10);
    const ready = until(upgraded, (state) => state.player.fireballTicks === 0);
    expect(readState(step(nextWave(ready), throwing)).player.fireballTicks).toBe(300);
  });

  it("leave a Wizard vessel's Fireball damage and cooldown as they were", () => {
    // A Wizard vessel in every Wave. The first one's loss pays for both Upgrades at their highest level, and the
    // second one has the health to outlast its cooldown from spawning.
    const wizards = rich(0, 1000, { ...still, fireballRange: 1200, wizardVesselsFromWave: 1, wizardVesselChance: 1, enemyHealthGrowth: 100 });
    const upgraded = buy(buy(wealthy(wizards), 'fireballDamage', 3), 'fireballCooldown', 3);
    expect(itemOf(upgraded, 'fireballCooldown').level).toBe(3);

    // A Wizard throws once its cooldown from spawning has passed.
    const state = readState(run(nextWave(upgraded), noCommands, 600));
    const wizard = state.enemies.find((enemy) => enemy.wizardVessel)!;
    expect(state.fireballs.filter((fireball) => fireball.side === 'enemy')).toEqual([expect.objectContaining({ damage: 20 })]);
    expect(wizard.fireballTicks).toBe(600);
  });

  it("are refused when the player can't afford the next level, leaving the world unchanged", () => {
    const poor = wealthy(rich(0, 25));
    expect(readState(poor).gold).toBe(25);

    for (const item of ['maxHealth', 'volleySize', 'fireballDamage', 'fireballCooldown'] as const) {
      expect(itemOf(poor, item).canBuy).toBe(false);
      expect(buy(poor, item)).toBe(poor);
    }
    expect(readState(buy(poor, 'regen')).gold).toBe(0);
  });

  it('are refused once maxed, leaving the world unchanged', () => {
    const start = wealthy(rich(0));

    const maxLevels = [['maxHealth', 3], ['regen', 3], ['arrowRate', 3], ['volleySize', 4], ['flamingArrows', 1], ['fireballDamage', 3], ['fireballCooldown', 3]] as const;
    for (const [item, levels] of maxLevels) {
      const maxed = buy(start, item, levels);
      expect(buy(maxed, item)).toBe(maxed);
    }
  });

  it('are all back at level 0 in a new Run', () => {
    const upgraded = buy(buy(wealthy(rich(0)), 'maxHealth'), 'volleySize');
    expect(itemOf(upgraded, 'maxHealth').level).toBe(1);

    const fresh = createWorld(1, rich(0));
    expect(readState(fresh).cabin.map(({ level }) => level)).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect(readState(fresh).player.maxHealth).toBe(100);
  });
});

describe('Targeting rules', () => {
  const allRules = ['closest', 'farthest', 'lowestHealth', 'highestHealth'] as const;
  const throwing: Commands = { ...noCommands, throwFireball: true };
  const setRule = (world: World, rule: TargetingRule) => applyCabinAction(world, { type: 'setTargetingRule', rule });
  /**
   * Wave 1 is one still enemy dinghy worth 1000 Gold, which the player's first Arrow sinks. Wave 2 is two still
   * enemy dinghies and an enemy ship, none of which hurts the player. With seed 5, one dinghy is 661 px from the
   * player, the other 748 px, and the ship 1006 px.
   */
  const known = (fireballRange: number) =>
    withClasses(
      { ...still, regenRate: 0, shipsFromWave: 2, fireballRange },
      { arrowDamage: 20 },
      { health: 10, arrowDamage: 0, gold: 1000 },
    );
  /** The world on the tick after Wave 2 spawns, which is when the Captain first has a target. */
  const wave2 = (world: World) => step(until(world, (state) => state.wave === 2 && state.waveStatus === 'fighting'), noCommands);
  /** Wave 2's enemies: the closer and the farther dinghy, and the ship. */
  const enemiesOf = (world: World) => {
    const { enemies, player } = readState(world);
    const [near, far] = enemies
      .filter((enemy) => enemy.vesselClass === 'enemyDinghy')
      .sort((a, b) => distanceBetween(a, player) - distanceBetween(b, player));
    const ship = enemies.find((enemy) => enemy.vesselClass === 'enemyShip')!;
    return { near, far, ship, player };
  };
  const spawned = (fireballRange: number) => untilSpawned(createWorld(5, known(fireballRange)));

  it('are all four listed at the start of a Run, with "closest" active, and none is a Cabin item', () => {
    const state = readState(createWorld(1, config));

    expect(state).toMatchObject({ targetingRules: allRules, targetingRule: 'closest', gold: 0 });
    const items: string[] = state.cabin.map(({ item }) => item);
    for (const rule of allRules) expect(items).not.toContain(rule);
  });

  it('can each be picked in a new Run, with no Gold spent', () => {
    const world = createWorld(1, config);

    for (const rule of allRules) expect(readState(setRule(world, rule))).toMatchObject({ targetingRule: rule, gold: 0 });
  });

  it('refuse any rule once the player vessel is sinking, and after the Run ends', () => {
    const doomed = withClasses(still, { health: 5, arrowDamage: 0 }, { arrowDamage: 10 });
    const sinking = until(untilSpawned(createWorld(1, doomed)), (state) => state.run === 'sinking');
    const ended = until(sinking, (state) => state.run === 'ended');

    for (const world of [sinking, ended]) for (const rule of allRules) expect(setRule(world, rule)).toBe(world);
  });

  it('take no time to set, and the rule stays until the player sets another', () => {
    const start = spawned(1200);
    const before = readState(start);

    const set = setRule(start, 'farthest');

    expect(readState(set)).toEqual({ ...before, targetingRule: 'farthest' });
    expect(readState(wave2(set)).targetingRule).toBe('farthest');
    expect(readState(setRule(wave2(set), 'closest')).targetingRule).toBe('closest');
  });

  it('each pick the right enemy of a known Wave, and ties go to the closest', () => {
    const start = spawned(1200);
    const { near, ship, player } = enemiesOf(wave2(start));
    expect(distanceBetween(near, player)).toBeCloseTo(661, 0);

    const picks = Object.fromEntries(
      allRules.map((rule) => [rule, readState(wave2(setRule(start, rule))).fireballTargetId]),
    );

    // The two dinghies have the same health, so "lowest health" is a tie between them.
    expect(picks).toEqual({ closest: near.id, farthest: ship.id, lowestHealth: near.id, highestHealth: ship.id });
    // The Captain throws at the rule's pick.
    const [fireball] = readState(step(wave2(setRule(start, 'highestHealth')), throwing)).fireballs;
    expect(fireball.targetId).toBe(ship.id);
  });

  it('count only enemies within Fireball range', () => {
    // The ship, which is farthest away and has the most health, is out of range.
    const start = spawned(900);
    const { near, far, ship, player } = enemiesOf(wave2(start));
    expect(distanceBetween(far, player)).toBeLessThan(900);
    expect(distanceBetween(ship, player)).toBeGreaterThan(900);

    const pick = (rule: TargetingRule) => readState(wave2(setRule(start, rule))).fireballTargetId;

    expect(pick('farthest')).toBe(far.id);
    // A tie between the two dinghies.
    expect(pick('highestHealth')).toBe(near.id);
  });

  it('make a Fireball whose target is lost pick a new target by the active rule', () => {
    // The Captain throws at the closer dinghy, and the Crew's faster Arrow sinks it before the Fireball gets there.
    const start = spawned(1200);
    const thrown = step(wave2(start), throwing);
    const { near, ship } = enemiesOf(thrown);
    expect(readState(thrown).fireballs[0].targetId).toBe(near.id);

    const afterLoss = (world: World) => {
      const lost = until(world, (state) => state.enemies.find((enemy) => enemy.id === near.id)!.health === 0);
      return readState(step(lost, noCommands)).fireballs[0];
    };

    expect(afterLoss(setRule(thrown, 'highestHealth')).targetId).toBe(ship.id);
    // Under "closest" it goes for the other dinghy instead.
    expect(afterLoss(thrown).targetId).not.toBe(ship.id);
  });
});

describe('Flaming arrows', () => {
  const buyFlaming = (world: World) => applyCabinAction(world, { type: 'buy', item: 'flamingArrows' });
  /**
   * One still enemy per Wave, worth 100 Gold, that never hurts the player. Wave 1's has 10 health, so the
   * player's first Arrow sinks it, and Wave 2's has 10 times the enemy health growth more. The player
   * Crew fires a Volley every given number of seconds.
   */
  const burning = (volleySeconds: number, enemyHealthGrowth: number) =>
    withClasses({ ...still, volleySeconds, enemyHealthGrowth }, { arrowDamage: 10 }, { health: 10, arrowDamage: 0, gold: 100 });
  /** The world once Wave 1's enemy is sunk for Gold, with Flaming arrows bought or not. */
  const paid = (config: Config, bought: boolean) => {
    const world = until(untilSpawned(createWorld(1, config)), (state) => state.gold > 0);
    return bought ? buyFlaming(world) : world;
  };
  const enemyOf = (world: World) => readState(world).enemies[0];
  /** Plays until the player Crew's Arrows have hit Wave 2's enemy the given number of times. */
  const untilHits = (world: World, hits: number) => {
    let count = 0;
    return until(world, (state) => {
      if (state.wave === 2 && state.events.some((event) => event.type === 'arrowHit' && event.vesselId !== state.player.id)) count++;
      return count === hits;
    });
  };

  it('cost 80 Gold, can be bought once, and then show as maxed', () => {
    const world = paid(burning(1, 9), false);
    const itemOf = (current: World) => readState(current).cabin.find((entry) => entry.item === 'flamingArrows');
    expect(readState(world).gold).toBe(100);
    expect(itemOf(world)).toMatchObject({ level: 0, highestLevel: 1, nextPrice: 80, canBuy: true });

    const bought = buyFlaming(world);

    expect(readState(bought).gold).toBe(20);
    expect(itemOf(bought)).toMatchObject({ level: 1, highestLevel: 1, nextPrice: null, canBuy: false });
    expect(buyFlaming(bought)).toBe(bought);
  });

  it("don't burn before they are bought", () => {
    const hit = untilHits(paid(burning(5, 9), false), 1);
    expect(enemyOf(hit)).toMatchObject({ health: 90, burnTicks: 0 });

    expect(enemyOf(run(hit, noCommands, 120)).health).toBe(90);
  });

  it('set the target burning for 3 s at 2 damage per second after they are bought', () => {
    // The next Volley lands 5 s after this one, so nothing else hurts the enemy.
    const hit = untilHits(paid(burning(5, 9), true), 1);
    expect(enemyOf(hit)).toMatchObject({ health: 90, burnTicks: 180 });

    const halfway = enemyOf(run(hit, noCommands, 90));
    expect(halfway.burnTicks).toBe(90);
    expect(halfway.health).toBeCloseTo(87);
    const burnedOut = run(hit, noCommands, 180);
    expect(enemyOf(burnedOut).burnTicks).toBe(0);
    expect(enemyOf(burnedOut).health).toBeCloseTo(84);
    expect(enemyOf(run(burnedOut, noCommands, 60)).health).toBe(enemyOf(burnedOut).health);
  });

  it('restart the time on a new hit without stacking the damage', () => {
    // A Volley lands every second, while the first burn still has 2 s left.
    const second = untilHits(paid(burning(1, 9), true), 2);
    const { health, burnTicks } = enemyOf(second);
    expect(burnTicks).toBe(180);
    expect(health).toBeCloseTo(100 - 10 - 2 - 10);

    expect(enemyOf(run(second, noCommands, 30)).health).toBeCloseTo(health - 1);
  });

  it("replace a Fireball's burn, and are replaced by one, without stacking", () => {
    // The Fireball does no damage of its own, and burns hotter and longer than a Flaming arrow.
    const mixed: Config = {
      ...burning(5, 9),
      fireballDamage: 0,
      fireballRange: 1200,
      fireballBurnOutSeconds: 10,
      fireballBurn: { damagePerSecond: 6, burnSeconds: 10 },
    };
    const wave2 = until(paid(mixed, true), (state) => state.wave === 2 && state.waveStatus === 'fighting');
    // The Arrow is faster than the Fireball, so it lands first.
    const arrowHit = untilHits(step(wave2, { ...noCommands, throwFireball: true }), 1);
    expect(enemyOf(arrowHit)).toMatchObject({ burnTicks: 180, burnDamagePerSecond: 2 });
    expect(readState(arrowHit).fireballs).toHaveLength(1);

    const fireballHit = until(arrowHit, (state) => state.events.some((event) => event.type === 'fireballHit'));
    expect(enemyOf(fireballHit)).toMatchObject({ burnTicks: 600, burnDamagePerSecond: 6 });
    const health = enemyOf(fireballHit).health;
    expect(enemyOf(run(fireballHit, noCommands, 30)).health).toBeCloseTo(health - 3);

    // The next Volley lands 5 s after the first.
    const nextHit = untilHits(fireballHit, 1);
    expect(enemyOf(nextHit)).toMatchObject({ burnTicks: 180, burnDamagePerSecond: 2 });
  });

  it('can sink an enemy, which credits full Gold and counts toward the Wave', () => {
    // Wave 2's enemy has 15 health, so the burn sinks it 2.5 s after the one Arrow hit.
    const hit = untilHits(paid(burning(5, 0.5), true), 1);
    expect(enemyOf(hit).health).toBeCloseTo(5);
    const { id } = enemyOf(hit);

    const sunk = until(hit, (state) => state.events.some((event) => event.type === 'vesselSunk'));

    expect(readState(sunk).events).toEqual([
      { type: 'vesselSunk', vesselId: id },
      { type: 'goldCredited', vesselId: id, gold: 100 },
    ]);
    expect(readState(sunk).gold).toBe(120);
    expect(enemyOf(sunk).burnTicks).toBe(0);
    expect(readState(until(sunk, (state) => state.waveStatus === 'countdown'))).toMatchObject({ wave: 3, score: 2 });
  });
});

describe('the small ship', () => {
  const buy = (world: World, item: CabinItemName, times = 1) => {
    for (let i = 0; i < times; i++) world = applyCabinAction(world, { type: 'buy', item });
    return world;
  };
  const itemOf = (world: World, item: CabinItemName) => readState(world).cabin.find((entry) => entry.item === item);
  /**
   * One still enemy per Wave, worth the given Gold, that the player's first Arrow sinks. Its Arrows take off
   * the given health each. There is no regen.
   */
  const rich = (enemyArrowDamage: number, gold = 1000) =>
    withClasses({ ...still, regenRate: 0 }, { arrowDamage: 10 }, { health: 10, arrowDamage: enemyArrowDamage, gold });
  const paid = (config: Config) => until(untilSpawned(createWorld(1, config)), (state) => state.gold > 0);
  const { smallShip } = defaultConfig.vesselClasses;

  it('costs 150 Gold and swaps the vessel class, keeping position, heading, speed and throttle', () => {
    const sailing = run(paid(rich(0)), { ...noCommands, setThrottle: 0.5, rudder: 0.5 }, 60);
    const before = readState(sailing);
    expect(itemOf(sailing, 'smallShip')).toMatchObject({ level: 0, highestLevel: 1, nextPrice: 150, canBuy: true });
    expect(before.player.speed).toBeGreaterThan(0);

    const { player, gold } = readState(buy(sailing, 'smallShip'));

    expect(gold).toBe(before.gold - 150);
    const { x, y, heading, speed, throttle } = before.player;
    expect(player).toMatchObject({ vesselClass: 'smallShip', x, y, heading, speed, throttle, health: 160, maxHealth: 160 });
  });

  it("sails with the small ship's top speed, acceleration and turn rate", () => {
    const ship = buy(paid(rich(0)), 'smallShip');
    const full = { ...noCommands, setThrottle: 1 };

    expect(readState(run(ship, full, 60)).player.speed).toBeCloseTo(smallShip.acceleration);
    expect(readState(run(ship, full, 180)).player.speed).toBeCloseTo(smallShip.topSpeed);
    expect(readState(run(ship, { ...noCommands, rudder: 1 }, 60)).player.heading).toBeCloseTo(smallShip.turnRate);
  });

  it('keeps every Upgrade level and applies it to the small ship', () => {
    const upgraded = buy(buy(buy(paid(rich(30)), 'maxHealth'), 'volleySize', 2), 'regen');
    const levels = (world: World) => readState(world).cabin.filter((item) => item.item !== 'smallShip').map(({ level }) => level);

    const ship = buy(upgraded, 'smallShip');

    expect(levels(ship)).toEqual(levels(upgraded));
    expect(readState(ship).player).toMatchObject({ health: 200, maxHealth: 200 });
    const volley = until(ship, (state) => arrowsOf(state, 'player').some((arrow) => arrow.flown === 0));
    expect(arrowsOf(readState(volley), 'player').filter((arrow) => arrow.flown === 0)).toHaveLength(3);
  });

  it('leaves a nearly sunk dinghy afloat at full health', () => {
    const nearlySunk = until(paid(rich(30)), (state) => state.player.health <= 10);
    expect(readState(nearlySunk).run).toBe('sailing');

    const rescued = buy(nearlySunk, 'smallShip');

    expect(readState(rescued).player).toMatchObject({ vesselClass: 'smallShip', health: 160, maxHealth: 160 });
    // An enemy Arrow that would have sunk the dinghy takes 30 off the small ship.
    const hit = until(rescued, (state) => state.player.health < 160);
    expect(readState(hit)).toMatchObject({ run: 'sailing', player: { health: 130 } });
  });

  it("can't be bought twice, and leaves the Cabin once owned", () => {
    const ship = buy(paid(rich(0)), 'smallShip');

    expect(itemOf(ship, 'smallShip')).toBeUndefined();
    expect(buy(ship, 'smallShip')).toBe(ship);
  });

  it('is refused without 150 Gold, leaving the world unchanged', () => {
    const poor = paid(rich(0, 149));

    expect(itemOf(poor, 'smallShip')?.canBuy).toBe(false);
    expect(buy(poor, 'smallShip')).toBe(poor);
  });

  it('is gone in a new Run, which starts in the small dinghy', () => {
    expect(readState(buy(paid(rich(0)), 'smallShip')).player.vesselClass).toBe('smallShip');

    const fresh = readState(createWorld(1, rich(0)));
    expect(fresh.player).toMatchObject({ vesselClass: 'smallDinghy', health: 100, maxHealth: 100 });
    expect(itemOf(createWorld(1, rich(0)), 'smallShip')).toMatchObject({ level: 0, nextPrice: 150 });
  });
});
