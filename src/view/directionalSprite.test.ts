import { describe, expect, it } from 'vitest';
import { frameForHeading } from './directionalSprite';

describe('frameForHeading', () => {
  it('shows frame 0 for a bow pointing up the screen', () => {
    expect(frameForHeading(0, 64)).toBe(0);
  });

  it('turns clockwise, a quarter of the frames per quarter turn', () => {
    expect(frameForHeading(Math.PI / 2, 64)).toBe(16);
  });

  it('picks the closest frame', () => {
    expect(frameForHeading((Math.PI * 2 * 10.4) / 64, 64)).toBe(10);
    expect(frameForHeading((Math.PI * 2 * 10.6) / 64, 64)).toBe(11);
  });

  it('wraps headings below 0 and at or above a full turn', () => {
    expect(frameForHeading(-Math.PI / 2, 64)).toBe(48);
    expect(frameForHeading(Math.PI * 2, 64)).toBe(0);
    expect(frameForHeading(Math.PI * 5, 64)).toBe(32);
    expect(frameForHeading((-Math.PI * 2 * 0.2) / 64, 64)).toBe(0);
  });
});
