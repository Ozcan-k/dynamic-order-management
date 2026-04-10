# Handheld Device Requirements — Picker & Packer Applications

> **Status:** Pending hardware evaluation  
> **Date:** 2026-04-10

---

## Minimum Requirements

| Spec | Minimum | Notes |
|---|---|---|
| OS | Android 8.0+ | Chrome browser compatibility |
| RAM | 2 GB | Browser + app session |
| WiFi | 802.11 b/g/n (2.4GHz) | Must connect to warehouse LAN |
| Barcode Scanner | 1D laser or 2D imager | Must read waybill barcodes |
| Display | 4"+ touchscreen | PIN numpad + order list |
| Battery | 3000mAh+ | Full shift usage |

---

## Recommended Requirements

| Spec | Recommended | Notes |
|---|---|---|
| OS | Android 10+ | Better Chrome performance |
| RAM | 3–4 GB | Smoother HMR + browser |
| WiFi | 802.11 ac (5GHz) | Faster, less interference |
| Barcode Scanner | 2D imager (omnidirectional) | Reads damaged/angled barcodes better |
| Display | 5"+ touchscreen | Easier PIN input |
| Battery | 5000mAh+ | Full shift without charging |
| Build | IP54+ rated | Warehouse drop/dust resistance |

---

## Software Requirements

- **Browser:** Chrome 80+ (pre-installed on Android)
- **Network:** Same LAN/WiFi as the application server
- **No app installation required** — runs entirely in browser

---

## Connecting a Device to the Application

### Prerequisites
- Application server must be running (`docker compose up`)
- Handheld device and server must be on the same WiFi/LAN network
- A PIN must be assigned to the user from the relevant admin panel (Picker Admin for pickers, Packer Admin for packers)

---

### Step 1 — Find the Server IP Address

On the server machine, open a terminal and run:

```
ipconfig
```

Look for the **IPv4 Address** under `Wireless LAN adapter Wi-Fi` or `Ethernet adapter`.

Example: `192.168.1.119`

---

### Step 2 — Assign a PIN to the Picker (from Picker Admin Panel)

1. On the server machine, go to `http://localhost:5173/picker-admin`
2. Find the picker's stat card
3. Click the **"Set PIN"** button on the card
4. Enter a 4-digit PIN (e.g. `1234`)
5. Click **Save**

> PINs are **globally unique** across all handheld devices. The same PIN cannot be assigned to two pickers, two packers, or one picker and one packer.

---

### Step 3 — Open the Browser on the Device

1. Open **Chrome** on the handheld device
2. Type the following in the address bar:

```
http://192.168.1.119:5173/picker
```

*(Replace `192.168.1.119` with the IP address found in Step 1)*

3. A dark PIN numpad screen should appear

---

### Step 4 — Log In with PIN

1. Picker enters their 4-digit PIN on the numpad
2. PIN is verified → picker's assigned order list opens
3. Screen switches to the light order list view

---

### Step 5 — Save as Home Screen Shortcut (One-time Setup)

In Android Chrome:
1. Tap the **⋮ (3-dot menu)** in the top right corner
2. Select **"Add to Home Screen"**
3. Name it (e.g. "Order Picker") → tap **Add**

The picker can now tap this shortcut each morning to open the app directly.

---

### Daily Usage Flow

```
Open device
    ↓
Tap "Order Picker" shortcut on home screen
    ↓
Enter 4-digit PIN        ← only on first launch or after logout
    ↓
Order list appears
    ↓
Scan physical waybill barcode
    ↓
Tap "Confirm Complete"
    ↓
Order removed from list ✓
```

> **Note:** Session is valid for 8 hours. The PIN will not be asked again if the device is turned off and back on during a shift. The PIN screen only reappears if the **Logout** button is pressed.

---

## Packer Handheld Setup

The packer handheld uses the **same hardware and process** as the picker handheld. The only differences:

| | Picker | Packer |
|---|---|---|
| URL | `http://<ip>:5173/picker` | `http://<ip>:5173/packer` |
| PIN set by | Picker Admin panel | Packer Admin panel |
| Order list | Own assigned orders | All PICKER_COMPLETE orders (shared queue) |
| Action | Complete own order | Scan waybill → complete from shared queue |
| Theme | Blue gradient PIN screen | Green gradient PIN screen |
| Shortcut name | "Order Picker" | "Order Packer" |

### Packer Daily Usage Flow

```
Open device
    ↓
Tap "Order Packer" shortcut on home screen
    ↓
Enter 4-digit PIN        ← only on first launch or after logout
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
  - [ ] WiFi supported
  - [ ] Barcode scanner type (1D/2D)
  - [ ] RAM ≥ 2GB
  - [ ] Display size ≥ 4"
  - [ ] Battery capacity
  - [ ] IP rating (dust/water resistance)

---

## Notes

- No special app or APK installation needed — browser-based solution
- If multiple pickers share shifts, each picker has their own 4-digit PIN
- PINs are globally unique — no picker and no packer may share the same PIN
- Session lasts 8 hours — no need to re-enter PIN during a shift
