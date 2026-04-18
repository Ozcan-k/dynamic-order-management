# Debugging & Solutions Log

This file records bugs encountered in the project and how they were resolved.
When the same issue appears again, check here first.

---

## [2026-04-17] Nightly Report — Sent at 11:30 AM Instead of 11:30 PM (Manila)

### Problem
The nightly report email was arriving around 11:30 AM Philippines time (PHT) instead of the expected 11:30–11:40 PM.

### Root Cause
Two compounding issues:
1. **Stale BullMQ repeatable job in Redis** — an old cron job registered by a previous deployment (e.g. `'30 3 * * *'` UTC = 11:30 AM Manila) was never fully cleared. BullMQ's `getRepeatableJobs()` can miss keys registered by older BullMQ versions or with a different key format, so the ghost job kept firing.
2. **UTC-converted cron patterns** — using UTC-equivalent times (`'30 15 * * *'`) is error-prone and breaks if the server timezone changes.

### Fix
1. **Explicit Manila timezone** — cron patterns now use `tz: 'Asia/Manila'` with local Manila times directly. No UTC math required, timezone-proof:
   ```ts
   repeat: { pattern: '30 23 * * *', tz: 'Asia/Manila' }  // archive 23:30 PHT
   repeat: { pattern: '40 23 * * *', tz: 'Asia/Manila' }  // report  23:40 PHT
   ```
2. **Redis SCAN+DEL sweep** — alongside `getRepeatableJobs()`, a direct Redis scan clears any leftover `bull:{queue}:repeat:*` keys that the BullMQ API may not list:
   ```ts
   const [next, keys] = await redis.scan(cursor, 'MATCH', `bull:${queueName}:repeat:*`, 'COUNT', '100')
   if (keys.length > 0) await redis.del(...keys)
   ```

### Rule
- **Always use `tz: 'Asia/Manila'`** when defining cron schedules — never convert to UTC manually.
- When changing a cron schedule, the Redis sweep ensures no ghost jobs survive across deployments.

### Files Affected
- `backend/src/index.ts` — `clearQueue()` helper + `tz: 'Asia/Manila'` on both cron registrations

---

## [2026-04-17] Deleted Users Still Appear on Picker/Packer Admin Pages

### Problem
Users deleted from Settings remained visible in the PickerAdmin and PackerAdmin pages.

### Root Cause
`DELETE /users/:id` is a **soft delete** — it sets `isActive = false`, it does not remove the record. `getPickerStats()` and `getPackerStats()` queried users without an `isActive` filter, so inactive users were included.

`getPickers()` and `getPackers()` already had `isActive: true` — only the stats functions were missing it.

### Fix
Added `isActive: true` to both stats queries:
```ts
// pickerAdminService.ts — getPickerStats()
where: { tenantId, role: UserRole.PICKER, isActive: true }

// packerAdminService.ts — getPackerStats()
where: { tenantId, role: UserRole.PACKER, isActive: true }
```

### Rule
User deletion in this project is **soft delete** (`isActive = false`). Every Prisma query that returns a user list **must** include `isActive: true`. Never omit this filter when writing new user-list queries.

### Files Affected
- `backend/src/services/pickerAdminService.ts` — `getPickerStats()`
- `backend/src/services/packerAdminService.ts` — `getPackerStats()`

---

## [2026-04-17] Deleted Users Still Visible in Workload Section After Deletion (Cache Not Cleared)

### Problem
After deleting a picker or packer from Settings, the deleted user continued to appear in the PickerAdmin assignment dropdown and workload stats — even though the backend filter (`isActive: true`) was correct.

### Root Cause (Three Layers — discovered progressively)

1. **Missing stats cache update**: `deleteMutation.onSuccess` only refreshed `['users']`, not `['picker-admin-stats']` / `['packer-admin-stats']`.
2. **Wrong invalidation method**: `invalidateQueries` marks cache as stale but serves old data on next mount (stale-while-revalidate). `removeQueries` wipes cache entirely → no flash.
3. **Missing dropdown cache**: `['picker-admin-pickers']` (the picker assignment dropdown query) was NEVER cleared on delete — this was the root cause of the persistent bug. Deleted pickers kept appearing in the "assign to picker" dropdown even after stats were fixed.

### Fix
All four caches must be cleared in `deleteMutation.onSuccess` in `Settings.tsx`:
```ts
queryClient.invalidateQueries({ queryKey: ['users'] })             // same-page list: invalidate OK
queryClient.removeQueries({ queryKey: ['picker-admin-stats'] })    // workload stats cards
queryClient.removeQueries({ queryKey: ['picker-admin-pickers'] })  // ← THE REAL FIX: assignment dropdown
queryClient.removeQueries({ queryKey: ['packer-admin-stats'] })    // packer workload stats
```

### Rule
When deleting a user, trace ALL query keys that display that user — not just the obvious ones. A user can appear in: (a) their own list, (b) stats cards, AND (c) assignment dropdowns. Each is a separate query key that must be cleared.

Use `removeQueries` (not `invalidateQueries`) for cross-page caches: removes data entirely so no stale flash occurs on next mount.

### Files Affected
- `frontend/src/pages/Settings.tsx` — `deleteMutation.onSuccess`

---

## [2026-04-17] Packer Scan — Final Fix Summary

The "not found" scan issue was resolved across multiple steps. All steps work together:

| Step | File | What it does |
|---|---|---|
| 1 | `packerService.ts` | `buildCandidates()` — tries all URL query params + path segments |
| 2 | `packerService.ts` | Bidirectional SQL substring fallback |
| 3 | `packer.ts` route | `GET /packer/orders` returns real PICKER_COMPLETE list |
| 4 | `PackerMobile.tsx` | Client-side queue match — compares scan against known queue before hitting API |
| 5 | `PackerMobile.tsx` | Debug card — shows Scanned vs Queue values on failure |

---

## [2026-04-17] Packer Scan — "Not Found" Error (URL Barcode Format Mismatch)

### Problem
Packer got "Order not found in this tenant" when scanning a barcode.

### Root Cause
**Two different barcode formats colliding:**
- Inbound admin enters a plain tracking number → stored in DB as `JT1234567890`
- Packer camera reads a QR code that encodes a full URL (e.g. `https://track.jtexpress.ph/tracking?logisticNo=JT1234567890`)

The old `extractTrackingNumber` only checked `?tn=` and `?tracking=` query params. Carriers like J&T, Shopee, etc. use different param names (`logisticNo`, `billCode`, `no`). When no matching param was found, it fell back to the last URL path segment — returning `TRACKING` instead of the actual tracking number.

### Fix (3 layers)

**1. Frontend — improved `extractTrackingNumber` (`PackerMobile.tsx`):**
- Tries every URL query param using an alphanumeric heuristic (`[A-Z0-9]{6,40}`)
- Applies same heuristic to URL path segments in reverse order
- Sends raw barcode value as `raw` param to backend

**2. Backend — `buildCandidates()` (`packerService.ts`):**
- Builds a deduplicated candidate list from extracted `tn` + raw barcode
- If raw is a URL: all query param values + all path segments are added as candidates
- Each candidate is tried for exact match in sequence

**3. Backend — Bidirectional substring fallback (raw SQL):**
```sql
AND (
  ${candidate} ILIKE '%' || tracking_number || '%'
  OR tracking_number ILIKE '%' || ${candidate} || '%'
)
```
Handles: URL barcode contains DB tracking number, or DB has longer format than what was scanned.

**Error message improvement:**
Shows `extracted: "XYZ" | raw: "https://..."` when values differ — format mismatch is immediately visible.

### Files Affected
- `frontend/src/pages/PackerMobile.tsx` — `extractTrackingNumber`, `handleScan`, `?raw=` param
- `backend/src/services/packerService.ts` — `buildCandidates()`, `findOrderForPacking()`, `diagnoseTracking()`
- `backend/src/routes/packer.ts` — accepts `raw` query param, passes to both service functions

### Rule
When working on packer scan: always check how inbound stores tracking numbers (plain text vs URL) and what barcode type the packer reads. Never assume a single format — always use bidirectional search + multi-candidate approach.

---

## [2026-04-17] Packer Scan — Client-Side Queue Match (Backend Search Bypass)

### Problem
Even after the backend multi-strategy search, scanning still returned "not found". The queue showed 2 orders but no search strategy matched.

### Root Cause
Relying solely on the backend was insufficient: deployment delays, SQL enum cast issues, or a completely different barcode format could cause all server-side searches to fail.

### Fix
Added client-side queue match in `handleScan` — runs before the API call:

```ts
const queue = queueData?.orders ?? []
const clientMatch = queue.find(order => {
  const dbTn = order.trackingNumber.toUpperCase()
  return (
    dbTn === tnUp ||
    dbTn === rawUp ||
    rawUp.includes(dbTn) ||   // barcode URL contains tracking number
    dbTn.includes(tnUp) ||    // DB has longer format, scan has shorter
    tnUp.includes(dbTn)       // scan has longer format, DB has shorter
  )
})
if (clientMatch) { setPendingOrder(clientMatch); return }
```

Error message also shows `queue: [tn1, tn2]` — scan value and DB values visible side by side, format mismatch detected instantly.

### Rule
- Even if backend search fails, always do client-side bidirectional match against the local queue cache
- Always show both the scanned value and queue tracking numbers in the error message
- `GET /packer/orders` must always return real PICKER_COMPLETE orders (never an empty array)

### Files Affected
- `frontend/src/pages/PackerMobile.tsx` — `handleScan` client-side match + queue hint in error
- `backend/src/routes/packer.ts` — `/orders` endpoint returns real queue

---

## [2026-04-17] Packer Scan — Debug Card (Scanned vs Queue Visualization)

### Problem
Client-side match also failed — there was no common substring between the scanned value and the queue tracking numbers. The cause was not visible.

### Fix
A yellow debug card appears after a failed scan showing:
- `Scanned:` — extracted tracking number
- `Raw:` — raw barcode value (full URL if applicable)
- `Queue:` — DB PICKER_COMPLETE tracking numbers line by line

This card made the format mismatch immediately visible. Once the mismatch was diagnosed and the client-side match corrected, scanning worked.

### Rule
For packer scan issues: activate the debug card first, compare Scanned vs Queue values.

### Files Affected
- `frontend/src/pages/PackerMobile.tsx` — `debugInfo` state + yellow debug card UI

---

## [2026-04-14] Packer Mobile — List Was Full, Should Be Empty

### Problem
When logged in as `PACKER`, the mobile page listed all tenant's `PICKER_COMPLETE` orders. Expected behavior: empty list — packer self-assigns by scanning.

### Root Cause
`GET /packer/orders` returned all `PICKER_COMPLETE` orders via `getAllPickerCompleteOrders(tenantId)`. No per-user filtering.

### Fix
1. `GET /packer/orders` → returns actual PICKER_COMPLETE queue (later changed from always-empty)
2. New endpoint: `GET /packer/find?tn=TRACKING_NUMBER` — looks up a PICKER_COMPLETE order by tracking number
3. `PackerMobile.tsx` updated: list query removed, scan triggers `/packer/find`, confirm dialog shows order details, confirm → `/packer/complete`

### Files Affected
- `backend/src/services/packerService.ts` — `findOrderForPacking()` added
- `backend/src/routes/packer.ts` — `/find` endpoint added
- `frontend/src/pages/PackerMobile.tsx` — list query removed, `handleScan` does API lookup

---

## [2026-04-14] Picker/Packer Mobile — Camera Scan Feature Added

### Change
`enableCamera` prop added to `ScanInput`. When active, shows a camera button that reads barcodes via `@zxing/browser`.

### Files Affected
- `frontend/src/components/ScanInput.tsx` — camera button + overlay + BrowserMultiFormatReader
- `frontend/src/pages/PickerMobile.tsx` — `enableCamera` prop enabled
- `frontend/src/pages/PackerMobile.tsx` — `enableCamera` prop enabled

---

## [2026-04-14] InboundScan + PickerAdminScan — Sign Out Button Added

### Change
Sign Out button added to the top-right corner of both scan pages.

### Files Affected
- `frontend/src/pages/InboundScan.tsx`
- `frontend/src/pages/PickerAdminScan.tsx`

---

## [2026-04-13] Philippines Inbound Panel — Scan Pop-up Not Appearing (WebSocket Nginx Fix)

### Problem
INBOUND_ADMIN scanning a waybill on mobile did not trigger a pop-up on the desktop Inbound panel. Same flow worked in Canada. Both devices on the same WiFi.

### Root Cause
**Missing `/socket.io/` location block in Nginx.**

Pop-up flow:
1. Phone → `POST /api/orders/handheld-scan` → Backend
2. Backend → `io.to('user:X').emit('order:handheld-scan', ...)` → Socket
3. Desktop → `wss://domwarehouse.com/socket.io` → WebSocket → Pop-up

Desktop connects to Nginx at `https://domwarehouse.com`. Nginx only proxied `/api/` to the backend. Without a `/socket.io/` location block, the WebSocket connection was never established — desktop could not join the `user:X` room — no pop-up.

In Canada, HTTP IP (`http://45.32.107.63:5173`) was used, bypassing Nginx and hitting Vite's dev server proxy directly (`ws: true`), so WebSocket worked.

### Fix

**1. Add `/socket.io/` location block to Nginx:**

```bash
sudo nano /etc/nginx/sites-available/dom
```

Add to the HTTPS server block:

```nginx
location /socket.io/ {
    proxy_pass http://localhost:3000;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_read_timeout 86400s;
    proxy_send_timeout 86400s;
}
```

```bash
sudo nginx -t && sudo systemctl reload nginx
```

**2. Check `CORS_ORIGIN` env var:**

```bash
docker exec dom_backend printenv CORS_ORIGIN
```

If `https://domwarehouse.com` is missing, add to `/opt/dom/.env`:

```
CORS_ORIGIN=https://domwarehouse.com,https://www.domwarehouse.com
```

```bash
docker compose -f /opt/dom/docker-compose.yml restart backend
```

**3. `vite.config.ts` — permanent `allowedHosts` fix:**

```typescript
server: {
  allowedHosts: ['domwarehouse.com', 'www.domwarehouse.com'],
}
```

---

## [2026-04-11] Modal / Fixed Overlay Not Rendering

### Problem
A `position: fixed` overlay/modal component renders but is not visible.

### Root Cause
If any parent element has `transform`, `filter`, `will-change`, or `perspective` CSS properties, `position: fixed` children are contained within that element instead of the viewport. Also, `overflow: hidden` on a parent can clip fixed children.

### Fix
Use `createPortal` to render the modal directly under `document.body`:

```tsx
import { createPortal } from 'react-dom'

export default function Modal({ onClose }: Props) {
  const modal = (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9999 }}>
      {/* modal content */}
    </div>
  )
  return createPortal(modal, document.body)
}
```

### Used In This Project
- `frontend/src/components/BulkScanModal.tsx`

---

## [2026-04-11] White Page (React Crash)

### Problem
App opens but shows a completely white page.

### Possible Causes & Checks

**1. Vite cache issue**
```bash
rm -rf frontend/node_modules/.vite
cd frontend && npx vite --force
```

**2. Multiple Vite processes running**
```bash
npx kill-port 5173 5174 5175 3000
taskkill /F /IM node.exe   # Windows
```

**3. Stale browser cache**
Hard refresh with `Ctrl+Shift+R`.

**4. Temporary error handler to capture runtime errors**
Add to `main.tsx`, note the error, then remove:
```tsx
window.addEventListener('error', (e) => {
  document.getElementById('root')!.innerHTML =
    `<pre style="color:red;padding:20px">[Error] ${e.message}\n${e.filename}:${e.lineno}</pre>`
})
```

**5. Shared package not built**
If `@dom/shared` was updated, always rebuild:
```bash
cd shared && npm run build
```
Then clear Vite cache (Vite caches the old dist):
```bash
rm -rf frontend/node_modules/.vite
```

---

## [2026-04-11] Shared Package — Adding a New Export

### Problem
New export added to `shared/src/index.ts` but backend or frontend can't find it.

### Fix (in order)
```bash
# 1. Build shared package
cd shared && npm run build

# 2. Prisma generate if schema changed
cd backend && npx prisma db push && npx prisma generate

# 3. Clear frontend Vite cache
rm -rf frontend/node_modules/.vite

# 4. Restart services
cd backend && npm run dev
cd frontend && npx vite
```

---

## [2026-04-11] Docker — Shared Export Not Found (SyntaxError: does not provide an export named 'X')

### Problem
New export added to `@dom/shared`. Works locally but Docker shows white page + error:
```
SyntaxError: The requested module '/node_modules/.vite/deps/@dom_shared.js?v=...'
does not provide an export named 'CARRIER_LABELS'
```

### Root Cause
The Docker image build compiled `shared/dist`. The new export was added locally and rebuilt, but the container's `node_modules/@dom/shared/dist/` still has the old version. Vite cached the old dist.

**Note:** Vite cache in Docker is at `/app/frontend/node_modules/.vite/` — not `/app/node_modules/.vite/`.

### Fix
```bash
# 1. Rebuild shared inside container
docker exec dom_frontend sh -c "cd /app && npm run build --workspace=shared"

# 2. Clear correct Vite cache
docker exec dom_frontend sh -c "rm -rf /app/frontend/node_modules/.vite/deps"

# 3. Restart frontend container
docker restart dom_frontend

# 4. Hard refresh browser
# Ctrl+Shift+R
```

### Permanent Fix
After changing `shared/src`, rebuild the Docker image:
```bash
docker compose build frontend && docker compose up -d frontend
```

---

## [2026-04-11] Docker — Backend Route / Prisma Client Stale

### Problem
New route or Prisma schema field added to backend. Works locally but Docker returns 404 or "Unknown argument".

### Root Cause
Docker container can have stale code in three layers:
1. `backend/dist/` — TypeScript not recompiled, old JS running
2. `node_modules/@prisma/client` — `prisma generate` not run
3. `node_modules/@dom/shared/dist/` — shared package not updated

### Fix (in order)
```bash
# 1. Build shared locally
cd shared && npm run build

# 2. Copy shared dist into container
docker cp shared/dist/. dom_backend:/app/node_modules/@dom/shared/dist/

# 3. Compile backend locally
cd backend && npm run build

# 4. Copy new dist into container
docker cp backend/dist/. dom_backend:/app/backend/dist/

# 5. Regenerate Prisma client if schema changed
docker cp backend/prisma/schema.prisma dom_backend:/app/backend/prisma/schema.prisma
docker exec dom_backend sh -c "cd /app/backend && npx prisma generate"

# 6. Restart backend
docker compose restart backend
```

### Permanent Fix
After every backend change:
```bash
cd backend && npm run build
docker cp backend/dist/. dom_backend:/app/backend/dist/
docker compose restart backend
```

---

## [2026-04-11] Rate Limiter Triggered — Page Won't Load (429)

### Problem
Backend returns `Too many requests. Please slow down.` for all requests. Orders, stats, and other data fail to load.

### Root Cause
Two compounding issues:
1. **Bulk action `Promise.all`**: All selected orders fired N simultaneous requests. 50 orders = 50 concurrent requests → rate limit exceeded.
2. **Aggressive polling**: Each page polled multiple endpoints every 3–5 seconds. With multiple tabs/users, this multiplied fast (3 tabs × 3 queries × 12/min = 108 req/min → exceeded limit of 100).

### Fix (3 layers)

**1. Backend: Single bulk endpoint**
```
POST /picker-admin/bulk-complete   { orderIds[], pickerId }
POST /picker-admin/bulk-unassign   { orderIds[], pickerId }
```
Backend processes sequentially in a for-loop — one HTTP request for N operations.

**2. Backend: Rate limit raised**
`backend/src/plugins/rateLimit.ts` → `max: 100` → `max: 500`

**3. Frontend: Polling interval extended**
All `refetchInterval: 3000 / 5000` → `10_000` ms. Socket handles real-time updates; polling is just a fallback — 10s is sufficient.

### Files Affected
- `backend/src/services/pickerAdminService.ts` — `bulkCompleteOrders`, `bulkUnassignOrders`
- `backend/src/routes/pickerAdmin.ts` — `/bulk-complete`, `/bulk-unassign`
- `backend/src/plugins/rateLimit.ts` — max: 500
- `frontend/src/pages/PickerAdmin.tsx` — `executeBulkAction` single API call
- `frontend/src/pages/Inbound.tsx`, `Outbound.tsx`, `PackerAdmin.tsx` — polling 10s

---

## [2026-04-11] `docker cp` Followed by Backend Crash Loop (exit code 0)

### Problem
Updated dist files with `docker cp backend/dist/... dom_backend:/app/...`. Then ran `docker compose up -d backend` — container entered a constant restart loop (exit code 0).

### Root Cause
`docker compose up` recreates the container from the image — changes made via `docker cp` are lost. A missing JS file at runtime can cause a silent exit instead of a visible error.

### Fix
Always **rebuild the image** when backend code changes:
```bash
docker compose build backend
docker compose up -d backend
```

`docker compose restart` restarts the existing container (cp changes preserved).
`docker compose up` creates a new container (cp changes lost) — be careful.

---

## [2026-04-13] Vultr Server — Domain + HTTPS + iPhone Camera Setup

### Problem
- iPhone Safari does not allow camera access over `http://`
- App was running at `http://45.32.107.63:5173`, camera wouldn't open on iPhone

### Fix

#### 1. Buy Domain (Namecheap)
- Purchase domain (e.g. `domwarehouse.com`)
- **Advanced DNS** → **Host Records** → add two A Records:
  - `@` → `45.32.107.63`
  - `www` → `45.32.107.63`
- DNS propagation takes 10–30 min, verify with `nslookup domwarehouse.com 8.8.8.8`

#### 2. Install Nginx + Certbot
```bash
sudo apt update && sudo apt install nginx -y
sudo apt install certbot python3-certbot-nginx -y
```

#### 3. Write Nginx Config
```bash
sudo tee /etc/nginx/sites-available/dom << 'EOF'
server {
    listen 80;
    server_name domwarehouse.com www.domwarehouse.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl;
    server_name domwarehouse.com www.domwarehouse.com;

    ssl_certificate /etc/letsencrypt/live/domwarehouse.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/domwarehouse.com/privkey.pem;

    location / {
        proxy_pass http://localhost:5173;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
    }

    location /api/ {
        proxy_pass http://localhost:3000/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
    }

    location /socket.io/ {
        proxy_pass http://localhost:3000/socket.io/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
    }
}
EOF

sudo ln -s /etc/nginx/sites-available/dom /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

#### 4. Open Firewall Ports (IMPORTANT)
```bash
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw allow 22/tcp
sudo ufw reload
```

#### 5. Obtain SSL Certificate
```bash
sudo certbot --nginx -d domwarehouse.com -d www.domwarehouse.com
```

#### 6. Vite `allowedHosts` Setting (IMPORTANT)
```ts
server: {
  allowedHosts: ['domwarehouse.com', 'www.domwarehouse.com'],
}
```

### Common Errors

| Error | Cause | Fix |
|---|---|---|
| `certbot: connection refused` | UFW port 80 closed | `sudo ufw allow 80/tcp && sudo ufw reload` |
| `certbot: NXDOMAIN` | DNS not propagated yet | Wait 10–30 min, check with `nslookup` |
| `Blocked request. This host not allowed` | Vite allowedHosts missing | Add domain to vite.config.ts, restart container |
| `403 Forbidden` | Nginx default config conflict | `sudo rm /etc/nginx/sites-enabled/default` |
| `This site can't be reached` | UFW port 443 closed | `sudo ufw allow 443/tcp && sudo ufw reload` |

### Mobile URL (All Roles)
```
https://domwarehouse.com/scan
```

| Role | Redirected Page |
|---|---|
| ADMIN / INBOUND_ADMIN | `/inbound-scan` |
| PICKER_ADMIN | `/picker-admin-scan` |
| PICKER | `/picker` |
| PACKER | `/packer` |

---

## [2026-04-11] Handheld Socket Event Lost — Page Closed When Send Is Pressed

### Problem
When phone (InboundScan / PickerAdminScan) sends "Send to Desktop", backend emits a socket event. If the desktop Inbound/PickerAdmin page is not open at that moment, the event is lost — nothing happens when the page opens later.

### Root Cause
Socket events are fire-and-forget. If the listener is not connected at that moment, the event is dropped — it is not queued.

### Fix
Two-layer approach:

**1. Backend — write to Redis (TTL 5 min):**
- `POST /orders/handheld-scan` → `redis.setex('pending:handheld:single:{userId}', 300, tn)`
- `POST /orders/handheld-bulk-scan` → `redis.setex('pending:handheld:bulk:{userId}', 300, JSON.stringify(tns))`
- New GET endpoints: `/orders/pending-handheld` and `/picker-admin/pending-staged`

**2. Frontend — check Redis on page mount:**
```tsx
useEffect(() => {
  api.get('/orders/pending-handheld').then(res => {
    if (res.data.bulk?.length > 0) { setBulkInitialTNs(res.data.bulk); setShowBulkModal(true) }
    else if (res.data.single) { setPendingScan(res.data.single) }
  }).catch(() => {})
}, [])
```

When the socket event arrives, Redis is cleared first to prevent double display.

### Files Affected
- `backend/src/routes/orders.ts` — Redis write + `GET /pending-handheld`
- `backend/src/routes/pickerAdmin.ts` — Redis write + `GET /pending-staged`
- `frontend/src/pages/Inbound.tsx` — mount effect
- `frontend/src/pages/PickerAdmin.tsx` — mount effect

---

## [2026-04-11] Inbound — Duplicate Waybill Opens QuickScanModal

### Problem
Scanning a waybill already in the inbound list opened the QuickScanModal. User selected carrier/shop and hit Confirm, then got a 409 from the backend. Unnecessary UX step.

### Fix
Check `allOrders` list before opening the modal:
```tsx
<ScanInput
  onScan={(tn) => {
    const exists = allOrders.some(o => o.trackingNumber.toUpperCase() === tn.trim().toUpperCase())
    if (exists) { setScanFeedback({ type: 'error', message: `Already in inbound list: ${tn}` }); return }
    setPendingScan(tn)
  }}
/>
```
Backend 409 stays as a safety net for edge cases.

### Files Affected
- `frontend/src/pages/Inbound.tsx`

---

## [2026-04-11] PickerAdminScan Bulk — Non-Existent Waybill Added to List

### Problem
In bulk mode, a scanned waybill was added to the list immediately. On "Send", backend returned not_found. User didn't realize the wrong item was added.

### Fix
In bulk mode, each scan immediately calls `/picker-admin/scan`:
- Success → add to list with `status: staged`
- Error (404/409) → beep + vibrate + error message, **not added to list**

### Files Affected
- `frontend/src/pages/PickerAdminScan.tsx`

---

## [2026-04-11] Bulk Scan — Carrier and Shop Name Required

### Behavior
- Carrier and Shop Name are both **required** (not optional)
- If either is empty after scanning, a yellow warning message is shown
- Confirm button stays disabled until both are filled
- Backend validates with `z.string().min(1)` → returns 400

### Files Affected
- `frontend/src/components/BulkScanModal.tsx` — `canConfirm` condition, label, warning message
- `backend/src/routes/orders.ts` — `BulkScanSchema.shopName` no longer optional

---

## General Rules

- Always use `createPortal(modal, document.body)` for modal/overlay components
- Always run `npm run build` in `shared/` after any update to `@dom/shared`
- Multiple Vite processes running can cause white page or stale code
- Run `npx tsc --noEmit` after every change
- For backend Docker changes: `docker compose build backend && docker compose up -d backend`
- Never use `Promise.all(allIDs)` for bulk API operations — add a single bulk endpoint on the backend
- Frontend polling: if socket handles real-time updates, `refetchInterval` should be at least `10_000` ms
- All user-list Prisma queries must include `isActive: true` — user deletion is soft delete
- All cron schedules must use `tz: 'Asia/Manila'` with local Manila time — never convert to UTC manually
