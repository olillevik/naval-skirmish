import { defineConfig } from 'vitest/config';

export default defineConfig({
  base: '/naval-skirmish/',
  // Phaser alone is about 1.4 MB minified.
  build: { chunkSizeWarningLimit: 2000 },
  test: {
    include: ['src/**/*.test.ts'],
  },
});
