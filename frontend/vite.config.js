import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  define: {
    // Baked in at build time (not runtime "now") — shown as a "Latest
    // deploy" footer so it's obvious in prod whether a change actually
    // shipped, without needing to check the Pages dashboard.
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
  },
  build: {
    rollupOptions: {
      output: {
        // Default chunking splits every src/lib and src/context module that's shared between the
        // eager Landing bundle and a lazy page into its OWN tiny chunk (measured: ~20 separate
        // requests, many under 1KB, just to render Landing) — each one is a real network round
        // trip on the deployed site, and every page navigation that touches a not-yet-loaded lib
        // module pays for another. None of these files are large or independently cacheable in a
        // way that benefits from staying split (they all change together on every deploy anyway,
        // same as the rest of the app), so folding them into one "shared" chunk trades zero bytes
        // for far fewer requests — the dominant cost on a real network, not the byte count.
        manualChunks(id) {
          if (id.includes('/src/lib/') || id.includes('/src/context/')) return 'shared';
        },
      },
    },
  },
});
