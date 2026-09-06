import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  envPrefix: 'SITE_',
  server: {
    port: 5174,
    open: true,
  },
})
