# Debugging & Solutions Log

This file records bugs encountered in the project and how they were resolved.
When the same issue appears again, check here first.

---

## ⏳ PENDING MERGE — v2.29.0 Packer Pre-assignment Workflow

**Status:** code complete on `test` branch, awaiting user merge approval to `main`.
User explicitly said merge will happen later: *"marge daha sonra yapacagiz."*

### What's pending

| | Value |
|---|---|
| Branch | `test` at `35bda7f` |
| Tag on test | `v2.29.0-test` (SHA `35bda7f`) |
| Plan file | `C:\Users\okili\.claude\plans\goofy-snacking-iverson.md` |
| Files changed | 11 (10 modified + 1 new `PackerAdminScan.tsx`) |
| Diff size | +1107 / -91 |

### What it does (one-paragraph reminder)

Replaces the packer shared queue with per-packer pre-assignment. Packer Admin
gets a new phone scan station (`/packer-admin-scan`, green theme) plus a desktop
Scan & Stage section that mirrors PickerAdmin. Packers see only their own
assigned orders on `/packer` and scan to complete (which still auto-dispatches
to OUTBOUND — preserves today's behavior). Activates the long-defined-but-unused
`OrderStatus.PACKER_ASSIGNED` enum value. ScanLogin bug fix included:
PACKER_ADMIN now routes to `/packer-admin-scan` (was wrongly routing to the
desktop URL `/packer-admin`).

### Merge command (when user gives the green light)

```bash
cd "/c/Users/okili/OneDrive/Documents/Programs/dynamic-order-management"
git checkout main && git pull origin main --rebase
git merge test --no-ff -m "merge: v2.29.0 packer pre-assignment workflow + phone scan (test -> main)"
git tag v2.29.0
git push origin main && git push origin v2.29.0
```

**Push the specific tag, not `--tags`** — the old stale `v1.2.0-test` local tag
will reject `--tags` again (cosmetic; just push the tag explicitly).

### Critical pre-merge reminder

**Deploy outside operating hours.** Between the moment CD finishes and the
moment admin completes the assignment sweep, packer phones show **empty
queues** because no PACKER_ASSIGNED rows exist yet. The user already
acknowledged and agreed to this trade-off in plan mode.

### Post-merge runbook (admin must do this once after CD)

1. CD finishes (`docker compose up -d --build` rebuilds; `dom_backend`
   restarts ~30s). Don't trust `(healthy)` flag — use
   `ss -tlnp | grep 3000` per `feedback_verify_deploy.md`.
2. Admin opens `https://domwarehouse.com/packer-admin` (desktop) **or**
   `/scan` on phone → redirects to `/packer-admin-scan`.
3. Admin uses Scan & Stage to scan every printed waybill on the bench;
   each scan stages an order; pick a packer; click "Assign N Staged Orders".
4. Verify packer phones show their items (15s refetch or instant socket
   `order:assigned`).

### Rollback if anything breaks

Two paths, both reversible:
1. **Quick fix** — revert `packerService.getMyOrders` to call the old
   `getPickerCompleteOrders` (1-line change), redeploy. Restores shared
   queue immediately.
2. **Full rollback** — `git revert <merge-commit>` on main + push. CD
   redeploys v2.28.5. PACKER_ASSIGNED rows created during the prod window
   are harmless after revert (status rolls back to PICKER_COMPLETE; the
   completion path simply creates the legacy completion row).

### Memory rules to apply at merge time

- `feedback_docs_sync.md` — ARCHITECTURE.md + CLAUDE.md already updated in
  the same commit on test. ✓
- `project_github.md` — push to test done. Merge → tag `v2.29.0` → push
  main + tag. (`v2.29.0-test` already on remote.)
- After merge, update memory `project_phase9.md` and `MEMORY.md` index to
  reflect v2.29.0 live status.

### Note on version slot

The "PENDING — v2.29.0 Reports heavy-query refactor" entry below was
**reserved** for that refactor at the time it was deferred (2026-04-23).
That refactor was never picked up because the v2.28.1 pool fix appears to
have resolved the 500s. The v2.29.0 slot has now been used by this packer
workflow change. **If the reports refactor ever needs to ship, use v2.29.1
or v2.30.0.** The technical content of that pending entry is still valid
as instructions for the refactor; only the version label is stale.

---

## [2026-04-23] Intermittent 500 on `/reports/performance` + `/reports/live-performance` (v2.28.1)

### Problem
Warehouse Report page intermittently showed `Failed to load performance data. Retrying...` with 500 responses from both `/reports/performance?days=30` and `/reports/live-performance`. Frontend polls live-performance every 30s, so the banner flickered.

### Root cause hypotheses (unconfirmed — prod backend logs returned no error body before this fix)
- Prisma connection pool exhaustion under concurrent report polling + sales + picker/packer traffic. Default pool is `num_physical_cpus * 2 + 1` = **5** on the 2-vCPU Vultr box.
- Heavy `findMany` in `/performance` loading up to 30 days of picker+packer assignments into memory (no date upper bound, no limit).
- No global `setErrorHandler` → every unhandled throw returned body-less 500, making root-causing impossible from the outside.

### Applied in v2.28.1 (safe batch — no rapor/output değişmedi)
- `backend/src/plugins/rateLimit.ts` — `max: 100 → 500` (regression from v2.X; previously documented as fixed but file had reverted).
- `backend/src/index.ts` — global `setErrorHandler` that recognises:
  - Prisma known errors (`PrismaClientKnownRequestError`) → logs `prisma_known_error code=…` + returns `{error, code, reqId}`.
  - Prisma init errors → `503 Database unavailable`.
  - Pool timeouts (`Timed out fetching a new connection`) → `503 Database pool exhausted`.
  - Everything else → `500 Internal server error` with `reqId` for log correlation.
  - Respects lower statusCodes (validation, rate-limit) and does not mask them.

### Manual ops step required on prod (not in repo)
Add `?connection_limit=15&pool_timeout=10` to `DATABASE_URL` in `/opt/dom/.env`, then `docker compose up -d backend`. Raises pool from 5 → 15 which is what the current query pattern needs.

### Deployed + verified live
- `main` at `eeedec9`, tag `v2.28.1` pushed via CD. `dom_backend` restarted cleanly, `/health` returned ok at 08:31 UTC on 2026-04-23.
- `.env` on prod (`/opt/dom/.env`) updated manually — `DATABASE_URL` now ends in `?schema=public&connection_limit=15&pool_timeout=10`. Verified via `grep DATABASE_URL /opt/dom/.env`.
- User was left observing the `/reports` page for 5–10 min to confirm the `Failed to load performance data. Retrying...` banner stops. If it returns, the new error handler now emits a structured body (`{error, code, reqId}`) so next-session can grep prod logs by `reqId`.

---

## ⏳ PENDING — Reports heavy-query refactor (originally tagged v2.29.0; that slot is now used by the packer workflow — re-tag this as **v2.29.1 or v2.30.0** if it ever ships)

**Do not re-investigate from scratch — all context below is complete.**

### Why deferred
v2.28.1 might already solve the 500s (pool was 5, now 15; query patterns unchanged). If the banner stopped appearing after v2.28.1, v2.29.0 becomes a nice-to-have refactor, not urgent. Start v2.29.0 only if:
- User confirms the banner is still appearing, OR
- User explicitly wants the refactor for cleanliness.

### What to change — file + exact lines

**File:** `backend/src/routes/reports.ts`

#### Change A — `/live-performance` groupBy scope (lines ~394-407)

**Current code (roughly):**
```ts
prisma.pickerAssignment.groupBy({
  by: ['pickerId'],
  where: { completedAt: null, order: { tenantId, archivedAt: null } },
  _count: { _all: true },
}),
```
Same block exists for `packerAssignment`.

**Problem:** Scans every historical open assignment across all time. Stale never-completed rows make this slower over time.

**Fix:** Add a 30-day lower bound on `order.createdAt`:
```ts
where: {
  completedAt: null,
  order: {
    tenantId,
    archivedAt: null,
    createdAt: { gte: new Date(Date.now() - 30 * 86_400_000) },
  },
},
```

**Business-logic check:** Orders older than 30 days that are still open are stuck/abandoned — excluding them from `activeNow` is actually *more correct*, not a regression. But call it out in the commit message.

**Verification:** Before deploy, open Live Performance tab and screenshot `activeNow` per worker. After deploy, compare — some may drop to 0 if they had stale phantom assignments. That's the intended outcome.

#### Change B — `/performance` DB-side aggregation (lines ~194-299)

**Current code:** `prisma.pickerAssignment.findMany({ where: { order: { tenantId }, completedAt: { gte: from, not: null } }, select: { pickerId, completedAt } })` — same for packer. Then JS loops group by pickerId + Manila date.

**Problem:** 30 days × ~10k orders/day × 2 roles = up to ~600k rows pulled into Node memory. One of the likely 500 culprits on a 4GB box.

**Fix:** Use `prisma.$queryRaw` with Postgres `date_trunc` / timezone conversion to aggregate in the DB. Example shape (picker; mirror for packer):

```ts
const pickerRows = await prisma.$queryRaw<{ pickerId: string; date: string; completed: bigint }[]>`
  SELECT pa."pickerId" as "pickerId",
         to_char((pa."completedAt" AT TIME ZONE 'Asia/Manila')::date, 'YYYY-MM-DD') as date,
         COUNT(*)::int as completed
  FROM "PickerAssignment" pa
  JOIN "Order" o ON o.id = pa."orderId"
  WHERE o."tenantId" = ${tenantId}
    AND pa."completedAt" >= ${from}
    AND pa."completedAt" IS NOT NULL
  GROUP BY pa."pickerId", (pa."completedAt" AT TIME ZONE 'Asia/Manila')::date
`
```

⚠️ **Before writing the SQL, verify table + column names with**:
```bash
docker exec dom_postgres psql -U dom_user -d dom_db -c "\d+ \"PickerAssignment\""
docker exec dom_postgres psql -U dom_user -d dom_db -c "\d+ \"PackerAssignment\""
```
Prisma sometimes uses snake_case `@map`, sometimes not — confirm before coding.

Then merge with user list (kept as-is: `prisma.user.findMany` for PICKER / PACKER). Zero-fill the `daily` array using `dateList` the same way the current JS does. Only the aggregation source changes; the response shape must stay identical.

**Same for packers** — parallel $queryRaw for `PackerAssignment`.

**Verification (mandatory — mismatch = hidden wrong numbers in reports):**
1. BEFORE deploy: open `/reports` Performance tab, days=30. Screenshot. Record each picker's + packer's **total** and the daily bars for 2–3 recognisable days.
2. Deploy v2.29.0.
3. AFTER deploy: reload same page, compare totals + daily values.
4. If any picker/packer differs by even 1 — revert immediately (`git revert <merge-commit>` on main, push). Do not "fix forward" under live traffic.

### Risks recap (from prior session chat)
- **Risk 1 — silent wrong numbers:** SQL vs JS aggregation discrepancy on timezone edges. Mitigation = manual screenshot diff above.
- **Risk 2 — `activeNow` drops:** Expected if stale uncompleted assignments exist. Not a bug, but tell user ahead.
- **Timing:** ~00:30 Manila = minimal user impact from the ~20s backend restart.

### Step-by-step resume plan for next session
1. Ask user: "Did the Retrying banner keep appearing after v2.28.1?" — determines urgency.
2. `git checkout test && git pull origin test --rebase`.
3. Edit `backend/src/routes/reports.ts` as above (Change A + Change B).
4. `cd backend && npx tsc --noEmit` — must pass.
5. Manual SQL sanity: run the raw query on prod DB once via `docker exec dom_postgres psql` and eyeball a few rows vs known-good picker/day counts.
6. Ask user for BEFORE screenshots (Performance + Live Performance tabs).
7. Commit: `fix: v2.29.0 — reports DB-side aggregation + open-assignment scope`. Tag `v2.29.0-test`. Push test.
8. Ask merge approval. If yes → merge to main with tag `v2.29.0`, push. CD deploys.
9. Wait for `dom_backend` healthy, then ask user for AFTER screenshots. Diff.
10. If numbers match → update CLAUDE.md to `v2.29.0`, ARCHITECTURE.md reports section if affected, commit as doc-sync.
11. If numbers differ → `git revert` the merge commit on main and push; keep error handler + pool fix intact.

### Optional — docker-compose warning
During deploy the user saw `WARN[0000] ... the attribute 'version' is obsolete`. Can remove the `version: "3.9"` line from `docker-compose.yml` at any time — cosmetic only, unrelated to the reports bug.

---

## [2026-04-20] Packer Phone Scan — Debug Card Leak to Production + Unfriendly Error Messages (v2.23.3)

### Problem
On `domwarehouse.com/scan` as a Packer, scanning a waybill that is **not** in the packer queue (e.g. an `INBOUND` order) produced two user-facing symptoms:
1. A short-but-jargon error toast: `Order status is INBOUND, not PICKER_COMPLETE`.
2. A yellow "Scan Debug" card right below it listing **every tracking number in the packer's queue**, one per line. On a packer with a full queue this filled the phone screen.

Reported as "long error message + entire list showing up."

### Root Causes (two independent issues)

**1. Backend jargon 404 message (`backend/src/routes/packer.ts`).**
`/packer/find` handler, on miss, interpolated raw `OrderStatus` enum + the string `PICKER_COMPLETE` directly into the error body. The message was technically correct but used internal enum names a warehouse packer has no context for.

**2. Scan Debug card left in production (`frontend/src/pages/PackerMobile.tsx`).**
The debug card was added 2026-04-17 to diagnose the J&T URL-encoded barcode problem ("Scanned vs Queue visualization" — see earlier entry). It rendered `debugInfo.queue` — **the full tracking-number list of the packer's current queue** — whenever `/packer/find` returned 404. It was temporary but never removed. The "whole list on screen" the user saw was this card, not a long error string.

There was also a small defensive gap: the error toast had no `wordBreak`/`maxHeight`/`overflowY`, so a future long message from the backend would again blow up the layout.

### Fix

**Backend — `backend/src/routes/packer.ts`:**
- Added `friendlyPackerMessage(diag)` helper that maps `OrderStatus` groups to user-friendly strings:
  - `INBOUND` / `PICKER_ASSIGNED` / `PICKING` → `"This order is not ready for packing yet"`
  - `PACKING` → `"This order is already being packed"`
  - `PACKER_COMPLETE` / `OUTBOUND` → `"This order has already been packed"`
  - archived → `"This order is archived and no longer active"`
  - no diag → `"Order not found"`
- Technical detail (raw status + archived flag) is retained **in logs only** via a new `request.log.warn(..., 'packer find miss')` call so diagnosis is still possible server-side without leaking enums to the scanner UI.

**Frontend — `frontend/src/pages/PackerMobile.tsx`:**
- Removed the `debugInfo` state, both `setDebugInfo(...)` calls in `handleScan`, and the entire `{debugInfo && ...}` render block.
- Added defensive style to the error toast: `wordBreak: 'break-word', maxHeight: '40vh', overflowY: 'auto'` so an unexpectedly long backend message can never again fill the screen.

### Lesson
A "temporary" debug UI that leaks internal state (queue contents, DB IDs, enums) to a scanner screen is a production leak, not an acceptable diagnostic. When adding a debug card to solve a specific incident, add a corresponding todo/task to remove it after the fix ships — don't let `import.meta.env.DEV` gates substitute for deletion when the feature's job is done. For on-going diagnostics use `request.log.warn` with structured fields, not on-screen UI.

### Verification after deploy (v2.23.3)
1. Packer phone → scan an INBOUND order's waybill → toast shows `"This order is not ready for packing yet"`, **no** yellow debug card.
2. Scan a completely unknown waybill → toast shows `"Order not found"`, no debug card.
3. Scan a real PICKER_COMPLETE order → normal confirm bottom sheet opens (regression check).
4. `docker logs dom_backend | grep "packer find miss"` on Vultr → shows the structured warn with raw status + archived flag for the 404 scan above.

---

## [2026-04-20] Post-Deploy Verification Gotchas — `dom_backend` never reports `(healthy)` + logs are empty (v2.23.1 merge)

### Problem
During the v2.23.1 sales-agent merge, after `docker restart dom_backend` on Vultr:
- `docker ps` showed `Up 8 seconds` but **never** `(healthy)` — even 3+ minutes later.
- `docker logs dom_backend --tail 30` returned **zero output**.
- `docker exec dom_backend wget -qO- http://localhost:3000/health` returned `Connection refused` when tested 8 seconds post-restart.

All three signals together made it look like the app had crashed silently. It had not — the app was fine.

### Root Causes (three independent reasons, each harmless on its own)

**1. Backend has no `healthcheck` stanza in `docker-compose.yml`.**
Only `dom_postgres` and `dom_redis` define `healthcheck:`. Without one, Docker has no basis to report `(healthy)` — the status column will forever read `Up X seconds` / `Up X minutes`, never `(healthy)`. Do not wait for `(healthy)` on `dom_backend` — it will not come.

**2. Fastify production log level is `warn` (or higher).**
Startup "listening on :3000" emits at `info` level and is suppressed in prod. `docker logs dom_backend` stays empty until an actual warning/error occurs. **Empty logs ≠ dead app.**

**3. Fastify takes 5–10 seconds to bind the port on cold start.**
The container is `Up` (PID 1 alive) immediately, but the HTTP listener isn't ready yet. An in-container `wget localhost:3000` issued at ~8 s can legitimately get `Connection refused`. Host-side `ss -tlnp | grep 3000` proves whether `docker-proxy` has bound the host port — that's the real signal.

### The Right Verification Checklist (use this, not `(healthy)` / logs / early `wget`)

```bash
# 1. Container is running, no restarts, no non-zero exit
docker inspect dom_backend --format 'State={{.State.Status}} Restarts={{.RestartCount}} ExitCode={{.State.ExitCode}}'
# Expect: State=running Restarts=0 ExitCode=0

# 2. Host has bound port 3000 via docker-proxy (this means the container-side listener is live)
ss -tlnp | grep 3000
# Expect: LISTEN ... 0.0.0.0:3000 ... docker-proxy

# 3. Real functional test — browser on https://domwarehouse.com
#    Log in, hit one endpoint that exercises the new code path.
```

If 1 + 2 pass, the app is alive. Skip log-staring and `(healthy)`-watching — they're structurally absent by design, not broken.

### Related Memory
`feedback_verify_deploy.md` says "if a fix is ineffective 2+ turns, suspect the deploy pipeline not the code." The flip side is equally true: **if the deploy pipeline completed but the in-container signals look off, check whether those signals are even defined** before escalating. The absence of a signal ≠ a failed signal.

### Files / Config References
- `docker-compose.yml:38-59` — `backend` service block, no `healthcheck:` defined (intentional; adding one is future work)
- `backend/src/index.ts` — Fastify `logger` config (prod level)

### Rule
When verifying a production deploy, rely on **inspect + port binding + real HTTP response**, not on status labels (`healthy`) or stdout logs that the service may not emit. If you expect a signal, first check whether it's configured to exist.

---

## [2026-04-19] Password Visibility Toggle on Login Forms (v2.13.12)

### Change
Added an eye/eye-off icon button to the right of the password input on both desktop login (`Login.tsx`) and handheld scan login (`ScanLogin.tsx`). Clicking toggles `type` between `password` and `text` so the user can verify what they typed.

### Implementation Notes
- `button type="button"` is **mandatory** — default is `type="submit"`, which would trigger the login form on every click. Miss this and the form submits with whatever is currently typed.
- `aria-label` swaps dynamically between `"Show password"` / `"Hide password"` — no extra `aria-pressed` needed.
- Toggle defaults to hidden (`showPassword=false`) so the security posture at page load is unchanged from before.
- `autoComplete="current-password"` preserved on the input → password managers keep autofilling regardless of the current `type`.
- Settings.tsx admin password inputs intentionally left without a toggle (different UX context — admin setting someone else's password).

### Rule
Whenever adding a visual toggle next to a form input, set `type="button"` explicitly on the button element. Default-`submit` on a button inside a `<form>` is one of the most common "my toggle submits the form" bugs.

### Files Affected
- `frontend/src/pages/Login.tsx` — `showPassword` state + eye toggle button, input `paddingRight` 44px
- `frontend/src/pages/ScanLogin.tsx` — same pattern, 18×18 SVG, `paddingRight` 46px

---

## [2026-04-19] Dashboard Looks Stale After Handheld Scans — Missing Socket Emit on `picker.ts` / `packer.ts` (v2.13.11)

### Problem
Dashboard's Picker Summary and Packer Summary cards felt "behind the times" — a picker or packer could complete an order on the handheld, but the admin's dashboard would not update for up to 10 seconds. Admin routes (`pickerAdmin.ts`, `packerAdmin.ts`, `orders.ts`) updated the dashboard immediately; only the handheld endpoints felt stale.

### Root Cause
Frontend `Dashboard.tsx` invalidates `['dashboard-stats']` on the socket event `order:stats_changed`. That event was emitted from the admin/crud routes but **not** from the handheld completion routes:

| Route | Emits `order:stats_changed`? |
|---|---|
| `backend/src/routes/orders.ts` (create / bulk) | ✅ |
| `backend/src/routes/pickerAdmin.ts` (assign / unassign / bulk-complete) | ✅ |
| `backend/src/routes/packerAdmin.ts` (assign / unassign) | ✅ |
| `backend/src/routes/picker.ts` `POST /complete` (handheld) | ❌ — bug |
| `backend/src/routes/packer.ts` `POST /complete` (handheld) | ❌ — bug |

So order-state mutations from the handheld did not reach the dashboard via socket; admins had to wait for the 10s react-query polling interval.

### Fix
Add the same emit pattern used in the admin routes, to both handheld completion handlers, after the successful DB update:
```ts
import { getIO } from '../lib/socket'
// ...
try { getIO().to(`tenant:${tenantId}`).emit('order:stats_changed') } catch {}
```
`try/catch {}` is intentional — matches the existing pattern (socket down should never fail the request). `GET /packer/find` does not mutate order state (verified in `packerService.ts`: only `findFirst` / raw SELECT), so no emit is needed there.

### Rule
**Any route that mutates order status MUST emit `order:stats_changed` to the tenant room.** When adding a new mutation endpoint, grep existing mutation routes for `getIO().to(\`tenant:\`` to confirm the pattern, and replicate it. Missing the emit doesn't break anything loudly — the dashboard just feels "laggy" — which is why the bug survived review. If you only see socket emits from admin routes but have handheld routes that do the same state transition, that is a red flag.

Secondary rule: when debugging "dashboard data looks stale", first check whether the mutation path is emitting the event. Polling-only updates (10s in this project) mask the missing emit long enough to be misdiagnosed as a cache bug.

### Files Affected
- `backend/src/routes/picker.ts` — emit on `POST /complete`
- `backend/src/routes/packer.ts` — emit on `POST /complete`

---

## [2026-04-19] CARRY Badge Showed on Today's Orders — String-Slice Timezone Comparison (v2.13.9)

### Problem
Orders created **today** in Manila time were sometimes badged as "CARRY" (carryover from a previous day) on the PickerAdmin and PackerAdmin workload panels. The CARRY tag should only appear on orders whose `workDate` is strictly before today in Manila.

### Root Cause
Both admin pages compared work date against today using raw ISO slicing:
```ts
{order.workDate?.slice(0, 10) < todayStr && (
```
`order.workDate` comes from the backend as a UTC ISO string. `todayStr` was computed as today's date in **Manila** (via `getManilaDateString()`). Slicing the UTC ISO string skips the timezone conversion entirely. So an order created in Manila at, say, 01:30 on 2026-04-19 (Manila) — which is 17:30 on 2026-04-18 (UTC) — would have `workDate.slice(0, 10) === '2026-04-18'`, while `todayStr === '2026-04-19'`. Comparison says past → CARRY badge shown, even though the order is genuinely from today in the operating timezone.

### Fix
Use the shared `getManilaDateString()` helper for both sides of the comparison:
```ts
{order.workDate && getManilaDateString(new Date(order.workDate)) < todayStr && (
```
Both values now represent the same timezone's calendar date, so the comparison matches user-perceived reality.

### Rule
**Never compare a date string by slicing its first 10 characters unless you are certain the string is already in the target timezone.** In this project all comparisons of "was this on or before today?" must use `getManilaDateString()` on both sides. The raw `workDate` ISO is UTC; using `.slice(0, 10)` is a hidden timezone conversion and will silently lie whenever a user operates across the Manila/UTC midnight.

When you spot a `slice(0, 10)` on any date field that will be compared to something timezone-aware, treat it as a bug by default — either remove the slice or convert to Manila first.

### Files Affected
- `frontend/src/pages/PackerAdmin.tsx` — CARRY badge conditional
- `frontend/src/pages/PickerAdmin.tsx` — CARRY badge conditional

---

## [2026-04-19] Archive Page Returns HTML Instead of JSON — Missing `/archive` in Vite proxyRoutes

### Problem
After v2.13.4 shipped, clicking **Archive OUTBOUND Now** still showed *"Archive failed"*. DevTools network tab:
```
POST https://domwarehouse.com/archive/trigger  →  404 Not Found
GET  https://domwarehouse.com/archive/stats    →  200 text/html (SPA index.html)
```
No archived records were visible either — the stats/list GETs returned HTML, so React Query got `undefined` for `.total` and `.orders`.

### Root Cause (correction — earlier diagnosis was wrong)
Initial suspicion was **nginx** missing a `location /archive` block. **That was wrong.** This project's nginx config only has three locations: `/socket.io/`, `/api/`, and `/` (catch-all → Vite on port 5173). Per-prefix routing happens one layer deeper: **Vite's dev-server `server.proxy` config** (`frontend/vite.config.ts`) decides which prefixes get forwarded to Fastify on `:3000` and which get served the SPA.

The real bug: `proxyRoutes` in `frontend/vite.config.ts:8` listed every other prefix but **`/archive` was missing**. So Vite did this:

| Request | Vite behavior | Result |
|---|---|---|
| `GET /archive/stats` | No proxy match → SPA fallback → `index.html` | 200 `text/html`, React Query sees undefined fields → empty UI |
| `GET /archive` (list) | Same SPA fallback | 200 `text/html`, empty table |
| `POST /archive/trigger` | No proxy match, static HTML can't POST | 404 → frontend generic *"Archive failed"* toast |

Archive feature (Phase 7) worked locally because `npm run dev` hits Fastify directly; the Vite proxy gap only bites when traffic actually flows `browser → nginx → Vite`.

### Wasted detour
I initially edited the nginx config on the Vultr host thinking it needed a `location /archive` block. nginx was already correct (the catch-all sends everything to Vite); I nearly broke the site by adding an unnecessary location outside the `server {}` block. Lesson: **before blaming nginx, read the nginx config** and identify whether per-prefix routing actually happens there.

### Fix
One line in `frontend/vite.config.ts:8`:
```diff
- const proxyRoutes = ['/auth', '/users', '/orders', '/assign', '/reports', '/health', '/picker-admin', '/packer-admin', '/picker', '/packer', '/outbound']
+ const proxyRoutes = ['/auth', '/users', '/orders', '/assign', '/reports', '/health', '/picker-admin', '/packer-admin', '/picker', '/packer', '/outbound', '/archive']
```
Shipped as **v2.13.6**. Deploy via CD → frontend container rebuild → Vite picks up new proxy list.

### Rules
- **When you register a new route prefix in `backend/src/index.ts`, you MUST also add it to `frontend/vite.config.ts` `proxyRoutes`.** Otherwise Vite will SPA-fallback that prefix and every API call silently returns `index.html`.
- **SPA-fallback + unproxied API = silent failure.** GETs return 200 HTML (React Query sees undefined → "no data"), POSTs return 404 (→ generic "failed" toast). Neither surfaces the real cause. When debugging a 404 on an API path, first check `Content-Type` of a GET on the same prefix — `text/html` means it never reached Fastify.
- **Read the actual nginx config before theorising about nginx.** In this stack nginx is a thin shell (`/api/`, `/socket.io/`, `/ → :5173`); the real per-route allowlist lives in Vite.

### Verification commands
```bash
# audit every backend prefix at once
for p in /auth/me /users /orders /picker-admin/pickers /packer-admin/packers \
         /picker/my-orders /packer/my-orders /outbound/stats /reports/dashboard \
         /archive/stats; do
  ct=$(curl -sS -o /dev/null -w "%{content_type}" "https://domwarehouse.com$p")
  code=$(curl -sS -o /dev/null -w "%{http_code}" "https://domwarehouse.com$p")
  echo "$code $ct $p"
done
```
Every row should report `application/json`. Any `text/html` row = that prefix is not in `proxyRoutes`.

### Files Affected
- `frontend/vite.config.ts` — added `/archive` to `proxyRoutes`
- `CLAUDE.md` — bumped to v2.13.6
- `SOLUTIONS.md` — this (corrected) entry

---

## [2026-04-19] Operational Tips — Uploading Long Terminal Output + nginx Recovery

### When Terminal Copy Doesn't Work: Upload to Termbin for a Shareable URL

**Problem:** SSH'de uzun çıktı geldiğinde (nginx config, log tail, error dump) terminal'den copy-paste ya başarısız ya da satırları bozar. Chat'e yapıştırmak için URL lazım.

**Fix — pipe the command through `nc termbin.com 9999`:**
```bash
# tek komut çıktısı
<command> 2>&1 | nc termbin.com 9999

# örnekler
sudo nginx -t 2>&1 | nc termbin.com 9999
cat -n /etc/nginx/sites-available/dom | nc termbin.com 9999
tail -n 30 /etc/nginx/sites-available/dom | nc termbin.com 9999
docker compose logs backend --tail=200 | nc termbin.com 9999
```
`nc` komutu bir URL döner (`https://termbin.com/xxxx`). URL 1 ay kalır, public — sensitive content (API key, password, session token) varsa önce redakte et:
```bash
<command> | sed 's/Authorization: Bearer [^"]*/Authorization: Bearer REDACTED/g' | nc termbin.com 9999
```

**Rule:** Uzun çıktı için artık screenshot / satır satır copy deneme — tek komut termbin. İki çıktı lazımsa iki ayrı URL at.

---

### nginx Recovery — Stray `sites-enabled` File + Missing Canonical Symlink

**Context:** Archive bug için debug yaparken, yanlışlıkla `location /archive` bloğunu `sites-enabled/domwarehouse.com` adıyla ayrı bir dosya olarak kaydetmişiz. Bu dosya `server { }` bloğu içermediği için `nginx -t` reddetti (*"location directive is not allowed here"*). Asıl config ise `/etc/nginx/sites-available/dom` idi ve `sites-enabled/dom` symlink'i hiç yoktu. Yani nginx sadece bozuk dosyayı görüyordu.

**Diagnostic probe:**
```bash
ls -la /etc/nginx/sites-enabled/
# beklenen: symlink → /etc/nginx/sites-available/<site>
# bu kazada: sadece bozuk duplicate dosya vardı, symlink yoktu
sudo nginx -t 2>&1 | nc termbin.com 9999
```

**Fix:**
```bash
sudo rm /etc/nginx/sites-enabled/domwarehouse.com        # stray bozuk dosya
sudo ln -s /etc/nginx/sites-available/dom /etc/nginx/sites-enabled/dom
sudo nginx -t && sudo systemctl reload nginx
```

### Heredoc Trap — Leading Whitespace on EOF Terminator

Heredoc ile çok satırlı config yazarken, kapanış `EOF`'un başında boşluk olursa bash onu terminator saymaz ve bekler. Bazen paste'de `EOF` satıra iki kez yazılıp dosyanın içine **literal "EOF" metni olarak** kaydolur — `nginx -t` sonra "unexpected end of file" verir.

**Recovery:** Dosyayı tamamen yeniden yazmaya uğraşma — stray EOF satırlarını tek `sed` ile temizle:
```bash
sudo sed -i '/^[[:space:]]*EOF[[:space:]]*$/d' /etc/nginx/sites-available/<site>
sudo nginx -t
```

**Rules (genel):**
- **Bir site için `sites-available/` canonical, `sites-enabled/` sadece symlink olmalı.** Eğer `sites-enabled/` içinde symlink değil gerçek dosya varsa şüphelen — yanlış editörle yaratılmış veya önceki bir kaza.
- **nginx düzenleme kesin çalışıyorsa önce doğrulama:** `ls -la /etc/nginx/sites-enabled/` (symlink kontrolü) + `sudo nginx -t` (syntax) + `sudo systemctl reload nginx` (uygulama). `systemctl reload` hatada graceful fail verir, site ayakta kalır — `restart` yerine her zaman `reload` tercih et.
- **Heredoc yerine `sudo tee` + `<<'EOF'` daha güvenli** çünkü `<'EOF'` quotes expansion'ı durdurur ve çoğu paste bug'ını engeller. Ama kapanış EOF yine de column 0'da ve tamamen yalnız olmalı — whitespace yok.

### Files Affected
- (server-only) `/etc/nginx/sites-enabled/dom` (symlink restored), `/etc/nginx/sites-enabled/domwarehouse.com` (stray file removed)
- `SOLUTIONS.md` — this entry

---

## [2026-04-18] Archive Now — Wrong Schedule Text in UI + Brittle Manual-Trigger Route

### Problem
1. On `/archive`, the "Archive OUTBOUND Now" confirm popup showed: *"This normally runs automatically at 7:00 PM. Proceed?"* and the empty-state copy referred to *"the daily 7 PM archive job"*. The actual cron fires at **23:30 Manila**.
2. Clicking Archive Now surfaced *"Archive failed"* with no server-side detail.
3. Archive list appeared empty even when admins expected archived rows to be there.

### Root Cause
**Stale UI text:** The cron pattern in `backend/src/index.ts:118` is `'30 23 * * *', tz: 'Asia/Manila'` (23:30 nightly). `frontend/src/pages/Archive.tsx` lines 381 + 468 and the comment at `backend/src/lib/queues.ts:25` were never updated when the schedule moved from 19:00 to 23:30 in an earlier phase.

**Brittle route:** `backend/src/routes/archive.ts` POST `/trigger` did:
```ts
const result = await archiveOutboundOrders(tenantId)                    // DB update
await archiveOutboundQueue.add('archive', { tenantId }, {...})          // Redis enqueue
return reply.send({ archived: result.archived })
```
If the BullMQ `add(...)` threw (Redis hiccup, auth issue, etc.), Fastify surfaced a 500 with no `error` field, so the frontend fell back to a generic *"Archive failed"* toast — **even though the DB archive had already committed**. The audit enqueue is not the critical path; treating it as critical collapsed a successful operation into a user-visible failure.

### Fix
- UI/comment text aligned with the real cron: `"11:30 PM (Manila time)"` / `23:30 Manila`.
- Route wrapped with an outer try/catch around the DB archive (explicit error log + typed 500 with message) and an **inner try/catch around the queue enqueue** that logs-and-swallows, so the main flow always reflects the DB outcome. Also added structured info/warn/error logs so future failures leave a trail in `docker compose logs backend`.

### Rules
- **Best-effort telemetry/audit queues must never fail the critical path.** Isolate them with a local try/catch and log the enqueue error — the response must describe the main operation's outcome, not the audit hop.
- **Any UI copy that mentions a schedule must match the cron definition.** Single source of truth: `backend/src/index.ts` `repeat: { pattern, tz }`. When changing either, grep the frontend for the old time (`7 PM`, `19:00`, etc.) in the same change.

### Files Affected
- `frontend/src/pages/Archive.tsx`
- `backend/src/lib/queues.ts`
- `backend/src/routes/archive.ts`

---

## [2026-04-18] Outbound / Reports 403 for PICKER_ADMIN and PACKER_ADMIN — Frontend/Backend Role List Mismatch

### Problem
After a picker + packer completed an order via scan, a PICKER_ADMIN or PACKER_ADMIN user navigating to `/outbound` saw repeating `GET /outbound/grouped 403` and `GET /outbound/stats 403` errors. The same user on `/reports` saw `Failed to load performance data. Please try again.` (also from a 403 on `/reports/performance`).

### Root Cause
Frontend route guards in `frontend/src/App.tsx` allow the page:
```
/outbound → [ADMIN, INBOUND_ADMIN, PICKER_ADMIN, PACKER_ADMIN]
/reports  → [ADMIN, INBOUND_ADMIN, PICKER_ADMIN, PACKER_ADMIN]
```
So the user reaches the page and React Query starts polling. But the backend `requireRole(...)` preHandler for the endpoints those pages hit was narrower:
```
/outbound/{grouped,stats,stuck}           → [ADMIN, INBOUND_ADMIN]
/reports/performance (+ export, export-pdf) → [ADMIN, INBOUND_ADMIN]
/reports/sla (+ export-pdf)               → [ADMIN, INBOUND_ADMIN]
```
Result: page renders, every poll 403s, user sees error toasts while the sidebar link that got them there is clearly "allowed."

### Fix
Widen the backend `requireRole` lists to match the frontend `allowedRoles` for the exact endpoints those pages call:
- `backend/src/routes/outbound.ts` — shared `preHandler` → add PICKER_ADMIN + PACKER_ADMIN.
- `backend/src/routes/reports.ts` — `/performance`, `/performance/export`, `/performance/export-pdf`, `/sla`, `/sla/export-pdf` → add PICKER_ADMIN + PACKER_ADMIN.

Intentionally **not** widened:
- `/reports/dashboard` — only called from `/` (Dashboard) and `/dashboard` (Inbound), both gated to ADMIN + INBOUND_ADMIN. Widening would grant data access a *_ADMIN never needs.
- `/reports/trigger-nightly` — admin-only debug trigger.
- `/reports/order-timeline` — already correctly 4-role.

### Rule
**Frontend `ProtectedRoute allowedRoles` and backend `requireRole(...)` for the endpoints that page calls MUST stay in sync.** When adding a role to a page's `allowedRoles` in `App.tsx`, grep the page component for every `api.get(...)` / `api.post(...)` path and update the matching backend routes in the same commit. A narrower backend than frontend produces a 403-spam UX; a wider backend is a privilege leak.

When debugging a `403` that only hits some user roles: first check frontend allowedRoles vs backend requireRole for the exact URL path in the network tab — the list mismatch is the most common cause.

### Files Affected
- `backend/src/routes/outbound.ts`
- `backend/src/routes/reports.ts`

---

## [2026-04-18] Picker/Packer "Order not assigned to you" on Scan — Archived Duplicate

### Problem
`picker1` sees an assigned order in their mobile list. Scanning that order's waybill and pressing **Confirm Complete** returns HTTP 403 `"Order not assigned to you"`. The order is clearly the picker's — list says so — but completion fails.

### Root Cause
`backend/prisma/schema.prisma:108` replaced the `@@unique([tenantId, trackingNumber])` constraint with a **partial unique index** (`archived_at IS NULL`) via a raw SQL migration. So the same `(tenantId, trackingNumber)` pair can legally exist multiple times: one active row + any number of archived rows (re-shipment of the same logistics code over time).

`pickerService.completeByTracking` looked up the order like this:
```ts
const order = await prisma.order.findFirst({
  where: { trackingNumber: { equals: trackingNumber, mode: 'insensitive' }, tenantId },
})
```
No `archivedAt: null` filter, no status filter, no `orderBy`. Postgres returns **any** matching row in undefined order — `findFirst` could return the **old archived** row whose `pickerAssignment.completedAt` was already set long ago. The follow-up `pickerAssignment.findFirst({ orderId: <archived-id>, pickerId, completedAt: null })` then matched nothing → `"Order not assigned to you"` → route mapped that message to HTTP 403.

The same latent anti-pattern existed in `packerService.completeByTracking`.

Meanwhile, `getMyOrders` correctly joins on `order.status ∈ {PICKER_ASSIGNED, PICKING}` (never on archived rows), so the picker's **list** always shows the active row — the mismatch made the bug look like a permission error.

### Fix
Add `archivedAt: null` + status filter inside the Prisma `findFirst` for both services. Because the status filter now lives in the query, the redundant post-fetch status check is dropped.

```ts
// pickerService.completeByTracking
const order = await prisma.order.findFirst({
  where: {
    trackingNumber: { equals: trackingNumber, mode: 'insensitive' },
    tenantId,
    archivedAt: null,
    status: { in: [OrderStatus.PICKER_ASSIGNED, OrderStatus.PICKING] },
  },
})

// packerService.completeByTracking
const order = await prisma.order.findFirst({
  where: {
    trackingNumber: { equals: trackingNumber, mode: 'insensitive' },
    tenantId,
    archivedAt: null,
    status: OrderStatus.PICKER_COMPLETE,
  },
})
```

The canonical filter pattern was already used correctly in `pickerAdminService.lookupOrderByScan` (`backend/src/services/pickerAdminService.ts:94-96`, `archivedAt: null`) — reference it for any future scan-resolution code.

### Rule
**Every Prisma query that resolves a scan to an `Order` by `trackingNumber` MUST include `archivedAt: null` in its `where`.** The partial unique index makes archived duplicates legal; any query that omits this filter is a time bomb that fires when a carrier re-uses a tracking number.

Also prefer putting the expected `status` filter inside the query (single round trip, clearer intent) rather than fetching and re-checking in application code.

### Files Affected
- `backend/src/services/pickerService.ts` — `completeByTracking`
- `backend/src/services/packerService.ts` — `completeByTracking`

---

## [2026-04-18] Backend Container Never Rebuilt on CD — All Backend Fixes Silently No-Op'd

### Problem
After 6+ rounds of backend fixes (v2.5.4 → v2.12.5) addressing the "deleted users still visible" bug, none of them actually took effect on production. The backend container on Vultr was running the ORIGINAL image built weeks ago — every backend change pushed since then was silently ignored.

### Root Cause
Three-way config mismatch between Dockerfile, docker-compose.yml, and the CD script:

1. **`backend/Dockerfile`** — runtime command: `CMD ["node", "backend/dist/index.js"]`. Runs compiled JS from `/app/backend/dist/` which is baked into the image at build time.

2. **`docker-compose.yml`** — volume mount: `./backend/src:/app/backend/src`. Mounted the source directory, but the runtime never reads from there (it reads `dist/`, which was NOT mounted). So source updates on the host were invisible to the running process.

3. **`.github/workflows/cd.yml`** — deploy script:
   ```bash
   git pull origin main      # updates /opt/dom/backend/src (irrelevant — not used at runtime)
   docker compose pull       # no-op: services declared `build:` not `image:`
   docker compose up -d      # no config change → no container restart
   ```

Combined effect: `git pull` updated files the container didn't read, `pull` had no images to fetch (no `image:` field), and `up -d` saw no config diff so it left the container running. The old compiled `dist/index.js` kept running forever.

### How the Bug Looked
- Frontend fixes appeared to work (frontend runs `npx vite --host` in dev mode, reads source directly from volume — git pull propagates immediately).
- Backend fixes appeared to have no effect even after waiting, refreshing, clearing cache.
- Live `/packer-admin/stats` and `/picker-admin/stats` returned inactive users regardless of DB state, because the old baked-in code had no `isActive: true` filter.
- UI "Delete user" succeeded (backend DELETE /users/:id worked because that CRUD route was written long enough ago to be in the baked image), but the stats endpoint read the DB without filtering, so "deleted" users kept showing up.

### Fix
Two changes:
1. **`.github/workflows/cd.yml`** — force rebuild on every deploy:
   ```yaml
   docker compose up -d --build --remove-orphans
   ```
2. **`docker-compose.yml`** — tag the backend image (`ghcr.io/ozcan-k/dom-backend:latest`) and remove the useless `./backend/src` volume mount that misled every future reader into thinking the backend was in dev mode.

After the next CD run, the Vultr server will actually `docker build` fresh backend and frontend images from the pulled source, then recreate the containers — so all subsequent code changes will actually reach production.

### Rule — INFRASTRUCTURE DEBUGGING
If a "fixed" backend bug persists across multiple deploy cycles, **stop fixing the code** and verify the running container is executing the code you think it is. Ways to verify:
- `docker exec dom_backend cat /app/backend/dist/<file>.js | grep <expected-string>` — does the compiled code contain the new filter?
- `docker inspect dom_backend --format='{{.Created}}'` — when was this container created? If weeks ago, it's not running current code.
- `docker images ghcr.io/ozcan-k/dom-backend --format "{{.CreatedAt}}"` — when was the image built locally on the server?

A deploy pipeline that pushes images to a registry but doesn't actually consume them on the deploy target is a silent time bomb. Always trace the full path: source → build → image → container → process.

### Files Affected
- `.github/workflows/cd.yml` — `--build` flag on `docker compose up`
- `docker-compose.yml` — `image:` tag added; dead `backend.volumes` entry removed

---

## [2026-04-18] "Deleted" Users Still Visible — They Were Never Actually Deleted (True Root Cause)

### Problem
Across 6 fix rounds (v2.5.4 → v2.12.4) focused on cache invalidation, backend `isActive` filters, `staleTime`, orphaned assignments, and `invalidateQueries` vs `removeQueries` — test pickers (`picker1_test`, `picker2_test`, `picker3_test`, `picker11`) kept appearing in PickerAdmin workload.

### True Root Cause
**Those users had `isActive = true` in the database the whole time** — they were never successfully deleted. Direct inspection of the live `/picker-admin/stats` response proved the backend was correctly returning active-only users; they just happened to still be active.

The underlying bug: `deleteMutation` in `Settings.tsx` had **no `onError` handler**. Any failure (transaction rollback, permission error, network hiccup) was silently swallowed — the modal stayed open on failure but closed on success, making the two indistinguishable to the user. The user thought they clicked delete; the API call actually never succeeded, or was never made for those specific users.

All 6 prior cache-invalidation fixes were addressing a **symptom that wasn't the actual bug** — the data was never stale; it was always correct-per-DB. The DB was the wrong state.

### Fix
1. **Add `onError` to `deleteMutation` in `Settings.tsx`** — surface backend error messages via alert() so silent failures can never happen again:
   ```ts
   onError: (err: unknown) => {
     const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error
       ?? (err instanceof Error ? err.message : 'Failed to delete user')
     alert(`Delete failed: ${msg}`)
   }
   ```

2. **Manual cleanup of the orphan test users on live DB** (one-time):
   ```bash
   docker exec dom_backend node -e "
   const { PrismaClient } = require('@prisma/client');
   const p = new PrismaClient();
   p.user.updateMany({
     where: { username: { in: ['picker1_test','picker2_test','picker3_test','picker11','packer1_test','packer2_test','packer3_test'] } },
     data: { isActive: false }
   }).then(r => { console.log('Deactivated:', r.count); return p.\$disconnect(); }).catch(e => { console.error(e); process.exit(1); });
   "
   ```

### Rule — DEBUGGING LESSON
**Verify the DB state before blaming cache.** Before attempting any cache-invalidation fix for a "stale data" bug, check what the API is actually returning. If the API returns the "wrong" data, the bug is in the backend filter or the DB state — NOT in frontend cache.

In this case, a 30-second `curl` to `/picker-admin/stats` on day one would have proved the users were still active in the DB, saving 5 rounds of misdirected fixes.

**Always add `onError` handlers to destructive mutations.** A silent failure is strictly worse than a loud one.

### Files Affected
- `frontend/src/pages/Settings.tsx` — `deleteMutation` now has `onError`

---

## [2026-04-18] Deleted Users Still Appear in Workload — `removeQueries` vs `invalidateQueries` (Final Fix)

### Problem
After multiple fix rounds (v2.5.4 → v2.5.9), deleted users still appeared in the PickerAdmin / PackerAdmin workload sections. Switching from `invalidateQueries` to `removeQueries` in `Settings.tsx` did NOT solve it — earlier SOLUTIONS.md entry [2026-04-17 "Cache Not Cleared"] had this guidance backwards.

### Root Cause
`removeQueries` wipes the cache entry. But if PickerAdmin / PackerAdmin is **currently mounted** (common: admin deletes a user in Settings while another tab or the page above still holds the component), `removeQueries` does NOT force the mounted component's active `useQuery` observer to refetch. The observer keeps its last-rendered React state until:
- the next `refetchInterval` tick (up to 10s later), or
- the component unmounts and remounts.

`invalidateQueries`, in contrast, marks the query stale AND immediately triggers a refetch on every active observer — exactly what we need for cross-page deletions.

### Fix
`Settings.tsx` `deleteMutation.onSuccess` uses `invalidateQueries` for all cross-page keys:
```ts
queryClient.invalidateQueries({ queryKey: ['users'] })
queryClient.invalidateQueries({ queryKey: ['picker-admin-stats'] })
queryClient.invalidateQueries({ queryKey: ['picker-admin-pickers'] })
queryClient.invalidateQueries({ queryKey: ['packer-admin-stats'] })
```

Combined with the prior `staleTime: 0` + `refetchOnMount: 'always'` overrides on those queries (from entry [2026-04-18 "Global staleTime:30s"]), this covers both code paths:
- Mounted component → `invalidateQueries` forces an immediate refetch.
- Unmounted component → next mount refetches because `staleTime: 0` + `refetchOnMount: 'always'`.

### Rule
For cross-page cache updates triggered by a mutation, use `invalidateQueries` (NOT `removeQueries`). The only time to prefer `removeQueries` is when you want to free memory for a query no component will ever observe again.

Earlier guidance in this file recommending `removeQueries` for "cross-page caches" is **incorrect** — this entry supersedes it.

### Files Affected
- `frontend/src/pages/Settings.tsx` — `deleteMutation.onSuccess`

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

~~Use `removeQueries` (not `invalidateQueries`) for cross-page caches: removes data entirely so no stale flash occurs on next mount.~~ **SUPERSEDED** — see [2026-04-18 "Final Fix"] entry at top of file. `removeQueries` does not refetch on mounted components; use `invalidateQueries` for cross-page cache updates.

### Files Affected
- `frontend/src/pages/Settings.tsx` — `deleteMutation.onSuccess`

---

## [2026-04-18] Global staleTime:30s Preventing Immediate Refetch on Page Navigation

### Problem
After deleting a picker/packer from Settings, the workload section and picker assignment dropdown in PickerAdmin/PackerAdmin still showed the deleted user when navigating back to those pages — even though `removeQueries` was being called.

### Root Cause
`App.tsx` sets a global `staleTime: 30_000` for all queries. This means React Query considers fetched data "fresh" for 30 seconds. When PickerAdmin mounts after a deletion:
- If cache still exists and was fetched < 30s ago → `refetchOnMount: true` does NOT refetch (data is "fresh")
- The deleted user remains visible until the staleTime expires or `refetchInterval` fires

The `['picker-admin-pickers']` query had no `refetchInterval`, so it could show stale data for the full 30 seconds.

### Fix
Override the global staleTime at the query level for all picker/packer admin queries:

```ts
// PickerAdmin.tsx — pickers dropdown
const { data: pickers } = useQuery({
  queryKey: ['picker-admin-pickers'],
  staleTime: 0,
  refetchOnMount: 'always',   // bypasses staleTime entirely on mount
  ...
})

// PickerAdmin.tsx — stats workload
const { data: statsData } = useQuery({
  queryKey: ['picker-admin-stats'],
  staleTime: 0,              // always stale → always refetches on mount
  refetchInterval: 10_000,
  ...
})

// PackerAdmin.tsx — stats workload
const { data: statsData } = useQuery({
  queryKey: ['packer-admin-stats'],
  staleTime: 0,
  refetchInterval: 10_000,
  ...
})
```

Combined with `removeQueries` in `Settings.tsx deleteMutation.onSuccess`, this ensures deleted users never appear regardless of timing or navigation pattern.

### Rule
When a query displays data that can be changed by a mutation on ANOTHER page, always set `staleTime: 0` (and `refetchOnMount: 'always'` if no `refetchInterval`) on that query. Never rely solely on the global staleTime for cross-page consistency.

Do NOT set a high global `staleTime` for queries that must reflect deletions/deactivations across pages.

### Files Affected
- `frontend/src/pages/PickerAdmin.tsx` — `['picker-admin-pickers']` and `['picker-admin-stats']` queries
- `frontend/src/pages/PackerAdmin.tsx` — `['packer-admin-stats']` query

---

## [2026-04-18] deleteUser Leaves Orphaned pickerAssignment / packerAssignment Records

### Problem
When a picker or packer was deactivated (soft-deleted) via `DELETE /users/:id`, their incomplete assignments (`completedAt: null`) were NOT deleted from the `PickerAssignment` / `PackerAssignment` tables. The orders were correctly moved back to INBOUND / PICKER_COMPLETE, but the assignment rows remained. This is a data integrity issue that could cause subtle bugs in future queries.

### Root Cause
`deleteUser` in `userService.ts` correctly reassigned orders but did not call `deleteMany` on the assignment records afterwards.

### Fix
After reassigning orders, delete the now-orphaned incomplete assignments:
```ts
// For PICKER
await tx.pickerAssignment.deleteMany({
  where: { pickerId: userId, completedAt: null },
})

// For PACKER
await tx.packerAssignment.deleteMany({
  where: { packerId: userId, completedAt: null },
})
```

### How to delete test users from live DB (one-time cleanup)
SSH into the Vultr server, then run:
```bash
docker exec dom_backend node -e "
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
p.user.updateMany({
  where: { username: { in: ['picker1_test','picker2_test','picker3_test','picker11','packer1_test','packer2_test','packer3_test'] } },
  data: { isActive: false }
}).then(r => { console.log('Deactivated:', r.count); return p.\$disconnect(); }).catch(e => { console.error(e); process.exit(1); });
"
```

### Rule
When deactivating a user, ALWAYS clean up their incomplete assignment records in the same transaction. Orphaned assignments with `completedAt: null` are invisible to the UI (filtered by `isActive: true`) but pollute the DB and can cause subtle bugs.

### Files Affected
- `backend/src/services/userService.ts` — `deleteUser()`

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
