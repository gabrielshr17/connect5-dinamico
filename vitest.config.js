import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    reporters: ['verbose', 'json'],
    outputFile: {
      json: './test-results.json',
    },
    coverage: {
      provider: 'v8',
      reporter: ['html'],
      reportsDirectory: './coverage',
      include: ['js/game.js'],
    },
  },
});
