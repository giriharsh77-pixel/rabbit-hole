import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

/**
 * UI-only preview server (`npm run dev:ui`).
 *
 * Serves popup.html / options.html on http://localhost:5199 with an in-page
 * stand-in for the Chrome APIs (src/dev/shim.ts) so the interface can be
 * developed and screenshot-tested in an ordinary browser tab.  The preview
 * shim is compiled out of real extension builds (`__RH_PREVIEW__` is false).
 */
export default defineConfig({
  plugins: [react()],
  define: {
    __RH_DEV__: JSON.stringify(true),
    __RH_PREVIEW__: JSON.stringify(true),
  },
  server: { port: 5199, strictPort: true, host: '127.0.0.1' },
});
