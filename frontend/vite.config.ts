import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'fs'
import path from 'path'

const backendUrl = process.env.VITE_BACKEND_URL ?? 'http://localhost:3000'

const proxyRoutes = ['/auth', '/users', '/orders', '/assign', '/reports', '/health', '/picker-admin', '/packer-admin', '/picker', '/packer', '/outbound', '/archive']
const proxyConfig: Record<string, object> = Object.fromEntries(
  proxyRoutes.map((route) => [route, {
    target: backendUrl,
    changeOrigin: true,
    bypass: (req: { headers: { accept?: string } }) => {
      // Browser page navigations (Accept: text/html) → serve the React SPA, not the backend
      if (req.headers.accept?.includes('text/html')) return '/index.html'
    },
  }]),
)

// Proxy socket.io through Vite so it uses the same HTTPS connection (avoids mixed-content block)
proxyConfig['/socket.io'] = {
  target: backendUrl,
  changeOrigin: true,
  ws: true, // enable WebSocket proxying
}

const certPath = path.resolve(__dirname, '../certs/cert.pem')
const keyPath = path.resolve(__dirname, '../certs/key.pem')
const hasCerts = fs.existsSync(certPath) && fs.existsSync(keyPath)

export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    include: ['@dom/shared'],
  },
  server: {
    port: 5173,
    host: '0.0.0.0',
    allowedHosts: ['domwarehouse.com', 'www.domwarehouse.com'],
    https: hasCerts ? { cert: fs.readFileSync(certPath), key: fs.readFileSync(keyPath) } : undefined,
    proxy: proxyConfig,
    watch: {
      usePolling: true,
      interval: 300,
    },
  },
})
