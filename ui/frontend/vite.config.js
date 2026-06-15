import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  plugins: [vue()],
  server: {
    host: '127.0.0.1',
    port: 1420,
    strictPort: true,
    hmr: false
  },
  test: {
    api: false,
    environment: 'jsdom',
    globals: true
  },
  build: {
    rollupOptions: {
      external: ['/aim3d_core.js']
    }
  }
});
