# Dynamic Order Management System — Architecture Document

> **Version:** 2.29.0  
> **Date:** 2026-05-02  
> **Status:** Live (deployed 2026-05-02, merge commit `13fb7c2`) — **Packer flow rebuilt**: shared queue replaced with per-packer pre-assignment (mirrors picker flow). `OrderStatus.PACKER_ASSIGNED` finally activated. New `/packer-admin/{assign,bulk-assign,scan,handheld-bulk-scan,pending-staged,unassign}` endpoints; new `/packer-admin-scan` phone page with green theme; PackerAdmin desktop gains Scan & Stage section + per-row PACKER_ASSIGNED badge; PackerMobile shows assigned-only list with empty-state copy "Waiting for admin to assign orders". Bug fix: ScanLogin now routes PACKER_ADMIN to `/packer-admin-scan` (was `/packer-admin`). Status flow `PICKER_COMPLETE → PACKER_ASSIGNED → PACKER_COMPLETE → OUTBOUND` (auto-dispatch preserved). Remove still auto-reassigns to original picker for either PACKER_ASSIGNED or PACKER_COMPLETE per user decision. (v2.29.0)

---

## 1. Project Overview

**Dynamic Order Management (DOM)** is a warehouse order tracking system designed to manage the full lifecycle of e-commerce orders from arrival (inbound) through picking, packing, and final dispatch (outbound).

### Business Context
- A single warehouse company currently, with architecture ready to support multiple companies (multi-tenant)
- Orders arrive daily from multiple e-commerce platforms: **Shopee**, **Lazada**, **TikTok Shop**, **Direct** (in-house waybills with DR prefix)
- **Timezone:** All timestamps, schedules, and "start of day" calculations are anchored to **Asia/Manila (UTC+8, PHT — no DST)**. The cron jobs use UTC values that map to Manila local time. The frontend displays all dates and times in Manila time regardless of the user's browser timezone.
- Physical waybills are scanned using barcode scanners to enter orders into the system
- 50–100 staff members use the system simultaneously
- Daily volume: ~10,000 orders
- Data retention: minimum 6 months

### Core Workflow
```
07:00  Inbound Admin scans ~1500 waybills (work_date set to today)
        │  SLA 4-hour countdown starts (D0)
        │  [Direct] DR+8-digit tracking generated via "Generate Direct Inbound"
        ▼
  Picker Admin assigns → Picker prepares on handheld
        │
        ▼
  Packer Admin queue (auto) → Packer scans on handheld
        │   ↑ Remove → auto-reassigns back to original picker
        ▼
     Outbound ← SLA countdown ends
        │  [Historical view] Date navigator shows past days' carrier/shop reports
        │
11:00  Archive job runs: all OUTBOUND orders → archived_at set
        │  Active panels show 0 OUTBOUND rows
        │  Incomplete orders carry over to next day (CARRY badge)
        ▼
11:10  Nightly report email + hard-delete of orders > 180 days archived
```

**Carryover:** Orders not completed by end of shift remain active the next day. They are shown with an amber **CARRY** badge in all admin panels so supervisors can prioritize them.

**Daily cycle repeats** — new waybills each morning, incomplete orders carry forward, completed orders archived at 11:00.

### SLA Policy (D0–D4)
Every order must be completed (reach **OUTBOUND**) within **4 hours** of scanning. If it is not, it escalates through delay levels automatically:

| Level | Elapsed Time Since Scan | Priority Boost | Action Required |
|---|---|---|---|
| **D0** | 0–4 hours | +0 | Normal processing |
| **D1** | 4–8 hours | +200 | Prioritize over new orders |
| **D2** | 8–12 hours | +400 | Urgent — team lead attention |
| **D3** | 12–16 hours | +800 | Serious — immediate action |
| **D4** | 16+ hours | +1600 | Critical — supervisor notified by email & live alert |

- D-level escalation runs automatically every **15 minutes** via a background job
- D4 is the maximum — no further escalation, but supervisor is alerted immediately
- D-level is **independent** of status (an order can be D2 while still in PICKING)
- D-level **resets only when the order reaches OUTBOUND**

---

## 2. System Architecture

```
┌────────────────────────────────────────────────────────────────────────────┐
│                                 CLIENTS                                    │
│                                                                            │
│  ┌──────────────────────────────────┐  ┌────────────────────────────────┐ │
│  │  Desktop Browser (React)         │  │  Handheld Device (Android)     │ │
│  │  Admin / Inbound / Picker Admin  │  │  Picker & Packer               │ │
│  │  Packer Admin / Outbound         │  │  + Inbound Admin Scan          │ │
│  │  + HID Barcode Scanner (inbound) │  │  + Picker Admin Scan           │ │
│  │                                  │  │  Chrome browser — HTTPS/LAN    │ │
│  └──────────────────┬───────────────┘  └──────────────┬─────────────────┘ │
└─────────────────────┼────────────────────────────────── ┼──────────────────┘
                      │         HTTPS + WSS               │
┌─────────────────────▼───────────────────────────────────▼──────────────────┐
│                         BACKEND (Node.js + Fastify)                        │
│                                                                            │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐                    │
│  │   Auth API   │  │  Orders API  │  │  Users API   │                    │
│  │  POST /login │  │  GET/POST    │  │  CRUD        │                    │
│  │  POST /logout│  │  /orders/*   │  │  /users/*    │                    │
│  └──────────────┘  └──────────────┘  └──────────────┘                    │
│                                                                            │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────────────┐    │
│  │ Assign API   │  │ Reports API  │  │  WebSocket (Socket.io)       │    │
│  │ /assign/*    │  │ /reports/*   │  │  tenant:{id} — broadcast     │    │
│  └──────────────┘  └──────────────┘  │  user:{id}  — targeted push  │    │
│                                       └──────────────────────────────┘    │
│                                                                            │
│  ┌──────────────────────────────────────────────────────────────────────┐ │
│  │  BullMQ Job Queue                                                    │ │
│  │  → Archive job 11:00 AM PHT (03:00 UTC): OUTBOUND orders archived    │ │
│  │  → Nightly 11:10 AM PHT (03:10 UTC): email + hard-delete expired    │ │
│  │  → SLA sweep every 15 min: D0→D1→D2→D3→D4 escalation                │ │
│  │  → D4 supervisor alert email (triggered by sweep)                    │ │
│  └──────────────────────────────────────────────────────────────────────┘ │
└─────────────────────┬──────────────────────────┬───────────────────────────┘
                      │                          │
           ┌──────────▼──────────┐  ┌────────────▼───────────┐
           │    PostgreSQL 16    │  │         Redis           │
           │                    │  │                         │
           │  orders            │  │  JWT sessions           │
           │  users             │  │  order list cache       │
           │  tenants           │  │  BullMQ job queues      │
           │  assignments       │  │  socket user→room map   │
           │  status_history    │  └─────────────────────────┘
           │  sla_escalations   │
           └────────────────────┘
```

---

## 3. Order Status Lifecycle

```
┌───────────────────────────────────────────────────────────────────────┐
│                      ORDER STATUS FLOW                                │
│                                                                       │
│  [INBOUND]  ← sla_started_at set, delay_level = D0                   │
│      │  Inbound Admin scans waybill                                   │
│      ▼                                                                │
│  [PICKER_ASSIGNED]  ←──────────────────────────────────────────────┐ │
│      │  Picker Admin assigns to a Picker                            │ │
│      ▼                                                              │ │
│  [PICKING]                                                          │ │
│      │  Picker starts preparing the order                           │ │
│      ▼                                                              │ │
│  [PICKER_COMPLETE]                                                  │ │
│      │  Picker marks as complete (on handheld)                      │ │
│      │  Order automatically appears in Packer Admin queue           │ │
│      ▼                                                              │ │
│  ─ ─ ─ ─ ─ Packer Admin Panel ─ ─ ─ ─ ─                           │ │
│  │  Packer scans waybill on handheld → [PACKER_COMPLETE]            │ │
│  │  OR: Packer Admin manually completes → [PACKER_COMPLETE]         │ │
│  │  OR: Packer Admin removes → auto-reassigns to original picker ───┘ │
│  ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─                           │
│      ▼                                                                │
│  [PACKER_COMPLETE]                                                    │
│      │  Packer completes packing                                      │
│      ▼                                                                │
│  [OUTBOUND]  ← sla_completed_at set, SLA countdown ends              │
│      │  Order dispatched                                              │
│      ▼                                                                │
│    Done                                                               │
└───────────────────────────────────────────────────────────────────────┘
```

> **Note:** `PACKER_ASSIGNED` and `PACKING` statuses exist in the enum for future use but are **not used** in the current implementation. The packing flow goes directly PICKER_COMPLETE → PACKER_COMPLETE. No pre-assignment step is required for packers.

> **Important:** The SLA D-level escalates based on wall-clock time since scan — it is **independent of status**. An order can be at D2 while still in PICKING. Status and D-level are two separate dimensions.

### Priority Rules
| Scenario | Priority Change |
|---|---|
| Order scanned | 0 (default) |
| End of day — unassigned carryover | +100 |
| SLA escalates to D1 | +200 |
| SLA escalates to D2 | +400 (delta: +200 from D1) |
| SLA escalates to D3 | +800 (delta: +400 from D2) |
| SLA escalates to D4 | +1600 (delta: +800 from D3) |

Priority boosts are **additive** — a D2 carryover order has priority 500 (100 + 400). Orders are always sorted `priority DESC, created_at ASC`.

---

## 4. Waybill Scanning — Real-World Analysis

> Based on actual waybill analysis from Shopee, Lazada, and TikTok samples (real barcodes decoded).

### What a Barcode Scan Returns

All three platforms encode **only the tracking number** in their barcode/QR code — nothing else:

| Platform | Tracking Number Format | Example | Waybill Type |
|---|---|---|---|
| Shopee | Starts with `PH` | `PH269238346086D` | Text-based (PDF) |
| Lazada | Starts with `P` or `MP` | `P1416JAAX7QAJ`, `MP1455630180` | Image-based (scan) |
| TikTok | Starts with `JT` (J&T Express) | `JT0015937203819` | Text-based (PDF) |

Both barcode (CODE128) and QR code on the same waybill encode **identical data** — just the tracking number.

> **TikTok Note:** TikTok waybills contain a separate "TT Order ID" (e.g. `583406071177971250`) which is TikTok's internal order reference. The system uses the **tracking number** (`JT...`) as the unique key — not the TT Order ID.

### Scanner Hardware

| | Device |
|---|---|
| **Device** | HID Barcode Scanner (Zebra, Honeywell, or equivalent) |
| **Connection** | USB or Bluetooth |
| **Driver required** | None — OS sees it as a USB keyboard |
| **Library** | None needed |
| **Use case** | Main workstation inbound scanning |

> HID scanners emulate a keyboard at the OS level. No SDK, no driver, no special integration — plug in and it works in any browser input field.

### Inbound Entry Flow Per Order

```
Worker pulls trigger on HID scanner
        │
        ▼ (USB / Bluetooth — keyboard emulation)
OS receives keystrokes: "PH269238346086D\n"
        │
        ▼
Focused input field receives the string + Enter (terminator)
        │
        ├── tracking_number = "PH269238346086D"   ← from scan
        ├── platform = "Shopee"                    ← auto-detected from "PH" prefix
        │
        ▼
Order saved → appears in Picker Admin Panel
```

**Total time per order at inbound: ~2 seconds — zero manual input**

> `scanDetect.ts` distinguishes scanner input (keystroke interval < 50ms) from manual typing (> 200ms). The same input field handles both modes — no separate scanner UI needed.

### Platform Auto-Detection Rules

```
Tracking Number Prefix → Platform
─────────────────────────────────
PH...  →  Shopee
JT...  →  TikTok (J&T Express)
MP...  →  Lazada
P...   →  Lazada  (checked last — broadest pattern)
other  →  Unknown / Manual selection
```

> Detection order matters: `JT` and `PH` are checked before `P` to avoid false matches.

### Platform Waybill Comparison (verified from real samples)

| Feature | Shopee | Lazada | TikTok |
|---|---|---|---|
| PDF type | Text-based | Image-based | Text-based |
| Barcode → Tracking # | ✅ `PH...` | ✅ `P...` / `MP...` | ✅ `JT...` |
| QR code | ✅ Same as barcode | ✅ Same as barcode | ✅ Same as barcode |
| Platform logo on waybill | SPX | Flash / Lazada | TikTok Shop + J&T |
| Separate Order ID | ❌ | ❌ | ✅ TT Order ID (not used by system) |
| Product list on waybill | ✅ Packing List | ❌ | ✅ Full product list |
| Item count on waybill | ✅ | ❌ | ✅ Qty Total |
| Weight on waybill | ✅ | ❌ | ✅ |
| Payment type | ✅ COD / NonCOD | ✅ NonCOD | ✅ PP_PM (prepaid) |

> Product list and item count are visible on Shopee and TikTok waybills — workers read these directly from the physical waybill. The system does not record them.

### Fields Intentionally NOT Tracked

| Field | Reason Excluded |
|---|---|
| Store / seller name | Physical waybill shows this — not needed in system; no per-store reporting required |
| Item count | Worker reads from physical waybill; no system verification needed |
| Buyer name & address | Handled by courier — irrelevant to warehouse ops |
| Product names / SKU | Picker handles physical package, not product list |
| Weight | Measured by courier, not warehouse concern |
| COD amount | Accounting system responsibility |
| TikTok TT Order ID | System uses tracking number as unique key — TT Order ID is redundant |

---

## 5. Database Schema

### Entity Relationship Overview

```
tenants ──< users
tenants ──< orders
orders ──< order_status_history
orders ──< picker_assignments >── users (pickers)
orders ──< packer_assignments >── users (packers)
```

> **Design decision:** No separate `stores` table. Shop name is stored as a free-text nullable string on the `orders` table (`shop_name`). Distinct values are queried dynamically for the Bulk Scan dropdown — no additional CRUD UI needed.

### Table Definitions

#### `tenants`
| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| name | VARCHAR | Company name |
| slug | VARCHAR UNIQUE | URL-friendly identifier |
| is_active | BOOLEAN | |
| created_at | TIMESTAMPTZ | |

#### `users`
| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| tenant_id | UUID FK | → tenants |
| username | VARCHAR | Unique per tenant |
| password_hash | VARCHAR | bcrypt |
| role | ENUM | See roles below |
| is_active | BOOLEAN | |
| created_by | UUID FK | → users (admin who created) |
| created_at | TIMESTAMPTZ | |

**Role ENUM values:** `ADMIN`, `INBOUND_ADMIN`, `PICKER_ADMIN`, `PACKER_ADMIN`, `PICKER`, `PACKER`

#### `orders`
| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| tenant_id | UUID FK | → tenants |
| tracking_number | VARCHAR | Unique per tenant |
| platform | ENUM | `SHOPEE`, `LAZADA`, `TIKTOK`, `DIRECT`, `OTHER` — auto-detected from tracking number prefix (DR→DIRECT) |
| carrier_name | VARCHAR | Logistics carrier (e.g. `SPX`, `JT_EXPRESS`, `FLASH`, `LEX`, `LBC`, `NINJA_VAN`, `OTHER`). **Required** at Bulk Scan time. |
| shop_name | VARCHAR | Seller shop name (e.g. "Picky_Farm"). **Required** at Bulk Scan time. Chosen from 18 preset shop names or typed manually. |
| status | ENUM | See status flow |
| priority | INTEGER | Higher = more urgent; default 0, carryover +100, SLA boosts added on escalation |
| delay_level | INTEGER | SLA delay level: 0=D0, 1=D1, 2=D2, 3=D3, 4=D4; default 0 |
| sla_started_at | TIMESTAMPTZ | Set on INSERT (when order is scanned); never overwritten |
| sla_completed_at | TIMESTAMPTZ NULLABLE | Set when status → OUTBOUND; null = SLA still active |
| d4_notified_at | TIMESTAMPTZ NULLABLE | Set when D4 supervisor alert is sent; prevents duplicate alerts |
| work_date | TIMESTAMPTZ | Start of the day the order was scanned (set explicitly at scan time, not derived from created_at) |
| archived_at | TIMESTAMPTZ NULLABLE | null = active; non-null = archived. OUTBOUND orders are archived at 11:00 AM PHT daily. |
| scanned_by | UUID FK | → users (inbound admin) |
| created_at | TIMESTAMPTZ | |
| updated_at | TIMESTAMPTZ | |

**Status ENUM values:** `INBOUND`, `PICKER_ASSIGNED`, `PICKING`, `PICKER_COMPLETE`, `PACKER_ASSIGNED`, `PACKING`, `PACKER_COMPLETE`, `OUTBOUND`

#### `order_status_history`
| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| order_id | UUID FK | → orders |
| from_status | ENUM NULLABLE | null on first entry |
| to_status | ENUM | |
| changed_by | UUID FK | → users |
| changed_at | TIMESTAMPTZ | |

#### `picker_assignments`
| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| order_id | UUID FK | → orders |
| picker_id | UUID FK | → users |
| assigned_by | UUID FK | → users (picker admin) |
| assigned_at | TIMESTAMPTZ | |
| completed_at | TIMESTAMPTZ NULLABLE | |

#### `packer_assignments`
| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| order_id | UUID FK | → orders |
| packer_id | UUID FK | → users |
| assigned_by | UUID FK | → users (packer admin) |
| assigned_at | TIMESTAMPTZ | |
| completed_at | TIMESTAMPTZ NULLABLE | |

#### `sla_escalations`
Append-only audit log of every D-level transition. Never updated or deleted.

| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| order_id | UUID FK | → orders |
| tenant_id | UUID FK | → tenants (for RLS) |
| from_level | INTEGER NULLABLE | null on initial D0 entry at scan time |
| to_level | INTEGER | 0–4 |
| triggered_at | TIMESTAMPTZ | When escalation occurred |
| trigger_source | VARCHAR | `SCAN` (initial), `JOB` (auto escalation) |

### Indexes
```sql
-- Active orders unique constraint (partial — archived orders with same TN can co-exist)
CREATE UNIQUE INDEX orders_tenant_tracking_active_unique
  ON orders (tenant_id, tracking_number)
  WHERE archived_at IS NULL;

CREATE INDEX ON orders (tenant_id, status);
CREATE INDEX ON orders (tenant_id, created_at DESC);
CREATE INDEX ON orders (tenant_id, priority DESC, created_at ASC);
CREATE INDEX ON orders (tenant_id, shop_name);   -- GET /orders/shops distinct query
CREATE INDEX ON picker_assignments (picker_id, completed_at);
CREATE INDEX ON packer_assignments (packer_id, completed_at);

-- Daily cycle & archive indexes
CREATE INDEX ON orders (tenant_id, work_date);
CREATE INDEX ON orders (tenant_id, archived_at);
CREATE INDEX ON orders (tenant_id, status, archived_at);  -- all active status queries

-- SLA sweep index: fast scan for escalation-eligible orders (partial — excludes completed orders)
CREATE INDEX ON orders (tenant_id, delay_level, sla_started_at)
  WHERE sla_completed_at IS NULL;

-- SLA dashboard summary
CREATE INDEX ON orders (tenant_id, delay_level)
  WHERE sla_completed_at IS NULL;

-- SLA audit trail
CREATE INDEX ON sla_escalations (order_id);
CREATE INDEX ON sla_escalations (tenant_id, triggered_at DESC);
```

> **Important:** The old `@@unique([tenantId, trackingNumber])` full unique constraint has been replaced by the partial index above. This allows the same tracking number to be re-scanned after the original order is archived (e.g. a redelivery the next day).

---

## 6. User Roles & Permissions

| Panel / Action | Admin | Inbound Admin | Picker Admin | Packer Admin | Picker | Packer |
|---|:---:|:---:|:---:|:---:|:---:|:---:|
| **Main Dashboard** | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| **Inbound — view** | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |
| **Inbound — scan & add** | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| **Inbound — delete** | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| **Picker Admin Panel** | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ |
| **Inbound Handheld Scan** (`/inbound-scan`) | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| **Picker Admin Handheld Scan** (`/picker-admin-scan`) | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ |
| **Picker Device View** (handheld) | ❌ | ❌ | ❌ | ❌ | Own only | ❌ |
| **Packer Admin Panel** | ✅ | ❌ | ❌ | ✅ | ❌ | ❌ |
| **Packer Device View** (handheld) | ❌ | ❌ | ❌ | ❌ | ❌ | Own only |
| **Outbound Panel** | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| **User Management** | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Reports (all)** | ✅ | ✅ | Picker only | Packer only | ❌ | ❌ |
| **Archive Panel** | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |

### User Creation Rules
- Only **Admin** can create, edit, or deactivate users
- Admin sets both username and password at creation time
- New users cannot self-register
- Deactivated users cannot log in but their historical data is preserved

### Sales Agent Role (v2.23.1)

`SALES_AGENT` is a **cross-cutting role** — it does **not** participate in the order lifecycle (inbound → picker → packer → outbound). Sales agents track their own daily activities (content posts, live selling, marketplace reports, direct orders) and the admin aggregates these into a `/marketing-report` leaderboard + comparison charts.

| Panel / Action | Admin | Sales Agent |
|---|:---:|:---:|
| **Settings → Sales Agents** (create/disable agents) | ✅ | ❌ |
| **`/sales` — month calendar dashboard** | ❌ | ✅ Own only |
| **`/sales` — Enter Today's Report** (daily activity form) | ❌ | ✅ Own only |
| **`/sales` — day-detail modal** (historical drill-down) | ❌ | ✅ Own only |
| **`/marketing-report` — leaderboard + charts** (Today preset w/ LIVE auto-refresh v2.27.1) | ✅ | ✅ (v2.26.0) |
| **`/marketing-report` — `AgentDetailPanel`** (per-agent drill-down) | ✅ | ✅ (v2.26.0) |
| **Direct order edit + delete** (own orders from My Activity + My Orders; admin edits any via agent day modal — audit-logged, v2.28.0) | ✅ Any agent | ✅ Own only |
| **Any order/inbound/picker/packer panel** | (unchanged) | ❌ |

**Key isolation:** sales agents have zero read/write access to orders, users, or any warehouse data. The role only touches the `sales_*` tables. Marketing report read access (v2.26.0+) exposes other agents' `sales_*` aggregates — every call is logged by `backend/src/middleware/auditLog.ts` (userId, role, tenantId, method, url, ts) via fastify logger.

---

## 7. Panels — Detailed Specification

### 7.1 Main Dashboard
**Visible to:** Admin, Inbound Admin

- Live date and time display
- "Dynamic Order Management" logo and branding
- Real-time stats updated via WebSocket:
  - Inbound order count | Outbound order count | Remaining order count
  - **Carryover Active** — orders scanned on a previous day still not completed (amber card)
  - Remaining orders breakdown by department (Picker / Packer)
- **Picker Summary:** Total | Unassigned | Assigned | In Progress | Complete
- **Packer Summary:** Total | Unassigned | Assigned | In Progress | Complete
- **SLA Summary Card:** Live D-level breakdown bar (D0 / D1 / D2 / D3 / D4 counts); D4 count highlighted in red; updates via Socket.io `sla:escalated` event
- **Nightly Report:** Automated email sent at **11:10 AM PHT** (03:10 UTC) daily to all Admin users

---

### 7.2 Inbound Panel ✅ Built (Phase 2 + Phase 10 + Daily Cycle)
**Visible to:** Admin (edit), Inbound Admin (edit+delete), Picker Admin (view), Packer Admin (view)

**Carryover Section:** Orders scanned on a previous day (`work_date < today`) that are still in INBOUND status appear in a separate "Carryover Orders" section above "Today's Orders", with an amber left-border and clock icon.

**Single Scan Flow:**
1. Worker focuses the scan input field
2. Scans waybill barcode → tracking number auto-filled, platform auto-detected
3. Order saved immediately, appears in table — carrier/shop left null

**Bulk Scan Flow (added Phase 10):**
1. Admin clicks "Bulk Scan" button → `BulkScanModal` opens (rendered via `createPortal`)
2. Admin scans barcodes one by one → staging list builds up (client-side only, no DB writes yet)
   - Duplicate TN in same batch: client-side warning, not re-added
   - Each row shows: index | tracking number | platform badge | remove button
3. Admin selects **Carrier** (required) from dropdown: SPX / J&T / Flash / LEX / LBC / Ninja Van / Other
4. Admin selects or types **Shop Name** (required): dropdown shows 18 preset shop names merged with distinct past values from `GET /orders/shops`; or type a new name manually. Confirm button stays disabled until both Carrier and Shop Name are filled — yellow warning shown if either is missing after items are staged.
5. Admin clicks Confirm → `POST /orders/bulk-scan` → all orders created atomically with carrier + shop
6. Modal closes; success/partial-duplicate banner shown; order table refreshes

**Order Table Columns:** Tracking Number | Platform | Carrier | Shop | Delay (D-badge) | Scan Time | Scanned By | Actions

**Pagination:** 25 orders per page, client-side. Header stats (Total + D0–D4 counts) reflect full dataset regardless of current page.

**Sort order:** priority DESC → delayLevel DESC → createdAt ASC (most urgent first)

**Actions:**
- Inbound Admin / Admin: Delete order button (with confirmation dialog)

**API Endpoints:**
| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/orders/scan` | ADMIN, INBOUND_ADMIN | Single scan — creates one order with carrier + shop |
| `POST` | `/orders/bulk-scan` | ADMIN, INBOUND_ADMIN | Bulk scan — creates up to 200 orders with carrier + shop; returns `{ created, duplicates[] }` |
| `GET` | `/orders/shops` | ADMIN, INBOUND_ADMIN | Returns distinct shop names used so far (for Bulk Scan dropdown) |
| `POST` | `/orders/handheld-scan` | ADMIN, INBOUND_ADMIN | Phone signals desktop (no DB write) — checks duplicate, emits `order:handheld-scan` socket event |
| `POST` | `/orders/handheld-bulk-scan` | ADMIN, INBOUND_ADMIN | Phone sends multiple TNs to desktop (no DB write) — emits `order:handheld-bulk-scan` socket event |

**Handheld Scan Flow (phone → desktop):**

```
Phone (/inbound-scan)                     Desktop (Inbound Panel)
──────────────────                        ───────────────────────
Single Scan mode:
  Camera scans barcode
  → POST /orders/handheld-scan
    (backend checks duplicate)
    → emits order:handheld-scan ────────→ QuickScanModal opens
                                           Admin selects Carrier + Shop
                                           → POST /orders/scan → order saved

Bulk Scan mode:
  Camera scans multiple barcodes
  → accumulate list on phone
  → POST /orders/handheld-bulk-scan
    → emits order:handheld-bulk-scan ──→ BulkScanModal opens (pre-filled)
                                          Admin selects Carrier + Shop
                                          → POST /orders/bulk-scan → orders saved
```

---

### 7.3 Picker Admin Panel ✅ Built (Phase 3 + 4 + 5 + Handheld PIN Management)
**Visible to:** Admin, Picker Admin

**Carryover:** Orders scanned on a previous day (`work_date < today`) are shown with an amber **CARRY** badge in the Inbound table. The section header shows a carryover count next to an amber clock icon so supervisors can prioritize them.

**Header Stats Bar:** Inbound count | Assigned Today | Total Completed | Returned from Packer | Pickers count | Sync indicator

> **Total Completed** stat: count of all picker assignments where `completedAt IS NOT NULL` for the tenant. Decreases when Packer Admin returns an order (the assignment's `completedAt` is reset to null).  
> **Returned from Packer** stat: counts orders currently in PICKER_ASSIGNED status that were returned by Packer Admin (have a status history entry PICKER_COMPLETE → PICKER_ASSIGNED). Picker workload cards show an amber `↩ Returned: N` badge for pickers who have re-assigned orders.

---

#### Scan & Stage Flow (primary assignment method)

The top section of the panel is designed for the real-world scenario where a Picker Admin has a stack of printed waybills and a handheld barcode scanner.

**Flow:**
1. Picker Admin scans a waybill into the Scan Input → system looks up the order by tracking number
2. If found and INBOUND: order is added to the **staging list** (client-side, no DB write yet)
3. Admin scans more waybills one by one — staging list grows
4. Admin selects a Picker from the dropdown
5. Clicks **"Assign N Staged Orders →"** → all staged orders are bulk-assigned in one request
6. Staging list clears; Inbound table updates automatically

**Feedback (inline, no alerts):**
- Success: green message `Staged: <tracking number>`
- Duplicate scan: yellow warning `Already staged: <tracking number>` (not re-added)
- Not found: red error `Order not found`
- Already assigned: yellow warning `Already assigned to <picker username>` — names the active picker so the admin can follow up directly
- Other non-INBOUND status (no active picker): red error `Not available (<status>)`

**Staged orders list:**
- Rows: # | Tracking Number | Platform badge | Delay badge | Priority | × remove button
- Header shows count + "Clear all" button
- Staged rows in the Inbound table get a green tint + **STAGED** pill badge

**Backend endpoint:**
```
POST /picker-admin/scan   { trackingNumber }
  → 200: order data (id, trackingNumber, platform, delayLevel, priority, status, createdAt)
  → 404: Order not found
  → 409: Already assigned to <picker> | Not available (<status>)
```

**Handheld Scan Flow — Picker Admin Phone (`/picker-admin-scan`):**

```
Phone (/picker-admin-scan)                Desktop (Picker Admin Panel)
──────────────────────────                ────────────────────────────
Single Scan mode:
  Camera scans barcode
  → POST /picker-admin/scan
    (validates order is INBOUND)
    → emits order:staged ─────────────→ Order auto-appears in Staging area
                                          Admin selects Picker from dropdown
                                          → Assign Staged Orders

Bulk Scan mode:
  Camera scans multiple barcodes
  → accumulate list on phone
  → POST /picker-admin/handheld-bulk-scan
    (validates each TN)
    → emits order:staged per valid TN → Orders added to Staging area
                                          Admin selects Picker → Assign all
```

```
POST /picker-admin/handheld-bulk-scan   { trackingNumbers: string[] }
  → 200: { results: [{ trackingNumber, status: 'staged'|'not_found'|'error' }] }
```
This endpoint performs a lookup only — it does NOT create orders. Order creation is handled exclusively by the Inbound Panel (`POST /orders/scan`).

---

#### Manual Assignment Flow (secondary, for browsing)

**Picker Select Dropdown:** Shared with Scan & Stage — single picker selection used by both flows.

**Toolbar (below scan area):**
- Select All checkbox + selected count badge
- Assign Selected button (assigns checked rows to selected picker)
- Assign All button (assigns all INBOUND orders to selected picker)

**Inbound Order Table:**
- Columns: Checkbox | # | Tracking Number | Platform (badge) | Delay (D-badge) | Scanned At | Scanned By (avatar) | Priority | Assign button
- Sort: priority DESC → delayLevel DESC → createdAt ASC (D4 always at top)
- Pagination: 10 orders per page, page number buttons, "Showing X–Y of Z" counter
- Row tinting: D2 = amber, D3/D4 = red; selected rows = blue; staged rows = green
- Assign button per row: assigns single order to currently selected picker

---

#### Picker Workload Section

- Grid of picker cards (auto-fill, min 240px per card)
- Each card shows: Avatar + username | active count badge | Assigned / Done status chips | segmented progress bar (blue/green)
- **Click on any card → opens Order Detail Modal**

**Order Detail Modal (per picker):**
- Shows all active orders assigned to that picker (completedAt = null)
- Columns: Tracking Number | Platform | Status chip | Delay | Assigned At | Actions
- Status chips: Assigned (blue) | Done (green)
- Actions per row (shown only for non-complete orders):
  - **Remove** (red) → opens styled Remove Confirmation Dialog → on confirm: order returns to INBOUND queue
  - **Complete** (green) → opens styled Complete Confirmation Dialog → on confirm: order marked PICKER_COMPLETE
- Modal refetches every 3 seconds
- Closes on overlay click or X button

**Complete Confirmation Dialog:**
- Custom styled modal (z-index above order detail modal)
- Green gradient header + checkmark icon
- Shows tracking number in a styled pill
- Cancel / ✓ Yes, Complete buttons

**Remove Confirmation Dialog:**
- Custom styled modal (z-index above order detail modal)
- Red gradient header + trash icon
- Shows tracking number in a styled pill
- Cancel / Yes, Remove buttons

**Seed data:** 20 pickers (Picker 1–20, password: `picker123`) created by seed script. Pickers log in via the standard `/login` page with username + password.

---

### 7.4 Picker Device View ✅ Built
**Visible to:** PICKER role (own orders only)  
**Route:** `/picker` (public — no traditional login required)  
**Target device:** Android/iOS handheld — Chrome browser over WiFi (same LAN as server)  
**Design:** Mobile-first, touch-optimized, no sidebar, dark PIN screen + light order list

**Authentication — Username + Password:**
- Picker opens `http://<server-ip>:5173/login` on the handheld browser (Chrome over WiFi)
- Enters username + password → standard JWT cookie set (same `/auth/login` endpoint as all roles)
- After login, automatically redirected to `/picker` (role-based routing)
- Session persists via JWT cookie — device reopened without re-entering credentials
- Logout button → session cleared → redirected to `/login`

**Connection setup (one-time per device):**
1. IT/admin opens `http://<server-ip>:5173/login` on the handheld browser
2. Save/bookmark as home screen shortcut

**Order list (after PIN auth):**
- Header: picker username + active order count + Logout button
- Order cards: Tracking Number (monospace) | Platform badge | Delay badge | Assigned time
- Left border color: red (D3+), amber (D1–D2), blue (D0)
- List auto-refreshes every 15 seconds

**Waybill scan → complete flow:**
1. Picker picks up physical waybill paper → scans barcode with handheld scanner (USB HID → keyboard)
2. Tracking number appears in scan input → matched against active order list
3. Match found → **Confirm Complete** dialog shown (tracking number + platform + delay displayed)
4. Picker taps **Confirm Complete ✓** → `POST /picker/complete { trackingNumber }` → order removed from list
5. No match → error toast "not found in your assigned orders"

**API endpoints (PICKER role only):**
- `GET /picker/orders` — fetch own active orders (PICKER_ASSIGNED + PICKING statuses)
- `POST /picker/complete { trackingNumber }` — complete order by tracking number scan

---

### 7.5 Packer Admin Panel ✅ Built (Phase 5 + 7)
**Visible to:** Admin, Packer Admin  
**Route:** `/packer-admin`

Orders appear here **automatically** when a picker marks an order PICKER_COMPLETE — no manual assignment step required.

**Carryover:** Orders from a previous day (`work_date < today`) appear with an amber **CARRY** badge in the order table. The section header shows a carryover count with an amber clock icon.

**Header Stats Bar:** Waiting to Pack | Total Packed | Returned to Picker | Packers count | Sync indicator

> **Returned to Picker** stat: counts orders currently back in PICKER_ASSIGNED state (returned by packer admin). Updates every 5 seconds.

---

#### Order Queue (top section)

**Tracking Number Search:**
- Input above the order table — type partial or full tracking number to filter the list in real time
- Background turns amber while active; shows match count
- Cleared automatically after a successful Complete or Remove action

**Order Table:**
- Source: all orders with status = PICKER_COMPLETE (shared queue — no pre-assignment to packers)
- Columns: Checkbox | # | Tracking Number | Platform | Delay | Picked By (avatar) | Arrived At | Priority | Actions
- Sort: priority DESC → delayLevel DESC → createdAt ASC
- Pagination: 10 per page, resets on search
- Row tinting: D2 = amber, D3/D4 = red; selected = blue

**Actions per row:**
- **Complete** → green confirmation dialog → `POST /packer-admin/complete` → order → PACKER_COMPLETE
- **Remove** → red confirmation dialog "Are you sure?" → `POST /packer-admin/remove` → order auto-reassigned to original picker (PICKER_ASSIGNED); falls back to INBOUND if no previous picker

**Remove behavior (important):**
When admin removes an order, the backend:
1. Finds the most recent completed PickerAssignment for the order
2. Resets that assignment's `completedAt` → `null` (no new assignment created)
3. Sets order status → PICKER_ASSIGNED
4. Logs PICKER_COMPLETE → PICKER_ASSIGNED in orderStatusHistory

Side effects of step 2:
- Picker's "Total Completed" count decreases (assignment is no longer counted as done)
- The same assignment becomes active again → order reappears on the picker's handheld within 15 seconds
- No duplicate assignments — one clean active assignment per order per picker
- Falls back to INBOUND (no assignment reset) if the order had no previous picker

**Backend endpoints:**
```
GET  /packer-admin/orders                  → PICKER_COMPLETE orders (sorted)
GET  /packer-admin/stats                   → { stats[], totalCompleted, returnedCount }
POST /packer-admin/complete { orderId }    → PACKER_COMPLETE
POST /packer-admin/remove   { orderId }    → PICKER_ASSIGNED (auto-reassign) or INBOUND
```

---

#### Packer Workload Section (bottom)

- Grid of packer cards (auto-fill, min 220px)
- Each card: Avatar | username | `X packed` | Done chip
- **Click card → Order Detail Modal:** table of that packer's completed orders (Tracking | Platform | Delay | Completed At)
- **Backend endpoints:**
```
GET  /packer-admin/packers                         → active PACKER users
GET  /packer-admin/packer/:packerId/orders         → packer's completed orders (last 50)
```

---

### 7.6 Packer Device View ✅ Built (Phase 7)
**Visible to:** PACKER role  
**Route:** `/packer` (public — PIN auth, no traditional login)  
**Target device:** Android handheld — same hardware as Picker Device View  
**Design:** Mobile-first, green/teal theme (vs blue for picker)

**Authentication — Username + Password:**
- Packer opens `http://<server-ip>:5173/login` on the handheld browser (Chrome over WiFi)
- Enters username + password → standard JWT cookie set (same `/auth/login` endpoint as all roles)
- After login, automatically redirected to `/packer` (role-based routing)
- Session persists via JWT cookie — device reopened without re-entering credentials

**Order queue (shared — all packers see the same list):**
- All PICKER_COMPLETE orders (not pre-assigned; first packer to scan completes it)
- Auto-refreshes every 15 seconds
- List sorted by priority DESC → delayLevel DESC → createdAt ASC
- Left border color: red (D3+), amber (D1–D2), blue (D0)

**Waybill scan → complete flow:**
1. Packer picks up physical package → scans waybill barcode
2. Tracking number matched against the shared PICKER_COMPLETE list
3. Match found → **Confirm Complete** bottom sheet slides up (tracking + platform + delay)
4. Packer taps **Confirm ✓** → `POST /packer/complete { trackingNumber }` → PACKER_COMPLETE
5. Order disappears from all packers' lists within 15 seconds
6. Race condition protection: if two packers scan simultaneously, one gets success, the other gets "Order already completed"

**API endpoints (PACKER role only):**
- `GET /packer/orders` — all PICKER_COMPLETE orders (shared queue)
- `POST /packer/complete { trackingNumber }` — complete by tracking number scan

---

### 7.7 Outbound Panel ✅ Built (Phase 8)
**Visible to:** Admin, Inbound Admin  
**Route:** `/outbound`

Orders reach the Outbound Panel automatically when a packer marks them `PACKER_COMPLETE`. An Admin or Inbound Admin then dispatches them to `OUTBOUND`, which sets `sla_completed_at` and stops the SLA countdown.

#### Header Stats
| Card | Value | Color |
|---|---|---|
| Waiting to Dispatch | PACKER_COMPLETE order count | Sky blue |
| Dispatched Today | OUTBOUND orders with `slaCompletedAt ≥ today` | Green |
| D4 Orders | non-OUTBOUND orders with `delayLevel = 4` | Red |
| Missing | Total inbound − Total outbound | Amber |

#### Ready to Dispatch Table
- Lists all `PACKER_COMPLETE` orders sorted by `delayLevel DESC` → `createdAt ASC`
- Columns: Tracking Number · Platform · Packed By · Waiting Since · D-badge · Dispatch button
- **Search bar** — client-side filter on tracking number; clears after dispatch action
- **Checkbox selection** — select individual or all filtered orders
- **Dispatch** (single): confirm dialog → `POST /outbound/dispatch` → `PACKER_COMPLETE → OUTBOUND`, `slaCompletedAt = NOW()`
- **Dispatch Selected** (bulk): `POST /outbound/bulk-dispatch` → returns `{ dispatched, skipped }`
- Pagination: 10 orders/page; resets on search change and after dispatch

#### Comparison Report
Three stat tiles below the dispatch table:
- **Total Inbound** — all orders ever scanned for this tenant
- **Total Dispatched** — all OUTBOUND orders
- **Still in Pipeline** — Total Inbound − Total Dispatched (should approach 0 at end of day)

#### Stuck Orders Table
Lists every order **not yet at OUTBOUND** (INBOUND → PACKER_COMPLETE range).  
Sorted by `delayLevel DESC` then `slaStartedAt ASC` — most urgent at top.  
Columns: Tracking Number · Platform · Current Status (colored pill) · D-badge · Time in Status · In Pipeline Since  
Refetch: 10 s (less frequent than dispatch queue's 5 s).

#### Status Pill Colors
| Status | Background | Text |
|---|---|---|
| INBOUND | `#e5e7eb` | `#374151` |
| PICKER_ASSIGNED | `#dbeafe` | `#1d4ed8` |
| PICKING | `#e0e7ff` | `#4338ca` |
| PICKER_COMPLETE | `#ede9fe` | `#6d28d9` |
| PACKER_COMPLETE | `#ccfbf1` | `#0f766e` |

---

### 7.8 Archive Panel ✅ Built (v2.2.0)
**Visible to:** Admin only  
**Route:** `/archive`

The Archive Panel gives admins full visibility into soft-archived orders and control over the end-of-day archive cycle and long-term data retention.

#### Header Stats Bar
| Card | Value | Color |
|---|---|---|
| Total Archived | All orders with `archived_at IS NOT NULL` | Primary blue |
| Expiring in 30d | Archived orders whose `archived_at + 180 days <= now + 30 days` | Amber |
| Expiring in 7d | Archived orders whose `archived_at + 180 days <= now + 7 days` | Red |

**"Archive OUTBOUND Now" button** — appears alongside the stat cards. Opens a confirmation dialog: *"This will archive all currently OUTBOUND orders for your tenant. This normally runs automatically at 7:00 PM. Proceed?"* On confirm: calls `POST /archive/trigger`.

#### Filter Bar
| Filter | Type | Behavior |
|---|---|---|
| Tracking number search | Text input | Partial match on `tracking_number` |
| Platform | Dropdown | SHOPEE / LAZADA / TIKTOK / DIRECT / OTHER |
| Archived date range | Two date pickers (From / To) | Filters `archived_at` |
| Expiring within | Dropdown (7d / 14d / 30d / 60d) | Shows orders expiring in ≤ N days |

A **"Clear filters"** button appears when any filter is active.

#### Archived Orders Table
**Columns:** # | Checkbox | Tracking Number | Platform | Carrier | Shop | Work Date | Archived At | Expires In (badge)

**Expires In badge** color coding:
- **Green** — more than 30 days remaining
- **Amber** — 7–30 days remaining
- **Red** — fewer than 7 days remaining

**Pagination:** 25 orders per page.

#### Bulk Delete
- Checkbox per row + "select all" header checkbox
- **"Delete Selected (N)"** danger button appears when any rows are checked
- Opens `ConfirmDialog` (variant: danger): *"You are about to permanently delete N archived orders. This action cannot be undone. All history records will also be deleted. Are you sure?"*
- On confirm: `POST /archive/bulk-delete` — hard-deletes orders and all child table records (assignments, status history, SLA escalations) for the selected IDs

#### Archive API Endpoints
| Method | Path | Role | Description |
|---|---|---|---|
| `GET` | `/archive` | ADMIN | Paginated archive list. Query: `page`, `pageSize`, `search`, `platform`, `dateFrom`, `dateTo`, `expiresWithin` |
| `GET` | `/archive/stats` | ADMIN | Summary: `{ total, expiring30, expiring7 }` |
| `POST` | `/archive/trigger` | ADMIN | Immediately archives all OUTBOUND orders for the caller's tenant; also enqueues background job |
| `POST` | `/archive/bulk-delete` | ADMIN | Body: `{ orderIds: string[] }`. Hard-deletes with cascade. Admin confirmation required in UI before calling. |

#### Archive Job
- **Queue:** `archiveOutbound` (BullMQ)
- **Schedule:** `0 3 * * *` (UTC) — every day at **11:00 AM PHT** (Asia/Manila)
- **Action:** Sets `archived_at = NOW()` on all `status=OUTBOUND, archived_at IS NULL` orders (all tenants)
- **Manual trigger:** `POST /archive/trigger` → calls archive synchronously for the requester's tenant, then enqueues for background processing

#### Retention (6-Month Policy)
- **Hard-delete job** piggybacks on `nightlyReport` at **11:10 PHT (03:10 UTC)**
- Deletes orders where `archived_at <= NOW() - 180 days`
- Cascade-deletes all child records (`picker_assignments`, `packer_assignments`, `order_status_history`, `sla_escalations`)
- Per-tenant, per-order error catch — one failure does not abort the sweep

---

## 8. Frontend Structure

```
frontend/
├── src/
│   ├── pages/
│   │   ├── Login.tsx
│   │   ├── Inbound.tsx            ← /dashboard — Phase 2 ✅ (pagination 25/page, delay sort)
│   │   ├── PickerAdmin.tsx        ← /picker-admin — Phase 3+4 ✅ (scan+stage, bulk assign,
│   │   │                              workload cards, order detail modal, remove/complete,
│   │   │                              "Returned from Packer" stat, ↩ badge on picker cards)
│   │   ├── PickerMobile.tsx       ← /picker ✅ PIN auth + shared order list + scan complete
│   │   ├── PackerAdmin.tsx        ← /packer-admin ✅ (PICKER_COMPLETE queue, tracking search,
│   │   │                              complete/remove dialogs, auto-reassign on remove,
│   │   │                              packer workload cards, PIN management,
│   │   │                              "Returned to Picker" + "Total Packed" stats)
│   │   ├── PackerMobile.tsx       ← /packer ✅ PIN auth + shared queue + scan complete (green theme)
│   │   ├── Outbound.tsx           ← /outbound ✅ Phase 8 (dispatch queue, comparison report, stuck orders)
│   │   ├── Archive.tsx            ← /archive ✅ v2.2.0 (stats, filters, expiry badges, bulk delete, manual trigger)
│   │   └── Users.tsx              ← Phase 1 (placeholder until full build)
│   ├── components/
│   │   ├── ScanInput.tsx          ← HID barcode scanner input (desktop inbound only)
│   │   ├── OrderTable.tsx         ← desktop table; includes DelayBadge column; D2+ rows tinted
│   │   ├── OrderCard.tsx          ← Phase 4: mobile card, touch-friendly, large tap targets
│   │   ├── ConfirmDialog.tsx      ← reusable confirmation modal
│   │   ├── DelayBadge.tsx         ← D-level badge: D0=none, D1=yellow, D2=orange, D3=red, D4=red+pulse
│   │   ├── SlaAlertBanner.tsx     ← Phase 9: dismissible D4 alert banner for ADMIN/INBOUND_ADMIN
│   │   └── shared/
│   │       ├── AppLayout.tsx      ← desktop layout wrapper (Sidebar + content area)
│   │       ├── Sidebar.tsx        ← role-based nav with SVG icons; desktop only
│   │       ├── MobileHeader.tsx   ← Phase 4: handheld layout header (name + time, no nav)
│   │       ├── PageShell.tsx      ← sticky header + scrollable body for each panel
│   │       ├── Avatar.tsx         ← initials avatar component
│   │       ├── PlatformBadge.tsx  ← color-coded platform label (Shopee/Lazada/TikTok)
│   │       ├── StatCard.tsx       ← stat number card used in panel headers (supports optional subtitle prop)
│   │       └── SectionHeader.tsx  ← section title + count badge
│   ├── stores/                    ← Zustand global state
│   │   ├── authStore.ts
│   │   └── notificationStore.ts   ← Phase 9: d4Alerts[], addD4Alert(), dismissD4Alert()
│   ├── api/                       ← TanStack Query hooks
│   │   ├── orders.ts
│   │   ├── assignments.ts
│   │   ├── users.ts
│   │   └── reports.ts
│   ├── lib/
│   │   ├── platformDetect.ts      ← tracking number → platform logic
│   │   ├── scanDetect.ts          ← keystroke interval < 50ms = scanner, > 200ms = manual
│   │   └── manila.ts              ← timezone utilities: getManilaDateString() — Asia/Manila UTC+8, no deps
│   ├── theme.ts                   ← design tokens: colors, radius, shadow, font — single source of truth
│   └── index.css                  ← global design system CSS
```

### Route Access Control
```
/login                → Public
/dashboard            → ADMIN, INBOUND_ADMIN  (Inbound panel — also visible to PICKER_ADMIN, PACKER_ADMIN via sidebar)
/picker-admin         → ADMIN, PICKER_ADMIN
/picker               → PICKER            (mobile-first — PickerDevice.tsx)
/packer-admin         → ADMIN, PACKER_ADMIN
/packer               → PACKER            (mobile-first — PackerDevice.tsx)
/outbound             → ADMIN, INBOUND_ADMIN
/archive              → ADMIN only
/users                → ADMIN only
```

> **Handheld routing note:** `/picker` and `/packer` routes are opened on the handheld device browser. After login the device stays on this route — no navigation to other pages. The layout renders without Sidebar/Header and uses mobile-first components.

---

## 9. Backend Structure

```
backend/
├── src/
│   ├── routes/
│   │   ├── auth.ts
│   │   ├── orders.ts
│   │   ├── assignments.ts
│   │   ├── users.ts
│   │   ├── reports.ts
│   │   └── archive.ts             ← GET /archive, GET /archive/stats, POST /archive/trigger, POST /archive/bulk-delete
│   ├── plugins/
│   │   ├── auth.ts                ← JWT verification plugin
│   │   ├── cors.ts
│   │   ├── rateLimit.ts
│   │   └── socket.ts              ← Socket.io integration; joins user to tenant:{id} + user:{id} rooms on connect
│   ├── jobs/
│   │   ├── index.ts               ← registers all BullMQ workers and repeatable jobs
│   │   ├── nightlyReport.ts       ← BullMQ job: 11:10 AM email + hardDeleteExpiredOrders() call
│   │   ├── archiveOutbound.ts     ← BullMQ job: 11:00 AM daily, sets archived_at on OUTBOUND orders
│   │   ├── slaEscalation.ts       ← BullMQ job: every 15min sweep, D0→D4 escalation + priority boost
│   │   └── slaD4Email.ts          ← BullMQ job: supervisor alert email when order hits D4
│   ├── services/
│   │   ├── orderService.ts
│   │   ├── assignmentService.ts
│   │   ├── reportService.ts
│   │   ├── emailService.ts
│   │   ├── archiveService.ts      ← archiveOutboundOrders(), getArchivedOrders(), bulkDeleteArchivedOrders(), hardDeleteExpiredOrders()
│   │   └── slaService.ts          ← escalateOrder(), calculatePriorityDelta(), markSlaComplete(), querySlaEligibleOrders()
│   ├── lib/
│   │   └── manila.ts              ← getManilaStartOfToday(), getManilaDateString() — pure UTC+8 arithmetic, no deps
│   └── middleware/
│       └── rbac.ts                ← Role-based access control
└── prisma/
    └── schema.prisma
```

### API Endpoints

| Method | Endpoint | Role | Description |
|---|---|---|---|
| POST | `/auth/login` | All | Login |
| POST | `/auth/logout` | All | Logout |
| GET | `/orders` | Role-filtered | List orders (includes `delay_level` in response) |
| POST | `/orders` | ADMIN, INBOUND_ADMIN | Create order (scan) — sets `sla_started_at`, `delay_level=0` |
| DELETE | `/orders/:id` | ADMIN, INBOUND_ADMIN | Delete order |
| PATCH | `/orders/:id/status` | Role-filtered | Update status — sets `sla_completed_at` when → OUTBOUND |
| GET | `/orders/:id/sla` | ADMIN, INBOUND_ADMIN, PICKER_ADMIN, PACKER_ADMIN | Full SLA escalation history for an order |
| GET | `/picker-admin/orders` | ADMIN, PICKER_ADMIN | List INBOUND orders sorted by priority DESC, delayLevel DESC, createdAt ASC |
| GET | `/picker-admin/pickers` | ADMIN, PICKER_ADMIN | List active pickers |
| POST | `/picker-admin/assign` | ADMIN, PICKER_ADMIN | Assign single order to picker → status: PICKER_ASSIGNED |
| POST | `/picker-admin/bulk-assign` | ADMIN, PICKER_ADMIN | Bulk assign up to 200 orders to one picker |
| GET | `/picker-admin/stats` | ADMIN, PICKER_ADMIN | Per-picker workload: PICKER_ASSIGNED / PICKING / PICKER_COMPLETE counts |
| GET | `/picker-admin/picker/:id/orders` | ADMIN, PICKER_ADMIN | Active orders assigned to a specific picker (completedAt = null) |
| POST | `/picker-admin/complete` | ADMIN, PICKER_ADMIN | Mark order as PICKER_COMPLETE; sets pickerAssignment.completedAt |
| POST | `/picker-admin/unassign` | ADMIN, PICKER_ADMIN | Return order to INBOUND; deletes PickerAssignment record |
| POST | `/assign/picker` | ADMIN, PICKER_ADMIN | Assign to picker → emits `order:assigned` to `user:{pickerId}` |
| POST | `/assign/packer` | ADMIN, PACKER_ADMIN | Assign to packer → emits `order:assigned` to `user:{packerId}` |
| GET | `/outbound/orders` | ADMIN, INBOUND_ADMIN | List PACKER_COMPLETE orders ready to dispatch, sorted by delayLevel DESC, createdAt ASC |
| GET | `/outbound/stats` | ADMIN, INBOUND_ADMIN | Header stats: waitingCount, dispatchedToday, inboundTotal, outboundTotal, missingCount, d4Count |
| GET | `/outbound/stuck` | ADMIN, INBOUND_ADMIN | All non-OUTBOUND orders sorted by delayLevel DESC, slaStartedAt ASC |
| POST | `/outbound/dispatch` | ADMIN, INBOUND_ADMIN | Dispatch single order → OUTBOUND; sets `sla_completed_at` |
| POST | `/outbound/bulk-dispatch` | ADMIN, INBOUND_ADMIN | Dispatch up to 200 orders at once; returns `{ dispatched, skipped }` |
| GET | `/reports/dashboard` | ADMIN, INBOUND_ADMIN | Dashboard stats |
| GET | `/reports/picker` | ADMIN, PICKER_ADMIN | Picker reports |
| GET | `/reports/packer` | ADMIN, PACKER_ADMIN | Packer reports |
| GET | `/reports/sla` | ADMIN, INBOUND_ADMIN | SLA summary: count by D-level, D4 order list, avg time-to-OUTBOUND |
| GET | `/archive` | ADMIN | Paginated archived orders. Query: `page`, `pageSize`, `search`, `platform`, `dateFrom`, `dateTo`, `expiresWithin` |
| GET | `/archive/stats` | ADMIN | Archive summary: `{ total, expiring30, expiring7 }` |
| POST | `/archive/trigger` | ADMIN | Manually archive all OUTBOUND orders for the caller's tenant |
| POST | `/archive/bulk-delete` | ADMIN | Permanently delete archived orders. Body: `{ orderIds: string[] }`. Cascades child tables. |
| GET | `/users` | ADMIN | List users |
| POST | `/users` | ADMIN | Create user |
| PATCH | `/users/:id` | ADMIN | Update/deactivate user |

---

## 10. Multi-Tenant Architecture

Every database table includes `tenant_id`. PostgreSQL Row Level Security (RLS) enforces data isolation at the database level — even if application code has a bug, one tenant cannot see another tenant's data.

```sql
-- Example RLS policy
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON orders
  USING (tenant_id = current_setting('app.tenant_id')::uuid);
```

Future multi-tenant onboarding: Admin creates a new tenant record → system is ready for that company immediately.

---

## 11. Security

| Concern | Solution |
|---|---|
| Authentication | JWT tokens, short expiry (15min access + 7day refresh) |
| Session storage | Redis (not localStorage — prevents XSS token theft) |
| Password storage | bcrypt with salt rounds ≥ 12 |
| SQL injection | Prisma ORM — parameterized queries always |
| XSS | React escapes by default; no dangerouslySetInnerHTML |
| Rate limiting | Fastify rate-limit plugin (100 req/min per IP) |
| HTTPS | Enforced at reverse proxy (Nginx) level |
| Data isolation | PostgreSQL RLS per tenant |
| Input validation | Zod schemas on all API inputs |
| CORS | Whitelist-only origins |
| Security testing | Run OWASP checklist at every deployment |

---

## 12. Performance

| Concern | Solution |
|---|---|
| 50–100 concurrent users | Fastify handles 30K+ req/sec — no issue |
| 2,000 orders/day (initial) | ~0.023 req/sec — ~20-25% of Vultr 4GB capacity |
| 10,000 orders/day (target) | ~0.12 req/sec — same server sufficient |
| Database connections | Prisma connection pool sufficient; pgBouncer to be added at 10,000+ orders/day |
| Frequent order list reads | Redis cache with 30-second TTL, invalidated on write |
| Real-time dashboard | Socket.io — push only on state change, no polling |
| 6 months data (≈360K orders initial) | PostgreSQL with proper indexes — performant |

---

## 13. Reporting

### Automated
- **Nightly email at 9:00 PM PHT** (13:00 UTC) to all Admin users
- Contains: Inbound count, Outbound count, Remaining count, Picker & Packer summaries, **SLA data: D4 orders reached today (resolved vs still open), avg time-to-OUTBOUND, D-level breakdown at 9pm snapshot**

### On-Demand (in-app)
| Report | Where | Period |
|---|---|---|
| Dashboard summary | Main Dashboard | Live (real-time) |
| SLA summary (D0–D4 counts, D4 list, avg completion time) | Main Dashboard | Live (real-time) |
| **Live Performance** (per-role KPI cards, grouped hourly bar chart, per-worker **stacked** hourly bar charts for pickers and packers, per-worker tables with hourly sparklines) | Warehouse Report → Live Performance tab | Today (live) or any historical date up to 90 days back, Manila TZ — live: socket-pushed (`order:stats_changed`) + 30s polling; historical: no refetch, 5-min stale window |
| Picker / Packer daily performance (7/14/30 days, sparkline + CSV/PDF export) | Warehouse Report → Performance tab | Daily / Weekly / Monthly |
| SLA analytics (D-level distribution donut, D4 unresolved list, PDF export) | Warehouse Report → SLA Analytics tab | Last 7/14/30 days |
| Order Timeline (full per-order lifecycle audit — all status changes, picker/packer assignments, inter-event durations) | Warehouse Report → Order Timeline tab | Per tracking number (on-demand) |
| Inbound vs Outbound | Outbound Panel | Live |
| Stuck orders (with D-level) | Outbound Panel | Live |
| SLA escalation history (per order) | Any panel with order detail | On-demand |

**Warehouse Report access:** `ADMIN`, `INBOUND_ADMIN`, `PICKER_ADMIN`, `PACKER_ADMIN` — all four admin roles see the same 4 tabs. Tab order: **Live Performance** (default) → Performance → SLA Analytics → Order Timeline.

#### Live Performance tab — data model
- Endpoint: `GET /reports/live-performance?date=YYYY-MM-DD` (same RBAC tuple as `/reports/performance`)
  - Without `date` → today (live mode, socket-driven + 30s refetch)
  - With `date` → historical day in Manila TZ; max 90 days back (`400` otherwise); future dates rejected (`400`)
- Aggregates `PickerAssignment.completedAt` / `PackerAssignment.completedAt` within the 24-hour Manila-local window (`[from, from + 24h)`) into 24 hourly buckets using the `getManilaStartOf(dateStr)` / `getManilaStartOfToday()` helpers
- **Active now** = assignments where `completedAt IS NULL AND order.archivedAt IS NULL` — computed only in live mode; zero in historical
- **Items / hour** — live: `completedToday / max(1, hoursSinceFirstCompletionToday)` (per-worker elapsed so late starters aren't penalized); historical: `completedOnDay / hoursWithWork` (closed-day rate across active work hours)
- Worker list — live: every `isActive` picker/packer (idle workers shown as zero rows); historical: all pickers/packers regardless of `isActive` flag, so users who worked that day but were later deactivated still appear
- Sort: active users first, then by `completedToday` desc, then username asc — applied in both backend and frontend; inactive users carry an `Inactive` badge in the table
- Charts: aggregate grouped `BarChart` (Pickers vs Packers) + two stacked `BarChart`s with per-worker segments (hue-varied palette generated from base accent via HSL around `PICKER_COLOR` / `PACKER_COLOR`)
- Historical mode: no `refetchInterval`, no socket subscription, `staleTime: 5min`; `LiveStatusPill` renders amber "Historical · YYYY-MM-DD"
- Shared `DateNavigator` component (`frontend/src/components/shared/DateNavigator.tsx`) — extracted from the Outbound page; supports `minDate` prop; prev/next arrows, clickable date label opening native `<input type="date">`, "Today" shortcut
- No new DB migrations, no Redis caching — existing `[pickerId, completedAt]` / `[packerId, completedAt]` indexes cover the queries
- Socket event reused: `order:stats_changed` (already emitted on every picker/packer state transition); frontend subscribes only when not historical
- Files: `backend/src/routes/reports.ts` (endpoint), `frontend/src/pages/reports/LivePerformanceTab.tsx` (tab body), `frontend/src/components/shared/DateNavigator.tsx` (shared nav)

---

## 14. Deployment Strategy

### Environment Plan

| Environment | Where | Cost | Purpose |
|---|---|---|---|
| **Development** | Localhost | Free | Local development |
| **Production** | Vultr Manila 🇵🇭 | $12/month | Live system |

> No staging environment — features are developed on localhost and deployed directly to production once approved.

### Why Vultr Manila
- Closest datacenter to the Philippines (~5–10ms latency)
- Instant response for barcode scanning is critical — high latency is unacceptable
- $12/month handles 2,000–10,000 orders/day comfortably

### Production Server Specification

**Vultr Cloud Compute — Regular Performance (Manila, PH)**
| Resource | Value |
|---|---|
| CPU | 2 vCPU |
| RAM | 4 GB |
| Disk | 80 GB SSD |
| Bandwidth | 3 TB/month |
| Cost | **$12/month** |

At 2,000 orders/day the server runs at **~20–25% capacity**.

### Production Infrastructure (Docker Compose — Single Server)

```
[Vultr Manila VPS]
│
├── Nginx (reverse proxy + SSL — Let's Encrypt)
│       ├── /          → React static build
│       └── /api       → Node.js Fastify (backend)
│               ├── PostgreSQL 16
│               ├── Redis
│               └── BullMQ workers
```

### Branching Model
```
feature/xxx  →  main branch
                     │
              git tag v1.x.x
                     │
              docker build + push
                     │
              Deploy to Vultr
```

### Versioning
- Semantic versioning: `v1.0.0`, `v1.1.0`, `v1.2.0`
- Every production deploy is tagged in git
- Rollback: re-deploy the previous Docker image

### CI/CD (GitHub Actions)
```
On push to main branch:
  1. npm run lint
  2. npm run test
  3. docker build (tag with git tag)
  4. docker push → registry
  5. SSH to Vultr → git pull + `docker compose up -d --build --remove-orphans` (rebuilds images from source)
```

### Scaling Roadmap

| Phase | Load | Action |
|---|---|---|
| Launch | 2,000 orders/day | Vultr 2 vCPU / 4 GB — current plan |
| Growth | ~5,000 orders/day | Upgrade to Vultr 4 vCPU / 8 GB (~$24/month) |
| Scale | 10,000+ orders/day | Add separate DB server + pgBouncer |

---

## 15. Development Phases

| Phase | What Gets Built | Status | Exit Criteria |
|---|---|---|---|
| **1** | Project scaffold, auth system, user management, Socket.io dual-room join | ✅ Done | All 6 roles can log in; access restricted correctly |
| **2** | Inbound Panel — scan, auto-detect, zero manual input, SLA D0, pagination (25/page), delay-priority sort | ✅ Done | Orders appear after scan (~2 sec); D4 at top |
| **3** | Picker Admin Panel — custom picker dropdown, order table (10/page, delay sort), bulk assign, workload cards | ✅ Done | Orders assigned; workload grid accurate |
| **4** | Picker Admin — order detail modal, Remove (styled confirm dialog), Complete, unassign endpoint | ✅ Done | Remove → INBOUND; Complete → PICKER_COMPLETE; stats refresh within 5s |
| **5** | Packer Admin Panel (same pattern as Phase 3+4): order table, custom packer dropdown, workload cards, order detail modal with Remove/Complete | ✅ Done | PICKER_COMPLETE orders appear; packer workload visible; remove auto-reassigns to original picker |
| **6** | Picker Device View (mobile-first) — PIN auth, order list, scan complete | ✅ Done | Picker sees orders on handheld; complete works; PIN-based session |
| **7** | Packer Device View (mobile-first) — same pattern as Picker Device (green theme) | ✅ Done | Packer confirms on handheld; shared queue; race condition protected |
| **8** | Outbound Panel; `sla_completed_at` set on OUTBOUND | ✅ Done | End-to-end lifecycle works; SLA timer stops at dispatch |
| **9** | SLA escalation job (15-min sweep, D0→D4, priority boosts, D4 alert); SlaAlertBanner UI | ✅ Done | D-level updates automatically; D4 triggers Socket.io alert + supervisor email; banner shows stage + assigned picker/packer; collapse/expand for multiple alerts |
| **10** | Bulk Inbound Scan — `carrierName` + `shopName` fields on orders; `BulkScanModal` (createPortal), staging list, carrier dropdown, shop combobox; `POST /orders/bulk-scan`, `GET /orders/shops`; `Carrier` enum + `detectPlatform` moved to shared package. Carrier + Shop Name both **mandatory** (frontend disabled + yellow warning + backend 400 validation). 18 preset shop names always in dropdown. | ✅ Done | Batch of TNs staged, carrier + shop assigned, all saved; duplicates reported; single scan unaffected; carrier/shop columns visible in Inbound table |
| **10b** | Handheld Admin Scan — concurrent session support (`session:{userId}:{deviceType}`); `/inbound-scan` + `/picker-admin-scan` pages; Single/Bulk camera scan modes; phone→desktop real-time relay via Socket.io (no direct DB write from phone); duplicate check on handheld-scan routes; socket routed via Vite HTTPS proxy; custom SSL cert with IP SAN for LAN phone access | ✅ Done | Phone scans → desktop QuickScanModal or BulkScanModal opens; concurrent desktop+phone sessions without conflict; duplicate barcode blocked on phone with warning |
| **DC** | **Daily Cycle Tracking + End-of-Day Archiving** — `work_date` and `archived_at` fields on orders; partial unique index (archived tracking numbers reusable); `archiveService.ts` + `archiveOutbound` BullMQ job (19:00 PHT daily); `hardDeleteExpiredOrders` in nightly report (21:00 PHT, 180-day retention); `archivedAt: null` filter on all active service queries; Carryover badge (amber CARRY) in Inbound/PickerAdmin/PackerAdmin; Carryover Active stat on Dashboard; Archive Panel (`/archive`) with stats, filters, expiry badges, bulk delete, manual trigger. **Timezone localization:** all start-of-day calculations and cron schedules use Asia/Manila (UTC+8); `manila.ts` utilities in both backend and frontend; all UI date/time displays use `timeZone: 'Asia/Manila'`. **Auth unification:** Picker and Packer now use standard username+password login via `/login` (same as all other roles); PIN auth system removed; `picker_pin`/`packer_pin` columns dropped from DB | ✅ Done | OUTBOUND orders hidden at 7 PM PHT; CARRY badge on previous-day orders; Archive Panel works; all timestamps in Manila time; Picker/Packer log in via Chrome with username+password |
| **11** | Main Dashboard + SLA Summary Card + real-time + nightly email | ✅ Done | Live stats update via Socket.io (`sla:escalated`, `order:stats_changed`); nightly HTML email with SLA breakdown sent at 11:10 AM PHT; Dashboard shows pipeline, picker/packer summary, outbound summary, SLA D0–D4 |
| **SALES** | **Sales Agent Module (v2.23.1)** — new `SALES_AGENT` role (`UserRole` enum); 6 new Prisma models (`SalesDailyActivity`, `SalesContentPost`, `SalesLiveSellingMetric`, `SalesMarketplaceReport`, `SalesDirectOrder`, `SalesDirectOrderItem`) + 3 enums (`SalesPlatform`, `ContentPostType`, `SaleChannel`); backend routes `/sales` + `/marketing`; services `salesActivityService`, `salesDirectOrderService`, `marketingReportService`; agent-facing UI: `/sales` month calendar dashboard, day-entry form (content posts + live selling + marketplace + direct orders), day-detail modal, own history; admin-facing UI: `/marketing-report` leaderboard + 4 comparison charts + `AgentDetailPanel` (per-agent calendar drill-down); admin-only `Settings → Sales Agents` creation; Vite proxy extended for `/sales` + `/marketing` | ✅ Done (v2.23.1) | Agent logs in → `/sales` opens, calendar renders, daily entry saves + persists across refresh; admin `/marketing-report` shows leaderboard + charts + per-agent drill-down; existing picker/packer/inbound/outbound flows unaffected; **deploy note:** requires manual `prisma db push` on Vultr after CD (workflow runs `migrate deploy || true` — no migrations in repo yet, see SOLUTIONS.md 2026-04-20) |
| **12** | Reporting & Analytics + CSV/PDF export | 🟡 Partial | CSV/PDF exports for Performance + SLA (done). **Live Performance tab added (v2.25.0 + v2.25.1)**: intraday per-role KPIs, grouped hourly bar chart (Recharts `BarChart`, Pickers/Packers side-by-side), per-worker live tables with hourly sparklines; socket-driven updates via `order:stats_changed` + 30s polling fallback; Live/Polling status pill. Order Timeline tab (per-order lifecycle audit) also shipped. **Historical mode (v2.27.0)**: `DateNavigator` on Live Performance tab, up to 90 days back, per-worker stacked hourly bar charts, inactive-user inclusion in historical view. **Remaining:** CSV/PDF export for Live Performance (deferred), additional cross-period comparative analytics |
| **13** | Security hardening + load testing | 🔜 | OWASP checklist passed; 100 users load test passed |
| **14** | Multi-tenant, Docker, CI/CD, versioned deploy | 🔜 | Full regression on test branch; clean deploy to main |

---

## 16. SLA System — Technical Detail

### Escalation Job (`slaEscalation.ts`)
- **Schedule:** Every 15 minutes (`*/15 * * * *`) via BullMQ repeatable job
- **Logic:** For each tenant, query orders where `sla_completed_at IS NULL` AND `delay_level < 4` AND `NOW() - sla_started_at > (delay_level + 1) * 4 hours`
- **Per qualifying order (in a single DB transaction):**
  1. Calculate new `delay_level = MIN(4, FLOOR(elapsed_hours / 4))`
  2. Calculate priority delta: `SLA_PRIORITY_BOOSTS[newLevel] - SLA_PRIORITY_BOOSTS[oldLevel]`
  3. Update `orders`: set `delay_level`, increment `priority` by delta
  4. Insert into `sla_escalations`
  5. If `to_level === 4` and `d4_notified_at IS NULL`: set `d4_notified_at = NOW()`
- **After transaction:** emit Socket.io `sla:escalated` event; enqueue `slaD4Email` job for D4 orders
- **Error handling:** Per-order try/catch — one order failure does not abort the sweep

### D4 Supervisor Alert Flow
```
Sweep detects order elapsed ≥ 16 hours
        │
        ▼
DB Transaction: delay_level=4, priority+=800, d4_notified_at=NOW()
Insert sla_escalations (from=3, to=4)
        │
        ├──▶ Socket.io emit → sla:d4_alert → SlaAlertBanner appears for all ADMIN/INBOUND_ADMIN sessions
        │
        └──▶ BullMQ enqueue slaD4Email → Nodemailer → supervisor email
```

### Priority Delta Table
| Escalation | Delta Applied | Resulting Boost (cumulative) |
|---|---|---|
| D0 → D1 | +200 | 200 |
| D1 → D2 | +200 | 400 |
| D2 → D3 | +400 | 800 |
| D3 → D4 | +800 | 1600 |

### Shared Constants (`shared/src/sla.ts`)
Both frontend and backend import from this file — no magic numbers anywhere else:
- `SLA_HOURS_PER_LEVEL = 4`
- `SLA_MAX_LEVEL = 4`
- `SLA_PRIORITY_BOOSTS = [0, 200, 400, 800, 1600]`
- `SLA_LEVEL_COLORS = { 0: 'gray', 1: 'yellow', 2: 'orange', 3: 'red', 4: 'crimson' }`

### Socket.io Rooms

| Room | Members | Purpose |
|---|---|---|
| `tenant:{tenantId}` | All users of that tenant | Broadcast: dashboard stats, SLA alerts, order list updates |
| `user:{userId}` | Single user (their session) | Targeted push: new order assigned to this picker/packer |

On login, the socket server joins the user to both their `tenant:` room and their `user:` room automatically.

### Socket.io Events

| Event | Direction | Room | Payload | Consumer |
|---|---|---|---|---|
| `order:created` | Server → Client | `tenant:{id}` | `{ order }` | Invalidate order list cache |
| `order:updated` | Server → Client | `tenant:{id}` | `{ orderId, status }` | Invalidate order list cache |
| `order:deleted` | Server → Client | `tenant:{id}` | `{ orderId }` | Invalidate order list cache |
| `order:assigned` | Server → Client | `user:{pickerId/packerId}` | `{ order }` | Push new order to handheld device |
| `stats:updated` | Server → Client | `tenant:{id}` | `{ stats }` | Update dashboard stats |
| `sla:escalated` | Server → Client | `tenant:{id}` | `{ orderId, fromLevel, toLevel, tenantId }` | Invalidate order list cache |
| `sla:d4_alert` | Server → Client | `tenant:{id}` | `{ orderId, trackingNumber, tenantId, status, assignedPicker, assignedPacker }` | Show SlaAlertBanner |

> **Key design:** `order:assigned` goes to `user:{id}` room — only the assigned picker/packer receives it. All other events broadcast to the full tenant room.

### SlaAlertBanner (`frontend/src/components/SlaAlertBanner.tsx`)

Visible only to `ADMIN` and `INBOUND_ADMIN` roles. Rendered at the top of `AppLayout` (above page content).

| Alert count | Behaviour |
|---|---|
| 0 | Hidden |
| 1 | Full-width crimson bar: tracking number, stage (`OrderStatus`), assigned picker/packer (if any), `[Dismiss]` |
| 2+ | Summary bar: order count, `[Show ▼]` to expand individual rows, `[Dismiss All]` |

**Expanded rows** (2+ alerts): each row shows tracking number, stage, assigned picker/packer, individual `[Dismiss]`.

**Socket lifecycle fix:** `SlaAlertBanner` calls `connectSocket()` (not `getSocket()`) in its `useEffect`. React fires child effects before parent effects — at mount time `getSocket()` would return `null` because `AppLayout`'s `connectSocket()` call hasn't run yet. `connectSocket()` is idempotent and safe to call from either component.

**State:** `notificationStore` (Zustand, non-persisted) — `d4Alerts[]`, `addD4Alert()`, `dismissD4Alert(id)`, `dismissAllD4Alerts()`.

### RLS on `sla_escalations`
```sql
ALTER TABLE sla_escalations ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON sla_escalations
  USING (tenant_id = current_setting('app.tenant_id')::uuid);
```
The escalation job uses a privileged service-role connection (same as nightly report) — it is not tenant-scoped.

---

## 17. MCP Servers (Development Tooling)

| MCP | Purpose |
|---|---|
| **Figma MCP** | Design-to-code workflow, component inspection |
| **GitHub MCP** | PR management, branch operations |
| **PostgreSQL MCP** (DBHub) | Database query context in AI sessions |
| **Docker MCP** | Container management (Phase 10) |

---

*This document should be reviewed and approved before Phase 1 development begins. Any changes to the architecture after this point should be reflected in an updated version of this document.*
