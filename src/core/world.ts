// The pure game core (ADR 0001). No Phaser, no DOM, no real clocks.

/** Length of one fixed tick, in seconds. */
export const TICK_SECONDS = 1 / 60;

/** Every tuning number. The Arena is a disc centred on the world origin. */
export interface Config {
  arenaRadius: number;
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

/** Advances the world by one fixed tick of TICK_SECONDS. The Dinghy doesn't move yet. */
export function step(world: World, _commands: Commands): World {
  return world;
}
