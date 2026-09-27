import { describe, expect, it } from 'vitest';
import { defaultConfig } from './config';
import {
  createWorld,
  readState,
  step,
  type Commands,
  type Config,
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
    enemyDinghy: { topSpeed: 120, acceleration: 30, turnRate: Math.PI / 2, radius: 20, health: 30, volleySize: 1, arrowDamage: 5, gold: 5 },
    enemyShip: { topSpeed: 160, acceleration: 15, turnRate: Math.PI / 4, radius: 40, health: 120, volleySize: 3, arrowDamage: 5, gold: 20 },
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
        // enemyCircleRange is 0.9, so about 315 px.
        expect(distanceBetween(enemy, player)).toBeGreaterThan(0.8 * 350);
        expect(distanceBetween(enemy, player)).toBeLessThan(350);
      }
      // Still circling, not parked.
      expect(distanceBetween(readState(run(later, noCommands, 60)).enemies[0], enemies[0])).toBeGreaterThan(30);
    }
  });

  it("sails an enemy ship by the ship class's stats, faster than a dinghy but slower to get going and to turn", () => {
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
    expect(turnRate).toBeLessThan(defaultConfig.vesselClasses.enemyDinghy.turnRate);
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

    // One of the three enemies in Wave 1 has sunk, and the player vessel is still afloat.
    expect(play().run).toBe('sailing');
    expect(play().enemies).toHaveLength(2);
    expect(play()).toEqual(play());
  });
});

/** Changes some stats of the player's class and of the enemy class. */
function withClasses(base: Config, player: Partial<VesselClass>, enemy: Partial<VesselClass>): Config {
  return {
    ...base,
    vesselClasses: {
      smallDinghy: { ...base.vesselClasses.smallDinghy, ...player },
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
    expect(fireball).toMatchObject({ side: 'player', targetId: closest.id, damage: 40 });
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
    expect(fireballEvents(state)).toEqual([{ type: 'fireballHit', vesselId: enemy.id, x: state.enemies[0].x, y: state.enemies[0].y }]);
    expect(state.enemies[0].health).toBe(60);
    expect(readState(step(world, noCommands)).enemies[0].health).toBe(60);
  });

  it('sinks an enemy it takes to zero health, which credits Gold', () => {
    // Long enough in flight to reach the farthest spawn point.
    const fragile = withClasses({ ...inRange, fireballBurnOutSeconds: 10 }, {}, { health: 40 });
    const sunk = until(step(untilSpawned(createWorld(1, fragile)), throwing), (state) => state.enemies[0].health === 0);

    expect(readState(sunk).events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'fireballHit' }),
        expect.objectContaining({ type: 'vesselSunk' }),
        expect.objectContaining({ type: 'goldCredited', gold: 5 }),
      ]),
    );
  });

  it('can miss a target that turns faster than it does, and then burns out after the set time', () => {
    const sluggish: Config = { ...circling, fireballTurnRate: 0.1 };
    let world = step(run(untilSpawned(createWorld(1, sluggish)), noCommands, 60 * 20), throwing);
    expect(readState(world).fireballs).toHaveLength(1);
    // fireballBurnOutSeconds is 3 s, which is 180 ticks.
    world = run(world, noCommands, 179);
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

  it('throw Fireballs only at the player vessel, with their own damage, on their own cooldown', () => {
    // The Wizard throws on the tick after the Wave spawns.
    const thrown = step(untilSpawned(createWorld(1, wizard)), noCommands);
    const { player, enemies } = readState(thrown);

    expect(enemies[0].wizardVessel).toBe(true);
    expect(enemyFireballs(readState(thrown))).toEqual([
      expect.objectContaining({ side: 'enemy', targetId: 0, damage: 25, x: enemies[0].x, y: enemies[0].y }),
    ]);
    expect(turnBetween(readState(thrown).fireballs[0].heading, bearingTo(enemies[0], player))).toBeCloseTo(0);
    // wizardFireballCooldownSeconds is 10 s, which is 600 ticks. The Captain's cooldown is untouched.
    expect(enemies[0].fireballTicks).toBe(600);
    expect(player.fireballTicks).toBe(0);
    const hit = until(thrown, (state) => state.events.some((event) => event.type === 'fireballHit'));
    expect(readState(hit).events).toContainEqual({ type: 'fireballHit', vesselId: 0, x: expect.any(Number), y: expect.any(Number) });
    expect(readState(hit).player.health).toBe(75);
    const thrownAt = (world: World) => enemyFireballs(readState(world)).filter((fireball) => fireball.burnTicks === 600).length;
    expect(thrownAt(run(thrown, noCommands, 599))).toBe(0);
    expect(thrownAt(run(thrown, noCommands, 600))).toBe(1);
  });

  it('throw nothing while the player vessel is out of Fireball range', () => {
    const tooFar = run(untilSpawned(createWorld(1, { ...wizard, fireballRange: 500 })), noCommands, 60);

    expect(readState(tooFar).fireballs).toEqual([]);
    expect(readState(tooFar).enemies[0].fireballTicks).toBe(0);
  });

  it('are the only enemies that throw Fireballs', () => {
    const crowd = readState(step(untilSpawned(createWorld(1, { ...wizard, waveSizeBase: 3 })), noCommands));
    const none = readState(run(untilSpawned(createWorld(1, { ...wizard, wizardVesselChance: 0 })), noCommands, 60));

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
