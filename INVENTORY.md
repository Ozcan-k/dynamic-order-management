# QR Code Stock Control Module

> **Status:** ⏳ v2.30.0 implemented on `test` branch — pending Docker migration test + main merge approval
> **Sticker standard:** Avery L7173 / J8173 (A4, 10 stickers/sheet, 99.1 × 57 mm)
> **Roles:** ADMIN (manage + view) · STOCK_KEEPER (scan only)

---

## Genel Bakış

Depoya giren/çıkan kutular için QR tabanlı stok takip sistemi. Her kutuya basılı QR sticker yapıştırılır; depocu telefondan okutunca sistem giriş veya çıkış olarak otomatik flip eder. Mevcut sipariş sistemiyle **hiçbir bağlantısı yok** — tamamen bağımsız modül.

**Akış:**
1. ADMIN `/stock/create` → form doldur (ürün cinsi · kategori · kg · adet) → "Generate & Download PDF" → A4 üzerinde 10 sticker'lık PDF iner
2. ADMIN PDF'i Avery L7173 / J8173 sticker kağıdına basar → kutulara yapıştırır
3. STOCK_KEEPER telefondan `/scan` → login (`stockkeeper1` / `stock123`) → otomatik `/stock/scan`'e yönlendirilir
4. Kamera açılır → QR okutulur → IN/OUT toggle → ses + titreşim feedback'i + ekranda renkli banner
5. ADMIN `/stock` dashboard'da Items tab'ında envanteri, Movements tab'ında hareket geçmişini görür

---

## Roller

| Role | Yetki |
|---|---|
| `ADMIN` | Tüm `/stock` endpoint'leri (create, list, scan, movements, stats); Settings → Stock Keepers'tan depocu hesabı oluşturur |
| `STOCK_KEEPER` | **Sadece** `/stock/scan` endpoint'ine erişebilir; başka hiçbir panele giremez (PICKER/PACKER mantığı) |

`STOCK_KEEPER` rolü `shared/src/index.ts` ve `backend/prisma/schema.prisma`'nın `UserRole` enum'una eklendi.

---

## Sticker Layout — Avery L7173 / J8173

| Boyut | mm | PDFKit pt (1mm = 2.83465pt) |
|---|---|---|
| Kağıt (A4) | 210 × 297 | 595.28 × 841.89 |
| Sticker | 99.1 × 57.0 | 280.85 × 161.54 |
| Üst kenar boşluk | 13.5 | 38.27 |
| Sol kenar boşluk | 4.5 | 12.76 |
| Sticker arası yatay | 2.5 | 7.09 |
| Sticker arası dikey | 0 | 0 |
| Layout | 2 sütun × 5 satır | 10 sticker/sayfa |

**Hücre içeriği (her sticker):**
- **Sol:** QR kod (40×40mm) — UUID kodlanmış
- **Sağ:** ürün cinsi (11pt bold) · kategori (9pt) · ağırlık (9pt) · UUID ilk 8 hane (7pt mono)

Sticker baskıdan önce ölçüleri cetvelle doğrula. Kayma varsa `backend/src/services/stockService.ts`'teki `MARGIN_LEFT_PT` / `MARGIN_TOP_PT` değerlerine ufak offset ekle.

---

## Veritabanı

**Yeni Prisma model'leri** (`backend/prisma/schema.prisma`):

```prisma
enum StockStatus { IN_STOCK | OUT_OF_STOCK }
enum MovementDirection { IN | OUT }

model StockItem {
  id, tenantId, productType, category, weightKg, status, createdAt, updatedAt
  movements StockMovement[]
}

model StockMovement {
  id, stockItemId, direction, scannedById, scannedAt
  stockItem StockItem (cascade delete)
}
```

**Migration adı:** `add_stock_control_and_keeper_role` (UserRole enum'a `STOCK_KEEPER` ekler + 2 yeni model + 2 yeni enum)

---

## API Endpoint'leri

`backend/src/routes/stock.ts` — tümü prefix `/stock`

| Method | Path | Body / Query | Roles |
|---|---|---|---|
| POST | `/items/bulk` | `{ productType, category, weightKg, quantity }` | ADMIN |
| GET | `/items` | `?status&productType&category` | ADMIN |
| POST | `/scan` | `{ stockItemId }` (UUID) | ADMIN, STOCK_KEEPER |
| GET | `/movements` | `?limit&offset` | ADMIN |
| GET | `/stats` | — | ADMIN |

`POST /items/bulk` response: `application/pdf` Buffer + `X-Items-Created` header.

---

## Frontend Sayfaları

| Sayfa | Roller | Açıklama |
|---|---|---|
| `frontend/src/pages/StockDashboard.tsx` (`/stock`) | ADMIN | StatCard'lar (In Stock · Out of Stock · Total · Categories) + Items/Movements tab'ları |
| `frontend/src/pages/StockCreate.tsx` (`/stock/create`) | ADMIN | Form → bulk create → PDF blob → `window.open()` yeni sekmede aç |
| `frontend/src/pages/StockScan.tsx` (`/stock/scan`) | ADMIN, STOCK_KEEPER | Mobil-first kamera (`@zxing/browser`); UUID parse → toggle scan; ses + titreşim + renkli result banner |
| `frontend/src/api/stock.ts` | — | TanStack Query hooks (`useStockItems`, `useStockMovements`, `useStockStats`, `useCreateBulkItems`, `useScanStock`) |

---

## Yardımcı Dosya Değişiklikleri

| Dosya | Ne yapıldı |
|---|---|
| `shared/src/index.ts` | `UserRole` enum'a `STOCK_KEEPER` + `StockStatus`/`MovementDirection` type export |
| `backend/prisma/schema.prisma` | UserRole enum + 2 model + 2 enum |
| `backend/src/index.ts` | `stockRoutes` registered at `/stock` |
| `backend/src/lib/seed.ts` | 2 örnek STOCK_KEEPER kullanıcı (`stockkeeper1`, `stockkeeper2` / `stock123`) |
| `frontend/src/App.tsx` | 3 yeni route (`/stock`, `/stock/create`, `/stock/scan`) |
| `frontend/src/pages/ScanLogin.tsx` | `STOCK_KEEPER` → `/stock/scan` redirect case |
| `frontend/src/components/ProtectedRoute.tsx` | `/stock/scan` SCAN_ROUTES'e eklendi |
| `frontend/src/components/shared/Sidebar.tsx` | "Stock Control" nav item (ADMIN only) |
| `frontend/src/pages/Settings.tsx` | STOCK_KEEPER role config + "Stock Keepers" section |

---

## Reprint (Phase 2 — şimdilik yok)

Sticker yırtılır/yıpranırsa: ileride `StockDashboard` Items tablosunda her satıra "Reprint" butonu → `POST /stock/items/:id/reprint` → tek QR'lık PDF döner. Phase 1'de yok, kullanıcı kararıyla ertelendi.

---

## Verification (Local)

1. `cd backend && npx prisma migrate dev --name add_stock_control_and_keeper_role` — migration çalışmalı (Docker `postgres` ayakta olmalı)
2. `cd backend && npm run db:seed` — STOCK_KEEPER seed user'ları oluşur
3. `docker compose up` — backend + frontend ayakta
4. ADMIN login → sidebar'da "Stock Control" görünüyor → Settings'te "Stock Keepers" section'ı var
5. ADMIN `/stock/create` aç → 5 adet test → PDF iner, 1 sayfada 5 sticker
6. **Sticker baskı testi:** Önce normal A4'e bas → cetvelle ölç → ±0.5mm uyuşuyor mu → uyuşuyorsa Avery L7173'e bas
7. Telefonda `/scan` → `stockkeeper1` / `stock123` → otomatik `/stock/scan`'e yönlendirildi mi → sidebar yok mu
8. Bir QR'ı okut → "Checked OUT — …" yeşil banner; aynı QR tekrar okut → "Checked IN — …"
9. ADMIN `/stock` Items tab'da status doğru, Movements tab'da 2 hareket görünüyor (`scannedBy` = stockkeeper1)
10. **Yetki testleri:** STOCK_KEEPER tarayıcıdan `/stock` veya `/stock/create`'e direkt giderse reddetmeli; PICKER/PACKER `/stock/scan`'e giderse reddetmeli
11. **Mevcut sipariş akışı regresyonu yok** quick smoke test
