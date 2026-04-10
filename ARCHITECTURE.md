# Dynamic Order Management System — Architecture Document

> **Version:** 1.6.0  
> **Date:** 2026-04-10  
> **Status:** In development — Phase 5 + 7 complete (Packer Admin + PackerMobile)

---

## 1. Project Overview

**Dynamic Order Management (DOM)** is a warehouse order tracking system designed to manage the full lifecycle of e-commerce orders from arrival (inbound) through picking, packing, and final dispatch (outbound).

### Business Context
- A single warehouse company currently, with architecture ready to support multiple companies (multi-tenant)
- Orders arrive daily from multiple e-commerce platforms: **Shopee**, **Lazada**, **TikTok Shop**
- Physical waybills are scanned using barcode scanners to enter orders into the system
- 50–100 staff members use the system simultaneously
- Daily volume: ~10,000 orders
- Data retention: minimum 6 months

### Core Workflow
```
Inbound (Waybill Scan) ← SLA 4-hour countdown starts (D0)
        │
        ▼
  Picker Admin assigns → Picker prepares on handheld
        │
        ▼
  Packer Admin queue (auto, no assignment needed) → Packer scans on handheld
        │   ↑ Remove → auto-reassigns back to original picker
        ▼
     Outbound ← SLA countdown ends
```

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
│  │  Packer Admin / Outbound         │  │  Chrome browser — WiFi         │ │
│  │  + HID Barcode Scanner (inbound) │  │  Mobile-optimized UI           │ │
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
│  │  → Nightly 9:00 PM email report to admins (Nodemailer)               │ │
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

> **Design decision:** No `stores` table. Store/seller name is visible on the physical waybill and is not recorded in the system. Inbound requires zero manual input — scan only.

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
| picker_pin | VARCHAR NULLABLE | 4-digit PIN for PICKER handheld login; unique per tenant |
| packer_pin | VARCHAR NULLABLE | 4-digit PIN for PACKER handheld login; unique per tenant |
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
| platform | ENUM | `SHOPEE`, `LAZADA`, `TIKTOK`, `OTHER` |
| status | ENUM | See status flow |
| priority | INTEGER | Higher = more urgent; default 0, carryover +100, SLA boosts added on escalation |
| delay_level | INTEGER | SLA delay level: 0=D0, 1=D1, 2=D2, 3=D3, 4=D4; default 0 |
| sla_started_at | TIMESTAMPTZ | Set on INSERT (when order is scanned); never overwritten |
| sla_completed_at | TIMESTAMPTZ NULLABLE | Set when status → OUTBOUND; null = SLA still active |
| d4_notified_at | TIMESTAMPTZ NULLABLE | Set when D4 supervisor alert is sent; prevents duplicate alerts |
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
CREATE UNIQUE INDEX ON orders (tenant_id, tracking_number);
CREATE INDEX ON orders (tenant_id, status);
CREATE INDEX ON orders (tenant_id, created_at DESC);
CREATE INDEX ON orders (tenant_id, priority DESC, created_at ASC);
CREATE INDEX ON picker_assignments (picker_id, completed_at);
CREATE INDEX ON packer_assignments (packer_id, completed_at);

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

---

## 6. User Roles & Permissions

| Panel / Action | Admin | Inbound Admin | Picker Admin | Packer Admin | Picker | Packer |
|---|:---:|:---:|:---:|:---:|:---:|:---:|
| **Main Dashboard** | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| **Inbound — view** | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |
| **Inbound — scan & add** | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| **Inbound — delete** | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| **Picker Admin Panel** | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ |
| **Picker Device View** (handheld) | ❌ | ❌ | ❌ | ❌ | Own only | ❌ |
| **Packer Admin Panel** | ✅ | ❌ | ❌ | ✅ | ❌ | ❌ |
| **Packer Device View** (handheld) | ❌ | ❌ | ❌ | ❌ | ❌ | Own only |
| **Outbound Panel** | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| **User Management** | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Reports (all)** | ✅ | ✅ | Picker only | Packer only | ❌ | ❌ |

### User Creation Rules
- Only **Admin** can create, edit, or deactivate users
- Admin sets both username and password at creation time
- New users cannot self-register
- Deactivated users cannot log in but their historical data is preserved

---

## 7. Panels — Detailed Specification

### 7.1 Main Dashboard
**Visible to:** Admin, Inbound Admin

- Live date and time display
- "Dynamic Order Management" logo and branding
- Real-time stats updated via WebSocket:
  - Inbound order count | Outbound order count | Remaining order count
  - Remaining orders breakdown by department (Picker / Packer)
- **Picker Summary:** Total | Unassigned | Assigned | In Progress | Complete
- **Packer Summary:** Total | Unassigned | Assigned | In Progress | Complete
- **SLA Summary Card:** Live D-level breakdown bar (D0 / D1 / D2 / D3 / D4 counts); D4 count highlighted in red; updates via Socket.io `sla:escalated` event
- **Nightly Report:** Automated email sent at 9:00 PM daily to all Admin users

---

### 7.2 Inbound Panel ✅ Built (Phase 2)
**Visible to:** Admin (edit), Inbound Admin (edit+delete), Picker Admin (view), Packer Admin (view)

**Scan Flow:**
1. Worker focuses the scan input field
2. Scans waybill barcode → tracking number auto-filled, platform auto-detected
3. Order saved immediately, appears in table — no further input required

**Order Table Columns:** Tracking Number | Platform | Delay (D-badge) | Scan Time | Scanned By | Actions

**Pagination:** 25 orders per page, client-side. Header stats (Total + D0–D4 counts) reflect full dataset regardless of current page.

**Sort order:** priority DESC → delayLevel DESC → createdAt ASC (most urgent first)

**Actions:**
- Inbound Admin / Admin: Delete order button (with confirmation dialog)

---

### 7.3 Picker Admin Panel ✅ Built (Phase 3 + 4 + 5 + Handheld PIN Management)
**Visible to:** Admin, Picker Admin

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
- Not INBOUND: red error `Order is not available (status: PICKER ASSIGNED)` etc.

**Staged orders list:**
- Rows: # | Tracking Number | Platform badge | Delay badge | Priority | × remove button
- Header shows count + "Clear all" button
- Staged rows in the Inbound table get a green tint + **STAGED** pill badge

**Backend endpoint:**
```
POST /picker-admin/scan   { trackingNumber }
  → 200: order data (id, trackingNumber, platform, delayLevel, priority, status, createdAt)
  → 404: Order not found
  → 409: Order is not available (status: ...)
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
- **Device PIN section** (bottom of each card): shows current PIN or "not set"; **Set PIN / Change** button → inline 4-digit input → PATCH `/picker-admin/picker/:id/pin`
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

**Seed data:** 20 pickers (Picker 1–20, password: picker123) created by seed script

---

### 7.4 Picker Device View ✅ Built
**Visible to:** PICKER role (own orders only)  
**Route:** `/picker` (public — no traditional login required)  
**Target device:** Android/iOS handheld — Chrome browser over WiFi (same LAN as server)  
**Design:** Mobile-first, touch-optimized, no sidebar, dark PIN screen + light order list

**Authentication — PIN based:**
- Each picker has a 4-digit `picker_pin` set by Picker Admin from the workload section
- Device opens `http://<server-ip>:5173/picker` → PIN numpad screen shown
- Picker enters PIN → `POST /picker/auth { pin }` → JWT cookie set (8h session)
- Session persists in localStorage (Zustand) — device reopened without re-entering PIN
- Logout button → session cleared → PIN screen shown again

**Connection setup (one-time per device):**
1. Picker Admin sets PIN for the picker in the admin panel
2. IT/admin opens `http://<server-ip>:5173/picker` on the handheld browser
3. Save/bookmark as home screen shortcut

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
- `POST /picker/auth` — PIN login (public, no auth required)
- `GET /picker/orders` — fetch own active orders (PICKER_ASSIGNED + PICKING statuses)
- `POST /picker/complete { trackingNumber }` — complete order by tracking number scan

---

### 7.5 Packer Admin Panel ✅ Built (Phase 5 + 7)
**Visible to:** Admin, Packer Admin  
**Route:** `/packer-admin`

Orders appear here **automatically** when a picker marks an order PICKER_COMPLETE — no manual assignment step required.

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
- Each card: Avatar | username | `X packed` | Done chip | Device PIN management
- **Click card → Order Detail Modal:** table of that packer's completed orders (Tracking | Platform | Delay | Completed At)
- **PIN management:** shows current packerPin or "not set"; Set PIN / Change inline form → `PATCH /packer-admin/packer/:id/pin`
- **Backend endpoints:**
```
GET  /packer-admin/packers                         → active PACKER users
GET  /packer-admin/packer/:packerId/orders         → packer's completed orders (last 50)
PATCH /packer-admin/packer/:packerId/pin { pin }   → set 4-digit packerPin
```

---

### 7.6 Packer Device View ✅ Built (Phase 7)
**Visible to:** PACKER role  
**Route:** `/packer` (public — PIN auth, no traditional login)  
**Target device:** Android handheld — same hardware as Picker Device View  
**Design:** Mobile-first, green/teal theme (vs blue for picker)

**Authentication — PIN based:**
- Each packer has a 4-digit `packer_pin` set by Packer Admin from the workload section
- Device opens `http://<server-ip>:5173/packer` → PIN numpad screen (green gradient)
- Packer enters PIN → `POST /packer/auth { pin }` → JWT cookie (8h)

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
- `POST /packer/auth` — PIN login (public)
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
│   │   └── Users.tsx              ← Phase 1 (placeholder until full build)
│   ├── components/
│   │   ├── ScanInput.tsx          ← HID barcode scanner input (desktop inbound only)
│   │   ├── OrderTable.tsx         ← desktop table; includes DelayBadge column; D2+ rows tinted
│   │   ├── OrderCard.tsx          ← Phase 4: mobile card, touch-friendly, large tap targets
│   │   ├── ConfirmDialog.tsx      ← reusable confirmation modal
│   │   ├── DelayBadge.tsx         ← D-level badge: D0=none, D1=yellow, D2=orange, D3=red, D4=red+pulse
│   │   ├── SlaAlertBanner.tsx     ← Phase 7: dismissible D4 alert banner for ADMIN/INBOUND_ADMIN
│   │   └── shared/
│   │       ├── AppLayout.tsx      ← desktop layout wrapper (Sidebar + content area)
│   │       ├── Sidebar.tsx        ← role-based nav with SVG icons; desktop only
│   │       ├── MobileHeader.tsx   ← Phase 4: handheld layout header (name + time, no nav)
│   │       ├── PageShell.tsx      ← sticky header + scrollable body for each panel
│   │       ├── Avatar.tsx         ← initials avatar component
│   │       ├── PlatformBadge.tsx  ← color-coded platform label (Shopee/Lazada/TikTok)
│   │       ├── StatCard.tsx       ← stat number card used in panel headers
│   │       └── SectionHeader.tsx  ← section title + count badge
│   ├── stores/                    ← Zustand global state
│   │   ├── authStore.ts
│   │   └── notificationStore.ts   ← Phase 7: d4Alerts[], addD4Alert(), dismissD4Alert()
│   ├── api/                       ← TanStack Query hooks
│   │   ├── orders.ts
│   │   ├── assignments.ts
│   │   ├── users.ts
│   │   └── reports.ts
│   ├── lib/
│   │   ├── platformDetect.ts      ← tracking number → platform logic
│   │   └── scanDetect.ts          ← keystroke interval < 50ms = scanner, > 200ms = manual
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
│   │   └── reports.ts
│   ├── plugins/
│   │   ├── auth.ts                ← JWT verification plugin
│   │   ├── cors.ts
│   │   ├── rateLimit.ts
│   │   └── socket.ts              ← Socket.io integration; joins user to tenant:{id} + user:{id} rooms on connect
│   ├── jobs/
│   │   ├── index.ts               ← registers all BullMQ workers and repeatable jobs
│   │   ├── nightlyReport.ts       ← BullMQ job: 9pm email (extended with SLA data)
│   │   ├── slaEscalation.ts       ← BullMQ job: every 15min sweep, D0→D4 escalation + priority boost
│   │   └── slaD4Email.ts          ← BullMQ job: supervisor alert email when order hits D4
│   ├── services/
│   │   ├── orderService.ts
│   │   ├── assignmentService.ts
│   │   ├── reportService.ts
│   │   ├── emailService.ts
│   │   └── slaService.ts          ← escalateOrder(), calculatePriorityDelta(), markSlaComplete(), querySlaEligibleOrders()
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
- **Nightly email at 9:00 PM** to all Admin users
- Contains: Inbound count, Outbound count, Remaining count, Picker & Packer summaries, **SLA data: D4 orders reached today (resolved vs still open), avg time-to-OUTBOUND, D-level breakdown at 9pm snapshot**

### On-Demand (in-app)
| Report | Where | Period |
|---|---|---|
| Dashboard summary | Main Dashboard | Live (real-time) |
| SLA summary (D0–D4 counts, D4 list, avg completion time) | Main Dashboard | Live (real-time) |
| Picker performance | Picker Admin Panel | Daily / Weekly / Monthly |
| Packer performance | Packer Admin Panel | Daily / Weekly / Monthly |
| Inbound vs Outbound | Outbound Panel | Live |
| Stuck orders (with D-level) | Outbound Panel | Live |
| SLA escalation history (per order) | Any panel with order detail | On-demand |

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
  5. SSH to Vultr → docker compose pull + up
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
| **9** | SLA escalation job (15-min sweep, D0→D4, priority boosts, D4 alert); SlaAlertBanner UI | 🔜 Next | D-level updates automatically; D4 triggers Socket.io alert + supervisor email |
| **10** | Main Dashboard + SLA Summary Card + real-time + nightly email | 🔜 | Live stats update; email received at 9pm with SLA section |
| **11** | Reporting & Analytics + CSV/PDF export | 🔜 | Reports match known test data; SLA history queryable per order |
| **12** | Security hardening + load testing | 🔜 | OWASP checklist passed; 100 users load test passed |
| **13** | Multi-tenant, Docker, CI/CD, versioned deploy | 🔜 | Full regression on test branch; clean deploy to main |

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
        ├──▶ Socket.io emit → sla:d4_alert → SlaAlertBanner appears for all ADMIN sessions
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
| `sla:d4_alert` | Server → Client | `tenant:{id}` | `{ orderId, trackingNumber, tenantId }` | Show SlaAlertBanner |

> **Key design:** `order:assigned` goes to `user:{id}` room — only the assigned picker/packer receives it. All other events broadcast to the full tenant room.

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
