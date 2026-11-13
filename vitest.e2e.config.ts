import { defineConfig } from 'vitest/config';

/** Pruebas e2e: Playwright contra dist/etiquetas.html abierto con file:// (requiere `npm run build`). */
export default defineConfig({
  test: {
    include: ['tests/e2e/**/*.e2e.ts'],
    testTimeout: 30_000,
    hookTimeout: 60_000,
    fileParallelism: false,
  },
});
