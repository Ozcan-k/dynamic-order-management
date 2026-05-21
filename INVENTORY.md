# Inventory Module

> **Status:** ✅ LIVE on https://domwarehouse.com (v2.36.0, 2026-05-20 — overall app version; this doc covers the Inventory module up to v2.36.0). Schema unchanged since v2.33.0 — all subsequent work is application/UI/render-side. v2.36.0 trio: (1) Stock page row Delete button removed (delete lives only on the Product master page now); (2) Edit-modal Remove-boxes form gained an optional `Unit` + `Qty per box` pair — when set, REMOVE only consumes rows that match exactly (so a 10 kg box isn't silently eaten when the operator wanted to drop a 5 kg); blank still means FIFO oldest-first; (3) Product delete on the Products page actually works now — backend pre-checks IN_STOCK count (blocks with a clear message), then cascades PENDING + OUT_OF_STOCK rows in a transaction so the `StockItem.product onDelete: Restrict` FK no longer rejects every product that ever had a label printed. v2.33.x dialed in the thermal-label format (60 × 40 mm, single-page roll, QR 36 mm, EC=M margin 4, raw UUID payload, `fitText` manual truncation) and the mobile scan UX (Single / Bulk mode toggle, fullscreen camera, floating chip top bar, in-overlay close button, vibrate + beep on detect, Confirm-scan bottom sheet in Single mode, running log + counter in Bulk mode, explicit operation-pick guard). v2.34.0 added a manual stock-adjustment endpoint + Edit-modal section on the Stock page (ADMIN can ADD/REMOVE boxes per warehouse without scanning labels, batch-numbered `ADJ-YYYYMMDD-NNN`). v2.34.1 hard-blocks re-IN of an already-stocked label (use Transfer / Stock Out instead). v2.34.2 dropped the warehouse-name row from the printed sticker and widened the remaining text (product name 10pt, qty 12pt, code/batch 7pt). v2.34.4 reworked the Inventory label-generation form: Category → Product cascade dropdowns and the warehouse selector was removed — the destination warehouse is now picked at Stock-In scan time (backend `warehouseId` is optional on `POST /stock/labels`; PENDING rows fall back to the tenant's first warehouse as a placeholder until scanned). v2.35.4 → v2.35.5 fixed sticker rendering so product names print in full instead of ellipsis-truncating: the renderer greedy-wraps onto a 2nd line at 10pt, auto-shrinks 10→9→8→7→6pt when 2 lines still don't fit, and allows a 3rd line at 7/6pt for very long 3-word names (e.g. "Dried California Almonds" now prints as `Dried California` / `Almonds` at 6pt) — ellipsis only as a last-resort for pathological single-word names wider than the line at 6pt.
> **Sticker standard:** Thermal label roll · 60 × 40 mm · 1 label per page (direct thermal printer)
> **Roles:** ADMIN (manage + view + delete) · STOCK_KEEPER (scan + read-only product/warehouse lookups)

---

## v2.33.1 – v2.36.0 değişiklik özeti (2026-05-14 – 2026-05-20)

(v2.34.3 was a docs-only sync — no functional change.)

Bu aralıkta sadece application/UI/render değişikliği yapıldı; Prisma şeması ve API contract'larda kırıcı değişiklik yok. Hızlı liste (her satır kendi commit'i, hepsi `cf69ea5` ve öncesi merge'lerde live):

| Ver | Özet |
|---|---|
| **v2.33.1** | Avery A4 (10 sticker/sheet) → Thermal label roll 60×40mm, 1 label/page. PDFKit `page size = label size`. |
| **v2.33.2** | QR scan reliability ilk turu (EC=H, margin=2) + scan ekranı layout flip (camera üstte, selectors altta). *Not: EC=H küçük canvas'ta tam ters etki yaptı, v2.33.3'te geri alındı.* |
| **v2.33.3** | QR settings tekrar ayarlandı (EC=M, margin=4, **raw UUID payload**, canvas 30→36mm — modül boyutu 0.81→1.09 mm) + text rows yeni layout. |
| **v2.33.4** | Scan state machine no-op'larda `noChange: true` soft success + frontend sarı "⚠ Already done" banner; PDFKit `lineBreak: false` 0.18.0 quirk için `fitText` helper. *Not: IN soft success v2.34.1'de strict'e döndü.* |
| **v2.33.5** | QR detect sonrası **"Confirm scan"** bottom-sheet modal eklendi (single mode). Detect: titreşim + bip + modal. Confirm: ikinci titreşim + bip + result banner. Cancel: modal kapanır, kamera devam eder. |
| **v2.33.6** | Vibrate pattern'leri güçlendirildi (detect `[80,60,140]`, success `[200,60,80,60,80]`, error `[100,60,100,60,100]`). Header padding küçültüldü; camera açıkken stacked selectors → compact chip row. iOS Safari `navigator.vibrate` desteklemediğinden orada sessiz no-op. |
| **v2.34.0** | **Manual stock adjustment** — `POST /stock/adjust` (ADMIN-only). Stock page Edit modali'na 3 bölüm: Product details · Current stock (per-warehouse breakdown) · Adjust stock (ADD/REMOVE form). Batch number `ADJ-YYYYMMDD-NNN`. Schema değişmedi (MovementType ADD→IN, REMOVE→USED yeniden kullanıldı). REMOVE FIFO mantığıyla en eski IN_STOCK satırlarını OUT_OF_STOCK'a flip eder. |
| **v2.34.1** | (a) Operation seçimi zorunlu — `localStorage.stock-scan-op-picked` flag'i `'1'` olana kadar "Open Camera" Op picker'ı açar. (b) Açık kamerada × close butonu (sağ üstte). (c) **Strict re-IN block**: bir label bir kez stock-in'lendiyse (`IN_STOCK` veya `OUT_OF_STOCK`) tekrar IN denenmesi sert hata döner — Transfer veya OUT kullanılmalı. v2.33.4'teki "Already done" soft success geri alındı. |
| **v2.34.2** | (a) **Single / Bulk scan modes** — InboundScan/PickerAdminScan pattern'i StockScan'e taşındı. Single = confirmation modal (mevcut). Bulk = otomatik commit + alt log + counter `BULK · N done · M errors`, 800ms debounce. Mode `localStorage.stock-scan-mode`. (b) **Tam ekran kamera** — `position: fixed, inset: 0` overlay; top gradient bar (× + Op + WH + toWH + Mode toggle); bottom gradient bar (result/log). (c) **Warehouse satırı PDF'den kaldırıldı** — depo bilgisi DB+scan UI'da var, sticker'da gürültüydü. Product name 9→10pt, qty 10→12pt, code/batch 6→7pt. |
| **v2.34.4** | **Inventory label form yeniden düzeni** — (a) **Category → Product cascade**: önce Category dropdown, ardından sadece o kategorideki ürünleri listeleyen Product dropdown. Kategori değişince Product seçimi ilk eşleşene reset. (b) **Warehouse selector kaldırıldı** — hedef depo zaten Stock In scan'inde belirleniyor (v2.34.1+). Backend `POST /stock/labels` `warehouseId` artık opsiyonel; verilmezse tenant'ın en eski warehouse'u PENDING satırlara placeholder olarak yazılır, gerçek depo IN scan'inde overwrite edilir. DB şeması değişmedi. |
| **v2.34.5** | **Bulk Scan queue + confirm + auto-dismiss** — (a) Bulk mode artık auto-commit yapmıyor; her QR taraması yeni `GET /stock/lookup/:id` ile read-only preview yapıp local queue'ya `{productName, qty, unit}` ile push'lar (status değişmiyor). Aynı QR queue'da varsa silent skip. Üstte counter: `QUEUE · N boxes · X kg + Y pcs`. (b) Queue dolu iken alt overlay'de **Confirm All** butonu görünür → bottom-sheet **confirm popup**: operation, warehouse(s), box count, total kg + total pcs ayrı satırlarda. Confirm basılınca queue sırayla `/stock/scan` ile commit edilir, sonuçlar bulkResults log'a düşer. Cancel queue'yu korur. Clear button queue + log'u temizler. (c) **Single mode banner auto-dismiss**: `lastResult` ve `errorMessage` 7 saniye sonra otomatik kaybolur (sabit `RESULT_TOAST_MS = 7000`). Bulk log persistent kalır — operatör review'a ihtiyaç duyuyor. |
| **v2.35.4** | **Label PDF — product name full-render fix (initial)** — Eski `fitText` 18 mm text alanına sığmayan ürün adlarını "Dried Di…" gibi ellipsis ile kesiyordu (saha fotoğrafı ile teyit edildi). `stockService.ts`'ye yeni `fitProductName(doc, text, maxWidth)` helper'ı eklendi: önce 10pt tek satır dener; sığmazsa 10pt'de greedy word-wrap ile 2 satıra böler; 2 satır da yetmezse font'u 10→9→8→7pt'ye indirip her boyutta 1+2 satır kombinasyonlarını dener. Worst-case (7pt'de bile tek kelime aşıyor) ellipsis fallback kalır. Y konumu lineY(5) sabit, 2. satır `size × 1.2` line-height ile aşağı yazılır — 10pt iki satır ~y=9.2 mm'de bitiyor, qty satırı (y=15 mm) ile 5.8 mm açıklık. QR boyutu (36 mm), payload (raw UUID), QR settings (EC=M margin 4) dokunulmadı; sadece render-side fix. Schema değişmedi. **Not:** 7pt minimum + 2 satır sınırı, "Dried California Almonds" (`California Almonds` 7pt'de 64 pt > 51 pt text-W) gibi 3-kelime isimlerde yetersizdi — v2.35.5 ile genişletildi. |
| **v2.36.0** | **Stock UX + product-delete trio** — Üç bağımsız fix tek MINOR'da. (a) **Stock page row Delete kaldırıldı** — `StockSummary.tsx`'te Actions hücresinde artık sadece Edit var; ürün silme tek noktada (`/inventory/products`) toplandı, böylece sahada stok personeli yanlışlıkla ürün master record'unu silemiyor. (b) **Edit modali → Remove boxes** formuna **Unit + Qty per box** alanları eklendi (ADD'de zaten vardı, REMOVE'da opsiyonel). Backend `adjustStock` REMOVE dalı, `quantity` verildiğinde IN_STOCK candidate listesini `unit + quantity` ile filtreliyor (sadece tam eşleşen kutular silinir); boş bırakılırsa eski FIFO oldest-first davranışı korunur. Sebep: saha aynı üründe farklı boyutta kutu tutuyor (5 kg + 3 kg + 10 kg karışık); operatör "1 kutu 10 kg sil" demek istediğinde FIFO en eski 5 kg'yı silerse stok yanlışlanıyordu. (c) **Product delete artık çalışıyor.** Eski davranışta `Product → StockItem onDelete: Restrict` FK kuralı yüzünden tek bir geçmiş etiket (PENDING veya OUT_OF_STOCK) bile silmeyi bloke ediyordu — kullanıcı "hiç silinemiyor" olarak şikayet etmişti. Yeni `deleteProduct`: önce `IN_STOCK` row sayısını count'lar; > 0 ise net mesajla blok ("Cannot delete — N box(es) still in stock. Stock Out or Remove them first." → route 409); 0 ise transaction içinde `stockItem.deleteMany({ productId })` (movement'lar `StockMovement.stockItem onDelete: Cascade` ile otomatik gider) + `product.delete()`. Şema değişmedi, sadece servis logic. ConfirmModal mesajı "Pending labels and used-stock history will also be cleared. Deletion is blocked if any boxes are still IN STOCK." şeklinde netleştirildi. |
| **v2.35.5** | **Label PDF — extended wrap for long 3-word names** — v2.35.4 follow-up. `fitProductName` artık 6pt'ye kadar iniyor (sizes `[10,9,8,7,6]`) ve 6pt'de de 2 satır olmuyorsa 7pt → 6pt'de 3 satır wrap'ı deniyor. Mantık `greedyWrap(doc, text, maxWidth, maxLines)` helper'ına ayrıştırıldı (eski tek satırlık greedy döngü kaldırıldı). Yeni davranış (textW = 51.02 pt): `Almond` → 10pt single; `Dried Dill` → 10pt single; `Dried Dates` → 10pt 2-line; `Dried California Almonds` → 6pt 2-line (`Dried California` / `Almonds`); `Premium Organic Walnut Halves` → 6pt 2-line (`Premium Organic` / `Walnut Halves`); `Supercalifragilisticexpialidocious` (tek 33-char kelime) → 6pt ellipsis (kabul edilebilir patolojik durum). 3-satır wrap dikey çakışma riski yok: 7pt × 3 = 25.2 pt + lineY(5) = 39.4 pt; qty satırı 42.5 pt'de — 3 pt açıklık. PDFKit/Helvetica-Bold ölçümleri `widthOfString` ile her boyutta canlı yapılıyor. Schema değişmedi. |

---

## v2.33.0 değişiklik özeti (2026-05-10)

1. **Auto Product ID** — Admin "+ Add Product"'a basınca Product ID girmez; backend `{CategoryPrefix3}-NNN` formatında üretir (örn. Nuts → `NUT-001`). Kategori prefiksi kategori adının ilk 3 ASCII harfi (uppercase); harf yetersizse `X` ile pad'lenir ya da `PRD` fallback'i devreye girer. Collision durumunda 5'e kadar retry yapılır.
2. **PENDING label flow** — `POST /stock/labels` artık `StockItem` satırlarını **`PENDING`** status'unda yaratır. Bu satırlar `getSummary` / `getStats` / hover breakdown hesaplamalarında **görünmez**. Bir Stock Keeper QR'ı "Stock In" işlemiyle scan edince satır `IN_STOCK`'a flip olur ve envantere katılır.
3. **Operation-driven scan** — `/stock/scan` body'si `{ id, operation: 'IN'|'OUT'|'TRANSFER', warehouseId, toWarehouseId? }` formatına geçti. Server artık state machine'i çıkarımla bulmaz; operatör seçer. v2.33.4'te no-op state'ler **soft success** ile döner (`noChange: true`) — kullanıcı sahada kırmızı hata yerine sarı "Already done" banner görür:
   - **IN:** Sadece `PENDING` durumdaki labellar `IN_STOCK`'a flip edilebilir. v2.34.1'den itibaren bir label bir kez stoğa alındıktan sonra (status `IN_STOCK` veya `OUT_OF_STOCK`) tekrar IN denenmesi **sert hata** döner — kullanıcı Transfer/OUT kullanmalı veya yeni label üretmeli. (v2.33.4'te aynı warehouse re-IN soft success'ti; v2.34.1'de geri alındı.)
   - **OUT:** `IN_STOCK` → `OUT_OF_STOCK` (movement type `USED`). `OUT_OF_STOCK` ise no-op soft success. `PENDING` ise hata ("Stock In first").
   - **TRANSFER:** `IN_STOCK` + `warehouseId !== toWarehouseId` → taşı. Hedef zaten mevcut warehouse ise no-op soft success. `IN_STOCK` değilse hata.
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
3. ADMIN **Inventory** sayfasında label üretir: önce **Category** seçer, ardından o kategoriye filtrelenmiş **Product** dropdown'undan ürün seçer, KG/PCS toggle yapar, miktar + label sayısı girer → **Generate Labels PDF**. (v2.34.4'ten itibaren warehouse selector kaldırıldı — hedef depo Stock In scan'inde belirleniyor.) Backend `count` adet `StockItem` satırı oluşturur (status `PENDING`, warehouseId placeholder olarak tenant'ın en eski warehouse'u). Batch number sunucu üretir: `YYYYMMDD-NNN`. PDF iner.
4. ADMIN PDF'i **thermal label roll'a (60×40 mm, 1 label/sayfa)** basar → kutulara yapıştırır. (v2.33.1'den önce Avery L7173 A4 kağıdı kullanılıyordu, artık değil.)
5. STOCK_KEEPER telefondan `/scan` → login → `/stock/scan`'e yönlenir → **Scan Mode** (Single / Bulk) + Operation + Warehouse seçer → kamera açılır. **v2.34.2+:** Kamera tam ekran fixed overlay (`position: fixed, inset: 0`), üstte floating chip bar (× kapatma + Op + WH + Mode toggle), altta result/log strip — viewfinder maksimum alan kullanır. **v2.34.1+:** Operation seçimi açıkça yapılana kadar Open Camera Op picker'ı açar. **Modes:**
   - **Single Scan:** QR algılandığında titreşim + bip + **"Confirm scan"** bottom-sheet modali. Operatör Confirm'e basana kadar mutation tetiklenmez. Onaylanırsa ikinci titreşim + bip + result banner.
   - **Bulk Scan (v2.34.5):** Auto-commit kaldırıldı. Her QR taraması `GET /stock/lookup/:id` ile read-only preview yapıp local queue'ya `{productName, qty, unit}` ile push'lar (status değişmiyor). Aynı QR queue'da varsa silent skip. Üst counter: `QUEUE · N boxes · X kg + Y pcs`. Queue dolu iken alt overlay'de **Confirm All** butonu → bottom-sheet popup (Operation / Warehouse / Boxes / Total weight / Total count satırları). Confirm basılınca queue sırayla `/stock/scan`'e commit edilir, sonuçlar bulkResults log'a düşer. Cancel queue'yu korur. Clear button queue + log'u temizler. `lockedRef` 800ms debounce aynı frame'in iki kez işlenmesini engeller.
6. **QR scan state machine (v2.33.0 — operation-driven, server-side `stockService.scanItem`):** Operatör scan ekranında Stock In / Stock Out / Stock Transfer'i UI'dan seçer; server o operasyonun mevcut item durumunda geçerli olup olmadığını doğrular. Detaylı geçiş tablosu için yukarıdaki **"v2.33.0 değişiklik özeti"** bölümünün 3. maddesine bak. (v2.33.0 öncesi implicit state machine — aynı warehouse → USED, farklı warehouse → TRANSFER, OUT_OF_STOCK re-scan → IN — kaldırıldı.) Item bulunamazsa "Unknown label" hatası döner. Sonuç banner'ı: IN → yeşil, USED → kırmızı, TRANSFER → mavi.
7. ADMIN **Stock** sayfasında ürün başına özet görür (v2.33.0+ kolon düzeni): **Category · Product · Product ID · In Stock (qty + unit) · Box Quantity · Reserved · Status · Actions**. Üstte tek satır toolbar: search input + categories dropdown + Low-stock-only toggle. (v2.33.0 öncesinde 4 KPI kart — Products / Low stock / Transfers 30d / Used 30d — ve Transfer/Used 30d kolonları vardı; v2.33.0'da hepsi kaldırıldı, yerine In Stock hücresi hover'ında per-warehouse breakdown tooltip geldi.)

---

## Roller ve İzolasyon

| Role | Yetki |
|---|---|
| `ADMIN` | Tüm `/products`, `/warehouses`, `/stock` endpoint'leri (CRUD + scan + summary + stats); Settings → Stock Keepers'tan depocu hesabı oluşturur |
| `STOCK_KEEPER` | `POST /stock/scan` + `GET /products` + `GET /products/categories` + `GET /warehouses` (scan dropdown'ları için read-only). Hiçbir Inventory admin sayfasına giremez. |

`STOCK_KEEPER` rolü `shared/src/index.ts` ve `backend/prisma/schema.prisma`'nın `UserRole` enum'unda zaten mevcut (v2.30.0'dan kalma).

---

## Sticker Layout — Thermal Label Roll (60 × 40 mm)

| Boyut | mm | PDFKit pt (1mm = 2.83465pt) |
|---|---|---|
| Label (page size) | 60 × 40 | 170.08 × 113.39 |
| Sayfa marjı | 0 | 0 |
| Padding | 2 | 5.67 |
| QR kod | 36 × 36 | 102.05 × 102.05 |
| QR konumu | sol, dikey ortalı (y = 2 mm) | x = 5.67, y = 5.67 |
| Layout | 1 label/sayfa (roll) | N adet label → N sayfalı PDF |

**Hücre içeriği (her label):**
- **Sol:** QR kod (36×36mm) — raw UUID string (scanner `{id}` JSON'u da kabul eder; payload kısaltıldı)
- **Sağ (text alanı 18mm geniş, yukarıdan aşağı; her satır `fitText(doc, str, textW)` helper'ı ile manuel olarak `…` ile kısaltılır):**
  - Product Name (10pt bold) — y = 5 mm
  - Quantity+Unit (12pt bold, örn. "5 kg") — y = 15 mm
  - `#productCode` (7pt) — y = 26 mm
  - `YYYYMMDD-NNN` (7pt Courier, "Batch " prefiksi yok) — y = 33 mm
  - v2.34.2'den itibaren **Warehouse Name label'dan kaldırıldı** — depo bilgisi DB'de ve QR scan sonucu UI'da görünüyor, sticker üzerinde gereksiz görsel gürültü.

QR payload v2.30.0'da `{id, p, c, w}` idi; v2.31.0'da `{id}`'ye sadeleşti. v2.33.3'te raw UUID string'e geçildi (scanner her ikisini de kabul eder, parser `parseStockQr` UUID + `{id}` JSON ikisini de parse eder). QR ayarları: `errorCorrectionLevel: 'M'` + `margin: 4` (QR standart quiet zone). v2.33.2'deki `'H'` küçük 30mm canvas'ta modül boyutunu 0.81 mm'ye düşürerek scan başarısız olmuştu; M + raw UUID + 36mm canvas modülü 1.09 mm'ye çıkarır (phone scan rahatlar).

Thermal printer 60×40mm continuous roll için kalibre edilmeli. Page size = label size olduğundan yazıcı her sayfa arasında otomatik kesim yapar. Kayma varsa `backend/src/services/stockService.ts`'teki `PADDING_PT` veya `lineY(mm)` değerlerine ufak offset ekle.

> **PDFKit `lineBreak: false` 0.18.0 quirk:** Explicit `(x, y)` ile `text(..., { width, lineBreak: false })` çağrısı yapıldığında LineWrapper bazen yine devreye girip uzun string'i alta sarıyor. v2.33.4'ten beri `fitText(doc, text, maxWidth)` helper'ı kullanılıyor: `doc.widthOfString()` ile ölçüp string'i karakter karakter kısaltarak `…` ekliyor. Bu sayede PDFKit opsiyonel davranışına güvenmeden tek satır + ellipsis garanti altında.

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
| `pages/inventory/InventoryItems.tsx` | `/inventory/items` | ADMIN | Label üretim formu (v2.34.4+): **Category** dropdown → **Product** dropdown (kategoriye filtrelenmiş) · KG/PCS toggle · Quantity per label · Label count · Batch preview (server üretir). Warehouse selector v2.34.4'te kaldırıldı. |
| `pages/inventory/Warehouses.tsx` | `/inventory/warehouses` | ADMIN | Tablo: Name \| Address \| In-stock items count \| Actions. Add/Edit/Delete modal. |
| `pages/inventory/StockSummary.tsx` | `/inventory/stock` | ADMIN | Ürün başına özet tablosu (KPI kartları v2.33.0'da kaldırıldı). Search input + kategori dropdown + Low-stock-only checkbox. In Stock hücresi hover → per-warehouse breakdown tooltip. Edit modali (v2.34.0+) 3 bölüm: Product details · Current stock breakdown · Adjust stock (ADD/REMOVE per warehouse). Delete = ConfirmModal. |
| `pages/StockScan.tsx` | `/stock/scan` | ADMIN, STOCK_KEEPER | Mobile dark UI, sidebar yok. v2.34.2'den itibaren kamera **tam ekran fixed overlay**: üstte floating chip bar (× close + Op + WH + toWH + Single/Bulk toggle), altta sonuç stripi (single = renkli banner, bulk = log + counter). Op + WH explicit pick zorunlu (v2.34.1). Single mode QR detect → titreşim + bip + Confirm bottom-sheet → mutation. Bulk mode QR detect → otomatik mutation + log entry. Tüm tercihler `localStorage`'da persist. |

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
| POST | `/` | `{ categoryId, name, defaultUnit, reservedThreshold, productCode? }` — `productCode` v2.33.0'dan beri sunucu tarafında auto-generated (`{CategoryPrefix3}-NNN`); explicit gönderim hâlâ kabul ediliyor (migration / script use case) ama UI göndermez | ADMIN |
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
| POST | `/labels` | `{ productId, unit, quantity, count, warehouseId? }` | ADMIN | `count` adet `StockItem` oluşturur (status `PENDING`) + PDF döner. v2.34.4'ten itibaren `warehouseId` opsiyonel — verilmezse tenant'ın en eski warehouse'u placeholder olarak kullanılır (gerçek depo Stock In scan'inde set edilir). Headers: `X-Labels-Generated`, `X-Batch-Number`. |
| GET | `/items` | `?status&productId&warehouseId` | ADMIN | Filtreli liste, `take: 500`. Includes: `product` (with category), `warehouse`. |
| GET | `/lookup/:id` | — | ADMIN, STOCK_KEEPER | v2.34.5 — read-only label preview, status mutate etmez. Bulk Scan queue'sunu `{productName, productCode, qty, unit, status, warehouseName}` ile beslemek için. Etiket bulunamazsa 404. |
| POST | `/scan` | `{ id, operation: 'IN'\|'OUT'\|'TRANSFER', warehouseId, toWarehouseId? }` | ADMIN, STOCK_KEEPER | v2.33.0 operation-driven — operatör IN/OUT/TRANSFER'ı UI'dan seçer. Response: `{ item, type, fromWarehouse?, toWarehouse?, message }`. Eski `{ id, warehouseId }` body shape v2.33.0'da kaldırıldı. |
| POST | `/adjust` | `{ productId, warehouseId, operation: 'ADD'\|'REMOVE', unit, quantity?, boxes }` | ADMIN | v2.34.0 manuel stok düzeltme. ADD: `boxes` adet `IN_STOCK` row yaratır, batch `ADJ-YYYYMMDD-NNN`; REMOVE: en eski N `IN_STOCK` row'u `OUT_OF_STOCK`'a flip eder. Movement type ADD→IN, REMOVE→USED (schema değişmeden). |
| DELETE | `/items/:id` | — | ADMIN | Hard-delete + cascade movements. |
| GET | `/movements` | `?limit&offset` | ADMIN | Hareket geçmişi. Includes: `fromWarehouse`, `toWarehouse`, `item.product`. |
| GET | `/stats` | — | ADMIN | `{ totalProducts, totalInStock, totalOut, lowStockProducts, transfers30d, used30d, in30d }` |
| GET | `/summary` | — | ADMIN | Per-product aggregate (v2.33.0+ shape): `[{ productId, productCode, productName, categoryId, categoryName, defaultUnit, reservedThreshold, inStockQuantity, boxCount, byWarehouse[], lowStock }]`. PENDING ve OUT_OF_STOCK rows excluded. `byWarehouse` per-warehouse breakdown (hover tooltip için). Eski `inStockCount/transferCount/usedCount` alanları v2.33.0'da kaldırıldı. |

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
2. Categories tab → "Nuts" ekle. Products tab → "Almond" ekle (Category Nuts, Reserved 50, Default Unit KG) — Product ID inputu artık yok; backend `NUT-001` üretir (v2.33.0 Auto Product ID).
3. Warehouses → "Main WH" + "Transit WH" ekle.
4. Inventory → Category "Nuts" → Product "Almond" → 5 KG → 10 label print → PDF iner. **Thermal label 60×40mm, 1 label/sayfa**; A4 / Avery DEĞİL (v2.33.1). PDF'i thermal printer rolüne bas, sticker boyutunu cetvelle doğrula.
5. `/stock/scan` → **Operation = Stock In** + **Main WH** seç → bir label scan → status PENDING → IN_STOCK, yeşil banner "Stocked at Main WH". v2.34.1'den itibaren operation explicit seçilmedikçe Open Camera "Pick Operation" picker'ı açar.
6. Aynı label tekrar IN scan denenirse v2.34.1 **strict re-IN block**: kırmızı hata "Already in stock at Main WH — use Transfer or Stock Out instead".
7. **Stock Out** (USED) → `/stock/scan` → Operation = Stock Out → aynı label scan → status IN_STOCK → OUT_OF_STOCK, kırmızı banner.
8. **Stock Transfer** → yeni IN_STOCK label scan → Operation = Stock Transfer + To Warehouse = Transit WH → mavi banner "Transferred Main WH → Transit WH"; status IN_STOCK kalır, warehouseId güncellenir.
9. `/inventory/stock` → Almond satırında: **In Stock** kolonu güncel qty + unit ("4 kg"), **Box Quantity** güncel kutu sayısı; eski Transfer/Used 30d kolonları **yok** (v2.33.0'da kaldırıldı). In Stock hücresine hover → per-warehouse breakdown tooltip ("Main WH · 0 box · 0 kg · Transit WH · 1 box · 5 kg"). `inStockQuantity < reservedThreshold` ise **Low Stock** badge.
10. Yetki testleri: STOCK_KEEPER tarayıcıdan `/inventory/products`'a giderse reddetmeli; PICKER/PACKER `/stock/scan`'e giderse reddetmeli; SALES_AGENT `/inventory/*`'a giderse RootRoute (v2.35.3) onu `/sales`'e yönlendirmeli, dead-end görmemeli.

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
