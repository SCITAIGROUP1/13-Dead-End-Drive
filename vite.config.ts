import { defineConfig } from 'vite';
import { resolve } from 'path';
import react from '@vitejs/plugin-react';

export default defineConfig({
  root: '.',
  publicDir: 'public',
  plugins: [react()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: { main: resolve(__dirname, 'index.html') },
    },
  },
  server: {
    port: 5173,
    open: true,
    proxy: {
      '/bot-api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/bot-api/, ''),
      },
      '/lobby-api': {
        target: 'http://localhost:2567',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/lobby-api/, ''),
      },
    },
  },
  preview: {
    port: 4173,
    open: true,
    proxy: {
      '/bot-api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/bot-api/, ''),
      },
      '/lobby-api': {
        target: 'http://localhost:2567',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/lobby-api/, ''),
      },
    },
  },
  resolve: {
    alias: {
      '@data': resolve(__dirname, 'data'),
      '@ded/types': resolve(__dirname, 'packages/types/src'),
      '@ded/engine': resolve(__dirname, 'packages/engine/src'),
      '@ded/network': resolve(__dirname, 'packages/network/src'),
      '@ded/game-logic': resolve(__dirname, 'packages/game-logic/src'),
    },
  },
});
