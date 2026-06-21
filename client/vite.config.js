import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,        // pin to match the CORS origin on the backend
    strictPort: true,   // fail if 5173 is unavailable instead of silently switching
  },
})
