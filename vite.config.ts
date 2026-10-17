import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      // error.html is the S3 website "Error document" (served for 404s).
      input: { main: 'index.html', error: 'error.html' },
    },
  },
})
