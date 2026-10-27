/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  define: {
    __VERCEL_DEPLOYMENT__: JSON.stringify(process.env.VERCEL === '1'),
  },
  // `npm run dev` (UI hot reload) proxies the API and WebSocket to the game server (`npm run server`).
  server: {
    proxy: {
      '/api': 'http://localhost:3000',
      '/ws': { target: 'ws://localhost:3000', ws: true, xfwd: true },
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
