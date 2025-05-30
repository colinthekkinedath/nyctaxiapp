import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: { 
    proxy: { 
      "/api": {
        target: "http://backend:8000",  // Use the service name from docker-compose
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path.replace(/^\/api/, '/api')
      }
    }
  },
  assetsInclude: ['**/*.geojson'], // treat GeoJSON files as assets
  json: {
    stringify: true // This will ensure JSON/GeoJSON files are properly parsed
  }
})
