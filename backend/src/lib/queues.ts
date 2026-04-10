import { Queue } from 'bullmq'

const redisConnection = {
  host: process.env.REDIS_HOST || 'localhost',
  port: Number(process.env.REDIS_PORT) || 6379,
  password: process.env.REDIS_PASSWORD || undefined,
}

// Queue: runs slaEscalation on a repeatable schedule (every 15 min)
export const slaEscalationQueue = new Queue('slaEscalation', {
  connection: redisConnection,
})

// Queue: sends D4 alert email when an order hits delay_level 4
export const slaD4EmailQueue = new Queue('slaD4Email', {
  connection: redisConnection,
})

export { redisConnection }
