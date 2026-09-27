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
  /** The countdown before each Wave, in seconds. There is no skip. */
  waveCountdownSeconds: number;
  /** Wave n has this many enemy dinghies plus n. */
  waveSizeBase: number;
  /** Enemies spawn between these fractions of the Arena radius. */
  spawnInner: number;
  spawnOuter: number;
  /** The closest an enemy spawns to the player vessel, px. */
  minSpawnDistance: number;
  /** How far an Arrow flies, px. Enemies circle the player vessel at about this range. */
  arrowRange: number;
  /** Past this fraction of the Arena radius, or about to sail past it, an enemy steers back toward the centre. */
  enemyTurnBack: number;
  /**
   * The throttle an enemy keeps while it circles the player vessel or steers back toward the centre.
   * Below full, so the player vessel can catch an enemy and push it toward the Edge.
   */
  enemyCruiseThrottle: number;
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
  /** Unique within a Run. The player vessel is 0. */
  id: number;
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

export type WaveStatus = 'countdown' | 'fighting';

export interface WorldState {
  player: Vessel;
  /** An enemy that crosses the Edge is lost and leaves this list. */
  enemies: Vessel[];
  run: RunStatus;
  /** The Wave being counted down to or fought, from 1. */
  wave: number;
  waveStatus: WaveStatus;
  /** Seconds left before the Wave spawns. 0 while fighting. */
  countdown: number;
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
  /** Ticks left before the Wave spawns. */
  readonly countdownTicks: number;
  /** The seeded random generator's state. */
  readonly random: number;
  readonly nextId: number;
}

export function createWorld(seed: number, config: Config): World {
  const countdownTicks = countdownTicksFor(config);
  return {
    seed,
    config,
    fallTicks: 0,
    countdownTicks,
    random: seed,
    nextId: 1,
    state: {
      player: newVessel(0, 0, 0, 0),
      enemies: [],
      run: 'sailing',
      wave: 1,
      waveStatus: 'countdown',
      countdown: countdownTicks * TICK_SECONDS,
    },
  };
}

function newVessel(id: number, x: number, y: number, heading: number): Vessel {
  return {
    id,
    vesselClass: 'smallDinghy',
    x,
    y,
    heading,
    speed: 0,
    throttle: 0,
    rimCurrent: { x: 0, y: 0 },
    pastPointOfNoReturn: false,
  };
}

function countdownTicksFor(config: Config): number {
  return Math.round(config.waveCountdownSeconds / TICK_SECONDS);
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

  const { state } = world;
  const moved = [
    sail(state.player, commands, config),
    ...state.enemies.map((enemy) => sail(enemy, enemyCommands(enemy, state.player, config), config)),
  ];
  const [player, ...afloat] = pushApart(moved, config).map((vessel) => feelRimCurrent(vessel, config));
  const next: World = {
    ...world,
    state: {
      ...state,
      player,
      enemies: afloat.filter((enemy) => Math.hypot(enemy.x, enemy.y) < config.arenaRadius),
      run: Math.hypot(player.x, player.y) >= config.arenaRadius ? 'falling' : 'sailing',
    },
  };
  return advanceWave(next);
}

/** Counts down to the Wave and spawns it, or starts the next countdown once the Wave has no enemies left. */
function advanceWave(world: World): World {
  const { state, config } = world;
  if (state.waveStatus === 'fighting') {
    if (state.enemies.length > 0) return world;
    const countdownTicks = countdownTicksFor(config);
    return {
      ...world,
      countdownTicks,
      state: { ...state, wave: state.wave + 1, waveStatus: 'countdown', countdown: countdownTicks * TICK_SECONDS },
    };
  }
  const countdownTicks = world.countdownTicks - 1;
  if (countdownTicks > 0) return { ...world, countdownTicks, state: { ...state, countdown: countdownTicks * TICK_SECONDS } };
  return { ...spawnWave(world), countdownTicks: 0 };
}

/**
 * Wave n has waveSizeBase + n enemy dinghies at seeded points in the spawn ring, each at least
 * minSpawnDistance from the player vessel and clear of the others, facing the player vessel.
 */
function spawnWave(world: World): World {
  const { state, config } = world;
  const { player } = state;
  const random = seededRandom(world.random);
  const radius = config.vesselClasses.smallDinghy.radius;
  const [inner, outer] = [config.spawnInner * config.arenaRadius, config.spawnOuter * config.arenaRadius];
  const enemies: Vessel[] = [];
  let nextId = world.nextId;
  for (let i = 0; i < config.waveSizeBase + state.wave; i++) {
    for (let attempt = 0; ; attempt++) {
      if (attempt === 1000) throw new Error('No room to spawn the Wave. Check the spawn settings in the config.');
      // Uniform over the ring's area, not bunched at the inner rim.
      const distance = Math.sqrt(inner ** 2 + random.next() * (outer ** 2 - inner ** 2));
      const angle = random.next() * Math.PI * 2;
      const x = Math.sin(angle) * distance;
      const y = -Math.cos(angle) * distance;
      if (Math.hypot(x - player.x, y - player.y) < config.minSpawnDistance) continue;
      if (enemies.some((enemy) => Math.hypot(x - enemy.x, y - enemy.y) < 2 * radius)) continue;
      enemies.push(newVessel(nextId++, x, y, bearing(x, y, player.x, player.y)));
      break;
    }
  }
  return {
    ...world,
    random: random.state(),
    nextId,
    state: { ...state, enemies, waveStatus: 'fighting', countdown: 0 },
  };
}

/**
 * The enemy AI. It only chooses commands, so enemies move by the same rules as the player vessel.
 * An enemy sails at the player vessel, circles it at about Arrow range once close, and steers back
 * toward the centre when it is past enemyTurnBack, or would get there within one turning circle.
 */
function enemyCommands(enemy: Vessel, player: Vessel, config: Config): Commands {
  const { turnRate } = config.vesselClasses[enemy.vesselClass];
  const lookAhead = enemy.speed / turnRate;
  const aheadX = enemy.x + Math.sin(enemy.heading) * lookAhead;
  const aheadY = enemy.y - Math.cos(enemy.heading) * lookAhead;
  const limit = config.enemyTurnBack * config.arenaRadius;
  if (Math.hypot(enemy.x, enemy.y) > limit || Math.hypot(aheadX, aheadY) > limit) {
    return steerTo(enemy, bearing(enemy.x, enemy.y, 0, 0), config.enemyCruiseThrottle, turnRate);
  }

  const toPlayer = bearing(enemy.x, enemy.y, player.x, player.y);
  const range = Math.hypot(player.x - enemy.x, player.y - enemy.y) / config.arrowRange;
  // Straight at the player vessel from 1.5x Arrow range, side-on at Arrow range, and turning away when closer.
  const offset = clamp((1.5 - range) * Math.PI, 0, (Math.PI * 3) / 4);
  // Circle the way the enemy already points, so it doesn't turn across the player vessel's bow.
  const side = angleBetween(toPlayer, enemy.heading) >= 0 ? 1 : -1;
  return steerTo(enemy, toPlayer + side * offset, offset > 0 ? config.enemyCruiseThrottle : 1, turnRate);
}

/** Turns as far toward the heading as one tick allows. */
function steerTo(vessel: Vessel, heading: number, throttle: number, turnRate: number): Commands {
  const rudder = clamp(angleBetween(vessel.heading, heading) / (turnRate * TICK_SECONDS), -1, 1);
  return { throttleUp: false, throttleDown: false, rudder, setThrottle: throttle };
}

/**
 * Vessels that touch push apart along the line between their centres, each by half the overlap.
 * A few passes settle a crowd where one push makes a new overlap.
 */
function pushApart(vessels: Vessel[], config: Config): Vessel[] {
  const pushed = vessels.map((vessel) => ({ ...vessel }));
  for (let pass = 0; pass < 20; pass++) {
    let overlapped = false;
    for (let i = 0; i < pushed.length; i++) {
      for (let j = i + 1; j < pushed.length; j++) {
        const [a, b] = [pushed[i], pushed[j]];
        const reach = config.vesselClasses[a.vesselClass].radius + config.vesselClasses[b.vesselClass].radius;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const distance = Math.hypot(dx, dy);
        if (distance >= reach) continue;
        overlapped = true;
        // Two vessels on the same spot push apart sideways.
        const [nx, ny] = distance > 0 ? [dx / distance, dy / distance] : [1, 0];
        const half = (reach - distance) / 2;
        a.x -= nx * half;
        a.y -= ny * half;
        b.x += nx * half;
        b.y += ny * half;
      }
    }
    if (!overlapped) break;
  }
  return pushed;
}

/** Radians, clockwise from up the screen, from the first point toward the second. */
function bearing(fromX: number, fromY: number, toX: number, toY: number): number {
  return Math.atan2(toX - fromX, -(toY - fromY));
}

/** The turn from one heading to another, between -PI and PI. Positive is clockwise. */
function angleBetween(from: number, to: number): number {
  const turn = (to - from) % (Math.PI * 2);
  return turn > Math.PI ? turn - Math.PI * 2 : turn < -Math.PI ? turn + Math.PI * 2 : turn;
}

/** Mulberry32. Deterministic, and good enough for spawn points. */
function seededRandom(seed: number) {
  let state = seed >>> 0;
  return {
    next(): number {
      state = (state + 0x6d2b79f5) >>> 0;
      let t = state;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
    state: () => state,
  };
}

/** Moves one vessel for one tick by its class stats and last tick's Rim current. */
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
  return {
    ...vessel,
    x: vessel.x + (Math.sin(heading) * speed + pull.x) * TICK_SECONDS,
    y: vessel.y + (-Math.cos(heading) * speed + pull.y) * TICK_SECONDS,
    heading,
    speed,
    throttle,
  };
}

/** Works out the Rim current where the vessel ended the tick. */
function feelRimCurrent(vessel: Vessel, config: Config): Vessel {
  const { x, y } = vessel;
  const distance = Math.hypot(x, y);
  return {
    ...vessel,
    rimCurrent: rimCurrentAt(x, y, distance, config.vesselClasses[vessel.vesselClass].topSpeed, config),
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
