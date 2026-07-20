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
});
