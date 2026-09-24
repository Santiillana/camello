import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// jeep-sqlite gestiona su propio runtime WASM y no debe ser preempaquetado por Vite.
export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    exclude: ['jeep-sqlite'],
  },
})
