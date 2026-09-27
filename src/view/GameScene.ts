import { Scene, type GameObjects } from 'phaser';
import { defaultConfig } from '../core/config';
import { createWorld, readState, step, TICK_SECONDS, type Commands, type World } from '../core/world';
import { installTestHook } from './testHook';

const DINGHY_SCALE = 2;
/** The pack's sprites point their bow down the screen; heading 0 points up. */
const SPRITE_ROTATION = Math.PI;
/** Longest frame we catch up on, so a backgrounded tab doesn't run thousands of ticks. */
const MAX_FRAME_SECONDS = 0.25;
const noCommands: Commands = { throttleUp: false, throttleDown: false, rudder: 0 };

export class GameScene extends Scene {
  private world!: World;
  private dinghy!: GameObjects.Image;
  private accumulator = 0;

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
    const size = defaultConfig.arenaRadius * 2;
    this.add.tileSprite(0, 0, size, size, 'water');
    this.dinghy = this.add.image(0, 0, 'dinghy').setScale(DINGHY_SCALE);
    this.cameras.main.startFollow(this.dinghy);
    this.draw();
    installTestHook(() => readState(this.world));
  }

  update(_time: number, deltaMs: number): void {
    this.accumulator += Math.min(deltaMs / 1000, MAX_FRAME_SECONDS);
    while (this.accumulator >= TICK_SECONDS) {
      this.world = step(this.world, noCommands);
      this.accumulator -= TICK_SECONDS;
    }
    this.draw();
  }

  private draw(): void {
    const { x, y, heading } = readState(this.world).dinghy;
    this.dinghy.setPosition(x, y).setRotation(heading + SPRITE_ROTATION);
  }
}
