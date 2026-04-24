import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const backend = 'http://localhost:3001';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': backend,
      '/attachments': backend,
      '/telegram': backend,
      '/ws': { target: backend, ws: true, changeOrigin: true },
    },
  },
});
