import { useEffect, useRef } from 'react'
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query'
import type { PerfRole } from '@dom/shared'
import { getLiveWorkers } from '../../api/performance'
import { getSocket } from '../../lib/socket'

/**
 * Live floor for one role (GET /reports/live-workers) — the same engine as the
 * Warehouse Report live board. Polls every 30 s and refetches on
 * `order:stats_changed`, throttled to one refetch per 5 s so a busy floor
 * doesn't hammer the endpoint. Disabled for read-only viewers without access.
 */
export function useLiveWorkers(role: PerfRole, enabled: boolean) {
  const queryClient = useQueryClient()
  const lastInvalidate = useRef(0)

  const query = useQuery({
    queryKey: ['workload', 'live-workers', role],
    queryFn: () => getLiveWorkers(role),
    enabled,
    refetchInterval: 30_000,
    placeholderData: keepPreviousData,
    retry: 1,
  })

  useEffect(() => {
    if (!enabled) return
    const socket = getSocket()
    if (!socket) return
    let timer: ReturnType<typeof setTimeout> | null = null
    const invalidate = () => {
      if (timer) return
      const wait = Math.max(0, 5_000 - (Date.now() - lastInvalidate.current))
      timer = setTimeout(() => {
        timer = null
        lastInvalidate.current = Date.now()
        queryClient.invalidateQueries({ queryKey: ['workload', 'live-workers', role] })
      }, wait)
    }
    socket.on('order:stats_changed', invalidate)
    return () => {
      if (timer) clearTimeout(timer)
      socket.off('order:stats_changed', invalidate)
    }
  }, [enabled, queryClient, role])

  return query
}
