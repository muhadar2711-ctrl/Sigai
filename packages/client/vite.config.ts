import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';

export default defineConfig({
  root: __dirname, // Set the project root to packages/client
  plugins: [
    react(),
    (() => {
      try {
        const tailwind = require('@tailwindcss/vite');
        return tailwind.default ? tailwind.default() : tailwind();
      } catch (e) {
        console.error('Tailwind CSS plugin not found, skipping.');
        return null;
      }
    })(),
  ].filter(Boolean),
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  build: {
    // Output to dist/client relative to the project root
    outDir: '../../dist/client',
    emptyOutDir: true,
    sourcemap: true,
  },
  server: {
    port: 5173, // Default Vite port
    proxy: {
      // Proxy API requests to the backend server
      '/api': {
        target: 'http://localhost:3001', // The backend server port
        changeOrigin: true,
        secure: false,
      },
    },
  },
});
