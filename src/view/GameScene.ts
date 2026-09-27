import { Scene, type GameObjects, type Input, type Tweens } from 'phaser';
import { defaultConfig } from '../core/config';
import { createWorld, readState, step, TICK_SECONDS, type Commands, type Config, type World } from '../core/world';
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

type Keys = Record<'W' | 'A' | 'S' | 'D' | 'UP' | 'DOWN' | 'LEFT' | 'RIGHT', Input.Keyboard.Key>;

export class GameScene extends Scene {
  private world!: World;
  private dinghy!: GameObjects.Image;
  private keys!: Keys;
  private touch = new TouchControls();
  private accumulator = 0;
  private fall?: Tweens.Tween;
  private edgeWarning = document.getElementById('edge-warning')!;
  private gameOverScreen = document.getElementById('game-over')!;
  /** False while a screen such as the start screen is showing, so the world doesn't tick. */
  private running = false;

  constructor() {
    super('game');
  }

  preload(): void {
    const base = import.meta.env.BASE_URL;
    this.load.image('dinghy', `${base}assets/dinghySmall1.png`);
    this.load.image('water', `${base}assets/tile_73.png`);
  }

  create(): void {
    this.world = createWorld(Date.now(), defaultConfig);
    this.drawArena(defaultConfig);
    this.dinghy = this.add.image(0, 0, 'dinghy').setScale(DINGHY_SCALE);
    this.cameras.main.startFollow(this.dinghy);
    this.keys = this.input.keyboard!.addKeys('W,A,S,D,UP,DOWN,LEFT,RIGHT') as Keys;
    this.draw();
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
    if (this.accumulator >= TICK_SECONDS) {
      const commands = this.readCommands();
      while (this.accumulator >= TICK_SECONDS) {
        this.world = step(this.world, commands);
        this.accumulator -= TICK_SECONDS;
      }
    }

    const { run, pastPointOfNoReturn, dinghy } = readState(this.world);
    this.edgeWarning.hidden = !pastPointOfNoReturn || run === 'ended';
    this.touch.showThrottle(dinghy.throttle);
    // Once the Dinghy has crossed the Edge, the fall animation owns its scale, alpha and rotation.
    if (!this.fall) this.draw();
    if (run !== 'sailing' && !this.fall) {
      this.fall = this.tweens.add({
        targets: this.dinghy,
        scale: 0,
        alpha: 0,
        angle: '+=720',
        duration: defaultConfig.fallSeconds * 1000,
        ease: 'Quad.easeIn',
      });
    }
    if (run === 'ended') {
      this.running = false;
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
    this.dinghy.setScale(DINGHY_SCALE).setAlpha(1);
    this.draw();
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

  private draw(): void {
    const { x, y, heading } = readState(this.world).dinghy;
    this.dinghy.setPosition(x, y).setRotation(heading + SPRITE_ROTATION);
  }
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
