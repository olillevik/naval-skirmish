/** Must match FRAMES in scripts/render-sprites/render.ts. */
export const FRAMES = 64;

/**
 * The sprite sheet frame that shows a vessel at this heading. Frame 0 points the bow up the screen, and each
 * frame after it turns 1/FRAMES of a turn clockwise, as headings do. Any heading works, including negative ones.
 */
export function frameForHeading(heading: number, frames = FRAMES): number {
  const frame = Math.round((heading / (Math.PI * 2)) * frames) % frames;
  // Adding a full set of frames before the second % also turns a rounded -0 into 0.
  return (frame + frames) % frames;
}
