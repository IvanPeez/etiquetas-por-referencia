/// <reference types="vitest/config" />
import { defineConfig, type Plugin } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { existsSync, renameSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Renombra `dist/index.html` a `dist/<nombre>` al terminar el build.
 * (Rolldown no permite mutar el objeto bundle en generateBundle.)
 */
function renombrarSalida(nombre: string): Plugin {
  let outDir = 'dist';
  return {
    name: 'renombrar-salida',
    apply: 'build',
    configResolved(config) {
      outDir = resolve(config.root, config.build.outDir);
    },
    closeBundle() {
      const origen = resolve(outDir, 'index.html');
      if (existsSync(origen)) renameSync(origen, resolve(outDir, nombre));
    },
  };
}

export default defineConfig({
  // Rutas relativas: el archivo se abre con file://
  base: './',
  plugins: [viteSingleFile({ removeViteModuleLoader: true }), renombrarSalida('etiquetas.html')],
  build: {
    assetsInlineLimit: Number.MAX_SAFE_INTEGER,
    // Sin polyfill de modulepreload: el archivo único no debe contener ningún fetch.
    modulePreload: { polyfill: false },
    cssCodeSplit: false,
    reportCompressedSize: false,
  },
  test: {
    include: ['tests/**/*.test.ts'],
  },
});
