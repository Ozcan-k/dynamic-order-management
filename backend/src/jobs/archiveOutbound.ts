import { Worker } from 'bullmq'
import { redisConnection } from '../lib/queues'
import { archiveOutboundOrders, archiveOutboundOrdersAllTenants } from '../services/archiveService'

export function startArchiveOutboundWorker() {
  const worker = new Worker(
    'archiveOutbound',
    async (job) => {
      // If job has a tenantId payload, archive only that tenant (manual trigger)
      if (job.data?.tenantId) {
        const { tenantId } = job.data as { tenantId: string }
        const result = await archiveOutboundOrders(tenantId)
        console.log(`[archiveOutbound] Manual trigger: archived ${result.archived} orders for tenant ${tenantId}`)
        return result
      }

      // Otherwise archive all tenants (scheduled run)
      const results = await archiveOutboundOrdersAllTenants()
      const total = results.reduce((sum, r) => sum + r.archived, 0)
      console.log(`[archiveOutbound] Scheduled run: archived ${total} orders across ${results.length} tenants`)
      return { results, total }
    },
    { connection: redisConnection },
  )

  worker.on('failed', (job, err) => {
    console.error(`[archiveOutbound] job ${job?.id} failed:`, err.message)
  })

  return worker
}
