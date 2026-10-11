# Accounting v3 — kısmi ödeme, alacak takibi, yeni ekranlar

> Durum: **Faz 0 + Faz 1 LIVE (v2.99.0, 2026-10-11)** · **Faz 2 test'te (v2.100.0-test)** · Faz 3 + 4 sırada · kullanıcı kararı: Faz 2–4 tek seferde main'e (fresh prod yedeğiyle tek prova).
> Görsel plan + ekran tasarımları (denenebilir ödeme paneli): https://claude.ai/artifact/1DCALaDzR7PgsXTUspnMrM
> Mimari: ARCHITECTURE.md §7.13 · ilgili tuzak: SOLUTIONS.md [2026-06-03] (prod `db push` sessiz fail).

## Amaç

1. Satış faturasına **birden çok ödeme** (kısmi ödeme). Durum elle seçilmez, ödemelerden hesaplanır: `UNPAID → PARTIAL → PAID`.
2. **Vade / gecikme** ayrı işaret ("12 days late"), saklanmaz, okunurken hesaplanır (Manila).
3. **Alacak takibi**: Overview sayfası, yaşlandırma, en çok borçlu müşteriler, müşteri ekstresi (Statement PDF), Report'a "Collected" (ödeme tarihine göre).
4. Giderlerde aynı model (Faz 3).
5. **Kesinlikle veri kaybı yok.** E-fatura YOK (PrimerLedger'ın EIS/credit note/VAT tarafı alınmaz).

## Kullanıcı kararları (2026-10-10)

| Karar | Seçim |
|---|---|
| Eski PAID faturaların ödeme tarihi | **Fatura tarihi** (`dateIssued`) |
| Giderlerde kısmi ödeme | **Evet**, Faz 3 |
| Prod yedeğiyle lokal prova | **Evet** (her faz öncesi) |
| Fazla ödeme | **Reddet** (409); kredi takibi yok |

## Veri güvenliği kuralları (her faz)

- Şema **yalnız eklemeli**: yeni tablo, `@default`'lu kolon, nullable kolon, enum değeri. **Hiçbir tablo/kolon silinmez veya tipi değişmez.** Dolu tabloya default'suz NOT NULL kolon YASAK (CD `db push` onu ekleyemez, sessiz fail eder).
- Faturadaki eski ödeme kolonları (`paymentMethod`, `bankName`, `accountName`, `referenceNumber`, `gcashNumber`, giderde `paymentMethod`, `paidBy`) **silinmez**; geçişte okunur, sonra eski kayıt olarak kalır.
- Ödeme silinmez → **void** (`voidedAt`, `voidedByName`, `voidReason`).
- Geçişler backend açılışında, idempotent (`migrateEmpNosToFourDigit` kalıbı), fatura başına tek transaction + satır kilidi. Prod'da elle adım yok.
- Her faz: prova → şema diff → test → merge öncesi `backup.sh` + reconcile → merge sonrası CD log "in sync" + reconcile.

## Faz 0 — güvenlik ağı ✅ (v2.98.1, 2026-10-11)

**`scripts/acc-reconcile.sh`** (salt-okunur, her sorgu `BEGIN TRANSACTION READ ONLY` içinde — yazma denemesi `cannot execute UPDATE in a read-only transaction` ile reddedildiği test edildi).
- stdout = diff'lenebilir snapshot: satır sayıları, durum bazında sayı/toplam, legacy ödeme yöntemi dağılımı, aylık satış/gider toplamları, line-item toplamları, **v3 öncesi kolonların md5 parmak izi** (yeni eklenen kolonlar parmak izine girmez → şema eklemesi çıktıyı değiştirmez, değer değişirse değiştirir).
- stderr = faza bağlı değişmezler (ödeme tablosu varsa): `paid_total = Σ void olmayan ödemeler`, `paid_total ≤ total`, ödeme > 0, status = paid_total'dan türetilen, her `PAID` (total > 0) satırın en az bir ödemesi var. Biri bozulursa **exit 1**.

```bash
# sunucu
PROJECT_DIR=/opt/dom scripts/acc-reconcile.sh > /root/acc-before.txt
# ... deploy ...
PROJECT_DIR=/opt/dom scripts/acc-reconcile.sh > /root/acc-after.txt && diff /root/acc-before.txt /root/acc-after.txt
# lokal prova
PG_CONTAINER=dom_acc_rehearsal DB_USER=dom_user DB_NAME=dom_db MSYS_NO_PATHCONV=1 bash scripts/acc-reconcile.sh
```

**Prova ortamı (lokal, izole):** son gecelik `db-*.dump` (`/opt/dom/backups`) scp ile indirilir (sha256 sunucuyla karşılaştırılır), ayrı bir container'a açılır — dev DB'ye dokunulmaz:

```bash
docker run -d --name dom_acc_rehearsal -e POSTGRES_USER=dom_user -e POSTGRES_PASSWORD=rehearsal \
  -e POSTGRES_DB=dom_db -p 127.0.0.1:5499:5432 postgres:16-alpine
docker cp db-YYYYMMDD-HHMMSS.dump dom_acc_rehearsal:/tmp/db.dump
docker exec dom_acc_rehearsal pg_restore -U dom_user -d dom_db --no-owner --no-acl /tmp/db.dump
```

Dump müşteri/kullanıcı verisi içerir: **repoya/OneDrive'a koyma**, iş bitince container + dosyayı sil. Bu repo PUBLIC — prod tutarlarını commit'leme.

**Faz 0 bulguları (2026-10-11 yedeği):**
- Prod şeması = repo `schema.prisma` (`prisma migrate diff` → boş migration). Drift yok.
- Snapshot iki kez alındı → birebir aynı (deterministik).
- **Tüm PAID satışlarda ve tüm PAID giderlerde legacy ödeme yöntemi dolu** → geçişte tahmin edilecek yöntem yok.
- **Toplamı 0 olan satış/gider yok** → "₱0 PAID" kenar durumu prod'da yok (kod yine de ele alır).
- Header toplamı ≠ line item toplamı olan kayıt yok (satış ve gider).
- Recycle Bin'de satış ve gider var → geçiş binned kayıtları da kapsamalı (plan böyle).

## Faz 1 — satışlarda kısmi ödeme (v2.99.0) — test'te ✅

**Prova sonucu (2026-10-11 prod yedeği, izole container):** CD'nin `prisma db push --accept-data-loss` komutu → "in sync"; şema eklemesi sonrası snapshot birebir aynı; geçiş 513 PAID faturaya 513 `MIGRATED` ödeme yazdı (toplam = PAID toplamı), ikinci çalıştırma 0; geçiş sonrası snapshot birebir aynı + 5 değişmez PASS; `updated_at` değişmedi. API E2E 32/32 (eşzamanlı iki tam ödeme → biri 201 biri 409), Playwright 1440/390, PDF görsel kontrol.

**Prod'a geçiş adımları (main merge izniyle):**
1. Prod'da `PROJECT_DIR=/opt/dom scripts/acc-reconcile.sh > /root/acc-before-v299.txt` (exit 0, "skip" satırları normal).
2. `/opt/dom/scripts/backup.sh` elle çalıştır, dosyanın oluştuğunu doğrula.
3. test → main merge, CD izle; log'da db push "in sync" satırını doğrula; backend log'unda `Accounting: N paid invoice(s) moved to the payment ledger`.
4. `scripts/acc-reconcile.sh > /root/acc-after-v299.txt; diff …before… …after…` → **boş**, değişmezler PASS. Prod canlı olduğu için 1–3 arası biri fatura girerse fark çıkar: deploy'u sakin saatte yap, çıkan her fark satırını açıkla.
5. Canlı kontrol: listeyi ve eski bir PAID faturanın detayını aç (tek "From Paid status" ödemesi, tutar = toplam). Gerçek müşteri faturasına deneme ödemesi girme — void bile olsa iz kalır.

Bilinen not: Undo bir ödemeyi siler değil, "Undone right after it was entered" gerekçesiyle void eder (veri kaybı yok kuralı); listede üstü çizili görünür.

Şema (eklemeli):
- `AccSalePayment` → `acc_sale_payments`: `id`, `saleId` (cascade), `amount Decimal(14,2)`, `paidOn DateTime`, `method AccPaymentMethod`, `bankName?`, `accountName?`, `referenceNumber?`, `gcashNumber?`, `checkNumber?`, `note?`, `receivedByName?`, `source` (`MANUAL` | `MIGRATED`), `createdByName?`, `createdAt`, `voidedAt?`, `voidedByName?`, `voidReason?`; index `(saleId)`, `(tenantId, paidOn)`.
- `AccSale.paidTotal Decimal(14,2) @default(0)`; `AccPaymentStatus` + `PARTIAL`.
- `AccSaleAttachment.paymentId String?` (payment proof → ödemeye bağlanır).
- `AccSale.createdByName? / updatedByName? / deletedByName?`.

Geçiş `migrateSalePayments()`: `status = PAID` ve void olmayan ödemesi olmayan her satış (binned dahil) → tek ödeme (`amount = total`, `paidOn = dateIssued`, method + banka/GCash alanları legacy kolonlardan, `source = MIGRATED`) + `paidTotal = total`. UNPAID'e dokunulmaz. Toplam 0 → ödeme yok, PAID kalır.

Kurallar: para hesabı shared'de kuruş bazlı tek yerde (`deriveStatus`, `balanceOf`); backend her ödeme değişiminde aynı transaction'da `SELECT … FOR UPDATE` + yeniden hesap; fazla ödeme 409; düzenlemede yeni toplam < `paidTotal` → 409 ("void a payment first"); gecikme okunurken hesaplanır.

API: `GET/POST /accounting/sales/:id/payments`, `POST /accounting/sales/:id/payments/:pid/void` (reason zorunlu). `POST /sales` ilk ödemeyi (none/full/part) aynı transaction'da yazar.

UI: fatura detay sayfası (`/accounting/sales/:id`), sağdan açılan ödeme paneli, New Invoice ödeme bölümü (Not paid yet / Paid in full / Part paid), listede durum sekmeleri + Late filtresi + Collected çubuğu + Balance + vade, fatura PDF'inde Collected / Balance due (layout probe), Transactions'a Payments sekmesi, 390px kart görünümü. Stat kartları: Invoiced / Collected / Still owed / Late (tarih seçiciye bağlı — v2.74 kuralı).

## Faz 2 — alacak takibi (v2.100.0) — test'te ✅ (şema değişikliği yok; prova 15/15)
Overview sayfası (Accounting giriş sayfası), yaşlandırma (Not due / 1–30 / 31–60 / 60+), en çok borçlu müşteriler, Report'a Collected serisi (ödeme tarihi), müşteri profili + Statement PDF.

## Faz 3 — giderlerde kısmi ödeme (v2.101.0)
`acc_expense_payments` + `AccExpense.paidTotal`, aynı geçiş kuralı (`paidOn = dateIssued`, method + `paidBy` legacy'den), Overview'da vendor borçları, mükerrer gider uyarısı (aynı vendor + tutar + tarih; sadece uyarı).

## Faz 4 — export ve cila (v2.102.0)
CSV/Excel export (`lib/xlsxWriter.ts`, formül-enjeksiyon koruması), created/edited by, Expenses listesi Sales tasarımına, impeccable audit + Playwright 1440/390.

## Tasarım notları (ekranlar için bağlayıcı)
- dom'un mevcut dili (Inter, slate/mavi, açık tema, `.acc-page`); yeni görsel dünya değil.
- Durum metinleri AA kontrastlı koyu tonlar: warn `#b45309`, ok `#15803d`, bad `#b91c1c` (dom'un `#d97706`/`#16a34a` metin olarak 3.1:1).
- Grafik renkleri (dataviz validator ile doğrulandı): Invoiced `#3b82f6`, Collected `#0d9488`; gecikme rampası tek ton `#f97316 → #c2410c → #7c2d12`, Not due nötr `#94a3b8`.
- Ödeme durumu (pill) ile vade (late) ayrı işaretler; "Late" bir filtre, durum değil.
- Hareket: panel 300ms `cubic-bezier(.32,.72,0,1)` açılış / 180ms kapanış; butonlarda `:active scale(.97)`; çubuklar `transform: scaleX`; `prefers-reduced-motion` desteklenir.
