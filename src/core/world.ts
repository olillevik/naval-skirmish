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
  /** How long a vessel at zero health sinks before it is removed, in seconds. The Run stays sinking as long. */
  sinkingSeconds: number;
  /** The countdown before each Wave, in seconds. There is no skip. */
  waveCountdownSeconds: number;
  /** Wave n has this many enemy dinghies plus n. */
  waveSizeBase: number;
  /**
   * The first Wave with enemy ships. From it, Wave n also has (n - shipsFromWave) / 2 + 1 enemy ships,
   * rounded down, so one more ship joins every second Wave.
   */
  shipsFromWave: number;
  /** Each Wave's enemies have this fraction more max health than the last Wave's, compounded from Wave 1. */
  enemyHealthGrowth: number;
  /** Enemies spawn between these fractions of the Arena radius. */
  spawnInner: number;
  spawnOuter: number;
  /** The closest an enemy spawns to the player vessel, px. */
  minSpawnDistance: number;
  /** How far an Arrow flies, px. A Crew only fires at a vessel this close. */
  arrowRange: number;
  /** px/s. */
  arrowSpeed: number;
  /** The time between one Volley and the next from the same vessel, in seconds. */
  volleySeconds: number;
  /** The angle between neighbouring Arrows in one Volley, radians. */
  volleySpread: number;
  /** Health one of the Captain's Fireballs takes off the vessel it hits. */
  fireballDamage: number;
  /** The Captain only throws a Fireball at an enemy this close, px, and an enemy Wizard only at the player vessel this close. */
  fireballRange: number;
  /** px/s. */
  fireballSpeed: number;
  /** The time between one of the Captain's Fireballs and the next, in seconds. */
  fireballCooldownSeconds: number;
  /** How fast a Fireball turns toward its target, radians per second. */
  fireballTurnRate: number;
  /** How long a Fireball that hits nothing flies before it burns out, in seconds. */
  fireballBurnOutSeconds: number;
  /** The first Wave that can have a Wizard vessel. */
  wizardVesselsFromWave: number;
  /** From wizardVesselsFromWave, the chance each enemy has of being a Wizard vessel, until one in the Wave is. */
  wizardVesselChance: number;
  /** Health an enemy Wizard's Fireball takes off the player vessel. */
  wizardFireballDamage: number;
  /** The time between one of an enemy Wizard's Fireballs and the next, in seconds. */
  wizardFireballCooldownSeconds: number;
  /** Losing a Wizard vessel credits this many times its class's Gold. */
  wizardVesselGoldMultiplier: number;
  /** The player vessel regains this fraction of its max health each second, once regen has started. */
  regenRate: number;
  /** How long after the last damage the player vessel starts to regenerate, in seconds. */
  regenDelaySeconds: number;
  /** Enemies circle the player vessel at this fraction of the Arrow range, a little inside it so their Arrows reach. */
  enemyCircleRange: number;
  /** Past this fraction of the Arena radius, or about to sail past it, an enemy steers back toward the centre. */
  enemyTurnBack: number;
  /**
   * The throttle an enemy keeps while it circles the player vessel or steers back toward the centre.
   * Below full, so the player vessel can catch an enemy and push it toward the Edge.
   */
  enemyCruiseThrottle: number;
  /**
   * Health each of two vessels of the same size takes when they start touching at a closing speed of
   * rammingSpeed. Damage grows in proportion to the closing speed, and each vessel's share scales with
   * the other vessel's share of the two radii, so a bigger vessel takes less. Enemies never hurt each other.
   */
  rammingDamage: number;
  /** px/s. */
  rammingSpeed: number;
  vesselClasses: Record<VesselClassName, VesselClass>;
}

/** The player sails a smallDinghy. Enemy dinghies sail the same boat, but are weaker. Enemy ships join later Waves. */
export type VesselClassName = 'smallDinghy' | 'enemyDinghy' | 'enemyShip';

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
  /** Health at the start of a Run, or when the vessel spawns. */
  health: number;
  /** Arrows in each Volley. */
  volleySize: number;
  /** Health each of this vessel's Arrows takes off the vessel it hits. */
  arrowDamage: number;
  /** Gold credited to the player when an enemy of this class is lost. Nobody earns Gold for the player vessel. */
  gold: number;
}

/** The player vessel is on one side, and every enemy vessel is on the other. */
export type Side = 'player' | 'enemy';

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
  /** 0 means the vessel is sinking. A sinking vessel no longer moves, shoots, blocks or takes hits. */
  health: number;
  maxHealth: number;
  /** Ticks left before the Crew can fire the next Volley. A ready Crew fires as soon as an enemy is in range. */
  volleyTicks: number;
  /** An enemy vessel with a Wizard aboard, who throws Fireballs at the player vessel. Always false for the player vessel. */
  wizardVessel: boolean;
  /** Ticks left before the vessel's Wizard, the Captain on the player vessel, can throw the next Fireball. */
  fireballTicks: number;
  /** Ticks left before regen starts. Only the player vessel regenerates. */
  regenDelayTicks: number;
  /** Ticks left before a sinking vessel is removed. */
  sinkingTicks: number;
}

/** Flies straight until it hits a vessel on the other side or has flown the Arrow range. */
export interface Arrow {
  /** The side of the vessel that fired it. It never hurts that side. */
  side: Side;
  x: number;
  y: number;
  heading: number;
  damage: number;
  /** px flown so far. */
  flown: number;
}

/** Turns toward its target as fast as the Fireball turn rate allows, and explodes on the first vessel on the other side it hits. */
export interface Fireball {
  /** The side of the Wizard that threw it. It never hurts that side. */
  side: Side;
  x: number;
  y: number;
  heading: number;
  /** The vessel the Targeting rule picked. Once that vessel sinks or is lost, the Fireball flies straight on. */
  targetId: number;
  damage: number;
  /** Ticks left before it burns out. */
  burnTicks: number;
}

/** How the Captain picks the enemy a Fireball goes for. Always closest in this milestone. */
export type TargetingRule = 'closest';

/** Something that happened during the last tick, for the view's effects. */
export type WorldEvent =
  | { type: 'arrowHit'; vesselId: number }
  /** The vessel took ramming damage. */
  | { type: 'rammed'; vesselId: number }
  /** A Fireball exploded on the vessel, at this point. */
  | { type: 'fireballHit'; vesselId: number; x: number; y: number }
  /** A Fireball flew its burn-out time without a hit, and went out at this point. */
  | { type: 'fireballBurnedOut'; x: number; y: number }
  /** The vessel reached zero health and started sinking. */
  | { type: 'vesselSunk'; vesselId: number }
  | { type: 'vesselOverEdge'; vesselId: number }
  /** The player was credited Gold for losing the enemy vessel. */
  | { type: 'goldCredited'; vesselId: number; gold: number };

export type RunStatus = 'sailing' | 'falling' | 'sinking' | 'ended';

export type EndCause = 'sank' | 'fell off the Edge';

export interface Vector {
  x: number;
  y: number;
}

export type WaveStatus = 'countdown' | 'fighting';

export interface WorldState {
  player: Vessel;
  /** An enemy that crosses the Edge, or has finished sinking, is lost and leaves this list. */
  enemies: Vessel[];
  arrows: Arrow[];
  fireballs: Fireball[];
  targetingRule: TargetingRule;
  /** The enemy the Targeting rule picks within Fireball range after the last tick, or null when there is none. */
  fireballTargetId: number | null;
  run: RunStatus;
  /** Why the Run is falling, sinking or ended. Null while sailing. */
  endCause: EndCause | null;
  /** The Wave being counted down to or fought, from 1. */
  wave: number;
  waveStatus: WaveStatus;
  /** Seconds left before the Wave spawns. 0 while fighting. */
  countdown: number;
  /** The player's Gold. */
  gold: number;
  /** The Waves defeated in this Run. */
  score: number;
  /** What happened during the last tick, in the order it happened. */
  events: WorldEvent[];
}

/** What the player, or the enemy AI for an enemy vessel, asks for during one tick. */
export interface Commands {
  throttleUp: boolean;
  throttleDown: boolean;
  /** -1 (full left) to 1 (full right). */
  rudder: number;
  /** Sets the throttle straight to this value, 0 (stopped) to 1 (full), in place of up and down. */
  setThrottle?: number;
  /** True on the tick the player presses the Fireball key or button. Ignored for enemy vessels. */
  throwFireball?: boolean;
}

export interface World {
  readonly seed: number;
  readonly config: Config;
  readonly state: WorldState;
  /** Ticks spent falling or sinking so far. */
  readonly endingTicks: number;
  /** Ticks left before the Wave spawns. */
  readonly countdownTicks: number;
  /** The seeded random generator's state. */
  readonly random: number;
  readonly nextId: number;
  /** The enemies touching the player vessel on the last tick. Ramming only hurts when a contact starts. */
  readonly touching: readonly number[];
}

export function createWorld(seed: number, config: Config): World {
  const countdownTicks = countdownTicksFor(config);
  return {
    seed,
    config,
    endingTicks: 0,
    countdownTicks,
    random: seed,
    nextId: 1,
    touching: [],
    state: {
      player: newVessel(0, 'smallDinghy', 0, 0, 0, config),
      enemies: [],
      arrows: [],
      fireballs: [],
      targetingRule: 'closest',
      fireballTargetId: null,
      run: 'sailing',
      endCause: null,
      wave: 1,
      waveStatus: 'countdown',
      countdown: countdownTicks * TICK_SECONDS,
      gold: 0,
      score: 0,
      events: [],
    },
  };
}

function newVessel(
  id: number,
  vesselClass: VesselClassName,
  x: number,
  y: number,
  heading: number,
  config: Config,
  health = config.vesselClasses[vesselClass].health,
): Vessel {
  return {
    id,
    vesselClass,
    x,
    y,
    heading,
    speed: 0,
    throttle: 0,
    rimCurrent: { x: 0, y: 0 },
    pastPointOfNoReturn: false,
    health,
    maxHealth: health,
    volleyTicks: 0,
    wizardVessel: false,
    fireballTicks: 0,
    regenDelayTicks: 0,
    sinkingTicks: 0,
  };
}

const sideOf = (vessel: Vessel): Side => (vessel.id === 0 ? 'player' : 'enemy');
const ticksFor = (seconds: number) => Math.round(seconds / TICK_SECONDS);

function countdownTicksFor(config: Config): number {
  return ticksFor(config.waveCountdownSeconds);
}

export function readState(world: World): WorldState {
  return world.state;
}

/** Advances the world by one fixed tick of TICK_SECONDS. */
export function step(world: World, commands: Commands): World {
  const { config, state } = world;
  // Everything stays where it was while the player vessel falls or sinks. The view draws the fall or the wreck.
  if (state.run === 'ended') return world;
  if (state.run === 'falling' || state.run === 'sinking') {
    const endingTicks = world.endingTicks + 1;
    const run = endingTicks >= ticksFor(state.run === 'falling' ? config.fallSeconds : config.sinkingSeconds) ? 'ended' : state.run;
    return { ...world, endingTicks, state: { ...state, run, events: [] } };
  }

  const events: WorldEvent[] = [];
  // A wreck stays put, and is removed once it has sunk for the sinking time.
  const wrecks = state.enemies
    .filter((enemy) => enemy.health === 0 && enemy.sinkingTicks > 1)
    .map((wreck) => ({ ...wreck, sinkingTicks: wreck.sinkingTicks - 1 }));
  const moved = [
    sail(state.player, commands, config),
    ...state.enemies
      .filter((enemy) => enemy.health > 0)
      .map((enemy) => sail(enemy, enemyCommands(enemy, state.player, config), config)),
  ];
  regenerate(moved[0], config);
  const touching = ram(moved, world.touching, config, events);
  const afloat = pushApart(moved, config).map((vessel) => feelRimCurrent(vessel, config));
  const arrows = [...flyArrows(state.arrows, afloat, config, events), ...fireVolleys(afloat, config)];
  const flying = flyFireballs(state.fireballs, afloat, config, events);

  const [player, ...enemies] = afloat;
  const target = closestInRange(player, enemies, config.fireballRange);
  const fireballs = [...flying, ...throwFireball(player, target, commands, config), ...throwWizardFireballs(enemies, player, config)];
  const overEdge = (vessel: Vessel) => Math.hypot(vessel.x, vessel.y) >= config.arenaRadius;
  for (const vessel of afloat) {
    if (vessel.health > 0 && overEdge(vessel)) events.push({ type: 'vesselOverEdge', vesselId: vessel.id });
  }
  const endCause: EndCause | null = player.health === 0 ? 'sank' : overEdge(player) ? 'fell off the Edge' : null;
  // Once the player vessel has started sinking or falling, even on this tick, the Run is over, so no more
  // Gold is credited and no Wave is defeated.
  let { gold } = state;
  if (!endCause) {
    for (const event of [...events]) {
      if (event.type !== 'vesselSunk' && event.type !== 'vesselOverEdge') continue;
      const enemy = enemies.find((vessel) => vessel.id === event.vesselId);
      if (!enemy) continue;
      const credit = config.vesselClasses[enemy.vesselClass].gold * (enemy.wizardVessel ? config.wizardVesselGoldMultiplier : 1);
      gold += credit;
      events.push({ type: 'goldCredited', vesselId: enemy.id, gold: credit });
    }
  }
  const next: World = {
    ...world,
    touching,
    state: {
      ...state,
      player,
      enemies: [...enemies.filter((enemy) => enemy.health === 0 || !overEdge(enemy)), ...wrecks],
      arrows,
      fireballs,
      fireballTargetId: target?.id ?? null,
      run: endCause === 'sank' ? 'sinking' : endCause ? 'falling' : 'sailing',
      endCause,
      gold,
      events,
    },
  };
  return endCause ? next : advanceWave(next);
}

/** The player vessel regains health once the regen delay after its last damage has run out. */
function regenerate(player: Vessel, config: Config): void {
  if (player.regenDelayTicks > 0) {
    player.regenDelayTicks--;
    return;
  }
  player.health = Math.min(player.maxHealth, player.health + player.maxHealth * config.regenRate * TICK_SECONDS);
}

/**
 * Moves each Arrow one tick along its heading. An Arrow that touches a vessel on the other side hurts the
 * first one it reaches and is removed. One that has flown the Arrow range is removed too.
 */
function flyArrows(arrows: Arrow[], vessels: Vessel[], config: Config, events: WorldEvent[]): Arrow[] {
  const flying: Arrow[] = [];
  for (const arrow of arrows) {
    const distance = Math.min(config.arrowSpeed * TICK_SECONDS, config.arrowRange - arrow.flown);
    const dx = Math.sin(arrow.heading) * distance;
    const dy = -Math.cos(arrow.heading) * distance;
    const hit = firstHit(arrow, dx, dy, vessels, config);
    if (hit) {
      damage(hit, arrow.damage, config);
      events.push({ type: 'arrowHit', vesselId: hit.id });
      if (hit.health === 0) events.push({ type: 'vesselSunk', vesselId: hit.id });
      continue;
    }
    const flown = arrow.flown + distance;
    if (flown < config.arrowRange) flying.push({ ...arrow, x: arrow.x + dx, y: arrow.y + dy, flown });
  }
  return flying;
}

/** The first vessel afloat on the other side that the Arrow or Fireball touches on its way along the step. */
function firstHit(shot: Arrow | Fireball, dx: number, dy: number, vessels: Vessel[], config: Config): Vessel | undefined {
  return vessels
    .filter((vessel) => sideOf(vessel) !== shot.side && vessel.health > 0)
    .filter((vessel) => distanceToSegment(vessel, shot, dx, dy) <= config.vesselClasses[vessel.vesselClass].radius)
    .sort((a, b) => Math.hypot(a.x - shot.x, a.y - shot.y) - Math.hypot(b.x - shot.x, b.y - shot.y))[0];
}

/**
 * Turns each Fireball toward its target by at most one tick of the Fireball turn rate, then moves it one
 * tick. A Fireball that touches a vessel on the other side explodes on the first one it reaches. One that
 * has flown for the burn-out time burns out.
 */
function flyFireballs(fireballs: Fireball[], vessels: Vessel[], config: Config, events: WorldEvent[]): Fireball[] {
  const flying: Fireball[] = [];
  const maxTurn = config.fireballTurnRate * TICK_SECONDS;
  for (const fireball of fireballs) {
    const target = vessels.find((vessel) => vessel.id === fireball.targetId && vessel.health > 0);
    const turn = target ? angleBetween(fireball.heading, bearing(fireball.x, fireball.y, target.x, target.y)) : 0;
    const heading = fireball.heading + clamp(turn, -maxTurn, maxTurn);
    const distance = config.fireballSpeed * TICK_SECONDS;
    const dx = Math.sin(heading) * distance;
    const dy = -Math.cos(heading) * distance;
    const hit = firstHit(fireball, dx, dy, vessels, config);
    if (hit) {
      damage(hit, fireball.damage, config);
      events.push({ type: 'fireballHit', vesselId: hit.id, x: hit.x, y: hit.y });
      if (hit.health === 0) events.push({ type: 'vesselSunk', vesselId: hit.id });
      continue;
    }
    const [x, y] = [fireball.x + dx, fireball.y + dy];
    if (fireball.burnTicks <= 1) {
      events.push({ type: 'fireballBurnedOut', x, y });
      continue;
    }
    flying.push({ ...fireball, x, y, heading, burnTicks: fireball.burnTicks - 1 });
  }
  return flying;
}

/**
 * Counts down the Captain's cooldown. When the player asks for a Fireball, the cooldown is ready and the
 * Targeting rule has a target, the Captain throws one straight at it and the cooldown starts. Otherwise
 * nothing happens and the cooldown isn't spent.
 */
function throwFireball(player: Vessel, target: Vessel | undefined, commands: Commands, config: Config): Fireball[] {
  if (player.fireballTicks > 0) player.fireballTicks--;
  if (!commands.throwFireball || player.fireballTicks > 0 || player.health === 0 || !target) return [];
  player.fireballTicks = ticksFor(config.fireballCooldownSeconds);
  return [
    {
      side: 'player',
      x: player.x,
      y: player.y,
      heading: bearing(player.x, player.y, target.x, target.y),
      targetId: target.id,
      damage: config.fireballDamage,
      burnTicks: ticksFor(config.fireballBurnOutSeconds),
    },
  ];
}

/**
 * Counts down each enemy Wizard's cooldown. A Wizard whose cooldown is ready throws a Fireball straight at the
 * player vessel as soon as it is within Fireball range, and the cooldown starts.
 */
function throwWizardFireballs(enemies: Vessel[], player: Vessel, config: Config): Fireball[] {
  const thrown: Fireball[] = [];
  for (const enemy of enemies) {
    if (!enemy.wizardVessel || enemy.health === 0) continue;
    if (enemy.fireballTicks > 0) enemy.fireballTicks--;
    if (enemy.fireballTicks > 0 || !closestInRange(enemy, [player], config.fireballRange)) continue;
    enemy.fireballTicks = ticksFor(config.wizardFireballCooldownSeconds);
    thrown.push({
      side: 'enemy',
      x: enemy.x,
      y: enemy.y,
      heading: bearing(enemy.x, enemy.y, player.x, player.y),
      targetId: player.id,
      damage: config.wizardFireballDamage,
      burnTicks: ticksFor(config.fireballBurnOutSeconds),
    });
  }
  return thrown;
}

/** The closest vessel afloat among the others that is within range of the vessel. */
function closestInRange(vessel: Vessel, others: Vessel[], range: number): Vessel | undefined {
  return others
    .filter((other) => other.health > 0)
    .map((other) => ({ other, distance: Math.hypot(other.x - vessel.x, other.y - vessel.y) }))
    .filter(({ distance }) => distance <= range)
    .sort((a, b) => a.distance - b.distance)[0]?.other;
}

/** Restarts the regen delay. At zero health the vessel starts sinking. */
function damage(vessel: Vessel, amount: number, config: Config): void {
  vessel.health = Math.max(0, vessel.health - amount);
  vessel.regenDelayTicks = ticksFor(config.regenDelaySeconds);
  if (vessel.health === 0) vessel.sinkingTicks = ticksFor(config.sinkingSeconds);
}

/** The closest a point comes to the path from the start by the step, px. */
function distanceToSegment(point: Vector, start: Vector, dx: number, dy: number): number {
  const along = clamp(((point.x - start.x) * dx + (point.y - start.y) * dy) / (dx ** 2 + dy ** 2 || 1), 0, 1);
  return Math.hypot(point.x - (start.x + dx * along), point.y - (start.y + dy * along));
}

/**
 * Each Crew whose Volley is ready fires it at the closest vessel on the other side within Arrow range,
 * aimed where that vessel is now. The Arrows fan out evenly around the aim.
 */
function fireVolleys(vessels: Vessel[], config: Config): Arrow[] {
  const fired: Arrow[] = [];
  for (const vessel of vessels) {
    if (vessel.health === 0) continue;
    if (vessel.volleyTicks > 0) vessel.volleyTicks--;
    if (vessel.volleyTicks > 0) continue;
    const target = closestInRange(
      vessel,
      vessels.filter((other) => sideOf(other) !== sideOf(vessel)),
      config.arrowRange,
    );
    if (!target) continue;
    const { volleySize, arrowDamage } = config.vesselClasses[vessel.vesselClass];
    const aim = bearing(vessel.x, vessel.y, target.x, target.y);
    for (let i = 0; i < volleySize; i++) {
      const heading = aim + (i - (volleySize - 1) / 2) * config.volleySpread;
      fired.push({ side: sideOf(vessel), x: vessel.x, y: vessel.y, heading, damage: arrowDamage, flown: 0 });
    }
    vessel.volleyTicks = ticksFor(config.volleySeconds);
  }
  return fired;
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
      state: {
        ...state,
        wave: state.wave + 1,
        waveStatus: 'countdown',
        countdown: countdownTicks * TICK_SECONDS,
        score: state.score + 1,
      },
    };
  }
  const countdownTicks = world.countdownTicks - 1;
  if (countdownTicks > 0) return { ...world, countdownTicks, state: { ...state, countdown: countdownTicks * TICK_SECONDS } };
  return { ...spawnWave(world), countdownTicks: 0 };
}

/**
 * Wave n has waveSizeBase + n enemy dinghies, and enemy ships from shipsFromWave, at seeded points in the
 * spawn ring, each at least minSpawnDistance from the player vessel and clear of the others, facing the
 * player vessel. Their max health grows by enemyHealthGrowth each Wave. From wizardVesselsFromWave, each
 * enemy in turn has wizardVesselChance of being a Wizard vessel, until one is.
 */
function spawnWave(world: World): World {
  const { state, config } = world;
  const { player, wave } = state;
  const random = seededRandom(world.random);
  const [inner, outer] = [config.spawnInner * config.arenaRadius, config.spawnOuter * config.arenaRadius];
  const ships = wave < config.shipsFromWave ? 0 : Math.floor((wave - config.shipsFromWave) / 2) + 1;
  const classes: VesselClassName[] = [
    ...Array<VesselClassName>(config.waveSizeBase + wave).fill('enemyDinghy'),
    ...Array<VesselClassName>(ships).fill('enemyShip'),
  ];
  const growth = (1 + config.enemyHealthGrowth) ** (wave - 1);
  const radiusOf = (vesselClass: VesselClassName) => config.vesselClasses[vesselClass].radius;
  const enemies: Vessel[] = [];
  let wizardAboard = false;
  let nextId = world.nextId;
  for (const vesselClass of classes) {
    for (let attempt = 0; ; attempt++) {
      if (attempt === 1000) throw new Error('No room to spawn the Wave. Check the spawn settings in the config.');
      // Uniform over the ring's area, not bunched at the inner rim.
      const distance = Math.sqrt(inner ** 2 + random.next() * (outer ** 2 - inner ** 2));
      const angle = random.next() * Math.PI * 2;
      const x = Math.sin(angle) * distance;
      const y = -Math.cos(angle) * distance;
      if (Math.hypot(x - player.x, y - player.y) < config.minSpawnDistance) continue;
      if (enemies.some((enemy) => Math.hypot(x - enemy.x, y - enemy.y) < radiusOf(enemy.vesselClass) + radiusOf(vesselClass))) continue;
      const health = config.vesselClasses[vesselClass].health * growth;
      const enemy = newVessel(nextId++, vesselClass, x, y, bearing(x, y, player.x, player.y), config, health);
      enemy.wizardVessel = !wizardAboard && wave >= config.wizardVesselsFromWave && random.next() < config.wizardVesselChance;
      wizardAboard ||= enemy.wizardVessel;
      enemies.push(enemy);
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
 * An enemy sails at the player vessel, circles it just inside Arrow range once close, and steers back
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
  const range = Math.hypot(player.x - enemy.x, player.y - enemy.y) / (config.arrowRange * config.enemyCircleRange);
  // Straight at the player vessel from 1.5x the circling range, side-on at it, and turning away when closer.
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
 * When the player vessel and an enemy start touching, each takes ramming damage (see rammingDamage) from
 * the speed at which they close along the line between their centres. Returns the enemies touching the
 * player vessel.
 */
function ram(vessels: Vessel[], touchedBefore: readonly number[], config: Config, events: WorldEvent[]): number[] {
  const [player, ...enemies] = vessels;
  const touching: number[] = [];
  const velocity = (vessel: Vessel) => ({
    x: Math.sin(vessel.heading) * vessel.speed + vessel.rimCurrent.x,
    y: -Math.cos(vessel.heading) * vessel.speed + vessel.rimCurrent.y,
  });
  for (const enemy of enemies) {
    const [playerRadius, enemyRadius] = [player, enemy].map((vessel) => config.vesselClasses[vessel.vesselClass].radius);
    const dx = enemy.x - player.x;
    const dy = enemy.y - player.y;
    const distance = Math.hypot(dx, dy);
    if (distance >= playerRadius + enemyRadius) continue;
    touching.push(enemy.id);
    if (touchedBefore.includes(enemy.id) || player.health === 0) continue;
    const [nx, ny] = distance > 0 ? [dx / distance, dy / distance] : [1, 0];
    const [a, b] = [velocity(player), velocity(enemy)];
    const closing = (a.x - b.x) * nx + (a.y - b.y) * ny;
    if (closing <= 0) continue;
    const full = (2 * config.rammingDamage * closing) / config.rammingSpeed / (playerRadius + enemyRadius);
    for (const [vessel, otherRadius] of [
      [player, enemyRadius],
      [enemy, playerRadius],
    ] as const) {
      damage(vessel, full * otherRadius, config);
      events.push({ type: 'rammed', vesselId: vessel.id });
      if (vessel.health === 0) events.push({ type: 'vesselSunk', vesselId: vessel.id });
    }
  }
  return touching;
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
