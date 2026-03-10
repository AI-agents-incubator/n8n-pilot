import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/unit/**/*.test.js'],
    coverage: {
      include: ['lib/**/*.js'],
      reporter: ['text', 'html'],
    },
    setupFiles: ['tests/unit/setup.js'],
  },
});
