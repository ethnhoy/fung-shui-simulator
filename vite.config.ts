import { defineConfig } from 'vitest/config';

// Vite builds and serves the app; Vitest (the test runner) reads the `test` section.
export default defineConfig(({ command }) => ({
  // GitHub Pages serves the site from /chi-flow/, so production builds need that prefix.
  base: command === 'build' ? '/chi-flow/' : '/',
  test: {
    include: ['tests/**/*.test.ts'],
  },
}));
