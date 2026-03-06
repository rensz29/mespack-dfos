  import { defineConfig } from 'vite'
  import react from '@vitejs/plugin-react'
  import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: '0.0.0.0',
    port: 5011,
    proxy: {
      // Proxy WebSocket to mespack-server so client works from any IP
      '/ws': {
        target: 'http://127.0.0.1:5012',
        ws: true,
      },
    },
  },
})
