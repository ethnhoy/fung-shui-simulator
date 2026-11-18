import { defineConfig } from 'vitest/config';

// Vite builds and serves the app; Vitest (the test runner) reads the `test` section.
export default defineConfig(({ command, isPreview }) => ({
  // GitHub Pages serves the site from /fung-shui-simulator/ (the repo name), so the production build (and
  // `npm run preview`, which serves that build) need that prefix. The dev server uses "/".
  base: command === 'build' || isPreview ? '/fung-shui-simulator/' : '/',
  test: {
    include: ['tests/**/*.test.ts'],
  },
}));
