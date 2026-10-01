import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    setupFiles: ['./test/setup.ts'],
    // Cada teste tem uma base SQLite nova em memória (ver test/setup.ts).
    pool: 'forks',
    testTimeout: 20_000,
  },
})
