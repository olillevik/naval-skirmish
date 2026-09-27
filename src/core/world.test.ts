import { describe, expect, it } from 'vitest';
import { defaultConfig } from './config';
import { createWorld, readState, step, type Commands } from './world';

const config = { arenaRadius: 1000 };
const noCommands: Commands = { throttleUp: false, throttleDown: false, rudder: 0 };

describe('createWorld', () => {
  it('puts a still Dinghy in the centre of the Arena', () => {
    const { dinghy, run } = readState(createWorld(1, config));

    expect(dinghy).toEqual({ x: 0, y: 0, heading: 0, speed: 0, throttle: 0 });
    expect(run).toBe('sailing');
  });

  it('accepts the default config', () => {
    expect(readState(createWorld(1, defaultConfig)).run).toBe('sailing');
  });
});

describe('step', () => {
  it('leaves a stopped Dinghy in place when given no commands', () => {
    let world = createWorld(1, config);
    for (let i = 0; i < 60; i++) world = step(world, noCommands);

    expect(readState(world).dinghy).toEqual({ x: 0, y: 0, heading: 0, speed: 0, throttle: 0 });
    expect(readState(world).run).toBe('sailing');
  });
});
