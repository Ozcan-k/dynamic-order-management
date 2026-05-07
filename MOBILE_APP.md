# DOM Mobile App Plan — Capacitor Wrap (Android v1, iOS v2)

> **Status:** 📋 PLAN ONLY — Development başlamadı, ileride yapılacak.
> **Created:** 2026-05-06
> **Owner:** —
> **Target launch (Android v1):** —

---

## Context

Şu anda warehouse personeli (PICKER, PACKER, INBOUND_ADMIN, PICKER_ADMIN, STOCK_KEEPER) `https://domwarehouse.com/scan` URL'ini Chrome'da açıp telefondan barkod tarıyor. Bu plan, mevcut /scan akışını native bir mobil uygulamaya çevirip **Apple App Store** ve **Google Play Store**'a yayınlama yol haritasını tanımlar.

**Hedef:** Mevcut React/Vite kod tabanını yeniden yazmadan, **Capacitor** ile native shell içine sarmak. Native barcode scanner, push notification, screen wake lock, biometric login eklemek. Her iki store'a da yayınlamak.

---

## Decisions (kullanıcı onaylı — 2026-05-06)

| Karar | Seçim |
|---|---|
| Dağıtım modeli | Public stores (App Store + Google Play) |
| **v1 scope** | **Android-only — Mac yok, iOS v2'ye ertelenir** |
| Backend domain | `domwarehouse.com` (CORS güncellemesi yeterli, subdomain yok) |
| Native özellikler | Barcode scanner + Push notifications (D4 alert) + Screen wake lock + Biometric login |

**Bundle ID:** `com.domwarehouse.scanner` (Phase 0'da son onay)
**App display name:** `DOM Scanner`

---

## Mimari yaklaşım: Capacitor wrap (Android-only v1)

**Neden Capacitor?**
- Mevcut React/Vite kod tabanı %100 yeniden kullanılır
- Native plugin'lerle (scanner, push, biometric) "thin wrapper" değil olduğu görünür → Apple Guideline 4.2 rejection riski azalır
- iOS desteği aynı kod tabanından gelecek — sadece Mac + Apple Dev Program edinildiğinde Phase 4-iOS / Phase 5-iOS / Phase 7 aktive edilir

**Stack:**
- `@capacitor/core` + `@capacitor/cli` + `@capacitor/android` (iOS v2'de eklenir)
- `@capacitor-community/barcode-scanner` — native barkod tarama
- `@capacitor/push-notifications` + Firebase Cloud Messaging (FCM) — D4 alert push
- `@capacitor/keep-awake` — wake lock
- `@capgo/capacitor-native-biometric` — Android BiometricPrompt (parmak izi / yüz)
- `@capacitor/app` (donanım Back butonu) + `@capacitor/status-bar` + `@capacitor/splash-screen`

---

## Mevcut /scan flow audit (2026-05-06)

| Alan | Durum | Not |
|---|---|---|
| /scan flow + role redirect | 🟢 GREEN | 6 rol → 6 scan sayfa, `ScanLogin.tsx` clean dispatcher |
| ZXing camera scan | 🟢 GREEN | `@zxing/browser` v0.1.4, `getUserMedia` HTTPS, vibration + beep çalışıyor |
| Vibration / beep feedback | 🟢 GREEN | v1.12.0 |
| Auth (cookie) | 🟡 YELLOW | `sameSite: 'lax'` mobil WebView için `'None'`'a çekilmeli |
| Vite production build | 🟡 YELLOW | SPA build çalışıyor, dev proxy mobil'de çalışmaz |
| API base URL | 🔴 RED | `client.ts` relative URL fallback mobil'de patlar — `VITE_API_URL` zorunlu |
| PWA infra (manifest, icons, SW) | 🔴 RED | Hiç yok, sıfırdan kurulmalı |
| Wake lock | 🔴 RED | Yok — uzun scan oturumlarında ekran kapanır |
| Push notification | 🔴 RED | Yok — sadece Socket.io var |

---

## Aşamalar — v1 (Android)

### Phase 0 — Hazırlık (1 gün)

- [ ] **Bundle ID + app name onayı** (default: `com.domwarehouse.scanner` / `DOM Scanner`)
- [ ] **Google Play Console kaydı** — $25 tek seferlik, https://play.google.com/console/signup
- [ ] **Firebase project oluştur** (FCM için zorunlu) — https://console.firebase.google.com → Android app ekle, `google-services.json` indir
- [ ] **Privacy Policy yaz** + `https://domwarehouse.com/privacy.html` adresine deploy
- [ ] **Support email** — `support@domwarehouse.com` (veya mevcut admin email)
- [ ] App icon master 1024×1024 PNG hazırla (DOM logosu + warehouse motifi)

### Phase 1 — Backend hazırlık (1 gün)

**Dosya:** `backend/src/routes/auth.ts`
- [ ] Cookie config: `sameSite: 'None'` + `secure: true`
- [ ] `COOKIE_SECURE=true` env var prod'da forced

**Dosya:** `backend/src/plugins/cors.ts`
- [ ] `Access-Control-Allow-Credentials: true`
- [ ] Origin whitelist'e Capacitor scheme'lerini ekle (`https://localhost`, `capacitor://localhost`, `https://domwarehouse.com`)
- [ ] `CORS_ORIGIN` env var virgül-ayrılmış multi-origin desteği

**Yeni dosya:** `backend/src/routes/push.ts`
- [ ] `POST /push/register-token { token, platform }` — FCM token kaydet
- [ ] `POST /push/unregister` — logout'ta token sil
- [ ] Yeni Prisma model `PushToken { id, userId, token, platform, createdAt }`
- [ ] `backend/src/jobs/slaEscalation.ts` — D4 detection sonrası push gönderimi ekle (yeni `pushService.ts`)

### Phase 2 — Frontend hazırlık (3-5 gün)

**Dosya:** `frontend/src/api/client.ts`
- [ ] Relative URL fallback'ı kaldır (`baseURL: import.meta.env.VITE_API_URL || ''` → `baseURL: import.meta.env.VITE_API_URL`)
- [ ] Build sırasında `VITE_API_URL` set edilmediyse bariz hata fırlat

**Dosya:** `frontend/index.html`
- [ ] PWA meta tag'leri: `theme-color`, `apple-mobile-web-app-capable`, `manifest` link, `apple-touch-icon`

**Yeni dosya:** `frontend/public/manifest.webmanifest`
- [ ] Metadata: name "DOM Scanner", short_name "DOM", start_url "/scan", display "standalone", theme_color "#0f172a", background_color "#f1f5f9"
- [ ] Icons: 192×192, 512×512 (zorunlu)

**Yeni klasör:** `frontend/public/icons/`
- [ ] `icon-192.png`, `icon-512.png`, `apple-touch-icon-180.png`

**Vite plugin:** `vite-plugin-pwa` install + config

**Scan sayfaları wake lock:** PickerMobile, PackerMobile, StockScan, InboundScan, PickerAdminScan, PackerAdminScan
- [ ] Mount'ta `KeepAwake.keepAwake()` (Capacitor) veya `navigator.wakeLock.request('screen')` (web fallback)
- [ ] Unmount'ta release

**Biometric login:** `frontend/src/pages/ScanLogin.tsx`
- [ ] İlk başarılı login sonrası `NativeBiometric.setCredentials()`
- [ ] Sonraki açılışlarda `NativeBiometric.verifyIdentity()` → otomatik login
- [ ] "Use password instead" fallback butonu

### Phase 3 — Capacitor entegrasyon (3-5 gün)

**Yeni klasör yapısı (proje kökünde):**
```
mobile/
├── android/                 ← Capacitor üretir, Android Studio projesi
├── capacitor.config.ts      ← root config
└── package.json
```

**Adımlar:**
- [ ] `mkdir mobile && cd mobile && npm init -y`
- [ ] `npm install @capacitor/core @capacitor/cli @capacitor/android`
- [ ] `npx cap init "DOM Scanner" "com.domwarehouse.scanner" --web-dir=../frontend/dist`
- [ ] `capacitor.config.ts`:
  ```ts
  appId: 'com.domwarehouse.scanner'
  appName: 'DOM Scanner'
  webDir: '../frontend/dist'
  server: {
    androidScheme: 'https',
    url: 'https://domwarehouse.com',  // server-mode: frontend update'leri store review olmadan canlıya çıkar
    cleartext: false
  }
  android: { backgroundColor: '#0f172a' }
  ```
- [ ] `npx cap add android`

**Native plugin install:**
- [ ] `@capacitor-community/barcode-scanner` + Android camera permission
- [ ] `@capacitor/push-notifications` + Firebase setup (`google-services.json` + Google Services Gradle plugin)
- [ ] `@capacitor/keep-awake`
- [ ] `@capgo/capacitor-native-biometric` + Android USE_BIOMETRIC permission
- [ ] `@capacitor/app @capacitor/status-bar @capacitor/splash-screen`

**Native scanner conditional:** ScanInput.tsx, PickerMobile.tsx, StockScan.tsx, InboundScan.tsx
- [ ] `Capacitor.isNativePlatform()` true → `BarcodeScanner.startScan()`
- [ ] False → mevcut ZXing fallback

**Splash + icon assets:**
- [ ] `npm install -D @capacitor/assets`
- [ ] `assets/icon.png` (1024×1024) + `assets/splash.png` (2732×2732)
- [ ] `npx capacitor-assets generate --android`

**Android permissions (`AndroidManifest.xml`):**
CAMERA · INTERNET · USE_BIOMETRIC · VIBRATE · WAKE_LOCK · POST_NOTIFICATIONS

### Phase 4 — Build & device test (2-3 gün)

- [ ] `cd frontend && VITE_API_URL=https://domwarehouse.com npm run build`
- [ ] `cd ../mobile && npx cap sync android`
- [ ] `npx cap open android` → Android Studio
- [ ] Gradle build → APK
- [ ] Real Android cihazda USB debug ile test

**Test matrisi (Android):**
| Senaryo | Status |
|---|---|
| Login → role redirect → scan sayfası | ☐ |
| Native barcode scanner (ZXing'e göre 2x+ hızlı) | ☐ |
| Vibration + beep | ☐ |
| WebSocket bağlantı persist | ☐ |
| Push notification (D4 alert, app kapalıyken) | ☐ |
| Wake lock — 5dk idle, ekran kapanmaz | ☐ |
| Biometric login — parmak izi | ☐ |
| Donanım Back butonu | ☐ |
| Logout → login dön | ☐ |
| 8h cookie expiry sonrası re-login flow | ☐ |

**Test cihazı:** Android 8+ herhangi bir cihaz, ideal HC600S handheld

### Phase 5 — Google Play store assets (2 gün)

- [ ] App icon master 1024×1024
- [ ] Feature graphic 1024×500 PNG
- [ ] Screenshots (minimum 4):
  1. Login ekranı (biometric prompt görünür)
  2. Picker order list (D-badge + carryover)
  3. Camera scan açık (overlay'li)
  4. Confirm complete bottom sheet
  5. Stock scan transfer sonucu
- [ ] App description: title (max 30) · short (max 80) · full (max 4000)
- [ ] Privacy Policy URL: `https://domwarehouse.com/privacy.html`

### Phase 6 — Google Play yayın (1-2 gün iş + 1-7 gün review)

**Adım adım:**

1. **Google Play Console hesap aç** — https://play.google.com/console/signup ($25 tek)

2. **Yeni uygulama oluştur** — Console → "Create app"
   - App name: DOM Scanner
   - Default language: English (United States)
   - App or game: App
   - Free or paid: Free

3. **App content beyanları (zorunlu):**
   - Privacy Policy URL gir
   - **App access** — login required + test credentials sağla (Google review için bir test user)
   - **Ads:** No
   - **Content rating questionnaire** doldur — IARC certificate
   - **Target audience:** 18+
   - **News app:** No
   - **Data safety form** — Personal info (email), User content (scan log'ları), Camera (in-app barkod)
   - **Government app:** No

4. **Signed AAB build:**
   - Android Studio → Build → Generate Signed Bundle / APK → **Android App Bundle**
   - **Keystore üret** (ilk seferinde):
     - Path: `~/.android/dom-release.keystore`
     - Alias: `dom-scanner`
     - Validity: 25 yıl
     - **CRITICAL: Keystore kaybolursa app güncellenemez. Hem ekranlokal hem buluta backup al!**
   - Build variant: release · Signing: V1 + V2 enabled
   - Output: `mobile/android/app/release/app-release.aab`

5. **Upload AAB → Internal Testing:**
   - Console → "Testing" → "Internal testing" → "Create new release"
   - AAB yükle
   - Release notes ekle (TR + EN)
   - Save → Review release → Start rollout
   - Internal testers email listesi (5-10 staff)

6. **Test → Closed → Production:**
   - Internal testing → 1-2 gün staff testi
   - Closed testing (opsiyonel — geniş beta)
   - Production track'e promote → review tetiklenir

7. **Review süresi:** Tipik 1-7 gün

**Yaygın Google Play rejection sebepleri:**
- Privacy Policy URL erişilebilir değil (404)
- Data safety form eksik
- Test credentials çalışmıyor

### Phase 7 — FUTURE / v2 (Mac edinildiğinde): iOS şeridi

> ⏳ Bu phase v2 olarak ertelendi. Mac + Apple Developer Program ($99/yıl) edinildiğinde aktive edilir.

**v2 ek install + adımlar:**
- [ ] `cd mobile && npm install @capacitor/ios`
- [ ] `npx cap add ios` (Mac üzerinde)
- [ ] iOS Info.plist permission strings:
  - `NSCameraUsageDescription`: "DOM Scanner needs camera access to scan warehouse waybill barcodes."
  - `NSFaceIDUsageDescription`: "Use Face ID to log in faster."
- [ ] `npx capacitor-assets generate --ios`
- [ ] APNs key Apple Dev Console'dan üret + Firebase'e yükle
- [ ] Xcode → Archive → Distribute App → App Store Connect Upload
- [ ] TestFlight internal testing
- [ ] App Store Connect → Submit for Review (camera + privacy + 1.0 build)
- [ ] Apple review: 1-3 gün

**Apple rejection riskleri (Capacitor + native plugin'lerle minimize):**
- Guideline 4.2 — Minimum Functionality → Native scanner + push + biometric var, geçer
- Guideline 5.1.1 — Data Collection → Privacy Policy + camera permission strings net
- Guideline 2.1 — App Completeness → TestFlight'ta test credentials + working demo

---

## Critical Files to Modify

**Backend:**
- `backend/src/routes/auth.ts` — cookie sameSite + secure
- `backend/src/plugins/cors.ts` — credentials + Capacitor schemes whitelist
- `backend/src/routes/push.ts` — YENİ
- `backend/src/services/pushService.ts` — YENİ (FCM HTTP v1 API client)
- `backend/src/jobs/slaEscalation.ts` — D4 push gönderimi
- `backend/prisma/schema.prisma` — `PushToken` model

**Frontend:**
- `frontend/src/api/client.ts` — relative URL fallback kaldır
- `frontend/src/pages/ScanLogin.tsx` — biometric login flow
- `frontend/src/components/ScanInput.tsx` — `Capacitor.isNativePlatform` branching
- `frontend/src/pages/{PickerMobile,PackerMobile,StockScan,InboundScan,PickerAdminScan,PackerAdminScan}.tsx` — wake lock + native scanner branching + push register
- `frontend/index.html` — PWA meta tags
- `frontend/public/manifest.webmanifest` — YENİ
- `frontend/public/icons/` — YENİ klasör + 3 PNG
- `frontend/vite.config.ts` — `vite-plugin-pwa`
- `frontend/package.json` — yeni dep'ler

**Yeni mobile workspace:**
- `mobile/capacitor.config.ts` — YENİ
- `mobile/android/` — YENİ (Capacitor üretir)
- `mobile/package.json` — YENİ

**Yeni asset'ler proje kökünde:**
- `assets/icon.png` (1024×1024)
- `assets/splash.png` (2732×2732)

**Public asset'ler (web):**
- `frontend/public/privacy.html` — Privacy Policy

---

## Verification

End-to-end doğrulama checklist (development başladığında):

1. **Web build wrappable:** `cd frontend && VITE_API_URL=https://domwarehouse.com npm run build && npx serve dist` → tarayıcıda full cycle çalışmalı
2. **CORS cross-origin:** `curl -i -H "Origin: capacitor://localhost" https://domwarehouse.com/auth/me` → `Access-Control-Allow-Credentials: true` header'ı dönmeli
3. **Android APK install + smoke:** Phase 4 test matrisi 10/10 ✓
4. **Native scanner perf:** ZXing'e göre 2x+ hızlı (manuel ölçüm)
5. **Push:** Picker Admin telefonu app kapalı → backend D4 emit → 5sn içinde notification
6. **Biometric:** İlk login sonrası app kapat-aç → biometric prompt → otomatik login
7. **Cookie persistence:** App kapatıp 8h içinde tekrar açınca login korunur
8. **Wake lock:** Scan sayfasında 5dk dokunmadan bekle → ekran kapanmaz
9. **Google Play smoke:** Internal testing track'ten install eden test user tüm akışı çalıştırabiliyor

---

## Tahmini timeline + maliyet (v1, Android-only)

**Süre:** 2-3 hafta development + 1-7 gün Google Play review = **~3-4 hafta toplam**

**Maliyet:**
- Google Play Console: **$25 tek seferlik**
- Firebase (FCM): **Free** (Spark plan, push messaging unlimited)
- Privacy Policy hosting: **Free** (mevcut server)
- iOS yokluğu sayesinde Apple Dev Program $99/yıl ertelendi
- **Toplam v1 maliyet: $25**

**v2 (iOS) ek maliyet:**
- Apple Developer Program: $99/yıl
- macOS makine: yeni Mac mini ~$600 veya cloud Mac ~$30-50/ay

---

## Sonraki adım

Development başlatma kararı alındığında:
1. Phase 0 başlar — bundle ID son onay + Google Play hesabı + Firebase project + Privacy Policy
2. Phase 1-6 sırayla — her phase sonunda test branch'e push + tag (v2.32.0-test, v2.33.0-test, ...)
3. Production'a yayın v2.40.0 hedef (Google Play live)
4. Bu dosyadaki checkbox'lar `[ ]` → `[x]` olarak ilerleme takibi yapılır

iOS v2 zaman çizelgesi: Mac edinildiğinde Phase 7 ayrı milestone — kod tabanı ortak olduğu için 1-2 hafta ek iş.

---

## Açık sorular (development başlamadan önce netleştirilecek)

- [ ] Privacy Policy metni hazır mı, yoksa template'ten yeni mi yazılacak?
- [ ] Test cihazı Android için var mı (HC600S veya generic Android 8+)?
- [ ] Push notification scope: sadece D4 alert mi, yoksa `order:assigned` (handheld push) de eklensin mi?
- [ ] Biometric login fallback: cihaz biometric desteklemezse password promptu mu, yoksa direkt password screen mi?
