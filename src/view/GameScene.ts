import { Scene, type GameObjects, type Input, type Tweens } from 'phaser';
import { defaultConfig } from '../core/config';
import {
  createWorld,
  readState,
  step,
  TICK_SECONDS,
  type Arrow,
  type Commands,
  type Config,
  type Vessel,
  type World,
  type WorldEvent,
} from '../core/world';
import { installTestHook } from './testHook';
import { TouchControls } from './touchControls';

const DINGHY_SCALE = 2;
/** The pack's sprites point their bow down the screen; heading 0 points up. */
const SPRITE_ROTATION = Math.PI;
/** Longest frame we catch up on, so a backgrounded tab doesn't run thousands of ticks. */
const MAX_FRAME_SECONDS = 0.25;
/** Must match the game's background colour in main.ts. */
const SPACE_COLOUR = 0x0b0e1f;
const EDGE_COLOUR = 0xeaf6ff;
const EDGE_WIDTH = 6;
const RIM_CURRENT_MARKER_COLOUR = 0x3d8fc4;
const RIM_CURRENT_MARKER_WIDTH = 4;
const RING_SEGMENTS = 256;
/** How far past the Edge space is drawn. Wider than half of any screen, so the view never runs out of stars. */
const SPACE_DEPTH = 2500;
const STARS_PER_SQUARE_PX = 1 / 15000;
/** Enemy dinghies use the pack's other dinghy sprites, over a red ring, so the player's dinghy stands out. */
const ENEMY_DINGHY_SPRITES = ['enemyDinghy1', 'enemyDinghy2'];
const ENEMY_MARK_COLOUR = 0xd62f2f;
/** The ring is a little wider than the collision circle, so it shows around the hull. */
const ENEMY_MARK_SCALE = 1.4;
/** A dinghy below this share of its max health shows fire, since the pack has no damaged dinghy sprites. */
const FIRE_BELOW = 0.4;
/** Small enough that the hull shows around the flames. */
const FIRE_SCALE = 0.6;
const WRECK_TINT = 0x555555;
const HIT_TINT = 0xff6060;
const HIT_FLASH_MS = 100;
const ARROW_LENGTH = 12;
const ARROW_WIDTH = 2;
const ARROW_COLOUR = 0x3b2a1a;
const HEALTH_BAR_WIDTH = 40;
const HEALTH_BAR_HEIGHT = 5;
/** How far above an enemy's centre its health bar sits, px. */
const HEALTH_BAR_OFFSET = 36;
const HEALTH_BAR_COLOUR = 0x4caf50;
const HEALTH_BAR_BACK_COLOUR = 0x2b0b0b;
/** Where the view keeps the Best score. The core knows nothing about storage. */
const BEST_SCORE_KEY = 'naval-skirmish.bestScore';
const END_CAUSE_TEXT = { sank: 'The dinghy sank', 'fell off the Edge': 'The dinghy fell off the Edge' };

/** A vessel's hull and fire, which turn with it, inside a container that the fall and the wreck fade animate. */
interface VesselSprite {
  body: GameObjects.Container;
  hull: GameObjects.Image;
  fire: GameObjects.Image;
  sinking: boolean;
}

type Keys = Record<'W' | 'A' | 'S' | 'D' | 'UP' | 'DOWN' | 'LEFT' | 'RIGHT', Input.Keyboard.Key>;

export class GameScene extends Scene {
  private world!: World;
  private dinghy!: VesselSprite;
  /** Each enemy's sprite and mark, by vessel id. */
  private enemies = new Map<number, VesselSprite>();
  /** The Arrows and the enemies' health bars, drawn afresh each frame. */
  private overlay!: GameObjects.Graphics;
  private keys!: Keys;
  private touch = new TouchControls();
  private accumulator = 0;
  private fall?: Tweens.Tween;
  private edgeWarning = document.getElementById('edge-warning')!;
  private gameOverScreen = document.getElementById('game-over')!;
  private waveLabel = document.getElementById('wave')!;
  private countdownLabel = document.getElementById('countdown')!;
  private healthLabel = document.getElementById('health')!;
  private goldLabel = document.getElementById('gold')!;
  private scoreLabel = document.getElementById('score')!;
  private bestScoreLabel = document.getElementById('best-score')!;
  private endCauseLabel = document.getElementById('end-cause')!;
  /** False while a screen such as the start screen is showing, so the world doesn't tick. */
  private running = false;

  constructor() {
    super('game');
  }

  preload(): void {
    const base = import.meta.env.BASE_URL;
    this.load.image('dinghy', `${base}assets/dinghySmall1.png`);
    this.load.image('enemyDinghy1', `${base}assets/dinghySmall2.png`);
    this.load.image('enemyDinghy2', `${base}assets/dinghySmall3.png`);
    this.load.image('water', `${base}assets/tile_73.png`);
    this.load.image('fire', `${base}assets/fire1.png`);
  }

  create(): void {
    this.world = createWorld(Date.now(), defaultConfig);
    this.drawArena(defaultConfig);
    // Above the enemies, so the player's dinghy is never hidden under one.
    this.dinghy = this.addVesselSprite('dinghy');
    this.dinghy.body.setDepth(1);
    this.overlay = this.add.graphics().setDepth(2);
    this.cameras.main.startFollow(this.dinghy.body);
    this.keys = this.input.keyboard!.addKeys('W,A,S,D,UP,DOWN,LEFT,RIGHT') as Keys;
    this.draw([]);
    installTestHook(() => readState(this.world));
    this.showStartScreen();
    document.getElementById('new-run')!.addEventListener('click', () => {
      this.gameOverScreen.hidden = true;
      this.startRun();
    });
  }

  update(_time: number, deltaMs: number): void {
    if (!this.running) return;
    this.accumulator += Math.min(deltaMs / 1000, MAX_FRAME_SECONDS);
    // Read only when a tick runs, so a lever move in a frame without a tick isn't lost.
    // A frame can run several ticks, and each tick's events are only in the state until the next tick.
    const events: WorldEvent[] = [];
    if (this.accumulator >= TICK_SECONDS) {
      const commands = this.readCommands();
      while (this.accumulator >= TICK_SECONDS) {
        this.world = step(this.world, commands);
        events.push(...readState(this.world).events);
        this.accumulator -= TICK_SECONDS;
      }
    }

    const { run, player, endCause, score } = readState(this.world);
    this.edgeWarning.hidden = !player.pastPointOfNoReturn || run === 'ended';
    this.touch.showThrottle(player.throttle);
    // Once the dinghy has crossed the Edge or started sinking, that animation owns its scale, alpha and rotation.
    if (!this.fall) this.draw(events);
    if (run !== 'sailing' && !this.fall) {
      this.fall = run === 'sinking' ? this.sink(this.dinghy) : this.fallOffEdge(this.dinghy);
    }
    if (run === 'ended') {
      this.running = false;
      if (endCause) setText(this.endCauseLabel, END_CAUSE_TEXT[endCause]);
      setText(this.scoreLabel, `Score ${score}`);
      setText(this.bestScoreLabel, `Best score ${saveBestScore(score)}`);
      this.gameOverScreen.hidden = false;
    }
  }

  /** Starts a fresh Run. The start screen and the game-over screen call this. */
  private startRun(): void {
    this.world = createWorld(Date.now(), defaultConfig);
    this.accumulator = 0;
    this.touch.takeThrottle();
    this.touch.showThrottle(0);
    this.fall?.remove();
    this.fall = undefined;
    this.dinghy.body.setScale(1).setAlpha(1);
    this.dinghy.hull.clearTint();
    this.dinghy.sinking = false;
    for (const enemy of this.enemies.values()) enemy.body.destroy();
    this.enemies.clear();
    this.draw([]);
    this.running = true;
  }

  private showStartScreen(): void {
    const startScreen = document.getElementById('start-screen')!;
    startScreen.addEventListener(
      'pointerup',
      (event) => {
        startScreen.hidden = true;
        this.startRun();
        // Fullscreen is only a nicety. A refusal, or a browser without it, must not stop the Run.
        if (event.pointerType === 'touch') document.documentElement.requestFullscreen?.().catch(() => {});
      },
      { once: true },
    );
  }

  /** Merges the keyboard and the touch controls. The core clamps the summed rudder to full. */
  private readCommands(): Commands {
    const k = this.keys;
    const left = k.A.isDown || k.LEFT.isDown;
    const right = k.D.isDown || k.RIGHT.isDown;
    return {
      throttleUp: k.W.isDown || k.UP.isDown,
      throttleDown: k.S.isDown || k.DOWN.isDown,
      rudder: Number(right) - Number(left) + this.touch.rudder,
      setThrottle: this.touch.takeThrottle(),
    };
  }

  /**
   * Water fills a square around the Arena, with a ring where the Rim current starts. A ring of space
   * colour covers everything outside the disc, then stars go on the ring and the Edge is stroked on top.
   */
  private drawArena({ arenaRadius: radius, rimCurrentStart }: Config): void {
    this.add.tileSprite(0, 0, radius * 2, radius * 2, 'water');

    const space = this.add.graphics();
    space.lineStyle(RIM_CURRENT_MARKER_WIDTH, RIM_CURRENT_MARKER_COLOUR, 0.7);
    strokeRing(space, radius * rimCurrentStart);

    const outer = radius + SPACE_DEPTH;
    // Overlap the inner rim slightly so the straight segments leave no water showing past the Edge.
    const inner = radius - EDGE_WIDTH / 2;
    space.fillStyle(SPACE_COLOUR);
    for (let i = 0; i < RING_SEGMENTS; i++) {
      const a = (i / RING_SEGMENTS) * Math.PI * 2;
      const b = ((i + 1) / RING_SEGMENTS) * Math.PI * 2;
      const [ix1, iy1, ox1, oy1] = [Math.cos(a) * inner, Math.sin(a) * inner, Math.cos(a) * outer, Math.sin(a) * outer];
      const [ix2, iy2, ox2, oy2] = [Math.cos(b) * inner, Math.sin(b) * inner, Math.cos(b) * outer, Math.sin(b) * outer];
      space.fillTriangle(ix1, iy1, ox1, oy1, ox2, oy2);
      space.fillTriangle(ix1, iy1, ox2, oy2, ix2, iy2);
    }

    const starCount = Math.round(Math.PI * (outer ** 2 - radius ** 2) * STARS_PER_SQUARE_PX);
    for (let i = 0; i < starCount; i++) {
      // Uniform over the ring's area, not bunched at the inner rim.
      const distance = Math.sqrt(radius ** 2 + Math.random() * (outer ** 2 - radius ** 2));
      const angle = Math.random() * Math.PI * 2;
      const size = Math.random() < 0.15 ? 3 : 2;
      space.fillStyle(0xffffff, 0.4 + Math.random() * 0.6);
      space.fillRect(Math.cos(angle) * distance, Math.sin(angle) * distance, size, size);
    }

    space.lineStyle(EDGE_WIDTH, EDGE_COLOUR);
    strokeRing(space, radius);
  }

  private draw(events: WorldEvent[]): void {
    const { player, enemies, arrows, wave, waveStatus, countdown, gold } = readState(this.world);
    this.drawVessel(this.dinghy, player);
    this.overlay.clear();
    this.drawEnemies(enemies, events);
    this.drawArrows(arrows);
    for (const event of events) {
      if (event.type === 'arrowHit') this.flashHit(event.vesselId === player.id ? this.dinghy : this.enemies.get(event.vesselId));
    }
    setText(this.waveLabel, `Wave ${wave}`);
    this.countdownLabel.hidden = waveStatus !== 'countdown';
    setText(this.countdownLabel, `starts in ${Math.ceil(countdown)}`);
    setText(this.healthLabel, `Health ${Math.ceil(player.health)}`);
    setText(this.goldLabel, `Gold ${gold}`);
  }

  /**
   * Adds a sprite for each new enemy, starts the wreck fade for each enemy that sank, plays the fall for
   * each enemy lost over the Edge, and drops the sprite of each wreck that has finished sinking.
   */
  private drawEnemies(enemies: Vessel[], events: WorldEvent[]): void {
    for (const event of events) {
      const sprite = this.enemies.get(event.vesselId);
      if (!sprite) continue;
      if (event.type === 'vesselSunk') this.sink(sprite);
      if (event.type === 'vesselOverEdge') {
        this.enemies.delete(event.vesselId);
        this.fallOffEdge(sprite).once('complete', () => sprite.body.destroy());
      }
    }
    const present = new Set(enemies.map((enemy) => enemy.id));
    for (const [id, sprite] of this.enemies) {
      if (present.has(id)) continue;
      this.enemies.delete(id);
      sprite.body.destroy();
    }
    for (const enemy of enemies) {
      let sprite = this.enemies.get(enemy.id);
      if (!sprite) {
        sprite = this.addVesselSprite(ENEMY_DINGHY_SPRITES[enemy.id % ENEMY_DINGHY_SPRITES.length]);
        const radius = defaultConfig.vesselClasses[enemy.vesselClass].radius * ENEMY_MARK_SCALE;
        sprite.body.addAt(this.add.circle(0, 0, radius, ENEMY_MARK_COLOUR, 0.35).setStrokeStyle(3, ENEMY_MARK_COLOUR), 0);
        this.enemies.set(enemy.id, sprite);
      }
      this.drawVessel(sprite, enemy);
      if (enemy.health > 0) this.drawHealthBar(enemy);
    }
  }

  private addVesselSprite(texture: string): VesselSprite {
    const hull = this.add.image(0, 0, texture).setScale(DINGHY_SCALE);
    const fire = this.add.image(0, 0, 'fire').setScale(FIRE_SCALE).setVisible(false);
    return { body: this.add.container(0, 0, [hull, fire]), hull, fire, sinking: false };
  }

  private drawVessel(sprite: VesselSprite, vessel: Vessel): void {
    sprite.body.setPosition(vessel.x, vessel.y).setRotation(vessel.heading + SPRITE_ROTATION);
    // The flames stay upright on the screen as the hull turns.
    sprite.fire.setVisible(vessel.health < vessel.maxHealth * FIRE_BELOW).setRotation(-sprite.body.rotation);
  }

  private drawHealthBar({ x, y, health, maxHealth }: Vessel): void {
    const left = x - HEALTH_BAR_WIDTH / 2;
    const top = y - HEALTH_BAR_OFFSET;
    this.overlay.fillStyle(HEALTH_BAR_BACK_COLOUR, 0.8).fillRect(left, top, HEALTH_BAR_WIDTH, HEALTH_BAR_HEIGHT);
    this.overlay.fillStyle(HEALTH_BAR_COLOUR).fillRect(left, top, (HEALTH_BAR_WIDTH * health) / maxHealth, HEALTH_BAR_HEIGHT);
  }

  /** Each Arrow is a short line ending at its point. */
  private drawArrows(arrows: Arrow[]): void {
    this.overlay.lineStyle(ARROW_WIDTH, ARROW_COLOUR);
    for (const { x, y, heading } of arrows) {
      this.overlay.lineBetween(x - Math.sin(heading) * ARROW_LENGTH, y + Math.cos(heading) * ARROW_LENGTH, x, y);
    }
  }

  private flashHit(sprite: VesselSprite | undefined): void {
    if (!sprite || sprite.sinking) return;
    sprite.hull.setTint(HIT_TINT);
    this.time.delayedCall(HIT_FLASH_MS, () => {
      if (!sprite.sinking && sprite.hull.active) sprite.hull.clearTint();
    });
  }

  /** The wreck: a dark, burning hull that fades out over the sinking time. */
  private sink(sprite: VesselSprite): Tweens.Tween {
    sprite.sinking = true;
    sprite.hull.setTint(WRECK_TINT);
    sprite.fire.setVisible(true);
    return this.tweens.add({ targets: sprite.body, alpha: 0, duration: defaultConfig.sinkingSeconds * 1000 });
  }

  private fallOffEdge(sprite: VesselSprite): Tweens.Tween {
    return this.tweens.add({
      targets: sprite.body,
      scale: 0,
      alpha: 0,
      angle: '+=720',
      duration: defaultConfig.fallSeconds * 1000,
      ease: 'Quad.easeIn',
    });
  }
}

/**
 * Stores the Score if it beats the stored Best score, and returns the Best score. Without local storage,
 * such as when the browser blocks it, the Best score is only this Run's Score.
 */
function saveBestScore(score: number): number {
  try {
    const best = Number(localStorage.getItem(BEST_SCORE_KEY)) || 0;
    if (score <= best) return best;
    localStorage.setItem(BEST_SCORE_KEY, String(score));
  } catch {
    // A browser that blocks storage still gets a game-over screen.
  }
  return score;
}

/** Writes to the page only when the text changes. */
function setText(element: HTMLElement, text: string): void {
  if (element.textContent !== text) element.textContent = text;
}

/** strokeCircle's default tessellation shows visible corners at the Arena's radius. */
function strokeRing(graphics: GameObjects.Graphics, radius: number): void {
  graphics.beginPath();
  for (let i = 0; i < RING_SEGMENTS; i++) {
    const a = (i / RING_SEGMENTS) * Math.PI * 2;
    graphics.lineTo(Math.cos(a) * radius, Math.sin(a) * radius);
  }
  graphics.closePath();
  graphics.strokePath();
}
