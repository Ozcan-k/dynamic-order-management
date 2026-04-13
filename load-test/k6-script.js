/**
 * Phase 13 — Load Test: 100 virtual users, 1 minute
 *
 * Prerequisites: Install k6 → https://k6.io/docs/getting-started/installation/
 *
 * Run:
 *   k6 run load-test/k6-script.js
 *
 * Custom credentials / URL:
 *   k6 run -e BASE_URL=http://localhost:3000 -e ADMIN_USER=admin -e ADMIN_PASS=admin123 load-test/k6-script.js
 *
 * Pass thresholds:
 *   http_req_failed < 5%   (error rate)
 *   http_req_duration p95  < 500ms
 */

import http from 'k6/http'
import { check, sleep } from 'k6'

export const options = {
  vus: 100,
  duration: '1m',
  thresholds: {
    http_req_failed:   ['rate<0.05'],  // < 5% errors
    http_req_duration: ['p(95)<500'],  // p95 < 500ms
  },
}

const BASE = __ENV.BASE_URL || 'http://localhost:3000'

// Login once, share cookie across all VUs
export function setup() {
  const res = http.post(
    `${BASE}/auth/login`,
    JSON.stringify({
      username: __ENV.ADMIN_USER || 'admin',
      password: __ENV.ADMIN_PASS || 'admin123',
      deviceType: 'desktop',
    }),
    { headers: { 'Content-Type': 'application/json' } },
  )

  if (res.status !== 200) {
    console.error(`Login failed: ${res.status} — ${res.body}`)
  }

  const cookie = res.cookies.access_token?.[0]?.value ?? ''
  return { cookie }
}

// Endpoints to stress-test (read-only — safe to hammer)
const ENDPOINTS = [
  '/reports/dashboard',
  '/outbound/stats',
  '/outbound/grouped',
  '/outbound/stuck',
  '/picker-admin/orders',
  '/packer-admin/orders',
]

export default function (data) {
  const headers = {
    Cookie: `access_token=${data.cookie}`,
    'Content-Type': 'application/json',
  }

  // Pick a random endpoint each iteration
  const path = ENDPOINTS[Math.floor(Math.random() * ENDPOINTS.length)]
  const res = http.get(`${BASE}${path}`, { headers })

  check(res, {
    'status is 200': (r) => r.status === 200,
    'response time < 500ms': (r) => r.timings.duration < 500,
  })

  sleep(0.5) // 0.5s think-time between requests
}
