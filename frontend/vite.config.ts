import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const backendUrl = process.env.VITE_BACKEND_URL ?? 'http://localhost:3000'

const proxyRoutes = ['/auth', '/users', '/orders', '/assign', '/reports', '/health', '/picker-admin', '/packer-admin', '/picker', '/packer']
const proxyConfig = Object.fromEntries(
  proxyRoutes.map((route) => [route, {
    target: backendUrl,
    changeOrigin: true,
    bypass: (req: { headers: { accept?: string } }) => {
      // Browser page navigations (Accept: text/html) → serve the React SPA, not the backend
      if (req.headers.accept?.includes('text/html')) return '/index.html'
    },
  }]),
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
    watch: {
      usePolling: true,
      interval: 300,
    },
  },
})
