import path from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Clean Vite config for the AITOMA CMMS frontend, served alongside the
// Laravel backend (localhost:8000). The SPA talks to the API directly
// over CORS using a Bearer token (no cookies/sessions), so no dev proxy
// is needed — see src/lib/api.js for how central vs. tenant hosts are
// resolved at runtime.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    host: true,
  },
  resolve: {
    extensions: ['.jsx', '.js', '.json'],
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});
