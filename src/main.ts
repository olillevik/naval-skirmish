import { AUTO, Game, Scale } from 'phaser';
import { GameScene } from './view/GameScene';

new Game({
  type: AUTO,
  backgroundColor: '#0b0e1f',
  scale: { mode: Scale.RESIZE, width: window.innerWidth, height: window.innerHeight },
  scene: [GameScene],
});
