import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

const fromRoot = (rel: string): string => fileURLToPath(new URL(rel, import.meta.url));

/**
 * Compile-time constants shared by every build target (app, content scripts,
 * tests).  `__RH_DEV__` gates the development-only API keys so that they can
 * never be compiled into a production bundle.
 */
export function buildDefines(mode: string): Record<string, string> {
  return {
    __RH_DEV__: JSON.stringify(mode === 'development'),
    __RH_PREVIEW__: JSON.stringify(false),
  };
}

/**
 * Main app build: popup + options pages and the MV3 service worker.
 * Content scripts are built separately (IIFE bundles) by scripts/build.mjs
 * because content scripts cannot be ES modules.
 */
export default defineConfig(({ mode }) => ({
  base: './',
  plugins: [react()],
  define: buildDefines(mode),
  build: {
    outDir: 'dist',
    emptyOutDir: false, // scripts/build.mjs cleans dist/ once, up front
    target: 'es2022',
    sourcemap: mode === 'development',
    minify: mode !== 'development',
    modulePreload: false,
    chunkSizeWarningLimit: 700,
    rollupOptions: {
      input: {
        popup: fromRoot('popup.html'),
        options: fromRoot('options.html'),
        background: fromRoot('src/background/index.ts'),
      },
      output: {
        entryFileNames: (chunk) =>
          chunk.name === 'background' ? 'background.js' : 'assets/[name]-[hash].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]',
      },
    },
  },
  test: {
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
    environment: 'node',
    globals: false,
    restoreMocks: true,
    unstubGlobals: true,
  },
}));
