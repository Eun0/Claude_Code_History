import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      // 127.0.0.1 (not localhost) — Node 18+ resolves `localhost` to IPv6
      // (::1) first, which collides with other projects' vites on the same
      // port and routes /api to their HTML instead of our backend.
      '/api': {
        target: 'http://127.0.0.1:5174',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
  },
})
