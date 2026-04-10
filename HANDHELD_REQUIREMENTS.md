# Handheld Device Requirements — Picker Application

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
- A PIN must be assigned to the picker from the Picker Admin panel

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

> Each picker must have a unique PIN. The same PIN cannot be assigned to two pickers.

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
- Session lasts 8 hours — no need to re-enter PIN during a shift
