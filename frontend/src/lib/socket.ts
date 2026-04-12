import { io, Socket } from 'socket.io-client'

let socket: Socket | null = null

export function connectSocket(): Socket {
  if (socket?.connected) return socket

  // Connect to current origin — socket.io goes through the Vite HTTPS proxy (/socket.io)
  // This avoids mixed-content blocks (HTTPS page → ws:// direct backend)
  socket = io('', {
    withCredentials: true,
    autoConnect: true,
  })

  socket.on('connect', () => {
    console.log('[socket] connected, id:', socket?.id)
  })
  socket.on('connect_error', (err) => {
    console.warn('[socket] connection error:', err.message)
  })
  socket.on('disconnect', (reason) => {
    console.warn('[socket] disconnected:', reason)
  })

  return socket
}

export function disconnectSocket() {
  if (socket) {
    socket.disconnect()
    socket = null
  }
}

export function getSocket(): Socket | null {
  return socket
}
