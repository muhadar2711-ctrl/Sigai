import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';

// Attempt to import tailwindcss vite plugin, fallback if not available
let tailwindPlugin;
try {
  // @ts-ignore
  import tailwindcss from '@tailwindcss/vite';
  tailwindPlugin = tailwindcss;
} catch (e) {
  tailwindPlugin = null;
}

export default defineConfig(() => {
  const plugins = [react()];
  if (tailwindPlugin) {
    plugins.push(tailwindPlugin());
  }

  return {
    plugins,
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    build: {
      target: 'esnext',
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});