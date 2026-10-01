import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    setupFiles: ['./test/setup.ts'],
    // Cada ficheiro de teste tem a sua base PGlite em memória.
    pool: 'forks',
    testTimeout: 20_000,
  },
})
