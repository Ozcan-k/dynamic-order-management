# Inventory Module

> **Status:** ✅ LIVE on https://domwarehouse.com (v2.33.0, 2026-05-10). Schema sync via `prisma db push`. v2.33.0 introduces operation-driven scan (Stock In / Stock Out / Stock Transfer), `StockStatus.PENDING` for unscanned printed labels (QR generation no longer inflates inventory), auto-generated Product IDs (`{CAT3}-NNN`), enriched per-warehouse stock breakdown with hover tooltip, search bar on the Stock page, and a unified `ConfirmModal` replacing all native `window.confirm` dialogs.
> **Sticker standard:** Avery L7173 / J8173 (A4, 10 stickers/sheet, 99.1 × 57 mm)
> **Roles:** ADMIN (manage + view + delete) · STOCK_KEEPER (scan + read-only product/warehouse lookups)

---

## v2.33.0 değişiklik özeti (2026-05-10)

1. **Auto Product ID** — Admin "+ Add Product"'a basınca Product ID girmez; backend `{CategoryPrefix3}-NNN` formatında üretir (örn. Nuts → `NUT-001`). Kategori prefiksi kategori adının ilk 3 ASCII harfi (uppercase); harf yetersizse `X` ile pad'lenir ya da `PRD` fallback'i devreye girer. Collision durumunda 5'e kadar retry yapılır.
2. **PENDING label flow** — `POST /stock/labels` artık `StockItem` satırlarını **`PENDING`** status'unda yaratır. Bu satırlar `getSummary` / `getStats` / hover breakdown hesaplamalarında **görünmez**. Bir Stock Keeper QR'ı "Stock In" işlemiyle scan edince satır `IN_STOCK`'a flip olur ve envantere katılır.
3. **Operation-driven scan** — `/stock/scan` body'si `{ id, operation: 'IN'|'OUT'|'TRANSFER', warehouseId, toWarehouseId? }` formatına geçti. Server artık state machine'i çıkarımla bulmaz; operatör seçer:
   - **IN:** `PENDING`/`OUT_OF_STOCK` → `IN_STOCK` at `warehouseId`. `IN_STOCK` ise hata: "Already in stock at …".
   - **OUT:** `IN_STOCK` → `OUT_OF_STOCK` (movement type `USED`). Diğer status'larda hata.
   - **TRANSFER:** `IN_STOCK` + `warehouseId !== toWarehouseId` → taşı. Aksi halde hata.
4. **Stock sayfası yeniden tasarım** —
   - Üst 4 KPI kartı (Products / Low stock / Transfers / Used) **kaldırıldı**.
   - Toolbar'a **search input** (product name + Product ID arar) eklendi; mevcut kategori dropdown ve Low-stock-only toggle korundu.
   - Tablo kolonları: **Category · Product · Product ID · In Stock (qty + unit) · Box Quantity · Reserved · Status · Actions**. Transfer/Used kolonları kaldırıldı.
   - **In Stock hücresi hover** → koyu tooltip: depo başına `boxes · quantity (kg/pcs)`.
   - **Actions:** Edit (createPortal modal) + Delete (ConfirmModal). Edit, kategori/isim/unit/reserved alanlarını güncellemeye izin verir; Product ID immutable ve modal başlığında gösterilir.
5. **Inventory (label gen) sayfası** — Sağdaki "Recent Batches" kartı kaldırıldı; form full-width (max 720px, centered) ve "Printed labels are pending until a Stock Keeper scans them into a warehouse." disclaimer'ı eklendi.
6. **Warehouse sayfası** — Tablodan "In-stock items" kolonu kaldırıldı.
7. **Custom ConfirmModal** — Yeni `components/shared/ConfirmModal.tsx` (createPortal, DESIGN_SYSTEM Remove pattern). Inventory modülündeki tüm `window.confirm()` çağrıları bu modal'la değiştirildi: Products tab category/product delete, Warehouses delete, StockSummary product delete.
8. **`StockSummaryRow` shape değişikliği** — Eski `inStockCount`/`transferCount`/`usedCount` alanları kaldırıldı; yerine: `inStockQuantity: number` (sum of `IN_STOCK` `quantity`), `boxCount: number` (sayım), `byWarehouse: WarehouseBreakdown[]` (hover için), `lowStock: boolean` (`inStockQuantity < reservedThreshold`).
9. **Scan page debug** — Mobile scan ekranına "Show raw QR (debug)" toggle eklendi. Açıkken kameranın okuduğu raw metni overlay olarak gösterir — JSON parse / UUID format problemlerini canlı sahada teşhis etmek için. Parser `{id}` JSON'unu **veya** çıplak UUID'yi kabul edecek şekilde gevşetildi.

---

## Genel Bakış

Stock Control modülü v2.30.0'da tek sayfa yapısıyla tasarlanmıştı; v2.31.0'da 4 alt sayfaya bölünmüş bir **Inventory** modülüne yeniden yapılandırıldı. v2.33.0'da scan akışı operasyon-bazlı oldu ve label üretimi artık otomatik stok'a katmıyor.

**Sidebar yapısı:**
```
Inventory  ▼
  ├─ Product       /inventory/products
  ├─ Inventory     /inventory/items
  ├─ Warehouse     /inventory/warehouses
  └─ Stock         /inventory/stock
```

> Parent ve bir child aynı isim ("Inventory") taşıyor — kullanıcının istediği yapı bu.

**Akış:**
1. ADMIN **Product** sayfasında kategori + ürün master data tanımlar (Category, Product Name, Product ID, Default Unit KG/PCS, Reserved threshold).
2. ADMIN **Warehouse** sayfasında depoları tanımlar (Name, Address).
3. ADMIN **Inventory** sayfasında label üretir: Product dropdown'dan seçer, KG/PCS toggle yapar, miktar + warehouse + label sayısı girer → **Generate Labels PDF**. Backend bu sırada `count` adet `StockItem` satırı oluşturur (her biri seçilen warehouse'da, status `IN_STOCK`). Batch number sunucu üretir: `YYYYMMDD-NNN`. PDF iner.
4. ADMIN PDF'i Avery L7173 sticker kağıdına basar → kutulara yapıştırır.
5. STOCK_KEEPER telefondan `/scan` → login → `/stock/scan`'e yönlenir → ekranın üstündeki **Warehouse Selector**'dan kendi mevcut deposunu seçer → kamera açılır.
6. QR scan state machine'i (server-side, `stockService.scanItem`):
   - Item bulunamadı → "Unknown label" hatası
   - IN_STOCK + aynı warehouse → **USED** (status OUT_OF_STOCK, kırmızı banner)
   - IN_STOCK + farklı warehouse → **TRANSFER** (warehouseId güncellenir, status IN kalır, mavi banner)
   - OUT_OF_STOCK + herhangi warehouse → **IN** (re-stock — status IN_STOCK + warehouseId update, yeşil banner)
7. ADMIN **Stock** sayfasında ürün başına özet görür: Category | Product | In Stock | Reserved | Transfer (30d) | Used (30d) | Status badge (Low Stock kırmızı / OK yeşil). Üstte 4 KPI card: Products / Low stock / Transfers 30d / Used 30d.

---

## Roller ve İzolasyon

| Role | Yetki |
|---|---|
| `ADMIN` | Tüm `/products`, `/warehouses`, `/stock` endpoint'leri (CRUD + scan + summary + stats); Settings → Stock Keepers'tan depocu hesabı oluşturur |
| `STOCK_KEEPER` | `POST /stock/scan` + `GET /products` + `GET /products/categories` + `GET /warehouses` (scan dropdown'ları için read-only). Hiçbir Inventory admin sayfasına giremez. |

`STOCK_KEEPER` rolü `shared/src/index.ts` ve `backend/prisma/schema.prisma`'nın `UserRole` enum'unda zaten mevcut (v2.30.0'dan kalma).

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
- **Sol:** QR kod (40×40mm) — JSON kodlanmış: `{ id }` (sadece UUID; backend lookup yapar)
- **Sağ (yukarıdan aşağı):** Product Name (11pt bold) · `#productCode` (8pt) · Quantity+Unit (9pt bold, örn. "5 kg" veya "24 pcs") · Warehouse Name (8pt) · `Batch YYYYMMDD-NNN` (7pt mono) · UUID ilk 8 hane (6pt gri)

QR payload v2.30.0'da `{id, p, c, w}` idi; v2.31.0'da `{id}`'ye sadeleşti. StockItem satırı zaten print sırasında oluşturulduğu için QR'ın metadata taşımasına gerek yok.

Sticker baskıdan önce ölçüleri cetvelle doğrula. Kayma varsa `backend/src/services/stockService.ts`'teki `MARGIN_LEFT_PT` / `MARGIN_TOP_PT` değerlerine ufak offset ekle.

---

## Veritabanı

**Prisma model'leri** (`backend/prisma/schema.prisma`):

```prisma
enum StockStatus  { PENDING | IN_STOCK | OUT_OF_STOCK }
enum StockUnit    { KG | PCS }
enum MovementType { IN | USED | TRANSFER }

model ProductCategory {
  id, tenantId, name, createdAt
  @@unique [tenantId, name]
}

model Product {
  id, tenantId, categoryId (FK), productCode, name, defaultUnit, reservedThreshold
  @@unique [tenantId, productCode]
}

model Warehouse {
  id, tenantId, name, address, createdAt, updatedAt
  @@unique [tenantId, name]
}

model StockItem {
  id, tenantId, productId (FK), warehouseId (FK), unit, quantity, batchNumber, status
  @@index [tenantId, productId | warehouseId | batchNumber | status]
}

model StockMovement {
  id, stockItemId (FK cascade), type, fromWarehouseId? (FK), toWarehouseId? (FK), scannedById, scannedAt
}
```

### Migration

`backend/prisma/migrations/20260504000000_inventory_module_redesign/migration.sql` — el yapımı (Prisma `migrate dev` interactive olduğundan `migrate diff --script` ile üretildi, başına TRUNCATE eklendi).

İçerik özeti:
1. `TRUNCATE stock_items, stock_movements CASCADE` — kullanıcı onaylı temiz başla.
2. `CREATE TYPE StockUnit`, `CREATE TYPE MovementType`.
3. `DROP TYPE MovementDirection`.
4. `stock_items`: drop `category`, `product_type`, `weight_kg` kolonlarını; add `product_id`, `warehouse_id`, `unit`, `quantity`, `batch_number`.
5. `stock_movements`: drop `direction`; add `type`, `from_warehouse_id`, `to_warehouse_id`.
6. Yeni tablolar: `product_categories`, `products`, `warehouses` + index'ler + foreign key'ler.

**Local'de uygulandı:** `docker exec dom_postgres psql -U dom_user -d dom_db -f /tmp/inventory_migration.sql` (file'ı önce `docker cp` ile container'a kopyalandı).

**Live (Vultr) deploy uyarısı:** Vultr'da `_prisma_migrations` tablosu yok (Sales modulü deploy'unda manuel `prisma db push` yapılmıştı). CD pipeline'daki `migrate deploy` no-op olabilir veya garip baseline yapabilir. Ayrıca migration `DROP COLUMN "category"` gibi komutlar içeriyor — Vultr'daki şema baseline'ı kontrol edilmeden uygulanamaz. Bkz. **"Pending — Deploy Notes"** bölümü altta.

---

## Frontend Sayfaları

| Sayfa | Path | Roller | İçerik |
|---|---|---|---|
| `pages/inventory/Products.tsx` | `/inventory/products` | ADMIN | 2 tab: **Categories** (liste + Add/Delete) ve **Products** (Category \| Name \| Product ID \| Unit \| Reserved tablo + Add/Edit/Delete modal) |
| `pages/inventory/InventoryItems.tsx` | `/inventory/items` | ADMIN | Label üretim formu: Product dropdown · KG/PCS toggle · Quantity per label · Warehouse dropdown · Label count · Batch preview (server üretir). Sağ tarafta "Recent Batches" tablosu. |
| `pages/inventory/Warehouses.tsx` | `/inventory/warehouses` | ADMIN | Tablo: Name \| Address \| In-stock items count \| Actions. Add/Edit/Delete modal. |
| `pages/inventory/StockSummary.tsx` | `/inventory/stock` | ADMIN | 4 KPI kartı + ürün başına özet tablosu. Filtre: kategori dropdown + Low stock only checkbox. Low stock satırlar kırmızı tint + ⚠️ icon + "Low Stock" badge. |
| `pages/StockScan.tsx` | `/stock/scan` | ADMIN, STOCK_KEEPER | Mobile dark UI, sidebar yok. Üstte warehouse selector (bottom sheet açılır). Scan sonucu: IN yeşil "Stocked" / USED kırmızı "Used / Out" / TRANSFER mavi "Transferred X → Y". Selection localStorage'da persist eder. |

### Eski sayfalar (silindi)
- `pages/StockDashboard.tsx` — yerini `StockSummary.tsx` aldı.
- `pages/StockCreate.tsx` — yerini `InventoryItems.tsx` aldı.

### Sidebar refactor

`components/shared/Sidebar.tsx` `NavItem` interface'i `children?: NavItem[]` ile genişletildi. Parent item button olarak render olur (NavLink değil), tıklayınca `expanded[path]` toggle yapılır; child'lar parent expanded olduğunda indent ile NavLink olarak görünür. `useLocation` ile parent path prefix match'inde otomatik expand. Şu an sadece Inventory'nin child'ı var; pattern reusable.

---

## API Endpoint'leri

### `/products` (yeni — `backend/src/routes/products.ts`)

| Method | Path | Body / Query | Roles |
|---|---|---|---|
| GET | `/categories` | — | ADMIN, STOCK_KEEPER |
| POST | `/categories` | `{ name }` | ADMIN |
| DELETE | `/categories/:id` | — | ADMIN (409 if referenced by products) |
| GET | `/` | `?categoryId` | ADMIN, STOCK_KEEPER |
| POST | `/` | `{ categoryId, productCode, name, defaultUnit, reservedThreshold }` | ADMIN |
| PUT | `/:id` | (partial body) | ADMIN |
| DELETE | `/:id` | — | ADMIN (409 if has stock items) |

### `/warehouses` (yeni — `backend/src/routes/warehouses.ts`)

| Method | Path | Body | Roles |
|---|---|---|---|
| GET | `/` | — | ADMIN, STOCK_KEEPER |
| POST | `/` | `{ name, address }` | ADMIN |
| PUT | `/:id` | (partial) | ADMIN |
| DELETE | `/:id` | — | ADMIN (409 if has stock items) |

### `/stock` (rewrite — `backend/src/routes/stock.ts`)

| Method | Path | Body / Query | Roles | Davranış |
|---|---|---|---|---|
| POST | `/labels` | `{ productId, warehouseId, unit, quantity, count }` | ADMIN | `count` adet `StockItem` oluşturur + PDF döner. Headers: `X-Labels-Generated`, `X-Batch-Number`. |
| GET | `/items` | `?status&productId&warehouseId` | ADMIN | Filtreli liste, `take: 500`. Includes: `product` (with category), `warehouse`. |
| POST | `/scan` | `{ id, warehouseId }` | ADMIN, STOCK_KEEPER | State machine (IN / USED / TRANSFER). Response: `{ item, type, fromWarehouse?, toWarehouse?, message }`. |
| DELETE | `/items/:id` | — | ADMIN | Hard-delete + cascade movements. |
| GET | `/movements` | `?limit&offset` | ADMIN | Hareket geçmişi. Includes: `fromWarehouse`, `toWarehouse`, `item.product`. |
| GET | `/stats` | — | ADMIN | `{ totalProducts, totalInStock, totalOut, lowStockProducts, transfers30d, used30d, in30d }` |
| GET | `/summary` | — | ADMIN | Per-product aggregate: `[{ productId, productName, categoryName, inStockCount, transferCount, usedCount, reservedThreshold, lowStock }]` |

---

## Frontend API Layer

| Dosya | Hook'lar |
|---|---|
| `frontend/src/api/products.ts` (yeni) | `useProducts`, `useCreateProduct`, `useUpdateProduct`, `useDeleteProduct`, `useProductCategories`, `useCreateCategory`, `useDeleteCategory` |
| `frontend/src/api/warehouses.ts` (yeni) | `useWarehouses`, `useCreateWarehouse`, `useUpdateWarehouse`, `useDeleteWarehouse` |
| `frontend/src/api/stock.ts` (rewrite) | `useStockItems`, `useStockMovements`, `useStockStats`, `useStockSummary` (yeni), `useGenerateLabels`, `useScanStock`, `useDeleteStockItem`. Type'lar: `StockItem`, `StockMovement`, `StockStats`, `StockSummaryRow`, `ScanResult`, `ScanPayload`, `GenerateLabelsInput`. |

`@dom/shared` export'ları güncellendi: `StockUnit`, `MovementType` eklendi; `MovementDirection` kaldırıldı; `StockItemSummary` interface yeni alanlara göre güncellendi.

---

## Yardımcı Dosya Değişiklikleri

| Dosya | Değişiklik |
|---|---|
| `shared/src/index.ts` | `StockUnit` + `MovementType` type export; `MovementDirection` removed; `StockItemSummary` rewritten |
| `backend/prisma/schema.prisma` | 3 yeni model + 2 yeni enum + StockItem/StockMovement rewrite |
| `backend/prisma/migrations/20260504000000_inventory_module_redesign/migration.sql` | El yapımı migration (TRUNCATE + diff SQL) |
| `backend/src/index.ts` | `productRoutes` + `warehouseRoutes` registered |
| `backend/src/services/productService.ts` | YENİ — Product/Category CRUD |
| `backend/src/services/warehouseService.ts` | YENİ — Warehouse CRUD + items count |
| `backend/src/services/stockService.ts` | Rewrite — yeni `generateLabelsPdf` (DB'ye yazar), state machine, batch number üretimi, `getSummary` |
| `backend/src/routes/products.ts` | YENİ |
| `backend/src/routes/warehouses.ts` | YENİ |
| `backend/src/routes/stock.ts` | Rewrite — yeni body shape'leri + `/summary` endpoint |
| `frontend/src/components/shared/Sidebar.tsx` | NavItem `children?` desteği + collapse/expand state |
| `frontend/src/pages/inventory/Products.tsx` | YENİ |
| `frontend/src/pages/inventory/InventoryItems.tsx` | YENİ (eski `StockCreate.tsx` deprecated) |
| `frontend/src/pages/inventory/Warehouses.tsx` | YENİ |
| `frontend/src/pages/inventory/StockSummary.tsx` | YENİ (eski `StockDashboard.tsx` deprecated) |
| `frontend/src/pages/StockScan.tsx` | Warehouse selector + IN/USED/TRANSFER renkli sonuç ekranı |
| `frontend/src/api/products.ts`, `warehouses.ts` | YENİ |
| `frontend/src/api/stock.ts` | Rewrite (yeni shape'ler + `useStockSummary`) |
| `frontend/src/App.tsx` | `/inventory/*` route'ları + `/stock` redirect → `/inventory/stock` |
| `frontend/vite.config.ts` | `proxyRoutes` listesine `/products`, `/warehouses` eklendi |
| `frontend/src/pages/StockDashboard.tsx`, `StockCreate.tsx` | **Silindi** |

---

## Verification (Local — Yapıldı)

Aşağıdaki adımlar bu çalışma içinde tamamlandı:

1. ✅ Schema güncellendi + Prisma validate (container içinde) temiz geçti.
2. ✅ Migration dosyası oluşturuldu (`prisma migrate diff --script`'in başına `TRUNCATE` eklendi).
3. ✅ `dom_backend` durduruldu, migration `dom_postgres`'e uygulandı (`psql -f /tmp/inventory_migration.sql`), backend image rebuild edildi (`docker compose build backend`) — TypeScript hatasız geçti.
4. ✅ `vite.config.ts` host'ta düzenlendi, container'a `docker cp` ile kopyalandı, `dom_frontend` restart edildi.
5. ✅ Smoke test:
   - `GET http://localhost:3000/health` → 200
   - `GET https://localhost:5173/products` (auth Accept: application/json) → 401 ✓
   - `GET https://localhost:5173/warehouses` → 401 ✓
   - `GET https://localhost:5173/stock/summary` → 401 ✓
   - DB tabloları: `product_categories`, `products`, `warehouses`, `stock_items` (rebuilt), `stock_movements` (rebuilt) ✓

### UI smoke test (kullanıcı tarafından — tarayıcıdan)

1. https://localhost:5173 → ADMIN login → sidebar'da "Inventory" parent görünür → expand olunca 4 child gelir.
2. Categories tab → "Nuts" ekle. Products tab → "Almond" ekle (Category Nuts, Product ID A-001, Reserved 50, Default Unit KG).
3. Warehouses → "Main WH" + "Transit WH" ekle.
4. Inventory → Almond + Main WH + 5 KG + 10 label print → PDF iner. Avery layout korunmuş mu cetvelle ölç.
5. `/stock/scan` → Main WH seç → bir label scan = "Stocked" (yeşil). Aynı label scan = "Used / Out" (kırmızı).
6. Yeni label scan → Main WH'da → IN. Sonra Transit WH seçili tekrar scan → "Transferred Main WH → Transit WH" (mavi).
7. `/inventory/stock` → Almond için Transfer count = 1, Used count = 1, In Stock = 8. Reserved 50 olduğu için "Low Stock" badge kırmızı.
8. Yetki testleri: STOCK_KEEPER tarayıcıdan `/inventory/products`'a giderse reddetmeli; PICKER/PACKER `/stock/scan`'e giderse reddetmeli.

---

## Bilinen Bug / Düzeltme

- **2026-05-04** — `InventoryItems.tsx` quantity input'unda `min={0.01}` + `step={0.1}` kombinasyonu HTML5 validation'ı yanıltıyordu (sadece 0.01, 0.11, 0.21, ... gibi ofsetli değerler kabul ediliyordu, integer değerler — örn. `20` — reddediliyordu). `step="any"` yapıldı.

---

## Pending — Deploy Notes

**Bu değişiklik henüz commit/push edilmedi (kullanıcı onayı bekliyor).** Live deploy için aşağıdaki riskler analiz edilmiş durumda:

### Live deploy'da çıkabilecek sorunlar

1. **Migration baseline uyuşmazlığı.** Migration dosyam v2.30.0 schema'sını baseline alıyor (`DROP COLUMN "category"`, `"weight_kg"`). Eğer Vultr'da v2.30.0 deploy edilmediyse (v2.29.0'da kaldıysa), bu kolonlar yok → DROP çuvallar.
2. **`_prisma_migrations` tablosu yok.** Vultr DB'sinde Prisma migration history yok (Sales modulü manuel `db push` ile gitmişti). CD'nin `migrate deploy` adımı no-op olur veya garip baseline yapar.
3. **TRUNCATE live'a gider.** Migration ilk satırı tüm `stock_items` ve `stock_movements` veriyi silmeyi deniyor. Live'da kullanılıp kullanılmadığını doğrulamadan uygulanmamalı.

### Deploy stratejisi (önerilen)

1. Önce sadece `test` branch'e push (CD trigger'lamaz).
2. Vultr DB'sine SSH → `\d stock_items` ile gerçek baseline'ı gör.
3. Live'da stock data var mı kontrol: `SELECT count(*) FROM stock_items;`.
4. Sonuca göre:
   - **Stock kullanılmıyorsa:** Migration'ı `DROP COLUMN IF EXISTS` ve `CREATE TABLE IF NOT EXISTS` ile idempotent yap, sonra elle uygula.
   - **Stock kullanılıyorsa:** Veri yedeği al + kullanıcıyla TRUNCATE riskini onayla.
5. Sales modülü pattern'ini tekrar et: `prisma db push --accept-data-loss` ile elle senkronize et, CD'ye bırakma.

---

## Reprint (gelecek phase)

Sticker yırtılır/yıpranırsa: ileride `Inventory > Stock` tablosunda her ürünün altındaki StockItem listesinde "Reprint" butonu → `POST /stock/items/:id/reprint` → tek QR'lık PDF döner. Şu an yok, kullanıcı kararıyla ertelendi.
