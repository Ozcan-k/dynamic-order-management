import { io, Socket } from 'socket.io-client'

let socket: Socket | null = null

const BACKEND_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000'

export function connectSocket(): Socket {
  if (socket?.connected) return socket

  socket = io(BACKEND_URL, {
    withCredentials: true, // sends the access_token cookie automatically
    autoConnect: true,
  })

  socket.on('connect_error', (err) => {
    console.warn('[socket] connection error:', err.message)
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
