import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const backendUrl = process.env.VITE_BACKEND_URL ?? 'http://localhost:3000'

const proxyRoutes = ['/auth', '/users', '/orders', '/assign', '/reports', '/health']
const proxyConfig = Object.fromEntries(
  proxyRoutes.map((route) => [route, { target: backendUrl, changeOrigin: true }]),
)

export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    include: ['@dom/shared'],
  },
  server: {
    port: 5173,
    host: '0.0.0.0',
    proxy: proxyConfig,
  },
})
