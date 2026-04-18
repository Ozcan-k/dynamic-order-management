# Debugging & Solutions Log

Bu dosya, projede karşılaşılan sorunları ve çözümlerini kayıt altına alır.
Bir sorunla tekrar karşılaşıldığında buradan hızlıca çözüm bulunabilir.

---

## [2026-04-14] Packer Mobile — Liste Doluydu, Boş Olmalıydı

### Sorun
`PACKER` rolüyle giriş yapıldığında packer mobile sayfasında tenant'ın tüm `PICKER_COMPLETE` siparişleri listeleniyordu. Beklenen davranış: liste boş olmalı, packer barkod scan yaparak sipariş tamamlamalı.

### Kök Neden
`GET /packer/orders` endpoint'i `getAllPickerCompleteOrders(tenantId)` ile tenant'taki tüm `PICKER_COMPLETE` siparişleri döndürüyordu. Kullanıcıya göre filtreleme yoktu.

### Çözüm
1. `GET /packer/orders` → her zaman `{ orders: [] }` döndürür
2. Yeni endpoint: `GET /packer/find?tn=TRACKING_NUMBER` → tracking number ile PICKER_COMPLETE sipariş arar, detaylarını döner
3. `PackerMobile.tsx` güncellendi: liste query kaldırıldı, scan yapınca `/packer/find` çağrılır, sipariş detayları confirm dialog'a gösterilir, confirm → `/packer/complete`

**Etkilenen dosyalar:**
- `backend/src/services/packerService.ts` — `findOrderForPacking()` eklendi
- `backend/src/routes/packer.ts` — `/find` endpoint eklendi, `/orders` boş döner
- `frontend/src/pages/PackerMobile.tsx` — liste query kaldırıldı, handleScan API lookup yapıyor

---

## [2026-04-14] Picker/Packer Mobile — Kamera Scan Özelliği Eklendi

### Değişiklik
`ScanInput` bileşenine `enableCamera` prop'u eklendi. Aktif edilince kamera butonu çıkar, `@zxing/browser` ile barkod okur.

### Etkilenen dosyalar
- `frontend/src/components/ScanInput.tsx` — kamera buton + overlay + BrowserMultiFormatReader
- `frontend/src/pages/PickerMobile.tsx` — `enableCamera` prop aktif
- `frontend/src/pages/PackerMobile.tsx` — `enableCamera` prop aktif

---

## [2026-04-14] InboundScan + PickerAdminScan — Sign Out Butonu Eklendi

### Değişiklik
Her iki scan sayfasına sağ üst köşeye Sign Out butonu eklendi.

**Etkilenen dosyalar:**
- `frontend/src/pages/InboundScan.tsx`
- `frontend/src/pages/PickerAdminScan.tsx`

---

## [2026-04-13] Philippines Inbound Panel — Scan Pop-up Çıkmıyor (WebSocket Nginx Fix)

### Sorun
Filipinler ofisinde INBOUND_ADMIN telefondan waybill scan yapıyor ancak masaüstü Inbound panel'de pop-up çıkmıyor. Kanada'da aynı işlem yapılınca pop-up çıkıyor. Her iki cihaz da aynı WiFi ağına bağlı.

### Kök Neden
**Nginx'te `/socket.io/` için location block eksik.**

Pop-up akışı:
1. Telefon → `POST /api/orders/handheld-scan` → Backend
2. Backend → `io.to('user:X').emit('order:handheld-scan', ...)` → Socket
3. Masaüstü → `wss://domwarehouse.com/socket.io` → WebSocket bağlantısı → Pop-up

Masaüstü `https://domwarehouse.com` üzerinden Nginx'e bağlanır. Nginx sadece `/api/` trafiğini backend'e yönlendiriyordu. `/socket.io/` için location block olmadığından WebSocket bağlantısı hiç kurulmuyordu → masaüstü `user:X` room'una katılamıyordu → pop-up gelmiyordu.

Kanada'da HTTP IP (`http://45.32.107.63:5173`) ile bağlanılıyordu. Bu durumda Nginx bypass edilip Vite dev server proxy'si devreye giriyor (`ws: true` ile), WebSocket sorunsuz çalışıyor.

### Çözüm

**1. Nginx config'e `/socket.io/` location block ekle:**

```bash
sudo nano /etc/nginx/sites-available/dom
```

HTTPS server bloğuna ekle:

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

**2. `CORS_ORIGIN` env var'ını kontrol et:**

```bash
docker exec dom_backend printenv CORS_ORIGIN
```

`https://domwarehouse.com` yoksa `/opt/dom/.env`'e ekle:

```
CORS_ORIGIN=https://domwarehouse.com,https://www.domwarehouse.com
```

```bash
docker compose -f /opt/dom/docker-compose.yml restart backend
```

**3. `vite.config.ts` — `allowedHosts` kalıcı fix (kod repo'sunda):**

```typescript
server: {
  allowedHosts: ['domwarehouse.com', 'www.domwarehouse.com'],
  ...
}
```

---

## [2026-04-11] Modal / Fixed Overlay Açılmıyor

### Sorun
`position: fixed` ile tanımlanan overlay/modal bileşeni render olmuyor veya görünmüyor.

### Kök Neden
React, `position: fixed` elementleri normal DOM hiyerarşisine göre render eder.
Eğer herhangi bir parent element `transform`, `filter`, `will-change` veya `perspective`
CSS özelliğine sahipse, `position: fixed` o elementin içinde kalır (viewport'a göre değil).
Ayrıca `overflow: hidden` olan bir parent içinde `position: fixed` child görünmeyebilir.

### Çözüm
`createPortal` kullanarak modal'ı `document.body`'ye render etmek:

```tsx
import { createPortal } from 'react-dom'

export default function Modal({ onClose }: Props) {
  const modal = (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9999, ... }}>
      {/* modal içeriği */}
    </div>
  )
  return createPortal(modal, document.body)
}
```

### Bu Projede Kullanılan Yerler
- `frontend/src/components/BulkScanModal.tsx`

---

## [2026-04-11] Beyaz Sayfa (White Page / React Crash)

### Sorun
Uygulama açılıyor ama tamamen beyaz sayfa görünüyor.

### Olası Nedenler ve Kontroller

**1. Vite cache sorunu**
```bash
# Vite cache'ini temizle ve yeniden başlat
rm -rf frontend/node_modules/.vite
cd frontend && npx vite --force
```

**2. Birden fazla Vite process çalışıyor**
Port 5173 dolu görünüyorsa eski process'ler temizlenmemiş demektir.
```bash
npx kill-port 5173 5174 5175 3000
taskkill /F /IM node.exe   # Windows
```

**3. Stale tarayıcı cache**
Tarayıcıda `Ctrl+Shift+R` ile hard refresh yap.

**4. Runtime hatayı yakalamak için geçici hata handler**
`main.tsx`'e geçici olarak ekle, hatayı gör, sonra kaldır:
```tsx
window.addEventListener('error', (e) => {
  document.getElementById('root')!.innerHTML =
    `<pre style="color:red;padding:20px">[Error] ${e.message}\n${e.filename}:${e.lineno}</pre>`
})
```

**5. Shared package build edilmemiş**
`@dom/shared` paketi güncellendiyse mutlaka build et:
```bash
cd shared && npm run build
```
Sonra Vite cache'ini temizle (Vite eski dist'i cache'ler):
```bash
rm -rf frontend/node_modules/.vite
```

---

## [2026-04-11] Shared Package Yeni Export Ekleme

### Sorun
`shared/src/index.ts`'e yeni export eklendikten sonra backend veya frontend bulamıyor.

### Çözüm (Sırayla)
```bash
# 1. Shared paketi build et
cd shared && npm run build

# 2. Backend için Prisma generate (schema değiştiyse)
cd backend && npx prisma db push && npx prisma generate

# 3. Frontend Vite cache'ini temizle
rm -rf frontend/node_modules/.vite

# 4. Servisleri yeniden başlat
cd backend && npm run dev
cd frontend && npx vite
```

---

## [2026-04-11] Docker'da Shared Export Bulunamıyor (SyntaxError: does not provide an export named 'X')

### Sorun
`@dom/shared`'e yeni bir export (örn. `CARRIER_LABELS`) eklendi. Lokal çalışıyor ama
Docker container'ında beyaz sayfa + şu hata:

```
SyntaxError: The requested module '/node_modules/.vite/deps/@dom_shared.js?v=...'
does not provide an export named 'CARRIER_LABELS'
```

### Kök Neden
Docker image build sırasında `shared/dist` derlendi. Sonradan `shared/src/index.ts`'e
eklenen exportlar host'ta `npm run build` ile güncellendi ama container içindeki
`node_modules/@dom/shared/dist/` hala eski versiyonu içeriyor. Vite bu eski dist'i
cache'lediği için yeni export görünmüyor.

**Dikkat:** Vite cache Docker'da `/app/node_modules/.vite/` DEĞİL,
`/app/frontend/node_modules/.vite/` altındadır.

### Çözüm
```bash
# 1. Container içinde shared'i rebuild et
docker exec dom_frontend sh -c "cd /app && npm run build --workspace=shared"

# 2. Doğru Vite cache'ini temizle
docker exec dom_frontend sh -c "rm -rf /app/frontend/node_modules/.vite/deps"

# 3. Frontend container'ı yeniden başlat
docker restart dom_frontend

# 4. Tarayıcıda hard refresh
# Ctrl+Shift+R
```

### Kalıcı Çözüm
`shared/src` değiştikten sonra Docker image'ı yeniden build et:
```bash
docker compose build frontend && docker compose up -d frontend
```

### TypeScript Kontrolü
```bash
# Backend
cd backend && npx tsc --noEmit

# Frontend
cd frontend && npx tsc --noEmit
```

---

## [2026-04-11] `Re-export` Pattern — platformDetect.ts

### Sorun
Aynı fonksiyon hem `shared/` hem `backend/src/lib/` içinde tanımlıydı.
İkisinin de sync tutulması gerekiyordu.

### Çözüm
`backend/src/lib/platformDetect.ts` içeriği tamamen shared'den re-export'a dönüştürüldü:
```typescript
export { detectPlatform } from '@dom/shared'
```
Tek kaynak `shared/src/index.ts` — değişiklik sadece orada yapılır.

---

## [2026-04-11] `React.CSSProperties` Kullanımı

### Sorun
`React` import edilmeden `React.CSSProperties` tip annotation'ı kullanılırsa
bazı konfigürasyonlarda TypeScript hata verebilir.

### Çözüm
```typescript
// Yerine şunu kullan:
const myStyle: Record<string, string | number> = { ... }

// Veya React'i import et:
import type { CSSProperties } from 'react'
const myStyle: CSSProperties = { ... }
```

---

## [2026-04-11] Docker Container'da Backend Route / Prisma Client Eski Kalıyor

### Sorun
Backend source'a yeni route veya Prisma schema alanı ekleniyor. Lokal'de çalışıyor ama
Docker container'ında "Not Found" (404) veya "Unknown argument" hatası alınıyor.

### Kök Neden
Docker container üç ayrı katmanda eski koda sahip olabilir:
1. `backend/dist/` — TypeScript compile edilmemiş, eski JS çalışıyor
2. `node_modules/@prisma/client` — `prisma generate` çalıştırılmamış
3. `node_modules/@dom/shared/dist/` — shared package güncellenmemiş

### Çözüm (Sırayla)
```bash
# 1. Shared package'ı lokal'de build et
cd shared && npm run build

# 2. Shared dist'i container'a kopyala
docker cp shared/dist/. dom_backend:/app/node_modules/@dom/shared/dist/

# 3. Backend'i lokal'de compile et
cd backend && npm run build

# 4. Yeni dist'i container'a kopyala
docker cp backend/dist/. dom_backend:/app/backend/dist/

# 5. Prisma client'ı container'da regenerate et (schema değiştiyse)
docker cp backend/prisma/schema.prisma dom_backend:/app/backend/prisma/schema.prisma
docker exec dom_backend sh -c "cd /app/backend && npx prisma generate"

# 6. Backend'i restart et
docker compose restart backend
```

### Kalıcı Çözüm
Her backend değişikliğinde:
```bash
cd backend && npm run build
docker cp backend/dist/. dom_backend:/app/backend/dist/
docker compose restart backend
```

---

## [2026-04-11] Bulk Scan — Carrier ve Shop Name Zorunlu Alanlar

### Davranış
- Carrier ve Shop Name her ikisi de **zorunludur** (optional değil)
- Barkod tarandıktan sonra biri boşsa sarı uyarı mesajı gösterilir
- Confirm butonu her ikisi dolu olmadan disabled kalır
- Backend de `z.string().min(1)` ile validate eder → 400 döner

### İlgili Dosyalar
- `frontend/src/components/BulkScanModal.tsx` — `canConfirm` koşulu, label, uyarı mesajı
- `backend/src/routes/orders.ts` — `BulkScanSchema.shopName` optional kaldırıldı

---

## [2026-04-11] Preset Shop Names — BulkScanModal

### Davranış
`PRESET_SHOPS` sabiti `BulkScanModal.tsx` içinde tanımlıdır (18 isim).
API'den gelen mevcut shop'larla birleştirilir (`Set` ile dedup), dropdown'da her zaman görünür.

### İlgili Dosyalar
- `frontend/src/components/BulkScanModal.tsx` — `PRESET_SHOPS` sabiti, `existingShops` merge

---

## [2026-04-11] Handheld Socket Event Kayboluyor — Sayfa Kapalıyken Send Basılıyor

### Sorun
Telefonda (InboundScan / PickerAdminScan) "Send to Desktop" basıldığında backend socket event emit eder.
Ancak desktop'ta Inbound veya PickerAdmin sayfası o anda açık değilse event uçup gidiyor —
sayfa sonradan açıldığında hiçbir şey olmuyor.

### Kök Neden
Socket event fire-and-forget'dir. Listener o an bağlı değilse event kaybolur, kuyruklanmaz.

### Çözüm
İki katmanlı yaklaşım:

**1. Backend — Redis'e yaz (TTL 5 dk):**
- `POST /orders/handheld-scan` → `redis.setex('pending:handheld:single:{userId}', 300, tn)`
- `POST /orders/handheld-bulk-scan` → `redis.setex('pending:handheld:bulk:{userId}', 300, JSON.stringify(tns))`
- `POST /picker-admin/scan` → `redis.rpush('pending:staged:{userId}', JSON.stringify(order))`
- Yeni GET endpoint'ler: `/orders/pending-handheld` ve `/picker-admin/pending-staged`

**2. Frontend — sayfa mount'unda Redis'i kontrol et:**
```tsx
useEffect(() => {
  api.get('/orders/pending-handheld').then(res => {
    if (res.data.bulk?.length > 0) { setBulkInitialTNs(res.data.bulk); setShowBulkModal(true) }
    else if (res.data.single) { setPendingScan(res.data.single) }
  }).catch(() => {})
}, [])
```

Socket event gelirse önce Redis temizlenir (çifte gösterim önlenir).

### İlgili Dosyalar
- `backend/src/routes/orders.ts` — Redis yazma + `GET /pending-handheld`
- `backend/src/routes/pickerAdmin.ts` — Redis yazma + `GET /pending-staged`
- `frontend/src/pages/Inbound.tsx` — mount effect
- `frontend/src/pages/PickerAdmin.tsx` — mount effect

---

## [2026-04-11] Docker Backend Değişikliği Yansımıyor

### Sorun
`backend/src/` dosyaları değiştirildi, ancak container'da eski davranış devam ediyor.

### Kök Neden
Docker container `node backend/dist/index.js` çalıştırır. `src/` dosyaları volume olarak mount edilir
ama `dist/` image build sırasında derlenir ve sabit kalır. `tsx watch` yoktur.

### Çözüm
Backend her değiştiğinde image rebuild edilmeli:
```bash
docker-compose up --build backend -d
```

---

## [2026-04-11] PickerAdminScan Bulk — Sistemde Olmayan Waybill Listeye Ekleniyor

### Sorun
Bulk modda scan edilen waybill önce listeye ekleniyor, "Send" basılınca backend not_found hatası dönüyor.
Kullanıcı listeye yanlış ürün eklendiğini fark etmiyor.

### Çözüm
Bulk modda her scan için anında `/picker-admin/scan` endpoint'i çağrılır.
- Başarılı → listeye `status: staged` ile eklenir
- Hata (404/409) → beep + titreme + hata mesajı, **listeye eklenmez**

```tsx
const bulkValidateMutation = useMutation({
  mutationFn: (tn: string) => api.post('/picker-admin/scan', { trackingNumber: tn }),
  onSuccess: (res) => { /* listeye ekle */ },
  onError: (err, tn) => { playBeep(false); vibrate([80,60,80]); setFeedback(error) }
})
```

### İlgili Dosyalar
- `frontend/src/pages/PickerAdminScan.tsx`

---

## [2026-04-11] Inbound — Duplicate Waybill QuickScanModal Açıyor

### Sorun
Zaten inbound listesinde olan bir waybill scan edilince QuickScanModal açılıyor.
Kullanıcı carrier/shop seçiyor, Confirm'e basıyor, sonra backend 409 hatası dönüyor.
Gereksiz UX adımı.

### Çözüm
`onScan` callback'inde modal açılmadan önce `allOrders` listesine karşı anlık kontrol:
```tsx
<ScanInput
  onScan={(tn) => {
    const exists = allOrders.some(o => o.trackingNumber.toUpperCase() === tn.trim().toUpperCase())
    if (exists) { setScanFeedback({ type: 'error', message: `Already in inbound list: ${tn}` }); return }
    setPendingScan(tn)
  }}
/>
```
Backend 409 güvenlik ağı olarak korunur (farklı statüdeki order'lar için).

### İlgili Dosyalar
- `frontend/src/pages/Inbound.tsx`

---

---

## [2026-04-11] Rate Limiter Tetikleniyor — Sayfa Yüklenmiyor (429)

### Sorun
Backend tüm isteklere `Too many requests. Please slow down.` (500/429) hatası dönüyor.
Orderlar, stats ve diğer veriler yüklenemiyor.

### Kök Neden
İki katmanlı sorun:
1. **Bulk action `Promise.all`**: Seçili tüm orderlar için aynı anda N istek atıldı. 50 order = 50 eşzamanlı request → rate limit aşıldı.
2. **Agresif polling**: Her sayfa 3–5 saniyede bir birden fazla endpoint polling yapıyordu. Birden fazla tab/kullanıcı olunca katlanarak artıyor (3 tab × 3 query × 12/dk = 108 req/dk → 100 limitini aşar).

### Çözüm (3 katman)

**1. Backend: Tek bulk endpoint**
```
POST /picker-admin/bulk-complete   { orderIds[], pickerId }
POST /picker-admin/bulk-unassign   { orderIds[], pickerId }
```
Backend içinde sequential for-loop ile işler — N işlem için tek HTTP request.

**2. Backend: Rate limit artırıldı**
`backend/src/plugins/rateLimit.ts` → `max: 100` → `max: 500`

**3. Frontend: Polling aralığı uzatıldı**
Tüm `refetchInterval: 3000 / 5000` → `10_000` ms
Socket zaten real-time güncelliyor; polling sadece fallback — 10 sn yeterli.

### İlgili Dosyalar
- `backend/src/services/pickerAdminService.ts` — `bulkCompleteOrders`, `bulkUnassignOrders`
- `backend/src/routes/pickerAdmin.ts` — `/bulk-complete`, `/bulk-unassign`
- `backend/src/plugins/rateLimit.ts` — max: 500
- `frontend/src/pages/PickerAdmin.tsx` — `executeBulkAction` tek API çağrısı
- `frontend/src/pages/Inbound.tsx`, `Outbound.tsx`, `PackerAdmin.tsx` — polling 10s

---

## [2026-04-11] `docker cp` Sonrası Backend Crash Loop (exit code 0)

### Sorun
`docker cp backend/dist/... dom_backend:/app/...` ile dist dosyası güncellendi.
Ardından `docker compose up -d backend` çalıştırılınca container sürekli restart loop'a girdi (exit code 0).

### Kök Neden
`docker compose up` mevcut container'ı yeniden oluşturur (recreate).
Yeni container image'dan açılır → `docker cp` ile yapılan değişiklikler kaybolur.
Eksik JS dosyası runtime'da import hatası yerine sessiz çıkışa neden olabilir.

### Çözüm
Backend kodu her değiştiğinde **image rebuild** zorunlu:
```bash
docker compose build backend
docker compose up -d backend
```
`docker compose restart` mevcut container'ı yeniden başlatır (cp değişiklikleri korunur).
`docker compose up` yeni container açar (cp değişiklikleri kaybolur) — dikkat.

---

---

## [2026-04-13] Vultr Sunucusuna Domain + HTTPS + iPhone Kamera Kurulumu

### Sorun
- iPhone Safari `http://` üzerinde kamera iznine izin vermiyor
- Uygulama `http://45.32.107.63:5173` adresinde çalışıyordu, iPhone'da kamera açılmıyordu

### Çözüm

#### 1. Domain Al (Namecheap)
- `namecheap.com`'dan domain satın al (örn. `domwarehouse.com`)
- **Advanced DNS** → **Host Records** bölümüne iki A Record ekle:
  - `@` → `45.32.107.63`
  - `www` → `45.32.107.63`
- DNS yayılması 10–30 dakika sürer, `nslookup domwarehouse.com 8.8.8.8` ile kontrol et

#### 2. Sunucuya Nginx + Certbot Kur
```bash
sudo apt update && sudo apt install nginx -y
sudo apt install certbot python3-certbot-nginx -y
```

#### 3. Nginx Config Yaz
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

#### 4. Firewall Portlarını Aç (ÖNEMLİ)
UFW aktifse 80 ve 443 açık olmalı, yoksa certbot "connection refused" hatası verir:
```bash
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw allow 22/tcp
sudo ufw reload
```

#### 5. SSL Sertifikası Al
```bash
sudo certbot --nginx -d domwarehouse.com -d www.domwarehouse.com
```
- Email gir, şartları kabul et (Y)
- Certbot 90 günde bir otomatik yeniler

#### 6. Vite `allowedHosts` Ayarı (ÖNEMLİ)
Vite varsayılan olarak dış domain'lerden gelen istekleri bloke eder.
`vite.config.ts` → `server:` bloğuna ekle:
```ts
server: {
  allowedHosts: ['domwarehouse.com', 'www.domwarehouse.com'],
  // ...diğer ayarlar
}
```

Docker kullanılıyorsa container içindeki dosyayı da güncelle:
```bash
# Container içindeki config'e ekle
sudo docker exec -it dom_frontend sh -c "sed -i 's/server: {/server: {\n    allowedHosts: [\"domwarehouse.com\", \"www.domwarehouse.com\"],/' /app/frontend/vite.config.ts"

# Frontend'i yeniden başlat
cd /opt/dom && sudo docker compose restart frontend
```

### Karşılaşılan Hatalar ve Çözümleri

| Hata | Neden | Çözüm |
|---|---|---|
| `certbot: connection refused` | UFW port 80 kapalı | `sudo ufw allow 80/tcp && sudo ufw reload` |
| `certbot: NXDOMAIN` | DNS henüz yayılmamış | 10-30 dk bekle, `nslookup` ile kontrol et |
| `Blocked request. This host not allowed` | Vite allowedHosts eksik | vite.config.ts'e domain ekle, container restart |
| `403 Forbidden` | Nginx default config çakışıyor | `sudo rm /etc/nginx/sites-enabled/default` |
| `This site can't be reached` | UFW port 443 kapalı | `sudo ufw allow 443/tcp && sudo ufw reload` |

### Telefon URL'i

Tüm roller için **tek URL**:

```
https://domwarehouse.com/scan
```

Kullanıcı username + password giriyor, sistem role'ü tanıyıp doğru scan sayfasına yönlendiriyor:

| Rol | Yönlendirilen Sayfa |
|---|---|
| ADMIN / INBOUND_ADMIN | `/inbound-scan` |
| PICKER_ADMIN | `/picker-admin-scan` |
| PICKER | `/picker` |
| PACKER | `/packer` |

**Not:** Zaten giriş yapılmış kullanıcı `/scan`'e gelirse formu görmez, direkt kendi sayfasına yönlendirilir.

---

## [2026-04-17] Packer Scan — "Not Found" Hatası (URL Barkod Format Uyuşmazlığı)

### Sorun
Packer kamerasıyla paket üzerindeki barkodu taradığında "Order not found in this tenant" hatası alınıyordu.

### Kök Neden
**İki farklı barkod formatının çakışması:**
- Inbound admin paketi sisteme girerken düz tracking number yazıyor → DB'de `JT1234567890` kaydediliyor
- Packer kamerasıyla okuyunca barkod bir URL içeriyor (örn. `https://track.jtexpress.ph/tracking?logisticNo=JT1234567890`)

Eski `extractTrackingNumber` fonksiyonu URL'den sadece `?tn=` veya `?tracking=` query param'larını arıyordu. J&T, Shopee, vb. carrier'lar farklı param isimleri kullanır (`logisticNo`, `billCode`, `no`, `waybill`). Param bulunamazsa **son path segment**'i dönüyordu → `TRACKING` gibi tamamen yanlış bir değer gidiyordu.

### Çözüm (3 katmanlı)

**1. Frontend — `extractTrackingNumber` iyileştirildi (`PackerMobile.tsx`):**
- Tüm URL query param'ları deneniyor
- `[A-Z0-9]{6,40}` regex ile "tracking number'a benziyor mu?" heuristic kontrolü
- Path segment'ler de aynı heuristic ile kontrol ediliyor
- Ham barkod değeri de `raw` param olarak backend'e gönderiliyor

**2. Backend — `buildCandidates()` fonksiyonu (`packerService.ts`):**
- Extracted `tn` + ham `raw` barkod'dan tüm adaylar çıkarılır
- `raw` URL ise tüm query param değerleri + tüm path segment'leri aday listesine eklenir
- Her aday için sırayla arama yapılır

**3. Backend — Çift yönlü substring fallback (raw SQL):**
```sql
AND (
  ${candidate} ILIKE '%' || tracking_number || '%'
  OR tracking_number ILIKE '%' || ${candidate} || '%'
)
```
- Scanned değer DB tracking'i içeriyorsa → bulur (URL barcode case)
- DB tracking scanned değeri içeriyorsa → bulur (kısaltılmış barcode case)

**Hata mesajı iyileştirmesi:**
- `extracted: "XYZ" | raw: "https://..."` formatında gösterilir
- Format uyuşmazlığı hemen görünür hale gelir

### Etkilenen Dosyalar
- `frontend/src/pages/PackerMobile.tsx` — `extractTrackingNumber`, `handleScan`, `?raw=` param
- `backend/src/services/packerService.ts` — `buildCandidates()`, `findOrderForPacking()`, `diagnoseTracking()`
- `backend/src/routes/packer.ts` — `raw` query param kabul, her iki fonksiyona geçiriliyor

### Kural: Packer Scan Geliştirmelerinde
- Packer sayfasına dokunurken: inbound'un tracking number'ı nasıl kaydettiğini (plain text mi URL mi?) ve packer'ın hangi barkod tipini okuduğunu her zaman kontrol et
- Tek format varsayımı yapma — her zaman bidirectional search + multi-candidate yaklaşımı kullan
- Yeni carrier formatı eklenince `extractTrackingNumber`'ı güncelle

---

## Genel Kurallar

- Modal/overlay bileşenlerinde her zaman `createPortal(modal, document.body)` kullan
- `@dom/shared` güncellenince mutlaka `npm run build` çalıştır
- Birden fazla Vite process çalışıyorsa beyaz sayfa veya stale kod görünebilir
- `npx tsc --noEmit` her değişiklikten sonra çalıştırılmalı
- Backend değişikliklerinde `docker compose build backend && docker compose up -d backend`
- Bulk API işlemlerinde asla `Promise.all(tümIDs)` kullanma — backend'e single bulk endpoint ekle
- Frontend polling: socket real-time güncelleme varsa `refetchInterval` en az 10_000 ms olmalı
