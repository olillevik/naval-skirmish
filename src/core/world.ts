// The pure game core (ADR 0001). No Phaser, no DOM, no real clocks.

/** Length of one fixed tick, in seconds. */
export const TICK_SECONDS = 1 / 60;

/** Every tuning number. The Arena is a disc centred on the world origin. */
export interface Config {
  arenaRadius: number;
  /** Dinghy speed at full throttle, px/s. */
  topSpeed: number;
  /** How fast the throttle moves while up or down is held, full throttle per second. */
  throttleRate: number;
  /** Largest change in speed, px/s per second, when speeding up or slowing down. */
  acceleration: number;
  /** Turn rate at full rudder, radians per second. The same at any speed. */
  turnRate: number;
}

export interface Dinghy {
  x: number;
  y: number;
  /** Radians, clockwise from pointing up the screen (-y). */
  heading: number;
  speed: number;
  /** 0 (stopped) to 1 (full). */
  throttle: number;
}

export type RunStatus = 'sailing' | 'falling' | 'ended';

export interface WorldState {
  dinghy: Dinghy;
  run: RunStatus;
}

/** What the player asks for during one tick. */
export interface Commands {
  throttleUp: boolean;
  throttleDown: boolean;
  /** -1 (full left) to 1 (full right). */
  rudder: number;
}

export interface World {
  readonly seed: number;
  readonly config: Config;
  readonly state: WorldState;
}

export function createWorld(seed: number, config: Config): World {
  return {
    seed,
    config,
    state: {
      dinghy: { x: 0, y: 0, heading: 0, speed: 0, throttle: 0 },
      run: 'sailing',
    },
  };
}

export function readState(world: World): WorldState {
  return world.state;
}

/** Advances the world by one fixed tick of TICK_SECONDS. */
export function step(world: World, commands: Commands): World {
  const { config } = world;
  const dinghy = world.state.dinghy;
  const throttleDirection = Number(commands.throttleUp) - Number(commands.throttleDown);
  const throttle = clamp(dinghy.throttle + throttleDirection * config.throttleRate * TICK_SECONDS, 0, 1);
  const maxSpeedChange = config.acceleration * TICK_SECONDS;
  const speed = clamp(throttle * config.topSpeed, dinghy.speed - maxSpeedChange, dinghy.speed + maxSpeedChange);
  const heading = dinghy.heading + clamp(commands.rudder, -1, 1) * config.turnRate * TICK_SECONDS;
  const distance = speed * TICK_SECONDS;
  const x = dinghy.x + Math.sin(heading) * distance;
  const y = dinghy.y - Math.cos(heading) * distance;

  return {
    ...world,
    state: { ...world.state, dinghy: { x, y, heading, speed, throttle } },
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
