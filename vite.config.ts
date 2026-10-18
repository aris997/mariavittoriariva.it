import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      // error.html is CloudFront's custom error page (403/404 from the private bucket).
      input: { main: 'index.html', error: 'error.html' },
    },
  },
})
