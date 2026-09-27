// The pure game core (ADR 0001). No Phaser, no DOM, no real clocks.

/** Length of one fixed tick, in seconds. */
export const TICK_SECONDS = 1 / 60;

/** Every tuning number. The Arena is a disc centred on the world origin. */
export interface Config {
  arenaRadius: number;
  /** How fast the throttle moves while up or down is held, full throttle per second. */
  throttleRate: number;
  /** Where the Rim current starts, as a fraction of the Arena radius. It is zero here and grows outward. */
  rimCurrentStart: number;
  /**
   * Where the Rim current's pull on a vessel equals that vessel's top speed, as a fraction of the Arena radius.
   * Past it no rowing escapes.
   */
  pointOfNoReturn: number;
  /** How long the Run stays falling after the player vessel crosses the Edge, in seconds. */
  fallSeconds: number;
  vesselClasses: Record<VesselClassName, VesselClass>;
}

export type VesselClassName = 'smallDinghy';

/** The stats every vessel of one class shares. */
export interface VesselClass {
  /** Speed at full throttle, px/s. */
  topSpeed: number;
  /** Largest change in speed, px/s per second, when speeding up or slowing down. */
  acceleration: number;
  /** Turn rate at full rudder, radians per second. The same at any speed. */
  turnRate: number;
  /** Radius of the circle used for collisions, px. */
  radius: number;
}

export interface Vessel {
  vesselClass: VesselClassName;
  x: number;
  y: number;
  /** Radians, clockwise from pointing up the screen (-y). */
  heading: number;
  speed: number;
  /** 0 (stopped) to 1 (full). */
  throttle: number;
  /** The Rim current's pull at the vessel, px/s. */
  rimCurrent: Vector;
  /** True once the Rim current is stronger than the vessel's top speed, so no rowing can escape it. */
  pastPointOfNoReturn: boolean;
}

export type RunStatus = 'sailing' | 'falling' | 'ended';

export interface Vector {
  x: number;
  y: number;
}

export interface WorldState {
  player: Vessel;
  enemies: Vessel[];
  run: RunStatus;
}

/** What the player, or the enemy AI for an enemy vessel, asks for during one tick. */
export interface Commands {
  throttleUp: boolean;
  throttleDown: boolean;
  /** -1 (full left) to 1 (full right). */
  rudder: number;
  /** Sets the throttle straight to this value, 0 (stopped) to 1 (full), in place of up and down. */
  setThrottle?: number;
}

export interface World {
  readonly seed: number;
  readonly config: Config;
  readonly state: WorldState;
  /** Ticks spent falling so far. */
  readonly fallTicks: number;
}

export function createWorld(seed: number, config: Config): World {
  return {
    seed,
    config,
    fallTicks: 0,
    state: {
      player: {
        vesselClass: 'smallDinghy',
        x: 0,
        y: 0,
        heading: 0,
        speed: 0,
        throttle: 0,
        rimCurrent: { x: 0, y: 0 },
        pastPointOfNoReturn: false,
      },
      enemies: [],
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
  // The player vessel stays where it crossed the Edge while it falls. The view draws the fall.
  if (world.state.run === 'ended') return world;
  if (world.state.run === 'falling') {
    const fallTicks = world.fallTicks + 1;
    const run = fallTicks >= Math.round(config.fallSeconds / TICK_SECONDS) ? 'ended' : 'falling';
    return { ...world, fallTicks, state: { ...world.state, run } };
  }

  const player = sail(world.state.player, commands, config);
  return {
    ...world,
    state: {
      ...world.state,
      player,
      enemies: world.state.enemies.map((enemy) => sail(enemy, idle, config)),
      run: Math.hypot(player.x, player.y) >= config.arenaRadius ? 'falling' : 'sailing',
    },
  };
}

const idle: Commands = { throttleUp: false, throttleDown: false, rudder: 0 };

/** Moves one vessel for one tick by its class stats and the Rim current. */
function sail(vessel: Vessel, commands: Commands, config: Config): Vessel {
  const vesselClass = config.vesselClasses[vessel.vesselClass];
  const throttleDirection = Number(commands.throttleUp) - Number(commands.throttleDown);
  const throttle = clamp(
    commands.setThrottle ?? vessel.throttle + throttleDirection * config.throttleRate * TICK_SECONDS,
    0,
    1,
  );
  const maxSpeedChange = vesselClass.acceleration * TICK_SECONDS;
  const speed = clamp(throttle * vesselClass.topSpeed, vessel.speed - maxSpeedChange, vessel.speed + maxSpeedChange);
  const heading = vessel.heading + clamp(commands.rudder, -1, 1) * vesselClass.turnRate * TICK_SECONDS;
  const pull = vessel.rimCurrent;
  const x = vessel.x + (Math.sin(heading) * speed + pull.x) * TICK_SECONDS;
  const y = vessel.y + (-Math.cos(heading) * speed + pull.y) * TICK_SECONDS;
  const distance = Math.hypot(x, y);

  return {
    ...vessel,
    x,
    y,
    heading,
    speed,
    throttle,
    rimCurrent: rimCurrentAt(x, y, distance, vesselClass.topSpeed, config),
    pastPointOfNoReturn: distance > config.pointOfNoReturn * config.arenaRadius,
  };
}

/**
 * Points straight outward. Grows with the square of the distance past the start, so it begins gently,
 * equals the vessel's top speed at the point of no return, and keeps growing past it.
 */
function rimCurrentAt(x: number, y: number, distance: number, topSpeed: number, config: Config): Vector {
  const depth = (distance / config.arenaRadius - config.rimCurrentStart) / (config.pointOfNoReturn - config.rimCurrentStart);
  if (depth <= 0) return { x: 0, y: 0 };
  const strength = topSpeed * depth ** 2;
  return { x: (x / distance) * strength, y: (y / distance) * strength };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
