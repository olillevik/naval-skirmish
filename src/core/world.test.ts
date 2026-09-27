import { describe, expect, it } from 'vitest';
import { defaultConfig } from './config';
import { createWorld, readState, step, type Commands, type Config, type World, type WorldState } from './world';

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
  waveCountdownSeconds: 1000,
  waveSizeBase: 2,
  spawnInner: 0.4,
  spawnOuter: 0.75,
  minSpawnDistance: 500,
  arrowRange: 350,
  enemyTurnBack: 0.75,
  enemyCruiseThrottle: 0.6,
  vesselClasses: { smallDinghy: { topSpeed: 120, acceleration: 30, turnRate: Math.PI / 2, radius: 20 } },
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
    vesselClasses: { smallDinghy: { ...config.vesselClasses.smallDinghy, acceleration: 120 * 60, turnRate: Math.PI * 60 } },
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
    vesselClasses: { smallDinghy: { ...config.vesselClasses.smallDinghy, topSpeed: 1200, acceleration: 1200 * 60 } },
  };

  it('goes from sailing to falling to ended once the dinghy crosses the Edge, and stays ended', () => {
    let world = createWorld(1, quick);
    while (readState(world).run === 'sailing') world = step(world, up);
    const fell = readState(world);

    expect(fell.run).toBe('falling');
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
  const waves: Config = { ...defaultConfig, waveCountdownSeconds: 1 };

  it('closes in on the player, then circles at about Arrow range', () => {
    for (let seed = 1; seed <= 5; seed++) {
      const spawned = untilSpawned(createWorld(seed, waves));
      const later = run(spawned, noCommands, 60 * 30);
      const { player, enemies } = readState(later);

      expect(enemies).toHaveLength(3);
      for (const [i, enemy] of enemies.entries()) {
        expect(distanceBetween(enemy, player)).toBeLessThan(distanceBetween(readState(spawned).enemies[i], player));
        expect(distanceBetween(enemy, player)).toBeGreaterThan(0.85 * 350);
        expect(distanceBetween(enemy, player)).toBeLessThan(1.15 * 350);
      }
      // Still circling, not parked.
      expect(distanceBetween(readState(run(later, noCommands, 60)).enemies[0], enemies[0])).toBeGreaterThan(30);
    }
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
  });
});

describe('contact', () => {
  it('pushes two touching vessels apart so they never overlap', () => {
    const homing: Config = { ...defaultConfig, waveCountdownSeconds: 1, waveSizeBase: 0, enemyTurnBack: 0 };
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
    const crowd: Config = { ...defaultConfig, waveCountdownSeconds: 1, waveSizeBase: 12 };
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
      for (let tick = 0; tick < 60 * 40; tick++) world = step(world, script(tick));
      return readState(world);
    };

    expect(play().enemies).toHaveLength(3);
    expect(play()).toEqual(play());
  });
});
