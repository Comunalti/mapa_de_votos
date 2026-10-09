import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
export default defineConfig({
  plugins: [react()],
  server: { watch: { ignored: ['**/.artifacts/**', '**/test-results/**', '**/playwright-report/**'] } },
  build: { chunkSizeWarningLimit: 800, rollupOptions: { output: { manualChunks: {

    three: ['three'],
    renderer: ['@react-three/fiber', '@react-three/drei'],
  } } } },
})
