import { Server, type Socket } from 'socket.io'
import type { Server as HttpServer } from 'http'
import jwt from 'jsonwebtoken'
import type { JWTPayload } from '@dom/shared'

let io: Server | null = null

export function initSocket(httpServer: HttpServer): Server {
  io = new Server(httpServer, {
    cors: {
      origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
      credentials: true,
    },
  })

  // Auth middleware — verify JWT from cookie
  io.use((socket: Socket, next) => {
    try {
      const cookies = socket.handshake.headers.cookie || ''
      const match = cookies
        .split(';')
        .map((c) => c.trim())
        .find((c) => c.startsWith('access_token='))

      if (!match) return next(new Error('Unauthorized'))

      const token = match.split('=').slice(1).join('=')
      const payload = jwt.verify(
        token,
        process.env.JWT_SECRET || 'change_this_secret',
      ) as JWTPayload

      socket.data.user = payload
      next()
    } catch {
      next(new Error('Unauthorized'))
    }
  })

  io.on('connection', (socket: Socket) => {
    const user = socket.data.user as JWTPayload
    socket.join(`tenant:${user.tenantId}`)
    socket.join(`user:${user.userId}`)
  })

  return io
}

export function getIO(): Server {
  if (!io) throw new Error('Socket.io not initialized — call initSocket() first')
  return io
}
