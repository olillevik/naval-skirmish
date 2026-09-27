import { describe, expect, it } from 'vitest';
import { defaultConfig } from './config';
import { createWorld, readState, step, type Commands, type Config, type World } from './world';

/**
 * Round numbers so expectations are easy to work out by hand at 60 ticks per second.
 * The Arena is big enough that the movement tests never reach the Rim current.
 */
const config: Config = {
  arenaRadius: 5000,
  throttleRate: 0.5,
  rimCurrentStart: 0.8,
  pointOfNoReturn: 0.95,
  fallSeconds: 0.5,
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
