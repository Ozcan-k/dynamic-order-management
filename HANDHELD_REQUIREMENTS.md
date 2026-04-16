# Handheld Device Requirements — All Handheld Roles

> **Status:** Pending hardware evaluation  
> **Date:** 2026-04-12  
> **Updated:** v1.12.0 — Scan feedback (beep + vibration), Redis-backed event relay, immediate validation, readability improvements

---

## Minimum Requirements

| Spec | Minimum | Notes |
|---|---|---|
| OS | Android 8.0+ | Chrome browser compatibility |
| RAM | 2 GB | Browser + app session |
| Network | WiFi or Mobile Data (4G/5G) | Any network with internet access |
| Barcode Scanner | 1D laser or 2D imager | Must read waybill barcodes |
| Display | 4"+ touchscreen | Login form + order list |
| Battery | 3000mAh+ | Full shift usage |

---

## Recommended Requirements

| Spec | Recommended | Notes |
|---|---|---|
| OS | Android 10+ | Better Chrome performance |
| RAM | 3–4 GB | Smoother browser |
| Network | WiFi 802.11 ac (5GHz) or 4G LTE | Faster, less interference |
| Barcode Scanner | 2D imager (omnidirectional) | Reads damaged/angled barcodes better |
| Display | 5"+ touchscreen | Easier credential input |
| Battery | 5000mAh+ | Full shift without charging |
| Build | IP54+ rated | Warehouse drop/dust resistance |

---

## Software Requirements

- **Browser:** Chrome 80+ (pre-installed on Android)
- **Network:** Any network — WiFi, mobile data (4G/5G), or LAN
- **No app installation required** — runs entirely in browser

---

## Connecting a Device to the Application

### Prerequisites
- Application server must be running (`docker compose up`)
- Each picker/packer must have a user account created by the admin (username + password)
- Server must be accessible via a known URL (local IP or public domain via Cloudflare Tunnel)

---

### Step 1 — Find the Server URL

**Option A — Same network (local IP):**

On the server machine, open a terminal and run:
```
ipconfig
```
Look for the **IPv4 Address** under `Wireless LAN adapter Wi-Fi` or `Ethernet adapter`.

Example: `192.168.1.119`

**Option B — Any network (Cloudflare Tunnel):**

Run on the server:
```
cloudflared tunnel --url http://localhost:3000
```
A public HTTPS URL will be generated (e.g. `https://abc.trycloudflare.com`).
Update `CORS_ORIGIN` in `.env` to include this domain and restart containers.

---

### Step 2 — Create User Accounts for Pickers/Packers

1. Go to `http://localhost:5173/users` (admin panel)
2. Create accounts with role **PICKER** or **PACKER**
3. Set a username and password for each worker
4. Share the credentials with the workers

---

### Step 3 — Open the Browser on the Device

1. Open **Chrome** on the handheld device
2. Type the following in the address bar:

```
https://domwarehouse.com/scan
```

3. A login screen will appear with **Username** and **Password** fields

---

### Step 4 — Log In

1. Worker enters their username and password
2. Tap **Sign In**
3. Credentials verified → system detects the worker's role and redirects automatically to the correct scan page
   - PICKER → `/picker`
   - PACKER → `/packer`
   - INBOUND_ADMIN → `/inbound-scan`
   - PICKER_ADMIN → `/picker-admin-scan`

---

### Step 5 — Save as Home Screen Shortcut (One-time Setup)

In Android Chrome:
1. Tap the **⋮ (3-dot menu)** in the top right corner
2. Select **"Add to Home Screen"**
3. Name it (e.g. "DOM Scan") → tap **Add**

The worker can now tap this shortcut each morning to open the app directly.
All roles use the same shortcut URL: `https://domwarehouse.com/scan`

---

### Daily Usage Flow

```
Open device
    ↓
Tap "Order Picker" shortcut on home screen
    ↓
Enter username + password   ← only on first launch or after logout
    ↓
Order list appears
    ↓
Scan physical waybill barcode
    ↓
Tap "Confirm Complete"
    ↓
Order removed from list ✓
```

> **Note:** Session is valid for 8 hours. Workers do not need to log in again during a shift unless they press **Sign Out**.

---

---

## Admin Handheld Scan Setup (INBOUND_ADMIN & PICKER_ADMIN)

INBOUND_ADMIN and PICKER_ADMIN users work primarily on their desktop computers. They use a **second device (phone/tablet) only for barcode scanning** — the scan result is relayed in real-time to their desktop.

### How It Works

| Role | Handheld URL | Desktop Effect |
|---|---|---|
| INBOUND_ADMIN | `https://domwarehouse.com/scan` → `/inbound-scan` | QuickScanModal (Single) or BulkScanModal (Bulk) opens on desktop — admin fills Carrier + Shop then saves |
| PICKER_ADMIN | `https://domwarehouse.com/scan` → `/picker-admin-scan` | Scanned order auto-appears in Staging area — admin selects Picker and assigns |

### Scan Modes

Both pages have two modes selectable via a toggle:

- **Single Scan** — scan one barcode → immediately sent to desktop
- **Bulk Scan (Inbound)** — scan multiple barcodes → accumulated on phone → tap "Send X Items to Desktop" → all sent at once
- **Bulk Scan (Picker Admin)** — each scan is validated immediately against the server; only waybills that exist in the system are added to the list; invalid scans are rejected with feedback on the phone

### Scan Feedback (v1.12.0)

Every scan triggers immediate sensory feedback on the phone:

| Result | Sound | Vibration |
|---|---|---|
| Success | Two-tone ascending beep | Single 100ms pulse |
| Duplicate / Warning | Low buzz | Double pulse (80-60-80ms) |
| Error | Low square-wave buzz | Double pulse (80-60-80ms) |

### Missed Event Recovery (v1.12.0)

If the desktop Inbound or PickerAdmin page is not open when a scan is sent from the phone,
the event is persisted in Redis (5-minute TTL). When the page is opened later, it automatically
reads the pending event from Redis and opens the correct modal/staging area.

This means **the desktop page does not need to be open at the exact moment of scanning**.

### Login Flow

1. Open `https://domwarehouse.com/scan` on the phone
2. Enter admin credentials (INBOUND_ADMIN or PICKER_ADMIN) → tap Sign In
3. System detects role → automatically redirected to `/inbound-scan` or `/picker-admin-scan`
4. A **separate session** is created for the handheld (`deviceType: handheld`) so the desktop session remains active simultaneously

### HTTPS Requirement

Camera access (`getUserMedia`) requires HTTPS on Android Chrome (except localhost).
- The Vite dev server runs with a **custom self-signed SSL certificate** (`certs/cert.pem`) that includes the server's local IP (`192.168.1.119`) in the SAN field.
- On first visit, Chrome shows "Your connection is not private" → tap **Advanced** → **Proceed** to accept.
- Socket.io is routed through the Vite HTTPS proxy (`/socket.io`) to avoid mixed-content browser blocks.

### Duplicate Protection

- **Handheld single scan:** backend checks DB before emitting the socket event — yellow warning shown on phone, nothing sent to desktop.
- **Picker Admin bulk scan:** each scan is validated immediately; not-found or already-assigned waybills are rejected on the phone before being added to the list.
- **Inbound desktop scan:** `allOrders` list checked client-side before opening QuickScanModal — instant error without going through carrier/shop selection.

---

## Packer Handheld Setup

The packer handheld uses the **same hardware and process** as the picker handheld. The only differences:

| | Picker | Packer |
|---|---|---|
| Login URL | `https://domwarehouse.com/scan` | `https://domwarehouse.com/scan` |
| Redirected to | `/picker` | `/packer` |
| Account role | PICKER | PACKER |
| Order list | Own assigned orders | All PICKER_COMPLETE orders (shared queue) |
| Action | Complete own order | Scan waybill → complete from shared queue |
| Theme | Blue gradient login screen | Green gradient login screen |
| Shortcut name | "Order Picker" | "Order Packer" |

### Packer Daily Usage Flow

```
Open device
    ↓
Tap "Order Packer" shortcut on home screen
    ↓
Enter username + password   ← only on first launch or after logout
    ↓
Shared order list appears (all PICKER_COMPLETE orders)
    ↓
Pick up physical package → scan waybill barcode
    ↓
Confirm Complete bottom sheet slides up
    ↓
Tap "Confirm ✓"
    ↓
Order removed from all packers' lists ✓
```

> **Note:** All packers see the same list. First packer to scan and confirm a waybill completes the order. If two packers scan the same waybill simultaneously, one gets success and the other gets an "already completed" error.

---

## Candidate Device — HC600S (Pending Evaluation)

- **Product:** HC600S Inventory Portable Android Rugged Industrial Handheld
- **Source:** Alibaba listing
- **Status:** ⏳ Spec sheet not yet obtained — request PDF from supplier
- **Check list:**
  - [ ] Android version ≥ 8.0
  - [ ] WiFi or mobile data support
  - [ ] Barcode scanner type (1D/2D)
  - [ ] RAM ≥ 2GB
  - [ ] Display size ≥ 4"
  - [ ] Battery capacity
  - [ ] IP rating (dust/water resistance)

---

## Notes

- No special app or APK installation needed — browser-based solution
- Each picker/packer has their own username and password
- Devices are not assigned to specific workers — any worker can log in on any device
- Session lasts 8 hours — no need to re-enter credentials during a shift
- Admin can deactivate a user account to immediately revoke access
