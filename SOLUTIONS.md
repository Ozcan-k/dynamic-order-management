# Debugging & Solutions Log

This file records bugs encountered in the project and how they were resolved.
When the same issue appears again, check here first.

---

## [2026-06-03] Windows PowerShell 5.1 corrupts `→` / `—` in large files via Get-Content -Raw + Set-Content (v2.56.0 docs)

### Problem
Patching `ARCHITECTURE.md` (too large for the Edit tool) with a PowerShell `(Get-Content -Raw).Replace(...) | Set-Content -Encoding utf8` round-trip silently mangled every `→` and `—` into mojibake (`â†'`, `â€"`), and the target `.Replace()` on a string containing `→` didn't even match (so the edit was a no-op + corruption).

### Root cause
Windows PowerShell 5.1 `Get-Content -Raw` reads as the system ANSI codepage, not UTF-8. A UTF-8 `→` (bytes E2 86 92) is read as 3 ANSI chars, so (a) `.Replace('…→…', …)` with a real single-char `→` never matches, and (b) writing back with `-Encoding utf8` re-encodes the mis-decoded chars → permanent mojibake across the whole file.

### Fix
Reverted with `git checkout -- ARCHITECTURE.md`, then patched with a tiny **Node** script (`readFileSync(f,'utf8')` → `.replace()` → `writeFileSync(f,'utf8')`). Node is UTF-8 native, so unicode round-trips cleanly. Verified `grep -c "→"` unchanged afterward.

### Rule
For unicode-bearing files too large for the Edit tool, do text surgery with **Node fs (utf8)** — never `Get-Content -Raw`/`Set-Content` in Windows PowerShell 5.1. After any large-file rewrite, `grep -c` a known unicode char to confirm no corruption.

---

## [2026-06-03] Invoice "PDF" button opens the DOM login screen instead of the PDF (v2.53.1)

### Problem
On the Invoices list, clicking **PDF** opened a new tab showing the DOM **login screen** instead of the invoice PDF.

### Root cause
The button did `window.open('/accounting/sales/:id/pdf', '_blank')`. A top-level navigation sends `Accept: text/html`, and `frontend/nginx.conf` rewrites html-accept requests on backend-prefixed routes to the SPA fallback (`/index.html`) — so the browser loaded the SPA (→ login), never reaching the backend PDF endpoint. Exact same gotcha the Incident module hit and fixed in v2.44.0 (see also SOLUTIONS.md [2026-05-02]).

### Fix
Added `downloadInvoicePdf(id, invoiceNo)` in `api/accounting.ts` that fetches `GET /accounting/sales/:id/pdf` via the axios api client with `responseType: 'blob'` (XHR carries the auth cookie and is proxied to the backend, not rewritten), then triggers an `<a download>` save. The list button calls it instead of `window.open`. Mirrors `downloadIncidentPdf`.

### Rule
Never open an authenticated backend file route with `window.open`/`<a href>` in this app — nginx serves the SPA to html-accept navigations. Always fetch as a blob through the api client and save/open the object URL.

---

## [2026-06-03] All /accounting endpoints 500 on prod — `prisma db push` silently failed on every deploy, acc schema stuck at v2.51.0 (v2.53.1)

### Problem
After v2.53.0 deployed, **every** accounting endpoint on `https://domwarehouse.com` returned 500 (GET /customers, /items, /categories, /sales, and POST save). Locally all the same endpoints returned 200 — so the code was fine; it was a prod-only DB issue.

### Root cause
The CD "Deploy to Vultr" step runs (inside the host):
```
docker exec dom_backend npx prisma db push --accept-data-loss --skip-generate ...
docker image prune -f
```
On prod, `acc_sales` still had the **v2.51.0** shape plus **1 leftover row**. The v2.52.0 redesign adds **required** columns (`invoice_no`, `date_issued`) with no default, so db push refused:
```
⚠️ We found changes that cannot be executed:
  • Added the required column `date_issued` to `acc_sales` … There are 1 rows … not possible.
Use the --force-reset flag … All data will be lost.
```
`--accept-data-loss` allows *dropping* things, but it **cannot add a NOT-NULL no-default column to a table that has rows** — that needs `--force-reset` (drops the whole DB, unacceptable). So the push aborted and applied **nothing**. Crucially the very next command `docker image prune -f` exited 0, and `appleboy/ssh-action` (without `script_stop`) returns the **last** command's status → **CD reported ✅ success** while the migration had failed. This had been silently failing since the v2.52.0 deploy (07:03), so prod's acc schema was frozen at v2.51.0 while v2.52/2.53 client code expected the new tables/columns → every acc query 500.

### Fix
1. **Prod recovery (one-off, surgical — only `acc_*`, no order/stock/incident data):**
   ```bash
   docker exec dom_postgres psql -U dom_user -d dom_db -c "DROP TABLE IF EXISTS acc_sale_items, acc_expense_items, acc_sales, acc_expenses, acc_invoices, acc_customers, acc_suppliers, acc_vendors, acc_items, acc_categories, acc_company_profiles, acc_counters CASCADE;"
   docker exec dom_backend npx prisma db push --accept-data-loss --skip-generate --schema=backend/prisma/schema.prisma
   ```
   Second command then prints "🚀 Your database is now in sync". (The DROP's "does not exist" notices for acc_sale_items/acc_vendors/acc_items/acc_categories confirmed prod was at v2.51.0.)
2. **CD hardening (`cd.yml`):** added `script_stop: true` to the ssh-action so a failing command (e.g. a refused db push) aborts the script and **fails the job** instead of being masked by the trailing `docker image prune` exit code.

### Generalised rule
- **`prisma db push --accept-data-loss` is NOT all-powerful** — adding a required, default-less column to a non-empty table is impossible without `--force-reset`. A destructive acc/schema redesign that was applied **locally** via a manual drop-then-push must be applied to **prod the same way** (drop just the affected tables, then push); it will never happen automatically.
- **A remote deploy script must fail fast.** Any `ssh-action` (or shell deploy) that ends with a cleanup command (`docker image prune`, etc.) will mask earlier failures unless `script_stop: true` / `set -e`. Pairs with SOLUTIONS.md [2026-05-23] (CD green ≠ app healthy) and `feedback_verify_deploy.md`.
- **Verify the db-push line in the deploy log**, not just the green check, after any schema change: `gh run view <id> --log | grep -i "in sync\|cannot be executed"`.

---

## [2026-06-03] Accounting invoice/expense save fails with 400 "Invalid uuid" on blank combo fields (v2.53.0)

### Problem
On the Accounting → Invoices / Expenses forms, saving sometimes returned a generic "Save failed". Basic saves worked (records existed), so it was scenario-specific.

### Root cause (confirmed by live reproduction)
The create/update zod schemas in `backend/src/routes/accounting.ts` typed every optional UUID field as `z.string().uuid().nullish()`. That accepts `null`/`undefined` but **rejects an empty string `""`**. When a combo/select (`customerId`, `salesAgentId`, `vendorId`, `itemId`, `categoryId`) reached the payload as `""` instead of `null`, zod returned `400 {"fieldErrors":{"customerId":["Invalid uuid"], ...}}`. Reproduced by minting an admin JWT + Redis session and POSTing `customerId:""` → 400; clean `null` payloads → 201.

### Fix
Added a shared helper and applied it to all five UUID fields:
```ts
const nullableUuid = z.preprocess((v) => (v === '' ? null : v), z.string().uuid().nullish())
```
`''` → `null` (accepted), real UUIDs still validated, bad strings still rejected. Frontend payloads (`InvoiceForm`/`PurchaseForm`) also hardened with `|| null` on `customerId`/`vendorId`/`itemId`. Verified 4/4 live: empty-string sale **201**, empty-string expense **201**, bad uuid **400** (validation preserved), valid uuid **201**.

### Gotcha / generalised rule
`z.string().uuid().nullish()` is a trap for any field fed by an HTML `<select>`/combo whose "none" state is `""`. Prefer the `nullableUuid` preprocess pattern for optional foreign-key fields. Also: **`tsx watch` does not pick up source edits when the repo lives on OneDrive** (chokidar misses the FS events) — to verify a backend change locally you must restart the dev server, not just save the file.

---

## [2026-06-01] Outbound Scan rejects in-house parcels packed on a previous day — "not in our system" (v2.49.1)

### Problem
On the handheld **Outbound Scan** (In-house mode), operators scanning packer-completed parcels got `Waybill <X> is not in our system. In-house parcels must already exist.` for **some** parcels, while same-batch parcels of identical format scanned fine. The failing ones were always leftovers carried over from a previous day.

### Root cause
The in-house dispatch lookup filtered on `archivedAt: null`:
```ts
// dispatchService.ts — lookupOrderForDispatch + createDispatchParcel
where: { tenantId, trackingNumber: tn, archivedAt: null }
```
But completed orders **auto-advance** `PACKER_COMPLETE → OUTBOUND` (`packerAdminService.ts:255-259`), and the nightly `archiveOutbound` job (23:30 Manila, `archiveService.ts` + `queues.ts`) stamps `archivedAt` on every `OUTBOUND` order. So any parcel handed to the courier the **day after** it was packed had already been archived overnight → the `archivedAt: null` filter excluded it → false "not in our system". Same-day parcels still had `archivedAt = null`, which is why only *some* failed.

Secondary latent bug: inbound `scanOrder` stores the tracking number with `trim()` only (no upper-case), while dispatch looked it up with `trim().toUpperCase()` — a case difference would also miss.

### Fix
In `dispatchService.ts`, both `lookupOrderForDispatch` and the in-house re-verify in `createDispatchParcel`:
- **Dropped** the `archivedAt: null` filter — dispatch is a read-only "handed-to-courier" log that legitimately happens days after packing, so archived orders must still match.
- Match **case-insensitively** (`{ equals: tn, mode: 'insensitive' }`) and `orderBy createdAt desc` to prefer the most recent order if a tracking number was re-used after archival.

### Gotcha
Don't "fix" this by stopping the auto-archive or the OUTBOUND transition — those are correct for the order pipeline / retention. The dispatch lookup simply must not be scoped to live orders.

---

## [2026-06-01] Warehouse Report "Custom" date button never opened the date picker (v2.49.0)

### Problem
On the Warehouse Report → Live Performance tab, clicking the **Custom** pill in the date picker did nothing useful — it silently jumped to "Yesterday" and never revealed the `<input type="date">`. There was no way to pick an arbitrary historical day through the UI.

### Root cause
`frontend/src/pages/reports/LivePerformanceTab.tsx` derived the active preset purely from `selectedDate`:
```ts
const datePreset = selectedDate === '' ? 'today' : selectedDate === yesterdayStr ? 'yesterday' : 'custom'
```
and the Custom button did `setSelectedDate(activeDate === todayStr ? yesterdayStr : activeDate)`. When the user was on "Today" (`selectedDate === ''`, `activeDate === todayStr`), Custom set `selectedDate = yesterdayStr`, which made `datePreset` evaluate to `'yesterday'` — so the `{datePreset === 'custom' && <input … />}` block never rendered and the Yesterday pill lit up instead. The custom branch was unreachable from the two default presets.

Note: the **Incident Report** date strip (`pages/IncidentReport.tsx`) uses the same visual component but works, because it tracks custom mode with an explicit `presetId === 'custom'` state rather than deriving it.

### Fix (v2.49.0)
Added an explicit `customMode` boolean state. `datePreset` is now `customMode ? 'custom' : (…derived…)`. Today/Yesterday set `customMode = false`; Custom sets `customMode = true` (defaulting the day to yesterday when coming from Today). The date input's `onChange` keeps `customMode` true (or resets to Today when cleared). One-file change; the saha-doğrulanmış scan/socket flow is untouched.

### Rule
A "Custom" toggle whose active state is **derived** from the same value the presets write will collide with a preset whenever the custom value happens to equal a preset value. Track custom/manual mode with its own boolean (as IncidentReport already did), don't infer it.

---

## [2026-06-01] New `INCIDENT_REPORTER` role — incident module access, everything except delete (v2.49.0)

### What shipped
A new desktop role `INCIDENT_REPORTER` (Settings label **"Incident Reporter"**, placed under the **Administration** section). It sees **only** the Incident Report module in the sidebar and can do **every** incident operation — create, edit *any* incident (not just its own), download/print PDF, upload signed files, send email, and edit company branding — **except delete**.

### Touch points (all must stay in sync when adding an incident-scoped role)
- `shared/src/index.ts` — `UserRole.INCIDENT_REPORTER`.
- `backend/prisma/schema.prisma` — `enum UserRole` + `INCIDENT_REPORTER` (additive `db push`, no data loss).
- `backend/src/routes/incidents.ts` — added to every `requireRole(...)` **except** `DELETE /:id` (the delete guard deliberately stays `ADMIN, WAREHOUSE_ADMIN`).
- `backend/src/routes/branding.ts` — added to `GET /` and `POST /` (logo + company info; `/logo` was already authenticate-only).
- `frontend/src/App.tsx` — `/incident-report` ProtectedRoute + `RootRoute.homeByRole`.
- `frontend/src/components/shared/Sidebar.tsx` — `/incident-report` nav `roles`.
- `frontend/src/pages/Login.tsx` — `ROUTE_ROLES['/incident-report']` + `getDefaultRoute` case.
- `frontend/src/pages/IncidentReport.tsx` — Delete button hidden unless role is ADMIN/WAREHOUSE_ADMIN (defence-in-depth; backend also blocks it).
- `frontend/src/pages/Settings.tsx` — `ROLE_CONFIG` entry + role added to the Administration `ROLE_SECTIONS` array (generic add/edit/delete-user flow works automatically because `CreateUserSchema` validates against the shared enum).

### Design decision
The role is **not** ownership-scoped. Per the requirement, it edits any incident regardless of `createdById`; the single restriction is delete. So no per-user filtering was added to `listIncidents` / `getIncidentById` / pivot / stats — only the delete capability is withheld (backend guard + hidden UI button).

---

## [2026-05-30] Stock Out raporunu kirleten test-dönemi manuel Remove'ları temizlendi (data-only, no code change)

### Context
Stock Out sayfası (`/inventory/stock-out`, `getOutSummary`) sadece `type='USED'` hareketlerini sayıyor. Kurulum/test döneminde (05-10→05-24) eklenip Stock sayfasından **admin "Remove Box"** ile çıkarılan test ürünleri, o tarihte prod henüz `ADJUSTMENT_OUT` fix'ini görmediği için `USED` olarak yazılmış ve gerçek scan çıkışlarıyla birlikte Stock Out raporunda görünüyordu. Kullanıcı bunların raporda görünmemesini istedi; sadece scan ile çıkış yapılan miktar kalsın.

### Kök sorun: Remove vs Scan veride ayırt edilemez
Eski kodda **"Admin Remove Box" da "Scan Out" da birebir aynı `USED` kaydını** yazıyordu (`type`, `from_warehouse`, `scanned_by` aynı). Ayırt etmeyi denediğimiz tüm sinyaller başarısız:
- **`scanned_by`** → Remove ADMIN rolüyle yapılır ama aynı hesaplar scan da yapıyor; Cranberry/Almond gibi "admin sildim" denen ürünlerin USED'leri bile personel (Zairah/bilal/Zedric) üzerindeydi.
- **`ADJ-` batch öneki** → sadece manuel ADD'lerde var; tüm 342 USED içinde sadece 2 satır.
- **Birebir-aynı `scanned_at` kümesi** (tek-transaction Remove imzası) → sorgu **0 satır** döndü. Bulk çıkışlar ~3ms aralıklı = **bulk-scan** (her kutu ayrı `POST /stock/scan`), Remove değil.

Sonuç: veritabanında Remove'u Scan'den ayıran **hiçbir alan yok** → otomatik tespit imkânsız.

### Çözüm: zaman-kesimli purge, iki pass (kullanıcı kararı)
Günlük USED dağılımı test churn'ünü gösterdi (05-16:53, 05-20:50, 05-21:52, 05-22:44 = dev bulk'lar). Prod'da (`dom_postgres`, `dom_user/dom_db`), her pass'te **yedek → SELECT count önizleme → DELETE**:

1. **Yedek:** `CREATE TABLE stock_movements_bak_0530 AS SELECT * FROM stock_movements;` (2826 satır — ilk silmeden önce, tüm orijinal state'i tutar).
2. **Pass 1 (05-25 öncesi):** Kullanıcı önce kesim olarak 2026-05-25'i seçti. `DELETE ... WHERE type='USED' AND (scanned_at AT TIME ZONE 'UTC')::date < DATE '2026-05-25'` → **244** silindi, 98 kaldı.
3. **Pass 2 (fix-deploy'a kadar):** Kullanıcı "bütün history'deki Remove'lar gitsin" deyince kesim, fix-öncesi pencerenin tamamına uzatıldı. **Kilit tarih:** `adjustStock REMOVE → ADJUSTMENT_OUT` fix'i (commit `5501daf`) main'e **2026-05-28 07:16:46 UTC** merge + CD ~3dk → canlı ~07:20. Bu andan önce Remove `USED`, sonra `ADJUSTMENT_OUT`. Güvenli tampon **07:30 UTC** ile: `DELETE ... WHERE type='USED' AND (scanned_at AT TIME ZONE 'UTC') < TIMESTAMP '2026-05-28 07:30:00'` → **62** silindi.

**Toplam:** 306 fix-öncesi `USED` silindi; kalan **36** USED (05-28 öğleden sonrası + 05-29/30) hepsi fix-sonrası saf scan. `IN`/`TRANSFER` ve hareketi silinen `OUT_OF_STOCK` stok kalemleri dokunulmadı (ikincisi ne Stock Out'ta ne mevcut stokta görünür, zararsız).

**Neden zaman kesimi yeterli:** Fix-öncesi pencerede Remove ile scan ayırt edilemese de, kullanıcı o penceredeki gerçek scan'lerin de silinmesini (kabul edilebilir bedel) onayladı; fix-sonrası pencerede zaten silinecek Remove yok (hepsi `ADJUSTMENT_OUT`). Yani fix-deploy anı, "tüm Remove'ları garanti temizle, sonrasına dokunma" için doğal ve kesin sınır.

### Going-forward zaten canlıydı (deploy gerekmedi)
`adjustStock REMOVE → ADJUSTMENT_OUT` fix'i commit **`5501daf` (v2.42.1)** ile yapılmış; prod enum'unda `ADJUSTMENT_OUT` mevcut (`pg_enum` kontrolüyle doğrulandı). Yani prod v2.44.0 zaten Remove'ları `ADJUSTMENT_OUT` yazıp Stock Out'tan dışlıyor; `getOutSummary` sadece `USED` sayıyor; `deleteItem` cascade ile hareketi siliyor. Prod'da `ADJUSTMENT_OUT` satırı olmamasının sebebi fix sonrası ekrandan henüz Remove yapılmamış olması, kod eksikliği değil.

### Learnings
- **"Hiç `ADJUSTMENT_OUT` satırı yok" ≠ "kod deploy değil".** Enum/şema deploy'unu doğrulamak için satır değil **`pg_enum`** sorgula. İlk başta bu ayrımı atlayıp "prod eski kod" diye yanlış çıkarım yaptım.
- Geçmiş hareket tipleri ayırt edilemez olduğunda, forensik tahmin yerine **kullanıcı bilgisine dayalı tarih/ürün kesimi** + önce `SELECT` önizleme + yedek tablo en güvenli yol.
- Prod destructive SQL akışı: **backup tablo → SELECT count önizleme → DELETE** (hepsi `docker exec -i dom_postgres psql -U dom_user -d dom_db -c "..."`; heredoc kapanışı girinti yüzünden takılıyor, tek satır `-c` tercih et).
- Yedek `stock_movements_bak_0530` birkaç gün sonra `DROP TABLE` ile kaldırılabilir.

---

## [2026-05-28] Incident Report module shipped (v2.43.0) — LIVE on prod, SMTP setup pending

### Context
Yeni admin-only modül: çalışan olaylarını (wrong-item, missing-item, parcel-damage, SOP failure, misconduct vs. 25 tip) resmî PDF rapor olarak belgelemek. PDF letterhead için per-tenant company name + logo upload edilebiliyor. Raporlar imzalanmak üzere indirilip, imzalı PDF/JPG geri yüklenebiliyor, ve recipient + employee email'e SMTP üzerinden gönderilebiliyor.

### What shipped (single ship — v2.43.0-test → main merge `0ecb13d`)
**25 dosya, +2730 / -12 satır.** Detaylı scope `ARCHITECTURE.md` Section 7.10'da.

1. **Prisma schema** (single source: `backend/prisma/schema.prisma`):
   - `IncidentType` enum — 25 değer (`Incident Report Type.txt` taxonomy'sine birebir uyumlu): WRONG_ITEM_PICKED, WRONG_ITEM_PACKED, MISSING_ITEM, WRONG_QUANTITY, PARCEL_DAMAGE, LOST_PARCEL, UNSCANNED_PARCEL, LATE_PROCESSING, INVENTORY_DISCREPANCY, DAMAGED_INVENTORY, LOW_PRODUCTIVITY, FAILURE_TO_FOLLOW_SOP, UNAUTHORIZED_ABSENCE, MISCONDUCT, COMPANY_PROPERTY_DAMAGE, SAFETY_INCIDENT, UNDERTIME, FAILURE_TO_SUBMIT_REPORTS, FAILURE_POSTING_SCHEDULE, POOR_QUALITY_CONTENT, UNAUTHORIZED_RECORDING, WRONG_SALES_ENCODING, COURIER_COORDINATION_FAILURE, FAILURE_TURN_OVER_PARCELS, MISMATCH_PARCEL_COUNT.
   - `incidents` tablosu — `tenantId`, `incidentType`, `incidentDate`, employee block (`employeeUserId` FK + `employeeFullName` + `employeeEmail`), `recipientEmail`, reportedBy block (`reportedByUserId` FK + `reportedByFullName` + `reportedByRole`), `adminDescription` (TEXT), conditional parcel block (`trackingNumber? / platform? / shopName?` — sadece 4 tip için), signed file persistence (`signedFilePath? / signedFileMime? / signedUploadedAt?`), email tracking (`emailSentAt? / emailSentTo?`), audit (`createdById`, `createdAt`, `updatedAt`). Index'ler: `(tenantId, incidentDate DESC)`, `(tenantId, employeeUserId)`, `(tenantId, incidentType)`.
   - `company_branding` tablosu — per-tenant 1 satır (`tenantId @unique`, `companyName`, `logoPath?`, `logoMime?`, `updatedById`, `updatedAt`).
   - CD `prisma db push --schema=backend/prisma/schema.prisma` ile auto-sync edildi.

2. **`shared/src/index.ts` — single source of truth for the 4-vs-21 split:**
   ```ts
   export const PARCEL_INCIDENT_TYPES = [
     IncidentType.WRONG_ITEM_PICKED,
     IncidentType.WRONG_ITEM_PACKED,
     IncidentType.MISSING_ITEM,
     IncidentType.PARCEL_DAMAGE,
   ] as const
   export function requiresParcelContext(type: IncidentType): boolean { ... }
   ```
   `INCIDENT_TYPE_LABELS` map (human label'lar). Hem backend (zod validation + PDF template) hem frontend (dropdown + conditional render) bu tek kaynağı tüketiyor.

3. **Backend services (4 yeni):**
   - `incidentService.ts` — CRUD, list+stats+pivot, lookup-tn (TN → Order'dan platform+shop autofill), signed file FS persistence, `getRememberedFullName()` (aynı user önceki incident'larda hangi Full Name ile geçtiyse onu öneriyor — User'a yeni kolon eklemeden formal isim sorununu çözüyor).
   - `incidentPdfService.ts` — PDFKit ile A4 letterhead. Layout: logo (70×70) + company name + INCIDENT REPORT etiketi + Report ID (`INC-YYYY-XXXXXX`) + Issue Date / Incident Information bloğu (Type/Date/Employee/Reported By 4 alan 2 kolon) / Parcel Reference (sadece 4 tip için Tracking+Platform+Shop) / Statement of Incident (tip'e özel resmî template paragrafı — 25 template tek `Record<IncidentType, (ctx) => string>` map'inde, isim+tarih+TN/Platform/Shop substitution otomatik) / boxed admin description (justified) / Employee Statement/Defense (boş ruled box — 5 kesik çizgi) / 2 imza bloğu (Employee · Reporting Officer + isim + Date: ____).
   - `incidentEmailService.ts` — nodemailer transporter (mevcut SMTP_HOST/PORT/USER/PASS/FROM env vars — slaD4Email + nightlyReport zaten kullanıyor; ayrı SMTP_INCIDENT_* prefix kullanılmadı). `isSmtpConfigured()` true/false. PDF attachment olarak gider, recipient + employee email'e.
   - `brandingService.ts` — getBranding, upsertBranding (logo dosyasını fs.writeFile ile `/app/uploads/branding/{tenantId}.{ext}`'e yazıyor, eski logo varsa siliyor), readLogoBuffer.

4. **Backend routes (2 yeni):**
   - `/incidents` (12 endpoint): GET / (paginated list with search/type/employeeUserId filters), GET /stats (total + this month + top type + `smtpConfigured` flag), GET /pivot (employee × type count matrix), GET /types (25 değer + label + requiresParcel flag), GET /lookup-tn?tn=... (Order'dan platform+shop), GET /selectable-users (active user listesi), GET /remembered-name/:userId, POST / (zod validate + create), GET /:id, GET /:id/pdf (anlık üretilen unsigned PDF stream), POST /:id/signed (multipart signed file upload, max 10MB, PDF/PNG/JPG), GET /:id/signed (signed file stream), POST /:id/email (SMTP setse PDF attach + send + markEmailSent; setlenmeden 503).
   - `/branding` (3 endpoint): GET / (current branding info), GET /logo (logo image stream), POST / (multipart: companyName field + optional logo file — PNG/JPG/WebP, max 2MB).
   - Hepsi `requireRole(UserRole.ADMIN)` middleware'i ile gated.

5. **Infra:**
   - `@fastify/multipart@^8.3.1` eklendi backend'e.
   - `docker-compose.yml` backend service'e named volume mount: `backend_uploads:/app/uploads` (yeni `backend_uploads` volume root-level `volumes:` listesinde). Logo + signed files CD redeploy'larından sağ çıkıyor.
   - `frontend/vite.config.ts` `proxyRoutes` listesi: `/incidents`, `/branding` eklendi.
   - `frontend/nginx.conf` regex location: `(incidents|branding)` alternation listesine eklendi (yoksa SPA fallback sessizce HTML serve eder, bu kuralın detayı SOLUTIONS.md [2026-05-02]'de).

6. **Frontend (4 yeni dosya + 3 mevcut dosya edit):**
   - `pages/IncidentReport.tsx` — `/incident-report` route. Page hero (logo + company name + Branding cogwheel + Create Incident butonu), 4 stat card, filter card (search + type dropdown), Table A (Recent Incidents — 25/page paginated, # / Date / Type / Employee / Reported By / Email Sent / Signed / Actions(Open)), Table B (Employee × IncidentType pivot — sticky 1. kolon + horizontal scroll, count'lar bold/regular tinted).
   - `pages/incident/CreateIncidentModal.tsx` — wide modal. Incident Type dropdown + Date / Employee dropdown (User listesi `username · role`) → Full Name + Email autofill / Recipient Email / Reported By auto-fill from session + editable Full Name + Role / parcel block (4 tip seçilince görünür — TN + Platform + Shop + Lookup button TN'den Order match → platform+shop autofill) / Description textarea.
   - `pages/incident/ViewIncidentModal.tsx` — Recent table'da Open'a tıklanınca açılır. Incident özeti + admin description preview + 3 buton (Download PDF, Upload Signed multipart, Send Email disabled-when-not-SMTP).
   - `pages/incident/CompanySettingsModal.tsx` — cogwheel'den açılır. Company name input + logo upload (PNG/JPG/WebP max 2MB) + preview + Save.
   - `api/incidents.ts` + `api/branding.ts` — TanStack Query hooks (useIncidents, useIncidentStats, useIncidentPivot, useIncidentTypes, useSelectableUsers, useCreateIncident, useUploadSignedFile, useSendIncidentEmail, useBranding, useUpdateBranding) + non-hook helpers (fetchRememberedFullName, lookupTrackingNumber, incidentPdfUrl, incidentSignedUrl, brandingLogoUrl).
   - `App.tsx` — `/incident-report` route, `ProtectedRoute allowedRoles={[ADMIN]}`.
   - `Sidebar.tsx` — yeni `IncidentIcon` (warning triangle SVG) + nav entry "Incident Report" placed directly under "Marketing Report", `roles: [UserRole.ADMIN]`.
   - `shared/src/index.ts` — IncidentType enum + INCIDENT_TYPE_LABELS + PARCEL_INCIDENT_TYPES + requiresParcelContext().

7. **Docs sync (same commit, per `feedback_docs_sync.md` rule):**
   - `ARCHITECTURE.md` Section 7.10 (Incident Report Module) fully written + status header replaced + Frontend Structure tree (+5 entries: IncidentReport.tsx, incident/3 modal, api/incidents.ts, api/branding.ts) + Backend Structure tree (+6 entries: routes/incidents.ts, routes/branding.ts, services/incident*Service.ts (3), services/brandingService.ts, lib/uploads.ts) + Route Access Control table (+1 line: `/incident-report → ADMIN only`).
   - `CLAUDE.md` "Mevcut versiyon" → v2.43.0.
   - `MEMORY.md` (auto-memory) — new entry `project_dom_v243.md` pointer added.

### Pre-push verification
| # | Check | Result |
|---|---|---|
| 1 | `npx prisma format && npx prisma validate` | ✓ schema valid |
| 2 | `npx prisma generate` (local Windows) | ✓ Client generated to `node_modules/@prisma/client` |
| 3 | Backend `npx tsc --noEmit` (after `npm run build --workspace=shared` so the new IncidentType + helpers compile through) | ✓ clean |
| 4 | Frontend `npm run build` (= `tsc -b && vite build`) | ✓ green, 9.62s, CSS 44.02 kB / JS 1652.51 kB |

### Post-deploy verification (LIVE on https://domwarehouse.com)
User browser-tested on 2026-05-28 and confirmed:
- Page hero loads with company branding (logo + name)
- Create Incident modal works end-to-end (Employee dropdown populates, parcel block conditional appearance for the 4 types, TN Lookup autofills Platform + Shop from existing Order)
- Recent Incidents table populates + paginates
- Pivot table builds Employee × Type matrix with sticky first column
- PDF download produces formal letterhead with 25-template substitution
- Signed file re-upload (PDF/JPG, max 10MB) persists to `backend_uploads` volume

### Open item — SMTP credentials
**Status:** prod `/opt/dom/.env` has no SMTP_HOST set, so the Send Email button is disabled in the UI with a "SMTP not configured" tooltip. **All other module functionality works without SMTP.**

When the user provides SMTP credentials, add the following to `/opt/dom/.env` on the Vultr host (`ssh root@45.32.107.63`, then edit `/opt/dom/.env`):

```bash
SMTP_HOST=smtp.gmail.com         # or whatever provider — e.g. smtp.sendgrid.net, smtp.office365.com
SMTP_PORT=587                    # 587 STARTTLS, 465 SSL
SMTP_USER=...                    # email address or API username
SMTP_PASS=...                    # ⚠ Gmail: must be an "App Password", NOT the account password (Google Account → Security → 2FA → App passwords)
SMTP_FROM="Your Company <noreply@company.com>"
SMTP_SECURE=false                # true for 465, false for 587 STARTTLS
```

Then:
```bash
cd /opt/dom && docker compose restart dom_backend
```

Verification path:
1. `curl https://domwarehouse.com/incidents/stats` (with ADMIN cookie) should now return `smtpConfigured: true`.
2. UI: open `/incident-report` → click any incident's Open → Send Email button should be enabled (no tooltip).
3. Send a test incident email → verify it arrives at both `recipientEmail` and `employeeEmail`.
4. If send fails server-side, check `docker logs dom_backend --tail=200` for the nodemailer error (auth failure, relay rejection, DNS, etc.).

**Reusing existing env vars on purpose:** the same SMTP credentials power `slaD4Email` and `nightlyReport` workers (already in prod when those features were built). The Incident Report module deliberately re-uses them instead of a separate `INCIDENT_SMTP_*` prefix so there's one set of credentials to provision and manage.

### Key design decisions (so future-you doesn't re-deliberate)
- **User schema has no `firstName`/`lastName`** — only `username` + optional `email` + `role`. To produce formal PDFs (e.g. "Juan Dela Cruz" instead of "picker1") without a schema migration, the Create Incident modal pairs the User dropdown with a separate **"Full Name (as on PDF)" text input**. The first time admin types a name for a given user, `getRememberedFullName()` looks it up on subsequent incidents from `incidents.employeeFullName` / `incidents.reportedByFullName` so they don't have to retype.
- **Unsigned PDFs are NEVER persisted to disk.** Each download/email request regenerates the PDF in-memory from current DB row + current branding. This means: (a) the document always reflects the latest data, (b) a logo upload after the incident was created immediately appears on the next download, (c) no stale "first-generated" snapshot rots on disk.
- **Only signed re-uploads hit disk** at `/app/uploads/incidents/{incidentId}-signed.{ext}` on the `backend_uploads` Docker named volume. Old signed file is deleted when a new one is uploaded.
- **Parcel context is enforced server-side** — for the 4 types in `PARCEL_INCIDENT_TYPES`, zod rejects requests where `trackingNumber || platform || shopName` is missing. Frontend conditional-renders the block, but server doesn't trust the UI.
- **Send Email button gating** — UI calls `/incidents/stats` which returns `smtpConfigured: !!process.env.SMTP_HOST`. If false, button is `disabled` with tooltip; backend POST `/incidents/:id/email` returns 503 if called anyway.
- **Module is independent of order pipeline** — no shared tables, no shared queries, no shared queues. Adding/changing inventory or order schemas does not affect incidents.

### Generalised lessons (memory'ye eklendi)
- **Adding a new IncidentType later:** 4 noktayı birlikte güncelle — `shared/src/index.ts` enum + INCIDENT_TYPE_LABELS map + (parcel-tipi ise PARCEL_INCIDENT_TYPES'a ekle) + `backend/src/services/incidentPdfService.ts TEMPLATES` Record. Aksi takdirde enum kabul edilir ama PDF render'da fallback yapar (template fonksiyonu yoksa `TEMPLATES[type]` undefined → runtime crash). Prisma'da enum'a yeni değer eklemek `db push --accept-data-loss` gerektirir.
- **`@fastify/multipart` register'ı global** — `index.ts`'te tek register, route'lar `request.parts({ limits })` ile per-route override yapar.
- **`/app/uploads` path'i tek source** — `backend/src/lib/uploads.ts UPLOADS_ROOT`. Production'da `/app/uploads` (Docker volume), dev'de `./uploads`. Yeni upload feature eklerken bu helper'ı kullan, hardcode path yazma.

---

## [2026-05-24] `vite build` + nginx static-serve migration shipped (v2.41.0) — root-cause fix for the 2026-05-23 prod 502 incident

### Context
The 2026-05-23 prod 502 incident (v2.40.0 vite 5→6 bump) and the persistent `wss://...?token=...` console-noise (v2.35.2 partial fix) both have the same root cause: `frontend/Dockerfile` runs `CMD ["npx", "vite", "--host"]`, so the **Vite dev server is the prod surface**. Filipin operasyonu sürerken bu migration ertelendi; 2026-05-24'te kullanıcı "operasyon durdu, başla" deyince ele alındı.

### What shipped
**1. `frontend/Dockerfile` → multi-stage:**
- **builder** (`node:20-alpine`): `npm ci` → `COPY shared/` + `COPY frontend/` → `npm run build --workspace=shared` (produces `shared/dist/`) → `npm run build --workspace=frontend` (= `tsc -b && vite build`, produces `frontend/dist/`)
- **runtime** (`nginx:alpine`): `RUN rm -f /etc/nginx/conf.d/default.conf` → `COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf` → `COPY --from=builder /app/frontend/dist /usr/share/nginx/html` → `EXPOSE 80` → `CMD ["nginx", "-g", "daemon off;"]`

**2. New `frontend/nginx.conf`:**
- `gzip on` with broad MIME list
- `location /assets/`: `expires 1y` + `add_header Cache-Control "public, immutable"` (Vite hashes filenames — content-addressed → safe forever)
- `location = /index.html`: `add_header Cache-Control "no-cache, must-revalidate"` (new deploy picks up immediately)
- `location /socket.io/`: `proxy_pass http://backend:3000` + `proxy_http_version 1.1` + `proxy_set_header Upgrade $http_upgrade` + `proxy_set_header Connection "upgrade"` + 7d read/send timeout — **WebSocket scan realtime is non-negotiable**; this location is declared BEFORE the regex proxy block so it wins prefix-matching
- `location ~ ^/(auth|users|orders|assign|reports|health|picker-admin|packer-admin|picker|packer|outbound|archive|sales|marketing|stock|products|warehouses)(/|$)`: backend proxy mirroring `vite.config.ts:8 proxyRoutes`. Wrapped with `if ($http_accept ~* "text/html") { rewrite ^ /index.html last; }` to mirror Vite proxy `bypass` callback — browser navigations to `/sales` etc. serve the SPA, while XHR/fetch with `Accept: application/json` proxy to backend. `client_max_body_size 25m`.
- `location /`: `try_files $uri $uri/ /index.html` — SPA fallback for everything else (`/login`, `/inventory/stock`, etc.)

**3. `docker-compose.yml` frontend service:**
- `ports: "5173:5173"` → `ports: "5173:80"` (host port preserved → Vultr outer nginx `proxy_pass http://localhost:5173` needs no edit; container-internal port changed from Vite 5173 to nginx 80)
- Removed `volumes:` block (`./frontend/src`, `./shared/src`, `./certs`) — code is now baked into the image at build time. **Side benefit:** CD `git pull` no longer auto-reloads every live browser session (the failure mode rejected in SOLUTIONS.md [2026-05-19] addendum is now structurally impossible)
- Removed `VITE_BACKEND_URL` + `VITE_DISABLE_HMR` env vars — frontend uses relative paths, nginx handles routing

**4. `vite.config.ts`:** unchanged. The `server.*` block (proxy, https, hmr, watch, allowedHosts) keeps working for `npm run dev` local development; has zero effect in the prod container because `vite` is no longer running there.

### Local smoke test results (Docker Desktop, pre-push)
| # | Test | Result |
|---|---|---|
| 1 | `docker compose build frontend` | ✓ vite v5.4.21 prod build green; 1610 KB JS (gzip 427 KB), 44 KB CSS (gzip 9 KB), 8 Inter woff2 files |
| 2 | `docker exec dom_frontend nginx -t` | ✓ syntax ok, test successful |
| 3 | `curl http://localhost:5173/` | ✓ 200 + SPA `index.html`; **`<script type="module" crossorigin src="/assets/index-DmSvx-Z2.js">` is the only script tag — `@vite/client` is GONE** (sentinel) |
| 4 | `curl -H "Accept: application/json" /health` | ✓ backend `{"status":"ok","timestamp":"..."}` |
| 5 | `curl -H "Accept: text/html" /sales` | ✓ 200 + SPA `index.html` (browser-nav fallback rewrite working) |
| 6 | `curl -H "Accept: application/json" /sales` | ✓ backend 404 `{"error":"Route not found: GET /sales"}` (proxy verified — 404 originates from Fastify, Content-Type application/json) |
| 7 | `curl -I /assets/index-DmSvx-Z2.js` | ✓ `Expires: <+1y>` + `Cache-Control: max-age=31536000` + `Cache-Control: public, immutable` (double Cache-Control header is cosmetic — browsers honor the immutable variant) |
| 8 | `curl -I /index.html` | ✓ `Cache-Control: no-cache, must-revalidate` |
| 9 | `curl ... /socket.io/?EIO=4&transport=websocket` upgrade | ✓ **HTTP 101 Switching Protocols** — WebSocket upgrade through nginx proxy working (scan realtime preserved) |
| 10 | browser DevTools console | ✓ `[socket] connected, id: FZ7JvzQhEhM4B2a9AAA4` (real socket id, not undefined-fallback); **zero `[vite]` connect / wss retry messages** (the multi-year noise that v2.35.2 couldn't silence is now structurally absent) |

Pre-existing pre-existing noise (NOT migration-caused): `[socket] connected, id: undefined` double-fire from `frontend/src/lib/socket.ts:16` (handshake fires `connect` before `socket.id` is assigned, then again with the real id), and `recharts width(-1)/height(-1)` `ResponsiveContainer` zero-height warning on Reports/MarketingReport init. Both pre-date this migration.

### What's pending
- **User browser smoke test** on `http://localhost:5173` — 5-role login (admin/picker/packer/sales_agent/stock_keeper), StockScan flow with 2s green banner + 3-note beep + 4-pulse vibrate, SPA refresh test on `/sales` `/picker-admin` `/inventory/stock`
- **Optional Vultr host nginx upstream pre-check** — SSH `cat /etc/nginx/sites-enabled/domwarehouse.com | grep proxy_pass` to confirm it targets `http://localhost:5173` (host port preserved, so this should be fine; pre-check is the safe-paranoid step)
- **Main merge + Vultr deploy** — awaiting user approval after browser smoke passes

### Rollback path (kept simple)
Single `git revert <merge-commit>` on `main` undoes Dockerfile + nginx.conf + docker-compose.yml in one shot; `docker compose up -d --build` on Vultr brings the v2.40.2 dev-server-in-prod state back in ~2 min. All three files are single-file changes with no cross-file coupling.

### Note for next vite/dep bump
With this migration live, frontend dep upgrades (including the originally-planned vite 5→6 bump that crashed prod as v2.40.0) become **build-time only** — a CI build failure catches them before prod ever sees the new image. Retrying the framer-motion + vite 6 bump now becomes a low-risk PR; v2.40.0's failure mode is structurally eliminated.

### URL change — local dev
Old: `https://localhost:5173` (Vite dev server, self-signed cert via `@vitejs/plugin-basic-ssl`)
New: `http://localhost:5173` (nginx container HTTP only; TLS terminated by outer nginx on Vultr in prod)
The `frontend/certs/` mount is gone; local HTTPS development via the dev server is unaffected (`npm run dev` still uses `vite.config.ts` `server.https` if certs exist).

---

## [2026-05-23] Prod 502 Bad Gateway after v2.40.0 (vite 5→6 + framer-motion bump) — rolled back to v2.39.1 as v2.40.1; root-cause fix deferred to post-Filipin

### Problem
At ~00:33 UTC the user reported `https://domwarehouse.com` returning **nginx 502 Bad Gateway**. The merge that broke prod was v2.40.0 (commit `44af48c`, merged `766e1af`), a deps-only change with no application code touched:
- `frontend/package.json`: added `framer-motion ^12.40.0`, bumped `vite ^5.4.10 → ^6.4.2`
- `package-lock.json`: regenerated

The CD pipeline reported full success in 4m0s (run `26347544418`): backend + frontend images built, pushed to GHCR, Vultr deploy script ran, `dom_postgres Healthy`, `dom_redis Healthy`, `dom_backend Started`, `dom_frontend Started`, `prisma db push` "already in sync", `Successfully executed commands to all hosts`. Despite all green CD signals, nginx upstream timed out and served 502.

### Root cause (hypothesis — not confirmed with live container logs; rollback prioritized)
`frontend/Dockerfile` runs `CMD ["npx", "vite", "--host"]` — i.e. **Vite's dev server is the prod surface** (this has been the case since the project began; documented in SOLUTIONS.md [2026-05-19] addendum as something to migrate but never executed). Vite 6's dev-server runtime API has multiple behavior changes vs. Vite 5:
- `server.allowedHosts` semantics tightened
- `/@vite/client` HMR token injection
- WebSocket upgrade handshake
- Plugin API surface changed (potential `@vitejs/plugin-basic-ssl@2.3.0` interaction)

The container's `Started` status in the deploy log only proves the process spawned, not that it bound to :5173 successfully. Most likely the dev server boot crashed shortly after start (or failed to listen on 0.0.0.0:5173), leaving nginx with no upstream to proxy to → 502.

Backend was identical to v2.39.1 (no source changes), so the 502 was definitively frontend-side.

### Immediate fix (v2.40.1) — emergency rollback
1. `git checkout test && git revert 44af48c` — clean revert of the deps bump commit
2. Bumped `CLAUDE.md` "Mevcut versiyon" to v2.40.1
3. Updated `ARCHITECTURE.md` Version 2.40.1 + Status block with rollback rationale and the deferred action items
4. `git commit --amend -F` (folded the doc sync into the revert commit)
5. Tagged `v2.40.1-test`, pushed test
6. Merged to main with `--no-ff`, tagged `v2.40.1`, pushed main + tag
7. CD run `26348760835` completed in 2m41s (success). Containers recreated with v2.39.1 code. Post-deploy probe:
   - `curl https://domwarehouse.com` → **HTTP 200** (431-byte SPA index.html)
   - `curl https://domwarehouse.com/health` → **HTTP 200** (backend OK)

Total downtime: ~70 minutes (deploy at 00:33 UTC → rollback live at 01:42 UTC).

Frontend deps restored to v2.39.1 lockfile state — `framer-motion` removed (had zero consumers; was queued for future motion work and can be re-added any time without coupling to a vite major).

### Root-cause fix (DEFERRED — do not start until Filipin operasyonu bittiğini kullanıcı söyleyene kadar)
The proper fix is to stop running Vite dev server in prod and serve the built static bundle instead. This is the same migration that SOLUTIONS.md [2026-05-19] addendum tracked as "v2.36.0" but was never executed. Doing it now would mean:

1. **`frontend/Dockerfile` → multi-stage:**
   - **build stage:** `node:20-alpine` runs `npm ci` + `npm run build --workspace=shared` + `cd frontend && npm run build` (`vite build`) — produces `dist/`
   - **runtime stage:** `nginx:alpine` + `COPY --from=build /app/frontend/dist /usr/share/nginx/html` + `COPY nginx.conf /etc/nginx/conf.d/default.conf` + `EXPOSE 80`
2. **New `frontend/nginx.conf`:**
   - SPA fallback: `location / { try_files $uri /index.html; }`
   - Proxy all backend routes from `vite.config.ts proxyRoutes` (`/auth /users /orders /assign /reports /health /picker-admin /packer-admin /picker /packer /outbound /archive /sales /marketing /stock /products /warehouses`) to backend container via `proxy_pass http://backend:3000`
   - `/socket.io`: same proxy + WebSocket upgrade headers (`proxy_http_version 1.1`, `proxy_set_header Upgrade $http_upgrade`, `proxy_set_header Connection "upgrade"`, long `proxy_read_timeout`) — Socket.io will break without these
3. **`docker-compose.yml`:** frontend port mapping `5173:80` (container nginx on :80, host still :5173 to keep the outer nginx/firewall config untouched)
4. **`vite.config.ts` `server.*` block** (proxy, https, hmr, watch, allowedHosts): keep for local dev; has zero effect in prod after the migration since `vite` is no longer running in the container
5. **Smoke test before merge to main — mandatory:** login + handheld scan flow (audio/haptic must still fire) + at least one real-time socket event (e.g. PickerAdmin staged-orders list updating on a fresh scan from another tab). The proxy + WebSocket rewiring is the high-risk surface.
6. **After migration ships green, v2.40.0 (vite 6 + framer-motion) can be retried** — at that point the bump is build-time only, so a CI build failure catches it before prod ever sees it.

Estimated work: ~30-40 min including smoke test.

**Why deferred:** Filipin operasyonu sürüyor; mevcut v2.39.1 prod stabil; bu migration ne kadar küçük görünse de proxy + WebSocket yollarını dokunduğu için sıfır olmayan regression riski var. Kullanıcı operasyon bitti deyince ele alınacak. Bu kadar süre içinde frontend dep upgrade önerme.

### Files affected by the rollback
- `frontend/package.json` — `vite ^6.4.2 → ^5.4.10`, `framer-motion` removed
- `package-lock.json` — regenerated
- `CLAUDE.md` — version `v2.40.0 → v2.40.1`
- `ARCHITECTURE.md` — Version `2.40.0 → 2.40.1`, Status block rewritten with rollback rationale + deferred root-cause fix plan

### Generalised rule
**CD reporting "Container Started" + "Successfully executed commands" does not prove the upstream is serving traffic.** The Vultr deploy script ends with `docker image prune -f` whose exit code is what `appleboy/ssh-action` checks, so the green tick only means the script ran to completion, not that the app is healthy. For deps-only commits that bump a tool whose runtime lives inside the prod container (Vite, Webpack, etc.), assume the surface contract may have shifted even if no application code changed. The structural fix is to stop coupling prod to a dev-server runtime at all (see deferred fix above); the interim guardrail is to **probe the public URL after every CD run that touches frontend deps** and roll back fast if it 502s.

Memory pairing: `feedback_verify_deploy.md` (deploy persist bug — verify the container, not the code) catches the *other* shape of this failure; this incident is the reverse — the deploy was honest, but the new code itself couldn't serve.

---

## [2026-05-20] Thermal sticker product name ellipsis-truncated ("Dried Di…") — fix took two attempts

### Problem
Field photo of a printed thermal label showed the product name as "Dried Di…" — the actual product was "Dried Dill" but the renderer cut it off with ellipsis. A second batch of labels for "Dried California Almonds" printed as "Dried Califor…" with the same shape: single line, ellipsis at character ~13. The operator's complaint was that the abbreviated name is useless on the warehouse floor — the QR carries the ID but humans need to read the sticker too.

### Root cause
`backend/src/services/stockService.ts buildStickerPdf` writes the product name into an ~18 mm text strip to the right of the 36 mm QR (text width = `LABEL_W_PT − qrX − QR_SIZE_PT − 2×PADDING_PT` = 51.02 pt). The original `fitText(doc, text, maxWidth)` measures via `doc.widthOfString` at 10pt Helvetica-Bold and character-by-character truncates with `…` until it fits. Any name wider than 51.02 pt at 10pt → ellipsis. "Dried Dill" Helvetica-Bold 10pt ≈ 52 pt — 1 pt over budget — so the whole name fails the single-line check and gets truncated.

### Fix attempt #1 (v2.35.4) — INSUFFICIENT
Added `fitProductName(doc, text, maxWidth)` helper that tries 10pt single line → 10pt 2-line greedy wrap → font shrink 10→9→8→7pt repeating both attempts. Ellipsis fallback only as last resort. Pushed to test + main; CD redeployed.

Field re-test for "Dried California X" product **still printed "Dried Califor…" on a single line.** Initial reflex was to suspect deploy persistence (cf. SOLUTIONS.md [2026-04-18] "Backend Container Never Rebuilt"), but `gh run view` confirmed `dom_backend Recreated` + `Container dom_backend Started` at 01:41:53Z, and the user-generated PDF was created at 01:42:47Z — 49 s after the new container came up. Deploy was fine; the code itself was insufficient.

### Root cause of attempt #1's insufficiency
At 7pt (the smallest size attempted), Helvetica-Bold "California Almonds" = 64.04 pt, "California Prunes" = ~61 pt, etc. Always > 51.02 pt text-W. Greedy 2-line wrap put "Dried" on line 1 and "California Almonds" on line 2 — line 2 never fit at any size 10pt → 7pt. All branches failed; the function fell through to its ellipsis fallback. The fix shipped because hand-math estimated that "9pt or 8pt should be enough" without actually measuring.

### Fix attempt #2 (v2.35.5) — SUCCESS
Two changes:
1. Extend size range to `[10, 9, 8, 7, 6]` pt. At 6pt "Dried California" = 44.56 pt (fits), "Almonds"/"Walnuts"/"Prunes" all under 30 pt (fit). 2-line wrap succeeds at 6pt for the entire "Dried California X" cohort.
2. After 2-line attempts at all sizes, allow 3-line wrap at 7pt then 6pt — covers very long 4-word names like "Premium Organic Walnut Halves". Vertical safety: 3 × 7pt × 1.2 line-height = 25.2 pt; baseline of line 3 = lineY(5) + 25.2 = 39.4 pt; qty row at lineY(15) = 42.5 pt; ~3 pt clearance — safe.

Helper refactored: `greedyWrap(doc, text, maxWidth, maxLines)` extracted from the inline 2-line packer. Ellipsis fallback fires only for pathological single-word names wider than 51 pt at 6pt (e.g. 33-char `Supercalifragilisticexpialidocious`); not seen on any real product.

Local probe script (using the same PDFKit version and Helvetica-Bold font) confirmed before push:
- `Almond` → 10pt single
- `Dried Dill` → 10pt single (52.0pt fits within 51.02 — close but OK)
- `Dried Dates` → 10pt 2-line ("Dried" / "Dates")
- `Dried California Almonds` → 6pt 2-line ("Dried California" / "Almonds")
- `Dried Californian Walnuts` → 6pt 2-line
- `Premium Organic Walnut Halves` → 6pt 2-line ("Premium Organic" / "Walnut Halves")
- Pathological 33-char single word → 6pt ellipsis (acceptable)

Field test post-deploy 2026-05-20 confirmed: user-generated PDF for the "Dried California X" product now prints the full name on 2 lines at 6pt.

### Files affected
- `backend/src/services/stockService.ts` — added `greedyWrap` + rewrote `fitProductName`; updated `buildStickerPdf` to render multi-line with `size × 1.2` line-height starting at `lineY(5)`.
- `CLAUDE.md` — version `v2.35.3` → `v2.35.4` → `v2.35.5`.
- `INVENTORY.md` — status header + 2 new rows in the change-log table.

### Generalised rule
**Layout / render fixes that depend on font measurements must be probed locally before pushing.** Write a one-shot script that uses the same library version + same font and prints `widthOfString` for a representative cohort of real product names (not just "Almond" — use the actual longest 5-10 entries from prod). Linear scaling estimates ("at 9pt this string should be ~10% narrower") are unreliable for proportional fonts; only the library's own measurement is ground truth.

Saved as `feedback_layout_render_probe.md` in the Claude Code memory; pairs with `feedback_verify_deploy.md` (which catches the *other* failure mode — code is fine but deploy didn't propagate).

---

## [2026-05-19] SALES_AGENT (and any non-admin role) sees "403 — Coming Soon" when hitting bare `/`

### Problem
Operator logged in to https://domwarehouse.com as `agent1` (SALES_AGENT role). Going to the bare domain (`https://domwarehouse.com/`) — typed in the address bar or via a stale bookmark — rendered the `PlaceholderPage title="403 — Forbidden"` with the "Coming Soon · This page is under construction" empty state. The session was valid (cookie present, `/auth/me` returned the user), but there was no obvious recovery path: no link to `/sales`, no logout-and-relogin needed (relogin doesn't help — the cookie is fine), no sidebar visible. Operator was effectively locked out of the app even though `/sales` worked when typed explicitly.

### Root cause
`frontend/src/App.tsx` had `/` wrapped in `<ProtectedRoute allowedRoles={[UserRole.ADMIN, UserRole.INBOUND_ADMIN]}>`. When any other role landed on `/`:
1. `ProtectedRoute` saw a valid user, but `user.role` not in `allowedRoles`.
2. Non-scan routes redirect to `/unauthorized`.
3. `/unauthorized` is rendered by `PlaceholderPage` — a leftover from very early phases when restricted pages stubbed out their UI. It shows "Coming Soon — This section will be available in a future release", which is misleading: the user actually has *less* access than that page implies, and the recovery path (go to your own home) is not surfaced.

The login flow itself was fine: `Login.tsx:285` `getDefaultRoute('SALES_AGENT')` returns `/sales`, so a fresh `/login` submission redirects correctly. The bug only manifests for **already-authenticated** sessions that navigate to `/` directly — bookmarks, address-bar typing, a `<a href="/">` link, or a `Navigate to="/"` somewhere. The `?next=/` query that `ProtectedRoute` would have set isn't consulted on the post-redirect side because there's no login step in this flow.

The same shape of bug affects every non-`/` route the role can't access, but `/` is by far the most common landing point — every operator types the bare domain at some point. STOCK_KEEPER also fell through `getDefaultRoute`'s default branch to `/dashboard` (which they can't access either), making this a latent footgun for them too.

### Fix (v2.35.3)
Replace the `/` route's `<ProtectedRoute>` wrapper with a new `RootRoute` component that branches on role:

```tsx
function RootRoute() {
  const user = useAuthStore((s) => s.user)
  if (!user) return <Navigate to="/login" replace />
  if (user.role === UserRole.ADMIN || user.role === UserRole.INBOUND_ADMIN) {
    return <AppLayout><Dashboard /></AppLayout>
  }
  const homeByRole: Record<string, string> = {
    [UserRole.PICKER_ADMIN]: '/picker-admin',
    [UserRole.PACKER_ADMIN]: '/packer-admin',
    [UserRole.PICKER]: '/picker',
    [UserRole.PACKER]: '/packer',
    [UserRole.SALES_AGENT]: '/sales',
    [UserRole.STOCK_KEEPER]: '/stock/scan',
  }
  return <Navigate to={homeByRole[user.role] ?? '/login'} replace />
}
```

And:
```tsx
<Route path="/" element={<RootRoute />} />
```

The map mirrors the role-coverage table in `ARCHITECTURE.md §6`. Every value is a route the listed role can actually access (checked against each `<Route allowedRoles>` declaration in `App.tsx`), so no infinite redirect cycle is possible. Unknown roles fall through to `/login` — defensive default, current `UserRole` enum has no entries that aren't mapped.

### Why not also fix `/unauthorized`?
`PlaceholderPage` is still useful for **explicit** role-mismatch hits — e.g., an ADMIN clicks a deep link that was scoped to a different role. The "Coming Soon" framing is wrong for that case too, but the immediate bug was the implicit landing on `/`, not the placeholder itself. A follow-up could rework the unauthorized page to show "You don't have access; go to <home>" with a button. Not in scope for v2.35.3.

### Verification path (post-deploy)
1. Log in to live as `agent1` (or any SALES_AGENT). Sidebar should show only Sales-relevant items; landing page should be `/sales`.
2. While logged in, type `https://domwarehouse.com/` in the address bar and hit Enter. Expected: instant redirect to `/sales` (no 403 flash if `Navigate` is fast enough; if you see a flash, it'll be the redirect itself, not the placeholder).
3. Repeat for PICKER_ADMIN → `/picker-admin`, PACKER_ADMIN → `/packer-admin`, PICKER → `/picker`, PACKER → `/packer`, STOCK_KEEPER → `/stock/scan`.
4. Regression check: log in as ADMIN, go to `/`. Should still see the Dashboard exactly as before — no extra redirect, same layout.

### Rule
When `<ProtectedRoute>` rejects a role, redirecting to `/unauthorized` is acceptable for *explicit* deep links the user shouldn't have followed. But for **landing routes** — `/`, the brand domain, anywhere a user could plausibly arrive without intent — the failure mode should be "route to your home", not "show a dead-end placeholder". The placeholder erodes trust: the operator can't tell whether the app is broken, their access was revoked, or it's just a stale UI artifact. Always make role-aware landing routes return the user to a page they own.

Also: when adding a new role to `UserRole`, audit every `getDefaultRoute`-style function and every `/` / index route — these places encode "where does this role live by default", and the wrong default silently sends users to a 403 page.

### Files affected
- `frontend/src/App.tsx` — `RootRoute` component added (lines 39-56), `/` route swapped from `<ProtectedRoute>` wrapper to `<RootRoute />`.
- `CLAUDE.md` — version `v2.35.2` → `v2.35.3`.
- `ARCHITECTURE.md` — header status replaced with v2.35.3 fix note.
- (Live verification, post-deploy) `agent1` login → `/` → `/sales` confirmed.

---

## [2026-05-19] Console noise on live — Vite HMR `wss://` retry loop + React Router v7 future-flag warnings

> **Status (post-deploy, 2026-05-19):** **PARTIAL FIX.** React Router future-flag warnings successfully silenced (deploy alone, no env var needed). Vite HMR `wss://` retries **persist** even with `VITE_DISABLE_HMR=true` set on Vultr — `server.hmr: false` only disables the server-side WS endpoint, but Vite dev mode still injects `/@vite/client` into every page, and that client unconditionally attempts a WebSocket connection. So one half of v2.35.2 worked, the other half does not actually achieve what the original entry below claimed. See the addendum at the bottom of this entry for the verified behavior and the recommended path forward (`vite build` migration, planned as v2.36.0).

### Problem
Loading any page on https://domwarehouse.com printed a chain of warnings in the browser console on every refresh:

```
client:536 WebSocket connection to 'wss://domwarehouse.com/?token=…' failed:
client:536 WebSocket connection to 'wss://localhost:5173/?token=…' failed:
client:512 [vite] failed to connect to websocket.
react-router-dom: ⚠️ React Router Future Flag Warning: v7_startTransition…
react-router-dom: ⚠️ React Router Future Flag Warning: v7_relativeSplatPath…
```

The app itself worked — API calls, Socket.io for app events, login/scan/etc. all fine. But the noise made real errors hard to spot during live debugging and made it look like something was broken to non-dev observers.

### Root Cause
**Two unrelated cosmetic issues conflated:**

1. **Vite HMR retry loop.** Production runs Vite **dev mode** behind nginx (per the original DOM infra decision — no `vite build` + static serve). The Vite client (`@vite/client`) shipped in every dev bundle opens a WebSocket back to the dev server for hot-module reloading:
   - First try: `wss://<page-host>/` → fails because nginx only proxies WS for `/socket.io`. There's no Vite HMR endpoint exposed.
   - Fallback: `wss://localhost:5173/` → hardcoded fallback in Vite's HMR client. The browser is on the **user's** machine, not the server, so `localhost:5173` resolves to the user's own machine where nothing's running. Fails too.
   - The client retries forever every ~1 s.

   Only `/socket.io` is proxied as WS in `frontend/vite.config.ts` (line 21-25). Real-time app events ride that, so app behavior is unaffected — but every page bleeds two failed WSS attempts into the console on first paint.

2. **React Router v7 future-flag warnings.** `BrowserRouter` in `frontend/src/App.tsx` had no `future` prop. React Router v6.4+ logs a warning every time the router mounts if `v7_startTransition` and `v7_relativeSplatPath` aren't explicitly opted in. Cosmetic — the app uses v6 behavior either way.

### Why it surfaced now
The HMR retry was always there (live has been Vite-dev-mode since the initial Vultr deploy), but a user paying attention to the browser console during the v2.35.1 Products page testing finally asked about it. Same root cause noted as a "red herring" in the v2.32.0 debug entry above (2026-05-07) but was never fixed.

### Fix (v2.35.2)
Two changes, both opt-in / non-breaking by default:

1. **`frontend/vite.config.ts`** — add `hmr: process.env.VITE_DISABLE_HMR === 'true' ? false : undefined` to the `server` config. When env var unset → `undefined` → Vite uses its default HMR setup (local dev unaffected). When set to `'true'` → HMR client disabled entirely → no more WSS retries.

2. **`docker-compose.yml`** — pass the env var through to the frontend container: `VITE_DISABLE_HMR: ${VITE_DISABLE_HMR:-}`. Default empty string → behavior identical to before. Vultr `.env` opts in with `VITE_DISABLE_HMR=true`.

3. **`frontend/src/App.tsx`** — `<BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>`. Splat route is a single `Navigate` (no nested children) so `v7_relativeSplatPath` is a no-op for this app; `v7_startTransition` wraps route transitions in `React.startTransition` — small timing difference but no Suspense boundaries in the route tree to surface it.

### Activation (post-deploy, manual)
The code change ships HMR control behind an env var that defaults to **off**, so a fresh deploy without touching `.env` will not change behavior. To actually silence the WSS noise on live:

1. SSH to Vultr: `ssh root@<vultr-ip>`
2. Edit `/path/to/dynamic-order-management/.env`: add `VITE_DISABLE_HMR=true`
3. `docker compose up -d --build frontend` — rebuild only the frontend container; backend/postgres/redis untouched
4. Reload https://domwarehouse.com and verify the two `wss://` errors are gone; React Router warnings should also be gone (those silenced themselves on first deploy, no env step needed).

The React Router warnings are silenced **immediately** by the deploy — no env step needed.

### Rule
Vite running in dev mode in production is a known-cost setup choice (zero-build deploy, instant cache-bust on file change, no static-asset pipeline). The unavoidable side effects:
- HMR client emits failed WSS handshakes unless explicitly disabled.
- All source files ship as ESM modules — bigger payload than a built bundle.

If the console noise itself is the concern (not the size/perf cost), `server.hmr: false` is the minimum-change fix. If long-term you want a proper production build (`vite build` + nginx serving `dist/`), that's a separate, larger pipeline change and would also remove the env-var requirement.

For React Router, always set `future` flags explicitly even if you don't intend to migrate yet — it's a one-time edit that keeps the console clean and forces a deliberate choice when v7 lands.

### Files affected
- `frontend/vite.config.ts` — `server.hmr` env-gated.
- `docker-compose.yml` — `VITE_DISABLE_HMR` passthrough on frontend service.
- `frontend/src/App.tsx` — `<BrowserRouter>` `future` prop.
- `CLAUDE.md` — version `v2.35.1` → `v2.35.2`.
- `ARCHITECTURE.md` — header status + new v2.35.2 paragraph.
- (Applied on live) `.env` on Vultr — `VITE_DISABLE_HMR=true` added; `docker compose up -d --build frontend` ran clean.

### Addendum (2026-05-19, post-deploy verification)

After the v2.35.2 deploy and the `.env` activation step on Vultr, two of the three claims in the original entry held; one did not. Recording the verified behavior so the next person doesn't repeat the analysis.

**Verified on live (Vite 5.4.21):**

1. ✅ **React Router warnings silenced.** The `future={{ v7_startTransition, v7_relativeSplatPath }}` prop on `<BrowserRouter>` immediately silenced both warnings on every page. No runtime regressions observed (splat route is a single `Navigate`, no Suspense boundaries in route tree, no visible timing change).

2. ✅ **Env passthrough works end-to-end.** Inside `dom_frontend`:
   - `docker exec dom_frontend grep VITE_DISABLE_HMR /app/frontend/vite.config.ts` → returns the gated line as committed.
   - `docker exec dom_frontend printenv VITE_DISABLE_HMR` → `true`.
   - Vite startup log (`docker logs dom_frontend`) shows clean boot, no errors. So `process.env.VITE_DISABLE_HMR === 'true'` was true at `vite.config.ts` evaluation time, and Vite ran with `server.hmr: false`.

3. ❌ **`hmr: false` does NOT silence the `wss://` retry loop.** Browser console on live still showed:
   ```
   client:536 WebSocket connection to 'wss://domwarehouse.com/?token=…' failed:
   client:536 WebSocket connection to 'wss://localhost:5173/?token=…' failed:
   client:512 [vite] failed to connect to websocket.
   ```
   Same in incognito (cache busted). The original entry's claim that `server.hmr: false` "disables the HMR client entirely" was **wrong**.

**Why `hmr: false` is insufficient.** `server.hmr: false` only disables the server-side WS upgrade handler. The `/@vite/client.js` script is **still injected into every page in dev mode** and unconditionally attempts a WS connection on load. With the server handler off, the connection just fails — and the client retries the fallback (`wss://localhost:5173`) before giving up. So `hmr: false` removes the option to actually use HMR, without removing the client's noise. Net effect on console: zero improvement.

**Why we didn't pursue an nginx WS-upgrade workaround.** Adding `proxy_http_version 1.1` + `Upgrade` headers to the nginx `/` location would let Vite HMR actually work in prod — silencing the noise as a side effect. But `docker-compose.yml` mounts `./frontend/src` and `./shared/src` into the running frontend container (volumes, not COPY), so a `git pull` on Vultr propagates file changes live without a rebuild. If HMR were working in prod, every CD-triggered `git pull` would auto-reload **every live user's browser session mid-shift**. That's a strictly worse outcome than the cosmetic console noise. Option rejected.

**Why we didn't strip `@vite/client` via plugin.** A custom Vite plugin could `transformIndexHtml` to remove the `/@vite/client` script tag. `import.meta.hot` is not referenced anywhere in the codebase (`grep -r 'import\.meta\.hot' frontend/src` → empty), so user code wouldn't break. But `@vitejs/plugin-react` injects React Refresh transforms into every component — those transforms emit `import.meta.hot.accept(...)` calls in the transformed module output. Without `@vite/client` loaded, `import.meta.hot` is `undefined` and those calls throw `Cannot read properties of undefined`. The whole React tree would fail to mount. Option rejected without a much larger plugin that also no-ops react-refresh, which is too much surface area for a console-cleanup.

**Real fix — deferred to v2.36.0.** The root cause is that we run Vite **dev mode** in production. The proper fix is to switch to `vite build` + nginx (or another static server) serving the built `dist/`. That removes:
- The `@vite/client` injection (no more WS retries).
- The volume-mount auto-reload risk (changes only apply after a CD-triggered container rebuild).
- The `proxyRoutes` array in `vite.config.ts` (per-prefix routing moves to nginx config).

Scope of v2.36.0:
- `frontend/Dockerfile` — multi-stage build: `vite build` in builder, then a small `nginx:alpine` (or `serve`) stage that serves `/app/frontend/dist`.
- `docker-compose.yml` — remove the `./frontend/src` and `./shared/src` volume mounts on the frontend service (or only keep them in a dev compose override).
- `nginx` site config on Vultr — extend with per-prefix routing currently handled by Vite (`/orders`, `/auth`, `/picker-admin`, `/packer-admin`, `/picker`, `/packer`, `/outbound`, `/archive`, `/sales`, `/marketing`, `/stock`, `/products`, `/warehouses`, `/users`, `/reports`, `/health`, `/assign`, `/api`, `/socket.io`).
- CD workflow — frontend image build is now slow, document the new minute-or-two CD time.
- Smoke test plan — every panel, role-based redirects, scan flows, socket.io rooms.

Estimated effort: 2-3 hours of focused work + careful staging-equivalent dry run on local.

**Current state on live (v2.35.2):**
- React Router warnings: gone ✓
- Vite HMR `wss://` errors: still present (cosmetic, app fully functional, real Socket.io connects fine: `[socket] connected, id: …`)
- `VITE_DISABLE_HMR=true` left in `/opt/dom/.env` — harmless, no-op, kept as a forward-compatible toggle if Vite ever fully respects it.
- New unrelated console warning surfaced during verification: `SlaSummaryCard.tsx:26` mixes `border` and `borderLeft` shorthand — React style warning, separate small fix, tracked as a TODO.

**Rule (updated).** When a config option claims to "disable" a feature, verify on a live page that the client-side artifacts (script tags, network requests) are also gone — not just that the server-side handler is off. Dev-server features in particular often inject runtime code that ignores the server-side setting. The signal to look for is whether the failed network call disappears, not just whether the server log goes quiet.

---

## [2026-05-07] `/picker-admin/stats` still hung after N+1 fix — missing composite index on `order_status_history`

### Problem
After v2.32.0 (`getPickerStats` collapsed from 4N+2 Prisma queries to 6 batched queries with in-memory aggregation) shipped to live, the `/picker-admin` workload section was **still** blank on page open — DevTools network tab showed `/picker-admin/stats` stuck in `pending` while sibling requests (`orders`, `pickers`, `pending-staged`) returned in 200–500 ms. User reported the page felt slower than before the v2.32.0 fix.

### Verification path that ruled out deploy persist bug
Per the deploy-persist feedback rule, the first move was to confirm the container actually had the new code, not chase another code fix:
- `docker inspect dom_backend --format='{{.Created}}'` → fresh timestamp from CD run.
- `docker exec dom_backend grep -c groupBy /app/backend/dist/services/pickerAdminService.js` → `2` (≥ 2 means the v2.32.0 refactor is in the running bundle; old code had zero `groupBy` calls).
- `Restarts=0`, healthy logs.

So the v2.32.0 code was running. The slowness was a **second, distinct** bottleneck the N+1 collapse couldn't fix.

### Root Cause
Two of the six batched queries hit `order_status_history`:
1. Per-picker `returned` `findMany` — selects `pickerId` for assignments whose order had a status transition `[PICKER_COMPLETE | PACKER_ASSIGNED | PACKER_COMPLETE] → PICKER_ASSIGNED`.
2. Tenant-level `returnedCount` `count` — same filter shape, scoped to the tenant.

Both compile to an `EXISTS` subquery on `order_status_history` keyed by `order_id` plus filters on `from_status` and `to_status`. The table (`backend/prisma/schema.prisma:160-172`) had only the primary key and FK auto-indexes — no covering composite index. Postgres therefore did a sequential scan over the entire history table for every candidate order, twice per stats request. As history grew (each pick / pack / dispatch writes a row), the scan got linearly slower. Collapsing N+1 cut the per-request scan count from N+1 to 2, but didn't fix the per-scan cost.

### Fix (v2.32.1)
Composite index `order_status_history(order_id, from_status, to_status)` added in `backend/prisma/schema.prisma`:

```prisma
@@index([orderId, fromStatus, toStatus], map: "order_status_history_order_id_from_status_to_status_idx")
```

To avoid blocking live picker/packer scans during the index build (status history is written on every status transition; a regular `CREATE INDEX` takes a `SHARE` lock that blocks writes), the index was first created on the live database with `CREATE INDEX CONCURRENTLY` from a `psql` session — zero-downtime build, no write lock. Only after that did the schema change get committed and pushed. CD's `prisma db push` sees the index already exists with the matching name and no-ops, so the deploy itself is also lock-free.

### Verification (post-deploy)
- `\d order_status_history` lists the new index alongside PK and FK indexes.
- `EXPLAIN ANALYZE` of the returned subquery shows `Index Scan using order_status_history_order_id_from_status_to_status_idx` instead of `Seq Scan on order_status_history`.
- DevTools shows `/picker-admin/stats` returning in tens-of-ms instead of timing out.
- Browser hard reload (`Ctrl + Shift + R`) needed to bust Vite's per-module cache after frontend changes; not strictly required for this index-only fix but worth doing on first verify.

### Rule
When `Promise.all` over ad-hoc queries collapses an N+1 but the request is still slow, look at **per-scan cost**, not just **scan count**. Any Prisma `some:` / `every:` filter on a related table is a `WHERE EXISTS` subquery — if the joined columns aren't covered by an index, even a single occurrence becomes O(table-size). Add a composite index on `(fk, filtered_col_1, filtered_col_2, ...)` matching the subquery's filter shape. For high-traffic tables, build it with `CREATE INDEX CONCURRENTLY` first, then sync the schema (Prisma `db push` no-ops once the index exists with the expected name).

### Files affected
- `backend/prisma/schema.prisma` — `@@index` added on `OrderStatusHistory`.
- `CLAUDE.md` — version `v2.32.0` → `v2.32.1`.
- `ARCHITECTURE.md` — header status + new v2.32.1 section.
- Live DB — index `order_status_history_order_id_from_status_to_status_idx` created via `CREATE INDEX CONCURRENTLY` on `dom_postgres`.

---

## [2026-05-07] PickerAdmin "Picker Workload" section blank for ~10 s after page open (N+1 query fan-out)

### Problem
Opening `/picker-admin` rendered the page header and orders table immediately, but the "Picker Workload" card grid stayed empty for ~10 seconds before per-picker cards appeared. The yesterday-shipped prefetch fix (v2.31.5) only addressed the **modal** open latency (clicking a picker card); the section itself still blanked on every navigation. Console errors at the same time (`wss://domwarehouse.com/?token=…` / `wss://localhost:5173/?token=…` failed, plus a `SlaSummaryCard` `border` vs `borderLeft` style warning) were unrelated red herrings — the WebSocket failure is just Vite HMR retrying in production (we run Vite dev mode behind nginx) and does not block API requests.

### Root Cause
`getPickerStats` in `backend/src/services/pickerAdminService.ts:274` issued **4N+2 Prisma queries per request**: for every active picker it ran four queries in parallel (active assignments select, lifetime completed count, today completed count, returned count), wrapped in a `Promise.all(pickers.map(...))`, plus two tenant-level counts. With ~10 active pickers that fanned out to ~42 round-trips. The dominant cost was the per-picker `returned` count — a `statusHistory.some({ fromStatus IN [PICKER_COMPLETE, PACKER_ASSIGNED, PACKER_COMPLETE], toStatus: PICKER_ASSIGNED })` subquery joining `OrderStatusHistory`, which has no composite index on `(order_id, from_status, to_status)` (verified in `backend/prisma/schema.prisma:160-172` — only PK and FK auto-indexes). Postgres scanned the history table once per picker. On the frontend (`PickerAdmin.tsx:1116`) the query had `staleTime: 0` with no `placeholderData`, so React Query showed an empty state on every mount instead of using the cached frame.

### Fix
Two changes shipped together as v2.32.0:

1. **Backend: collapse N+1 → 6 queries** (`backend/src/services/pickerAdminService.ts`).
   - 1× `pickerAssignment.findMany` selecting `{ pickerId, order.status }` for all active assignments — bucket per pickerId in JS.
   - 1× `pickerAssignment.groupBy({ by: ['pickerId'] })` for lifetime completed.
   - 1× `pickerAssignment.groupBy({ by: ['pickerId'] })` for today completed.
   - 1× `pickerAssignment.findMany` selecting `pickerId` for the returned set (single statusHistory subquery now scans the table **once total** instead of N times) — count per pickerId via `Map`.
   - 2× tenant-level queries (`returnedCount`, `totalCompleted`) — unchanged.
   - Final assembly maps `pickers` over those Maps, falling back to zeros for pickers with no rows.

2. **Frontend: cache last-good frame** (`frontend/src/pages/PickerAdmin.tsx:1116`).
   - Imported `keepPreviousData` from `@tanstack/react-query`.
   - Set `staleTime: 5_000` and `placeholderData: keepPreviousData` on the `picker-admin-stats` query.
   - The 10 s `refetchInterval` is preserved; cards now stay populated during the background refetch instead of unmounting.

### Verification path (post-deploy)
- `docker exec dom_backend cat /app/backend/dist/services/pickerAdminService.js | grep -c "groupBy"` should be ≥ 2 (proves the new code shipped — old code had no `groupBy` calls).
- Time `/picker-admin/stats` from the live API: should drop from multi-second to sub-second.
- `/picker-admin` page open: workload cards visible within first paint when query is cached; first-ever load should still be much faster than before.

### Rule
When a per-row pattern appears as `Promise.all(items.map(async (x) => Promise.all([...]) ))` against a relational table, audit the inner queries — each subquery becomes O(N) round-trips. If any of them include a `some:`/`every:` on a related table without a covering index, it compounds into an O(N · table-size) scan. Replace with batched `findMany`/`groupBy` over `pickerId IN (...)` and aggregate in memory.

### Files affected
- `backend/src/services/pickerAdminService.ts` — `getPickerStats` rewritten.
- `frontend/src/pages/PickerAdmin.tsx` — import + `picker-admin-stats` useQuery options.
- `CLAUDE.md` — version `v2.31.6` → `v2.32.0`.
- `ARCHITECTURE.md` — header status + new v2.32.0 section.

---

## [2026-05-06] PickerAdmin "↩ Returned" badge invisible for orders removed from `PACKER_ASSIGNED` state

### Problem
Operator reported that on the PickerAdmin page, when packer-admin clicked "Remove" on an order that was already assigned to a packer, the "Returned" badge briefly appeared next to the picker (frontend optimistic update), then disappeared within ~10 s without the picker completing the order. Pickers reported confusion about whether they should re-pick the order.

### Root Cause
`getPickerStats` in `backend/src/services/pickerAdminService.ts` (two places: per-picker `returned` count + tenant-level `returnedCount`) filtered the "returned" condition with:
```ts
statusHistory: {
  some: { fromStatus: PICKER_COMPLETE, toStatus: PICKER_ASSIGNED }
}
```
But `packerAdminService.removeOrder` writes the history entry as `(order.status BEFORE remove) → PICKER_ASSIGNED`. Two cases:

| Order state when "Remove" pressed | History entry written | Matches filter? |
|---|---|---|
| `PICKER_COMPLETE` (in packer queue, not yet packer-assigned) | `PICKER_COMPLETE → PICKER_ASSIGNED` | ✅ yes — badge shows |
| **`PACKER_ASSIGNED`** (already with a packer) | **`PACKER_ASSIGNED → PICKER_ASSIGNED`** | **❌ no — badge missing** |
| `PACKER_COMPLETE` (already packed, pre-dispatch) | `PACKER_COMPLETE → PICKER_ASSIGNED` | ❌ no |

In a 7-day prod sample: 112 returns matched the filter (visible), 12 returns from `PACKER_ASSIGNED` were silently invisible.

### Diagnostic queries
```sql
-- distribution of return-type transitions
SELECT from_status, to_status, COUNT(*) FROM order_status_history
WHERE to_status = 'PICKER_ASSIGNED' AND changed_at > NOW() - INTERVAL '7 days'
GROUP BY 1,2 ORDER BY 3 DESC;

-- currently-active returns per picker (post-fix should match the UI badge counts)
SELECT u.username, COUNT(*) FROM picker_assignments pa
JOIN users u ON u.id = pa.picker_id JOIN orders o ON o.id = pa.order_id
WHERE pa.completed_at IS NULL AND o.status = 'PICKER_ASSIGNED' AND o.archived_at IS NULL
  AND EXISTS (SELECT 1 FROM order_status_history h WHERE h.order_id = o.id
     AND h.from_status IN ('PICKER_COMPLETE','PACKER_ASSIGNED','PACKER_COMPLETE')
     AND h.to_status = 'PICKER_ASSIGNED')
GROUP BY 1;
```

### Fix
Widen the `fromStatus` filter to all three "return-source" statuses in both occurrences inside `getPickerStats`:
```ts
fromStatus: { in: [OrderStatus.PICKER_COMPLETE, OrderStatus.PACKER_ASSIGNED, OrderStatus.PACKER_COMPLETE] },
toStatus: OrderStatus.PICKER_ASSIGNED,
```
`INBOUND → PICKER_ASSIGNED` (the initial assignment, ~9k/day) is still excluded — correct, that's not a return.

### Rule
**Anywhere a query keys off "this order was returned to a picker", filter on `toStatus = PICKER_ASSIGNED` AND `fromStatus IN {PICKER_COMPLETE, PACKER_ASSIGNED, PACKER_COMPLETE}`.** A single `fromStatus = PICKER_COMPLETE` filter only covers one of three legitimate return entry points and silently undercounts.

### Files Affected
- `backend/src/services/pickerAdminService.ts` (lines 308–313 and 347–352)

Shipped as **v2.31.3**.

---

## [2026-05-06] `prisma db push` in CD failed silently — `--schema` flag missing for monorepo `WORKDIR=/app`

### Problem
After v2.31.2 (test → main merge with the new `db push` line), prod deploy succeeded for code (frontend + backend running new code) but **schema didn't sync**. First user action on Products page returned: `Invalid prisma.productCategory.create() invocation: The table public.product_categories does not exist`. Tables were never created.

### Root Cause
`backend/Dockerfile` sets `WORKDIR /app` (monorepo root). The Prisma schema lives at `/app/backend/prisma/schema.prisma`. When CD runs `docker exec dom_backend npx prisma db push ...`, Prisma searches for the schema relative to cwd — i.e. it looks for `/app/schema.prisma` and `/app/prisma/schema.prisma`, both 404. It exits with `Error: Could not find Prisma Schema`.

The CD's SSH script (`appleboy/ssh-action`) seems to continue past intermediate command failures by default, so the deploy step still reported green even though `db push` had crashed. The earlier `migrate deploy || true` line had been hiding the same path issue for weeks (no surprise — the project never had migration files for it to apply).

### Fix
Run `db push` with explicit schema path:
```bash
docker exec dom_backend npx prisma db push --accept-data-loss --skip-generate --schema=backend/prisma/schema.prisma
```

Manual hotfix (one-off after the v2.31.2 deploy):
```bash
ssh root@45.32.107.63
cd /opt/dom
docker exec dom_backend npx prisma db push --accept-data-loss --skip-generate --schema=backend/prisma/schema.prisma
# expected: 🚀  Your database is now in sync with your Prisma schema.
```

Permanent fix (shipped v2.31.3): `.github/workflows/cd.yml` line 86 now includes `--schema=backend/prisma/schema.prisma`. Future deploys auto-sync schema.

### Why we didn't catch this in CI
CI runs `tsc --noEmit`, not `db push`. There's no environment in CI that mirrors prod's empty-schema starting state. Until we add a smoke test that hits a route requiring a recently-added table, this kind of silent failure repeats.

### Diagnostic tip
After any deploy that should change schema:
```bash
docker exec dom_postgres psql -U dom_user -d dom_db -c "\dt"
```
If a table you expect is missing, the schema-sync step didn't run. Don't trust green CD when the manifest of changed tables isn't present in the DB.

### Rule
**Whenever a Prisma command runs from the monorepo root (`/app`), pass `--schema=backend/prisma/schema.prisma` explicitly.** The schema is not at the cwd. This applies to `db push`, `migrate deploy`, `migrate dev`, `generate`, etc. Dockerfile builder stage already does this on line 19 (`RUN npx prisma generate --schema=backend/prisma/schema.prisma`); the CD script must do the same.

### Files Affected
- `.github/workflows/cd.yml` (pending v2.31.3)

---

## [2026-05-05] CD switched from `prisma migrate deploy` to `prisma db push` — incomplete migration would brick prod

### Problem
While preparing to merge v2.31.0 to `main`, the inventory-module migration `20260504000000_inventory_module_redesign` was reviewed and found to assume v2.30.0 schema as the starting state. **Live was at v2.29.0** (Stock Control module never reached prod). The migration tried to `TRUNCATE stock_movements`, `DROP INDEX` and `ALTER TABLE stock_items DROP COLUMN` against tables that don't exist on prod, which would have crashed `prisma migrate deploy` on the first SQL statement and left `_prisma_migrations` in a half-applied state.

Missing pieces vs prod:
- `STOCK_KEEPER` value on `UserRole` enum (added in v2.30.0)
- `StockStatus` enum and old `stock_items` / `stock_movements` tables (created in v2.30.0)
- `MovementDirection` enum (the migration tried to `DROP TYPE`, prod never had it)

### Root Cause
The migration was autogenerated by `prisma migrate dev` against a local DB that had v2.30.0 applied. It captures only the v2.30.0 → v2.31.0 delta. But `prisma migrate deploy` is not idempotent — it expects a known previous state, which prod never reached.

This project has historically used `prisma db push` for schema sync (see [2026-04-20] sales-agent deploy: manual `db push` was needed because there were no migration files at all). The single migration file was a one-off experiment that broke the project's actual deployment model.

### Fix
1. `.github/workflows/cd.yml` — replace `npx prisma migrate deploy || true` with `npx prisma db push --accept-data-loss --skip-generate`. `db push` diffs current DB schema against `schema.prisma` and applies whatever is needed, regardless of migration history. `--accept-data-loss` allows `DROP COLUMN`/`DROP TABLE` without prompting.
2. Delete `backend/prisma/migrations/` folder. It is no longer used; `db push` ignores it.

### Why dropping `|| true` is intentional
Old line had `|| true` to silently swallow migration errors. With `db push`, a failure means schema-prod drift — we want loud CD failure, not a silent half-applied state.

### Rule
**This project uses `prisma db push`, not migrations.** Schema changes go in `schema.prisma`; CD runs `db push` to sync. If you need migration history (e.g. for a destructive change you want to review), generate the migration locally for review only — but don't ship it to CD.

### Files Affected
- `.github/workflows/cd.yml`
- `backend/prisma/migrations/` (deleted)

Shipped as **v2.31.2**.

---

## [2026-05-05] Local `https://localhost:5173` returns 403 Forbidden — `localhost` missing from Vite `allowedHosts`

### Problem
After v2.30.0 added `allowedHosts: ['domwarehouse.com', 'www.domwarehouse.com']` to `frontend/vite.config.ts` (production host check fix), local dev started returning **HTTP 403** for every request to `https://localhost:5173/`. `curl -k https://localhost:5173/` returned 403, browser showed a blank Forbidden page even though `dom_frontend` container was up and Vite logs showed `ready in N ms`.

### Root Cause
Vite 5 enforces a strict host-header check when `server.allowedHosts` is set as an explicit array. Any incoming request whose `Host` header is not in the allowlist is rejected with 403 — even `localhost`. The production fix added only the public hostnames and forgot to keep `localhost` / `127.0.0.1`, so dev was silently broken until someone tried to open the site locally.

### Fix
Add `localhost` and `127.0.0.1` to the allowlist in `frontend/vite.config.ts`:

```typescript
server: {
  allowedHosts: ['domwarehouse.com', 'www.domwarehouse.com', 'localhost', '127.0.0.1'],
}
```

Apply to running container (vite.config.ts is not in the volume mount — see [2026-05-04] entry):

```bash
docker cp frontend/vite.config.ts dom_frontend:/app/frontend/vite.config.ts
docker restart dom_frontend
curl -sk -o /dev/null -w "%{http_code}\n" https://localhost:5173/   # expect 200
```

### Diagnostic tip
- `curl -k https://localhost:5173/` returning 403 with `dom_frontend` up + Vite logs healthy = host-header rejection. First place to check is `server.allowedHosts` in `vite.config.ts`.
- Browser hard-refresh (`Ctrl+Shift+R`) or incognito window is required after the fix — browsers cache 403 responses aggressively.

### Rule
**When `allowedHosts` is set as an array, it must include every host you intend to access from**, including dev hosts. The default (`true` / no setting) accepts everything; only switch to an array when you explicitly need to restrict.

### Files Affected
- `frontend/vite.config.ts:39`

Shipped as **v2.31.1**.

---

## [2026-05-04] Vite proxy config edits don't propagate to dom_frontend container

### Problem
After adding `/products` and `/warehouses` to `frontend/vite.config.ts` `proxyRoutes` and restarting `dom_frontend`, calls through `https://localhost:5173/products` still returned `200 text/html` (SPA fallback) instead of being proxied to the backend.

### Root Cause
`docker-compose.yml` mounts only `./frontend/src` and `./shared/src` into the frontend container — **not** `frontend/vite.config.ts`. The config file is baked into the image during `docker build`, so editing it on the host has zero effect on the running container until either (a) the image is rebuilt, or (b) the file is `docker cp`'d in and Vite is restarted.

This is a sibling pitfall to the [2026-05-02] proxyRoutes rule: that rule was about "did you remember to edit the file?", but here the file *was* edited — it just never reached the container.

### Fix (until docker-compose is updated)

```bash
# 1. Edit vite.config.ts on host (add the new prefix to proxyRoutes)
# 2. Copy into the running container
docker cp frontend/vite.config.ts dom_frontend:/app/frontend/vite.config.ts
# 3. Restart so Vite re-reads its config
docker restart dom_frontend
# 4. Verify: 401 (auth required), not 404
curl -sk -H 'Accept: application/json' -o NUL -w "%{http_code}\n" https://localhost:5173/<new-prefix>
```

### Permanent fix
Add the file to the volumes list in `docker-compose.yml`:
```yaml
frontend:
  volumes:
    - ./frontend/vite.config.ts:/app/frontend/vite.config.ts
    - ./frontend/src:/app/frontend/src
    - ./shared/src:/app/shared/src
    - ./certs:/app/certs:ro
```
Then a host edit will hot-reload (Vite watches the config file). Until that change is made, the docker-cp + restart workaround above is the way.

### Diagnostic tip
- `text/html` response on a `/<new-prefix>` GET = Vite SPA fallback firing → proxy isn't matching → either `proxyRoutes` is missing the prefix, OR `vite.config.ts` in the container is stale.
- `401`/`403` = proxy IS reaching the backend → config is good, the issue is auth.
- Use `curl -H 'Accept: application/json'` so you don't trigger the `bypass` rule that returns `index.html` to browser-style requests.

---

## [2026-05-02] New API endpoint returns 404 in browser but 200 from curl-to-backend

### Problem
After adding a new route prefix (e.g. `/stock`) to the backend, browser calls
through the Vite dev server return 404 even though `curl http://localhost:3000/<new-prefix>/...`
hits the backend correctly.

### Root Cause
`frontend/vite.config.ts` has an explicit `proxyRoutes` allowlist. Any prefix
not in that list is served by Vite itself — which has no such route, so it
returns 404. **The allowlist must be edited every time a new top-level route
prefix is added to the backend.**

Compounding factor: the docker-compose `frontend` service only volume-mounts
`./frontend/src` and `./shared/src` — `vite.config.ts` lives in the image, so
host-side edits are NOT visible to the container until you `docker cp` the
file in (or rebuild the image).

### Fix
```bash
# 1. Add the new prefix to proxyRoutes in frontend/vite.config.ts
# 2. Copy the updated config into the running container (volume mount won't pick it up)
docker cp frontend/vite.config.ts dom_frontend:/app/frontend/vite.config.ts

# 3. Restart frontend so Vite re-reads its config
docker restart dom_frontend

# 4. Verify: 401 (auth required) instead of 404
curl -sk -o /dev/null -w "%{http_code}\n" -X POST https://localhost:5173/<new-prefix>/<endpoint>
```

For permanent fix, add `./frontend/vite.config.ts:/app/frontend/vite.config.ts`
to the frontend service's `volumes:` in `docker-compose.yml` so host-side
edits are picked up automatically.

---

## ✅ DEPLOYED — v2.29.0 Packer Pre-assignment Workflow (2026-05-02)

**Status:** Merged `test → main`, tagged `v2.29.0`, CD deployed to Vultr,
post-deploy verification passed.

### Deploy facts

| | Value |
|---|---|
| Merge commit | `13fb7c2` (no-ff merge) |
| Tag | `v2.29.0` (also `v2.29.0-test` on test SHA `35bda7f`) |
| Files changed | 11 (10 modified + 1 new `PackerAdminScan.tsx`) |
| Diff size | +1107 / -91 |
| Plan file | `C:\Users\okili\.claude\plans\goofy-snacking-iverson.md` |
| Verified | Backend `Up 3 minutes` post-rebuild · `:3000` LISTEN · `/health` ok · git HEAD = merge commit |

### What it did (one-paragraph reminder)

Replaced the packer shared queue with per-packer pre-assignment. Packer Admin
got a new phone scan station (`/packer-admin-scan`, green theme) plus a desktop
Scan & Stage section that mirrors PickerAdmin. Packers see only their own
assigned orders on `/packer` and scan to complete (which still auto-dispatches
to OUTBOUND — preserves prior behavior). Activated the long-defined-but-unused
`OrderStatus.PACKER_ASSIGNED` enum value. ScanLogin bug fix included:
PACKER_ADMIN now routes to `/packer-admin-scan` (was wrongly routing to the
desktop URL `/packer-admin`).

### Deploy timing

Deploy ran **2026-05-02 ~04:00 PHT** (well before mesai start) so the
empty-queue gap between CD completion and admin sweep was invisible to
packers. Lesson: this kind of state-shape change must always be deployed
in the off-hours window.

### Rollback (kept here for reference if regression appears)

1. **Quick fix** — revert `packerService.getMyOrders` to call the old
   `getPickerCompleteOrders` (1-line change), redeploy. Restores shared
   queue immediately.
2. **Full rollback** — `git revert 13fb7c2` on main + push. CD redeploys
   v2.28.5. PACKER_ASSIGNED rows created during the prod window are
   harmless after revert (status rolls back to PICKER_COMPLETE; the
   completion path simply creates the legacy completion row).

### Version-slot reuse note

The "PENDING — v2.29.0 Reports heavy-query refactor" entry below was
reserved for that refactor at the time it was deferred (2026-04-23).
That refactor was never picked up because the v2.28.1 pool fix appears to
have resolved the 500s. The v2.29.0 slot was used by this packer workflow.
**If the reports refactor ever needs to ship, use v2.29.1 or v2.30.0.**
The technical content of that pending entry is still valid as instructions
for the refactor; only the version label is stale.

---

## [2026-04-23] Intermittent 500 on `/reports/performance` + `/reports/live-performance` (v2.28.1)

### Problem
Warehouse Report page intermittently showed `Failed to load performance data. Retrying...` with 500 responses from both `/reports/performance?days=30` and `/reports/live-performance`. Frontend polls live-performance every 30s, so the banner flickered.

### Root cause hypotheses (unconfirmed — prod backend logs returned no error body before this fix)
- Prisma connection pool exhaustion under concurrent report polling + sales + picker/packer traffic. Default pool is `num_physical_cpus * 2 + 1` = **5** on the 2-vCPU Vultr box.
- Heavy `findMany` in `/performance` loading up to 30 days of picker+packer assignments into memory (no date upper bound, no limit).
- No global `setErrorHandler` → every unhandled throw returned body-less 500, making root-causing impossible from the outside.

### Applied in v2.28.1 (safe batch — no rapor/output değişmedi)
- `backend/src/plugins/rateLimit.ts` — `max: 100 → 500` (regression from v2.X; previously documented as fixed but file had reverted).
- `backend/src/index.ts` — global `setErrorHandler` that recognises:
  - Prisma known errors (`PrismaClientKnownRequestError`) → logs `prisma_known_error code=…` + returns `{error, code, reqId}`.
  - Prisma init errors → `503 Database unavailable`.
  - Pool timeouts (`Timed out fetching a new connection`) → `503 Database pool exhausted`.
  - Everything else → `500 Internal server error` with `reqId` for log correlation.
  - Respects lower statusCodes (validation, rate-limit) and does not mask them.

### Manual ops step required on prod (not in repo)
Add `?connection_limit=15&pool_timeout=10` to `DATABASE_URL` in `/opt/dom/.env`, then `docker compose up -d backend`. Raises pool from 5 → 15 which is what the current query pattern needs.

### Deployed + verified live
- `main` at `eeedec9`, tag `v2.28.1` pushed via CD. `dom_backend` restarted cleanly, `/health` returned ok at 08:31 UTC on 2026-04-23.
- `.env` on prod (`/opt/dom/.env`) updated manually — `DATABASE_URL` now ends in `?schema=public&connection_limit=15&pool_timeout=10`. Verified via `grep DATABASE_URL /opt/dom/.env`.
- User was left observing the `/reports` page for 5–10 min to confirm the `Failed to load performance data. Retrying...` banner stops. If it returns, the new error handler now emits a structured body (`{error, code, reqId}`) so next-session can grep prod logs by `reqId`.

---

## ⏳ PENDING — Reports heavy-query refactor (originally tagged v2.29.0; that slot is now used by the packer workflow — re-tag this as **v2.29.1 or v2.30.0** if it ever ships)

**Do not re-investigate from scratch — all context below is complete.**

### Why deferred
v2.28.1 might already solve the 500s (pool was 5, now 15; query patterns unchanged). If the banner stopped appearing after v2.28.1, v2.29.0 becomes a nice-to-have refactor, not urgent. Start v2.29.0 only if:
- User confirms the banner is still appearing, OR
- User explicitly wants the refactor for cleanliness.

### What to change — file + exact lines

**File:** `backend/src/routes/reports.ts`

#### Change A — `/live-performance` groupBy scope (lines ~394-407)

**Current code (roughly):**
```ts
prisma.pickerAssignment.groupBy({
  by: ['pickerId'],
  where: { completedAt: null, order: { tenantId, archivedAt: null } },
  _count: { _all: true },
}),
```
Same block exists for `packerAssignment`.

**Problem:** Scans every historical open assignment across all time. Stale never-completed rows make this slower over time.

**Fix:** Add a 30-day lower bound on `order.createdAt`:
```ts
where: {
  completedAt: null,
  order: {
    tenantId,
    archivedAt: null,
    createdAt: { gte: new Date(Date.now() - 30 * 86_400_000) },
  },
},
```

**Business-logic check:** Orders older than 30 days that are still open are stuck/abandoned — excluding them from `activeNow` is actually *more correct*, not a regression. But call it out in the commit message.

**Verification:** Before deploy, open Live Performance tab and screenshot `activeNow` per worker. After deploy, compare — some may drop to 0 if they had stale phantom assignments. That's the intended outcome.

#### Change B — `/performance` DB-side aggregation (lines ~194-299)

**Current code:** `prisma.pickerAssignment.findMany({ where: { order: { tenantId }, completedAt: { gte: from, not: null } }, select: { pickerId, completedAt } })` — same for packer. Then JS loops group by pickerId + Manila date.

**Problem:** 30 days × ~10k orders/day × 2 roles = up to ~600k rows pulled into Node memory. One of the likely 500 culprits on a 4GB box.

**Fix:** Use `prisma.$queryRaw` with Postgres `date_trunc` / timezone conversion to aggregate in the DB. Example shape (picker; mirror for packer):

```ts
const pickerRows = await prisma.$queryRaw<{ pickerId: string; date: string; completed: bigint }[]>`
  SELECT pa."pickerId" as "pickerId",
         to_char((pa."completedAt" AT TIME ZONE 'Asia/Manila')::date, 'YYYY-MM-DD') as date,
         COUNT(*)::int as completed
  FROM "PickerAssignment" pa
  JOIN "Order" o ON o.id = pa."orderId"
  WHERE o."tenantId" = ${tenantId}
    AND pa."completedAt" >= ${from}
    AND pa."completedAt" IS NOT NULL
  GROUP BY pa."pickerId", (pa."completedAt" AT TIME ZONE 'Asia/Manila')::date
`
```

⚠️ **Before writing the SQL, verify table + column names with**:
```bash
docker exec dom_postgres psql -U dom_user -d dom_db -c "\d+ \"PickerAssignment\""
docker exec dom_postgres psql -U dom_user -d dom_db -c "\d+ \"PackerAssignment\""
```
Prisma sometimes uses snake_case `@map`, sometimes not — confirm before coding.

Then merge with user list (kept as-is: `prisma.user.findMany` for PICKER / PACKER). Zero-fill the `daily` array using `dateList` the same way the current JS does. Only the aggregation source changes; the response shape must stay identical.

**Same for packers** — parallel $queryRaw for `PackerAssignment`.

**Verification (mandatory — mismatch = hidden wrong numbers in reports):**
1. BEFORE deploy: open `/reports` Performance tab, days=30. Screenshot. Record each picker's + packer's **total** and the daily bars for 2–3 recognisable days.
2. Deploy v2.29.0.
3. AFTER deploy: reload same page, compare totals + daily values.
4. If any picker/packer differs by even 1 — revert immediately (`git revert <merge-commit>` on main, push). Do not "fix forward" under live traffic.

### Risks recap (from prior session chat)
- **Risk 1 — silent wrong numbers:** SQL vs JS aggregation discrepancy on timezone edges. Mitigation = manual screenshot diff above.
- **Risk 2 — `activeNow` drops:** Expected if stale uncompleted assignments exist. Not a bug, but tell user ahead.
- **Timing:** ~00:30 Manila = minimal user impact from the ~20s backend restart.

### Step-by-step resume plan for next session
1. Ask user: "Did the Retrying banner keep appearing after v2.28.1?" — determines urgency.
2. `git checkout test && git pull origin test --rebase`.
3. Edit `backend/src/routes/reports.ts` as above (Change A + Change B).
4. `cd backend && npx tsc --noEmit` — must pass.
5. Manual SQL sanity: run the raw query on prod DB once via `docker exec dom_postgres psql` and eyeball a few rows vs known-good picker/day counts.
6. Ask user for BEFORE screenshots (Performance + Live Performance tabs).
7. Commit: `fix: v2.29.0 — reports DB-side aggregation + open-assignment scope`. Tag `v2.29.0-test`. Push test.
8. Ask merge approval. If yes → merge to main with tag `v2.29.0`, push. CD deploys.
9. Wait for `dom_backend` healthy, then ask user for AFTER screenshots. Diff.
10. If numbers match → update CLAUDE.md to `v2.29.0`, ARCHITECTURE.md reports section if affected, commit as doc-sync.
11. If numbers differ → `git revert` the merge commit on main and push; keep error handler + pool fix intact.

### Optional — docker-compose warning
During deploy the user saw `WARN[0000] ... the attribute 'version' is obsolete`. Can remove the `version: "3.9"` line from `docker-compose.yml` at any time — cosmetic only, unrelated to the reports bug.

---

## [2026-04-20] Packer Phone Scan — Debug Card Leak to Production + Unfriendly Error Messages (v2.23.3)

### Problem
On `domwarehouse.com/scan` as a Packer, scanning a waybill that is **not** in the packer queue (e.g. an `INBOUND` order) produced two user-facing symptoms:
1. A short-but-jargon error toast: `Order status is INBOUND, not PICKER_COMPLETE`.
2. A yellow "Scan Debug" card right below it listing **every tracking number in the packer's queue**, one per line. On a packer with a full queue this filled the phone screen.

Reported as "long error message + entire list showing up."

### Root Causes (two independent issues)

**1. Backend jargon 404 message (`backend/src/routes/packer.ts`).**
`/packer/find` handler, on miss, interpolated raw `OrderStatus` enum + the string `PICKER_COMPLETE` directly into the error body. The message was technically correct but used internal enum names a warehouse packer has no context for.

**2. Scan Debug card left in production (`frontend/src/pages/PackerMobile.tsx`).**
The debug card was added 2026-04-17 to diagnose the J&T URL-encoded barcode problem ("Scanned vs Queue visualization" — see earlier entry). It rendered `debugInfo.queue` — **the full tracking-number list of the packer's current queue** — whenever `/packer/find` returned 404. It was temporary but never removed. The "whole list on screen" the user saw was this card, not a long error string.

There was also a small defensive gap: the error toast had no `wordBreak`/`maxHeight`/`overflowY`, so a future long message from the backend would again blow up the layout.

### Fix

**Backend — `backend/src/routes/packer.ts`:**
- Added `friendlyPackerMessage(diag)` helper that maps `OrderStatus` groups to user-friendly strings:
  - `INBOUND` / `PICKER_ASSIGNED` / `PICKING` → `"This order is not ready for packing yet"`
  - `PACKING` → `"This order is already being packed"`
  - `PACKER_COMPLETE` / `OUTBOUND` → `"This order has already been packed"`
  - archived → `"This order is archived and no longer active"`
  - no diag → `"Order not found"`
- Technical detail (raw status + archived flag) is retained **in logs only** via a new `request.log.warn(..., 'packer find miss')` call so diagnosis is still possible server-side without leaking enums to the scanner UI.

**Frontend — `frontend/src/pages/PackerMobile.tsx`:**
- Removed the `debugInfo` state, both `setDebugInfo(...)` calls in `handleScan`, and the entire `{debugInfo && ...}` render block.
- Added defensive style to the error toast: `wordBreak: 'break-word', maxHeight: '40vh', overflowY: 'auto'` so an unexpectedly long backend message can never again fill the screen.

### Lesson
A "temporary" debug UI that leaks internal state (queue contents, DB IDs, enums) to a scanner screen is a production leak, not an acceptable diagnostic. When adding a debug card to solve a specific incident, add a corresponding todo/task to remove it after the fix ships — don't let `import.meta.env.DEV` gates substitute for deletion when the feature's job is done. For on-going diagnostics use `request.log.warn` with structured fields, not on-screen UI.

### Verification after deploy (v2.23.3)
1. Packer phone → scan an INBOUND order's waybill → toast shows `"This order is not ready for packing yet"`, **no** yellow debug card.
2. Scan a completely unknown waybill → toast shows `"Order not found"`, no debug card.
3. Scan a real PICKER_COMPLETE order → normal confirm bottom sheet opens (regression check).
4. `docker logs dom_backend | grep "packer find miss"` on Vultr → shows the structured warn with raw status + archived flag for the 404 scan above.

---

## [2026-04-20] Post-Deploy Verification Gotchas — `dom_backend` never reports `(healthy)` + logs are empty (v2.23.1 merge)

### Problem
During the v2.23.1 sales-agent merge, after `docker restart dom_backend` on Vultr:
- `docker ps` showed `Up 8 seconds` but **never** `(healthy)` — even 3+ minutes later.
- `docker logs dom_backend --tail 30` returned **zero output**.
- `docker exec dom_backend wget -qO- http://localhost:3000/health` returned `Connection refused` when tested 8 seconds post-restart.

All three signals together made it look like the app had crashed silently. It had not — the app was fine.

### Root Causes (three independent reasons, each harmless on its own)

**1. Backend has no `healthcheck` stanza in `docker-compose.yml`.**
Only `dom_postgres` and `dom_redis` define `healthcheck:`. Without one, Docker has no basis to report `(healthy)` — the status column will forever read `Up X seconds` / `Up X minutes`, never `(healthy)`. Do not wait for `(healthy)` on `dom_backend` — it will not come.

**2. Fastify production log level is `warn` (or higher).**
Startup "listening on :3000" emits at `info` level and is suppressed in prod. `docker logs dom_backend` stays empty until an actual warning/error occurs. **Empty logs ≠ dead app.**

**3. Fastify takes 5–10 seconds to bind the port on cold start.**
The container is `Up` (PID 1 alive) immediately, but the HTTP listener isn't ready yet. An in-container `wget localhost:3000` issued at ~8 s can legitimately get `Connection refused`. Host-side `ss -tlnp | grep 3000` proves whether `docker-proxy` has bound the host port — that's the real signal.

### The Right Verification Checklist (use this, not `(healthy)` / logs / early `wget`)

```bash
# 1. Container is running, no restarts, no non-zero exit
docker inspect dom_backend --format 'State={{.State.Status}} Restarts={{.RestartCount}} ExitCode={{.State.ExitCode}}'
# Expect: State=running Restarts=0 ExitCode=0

# 2. Host has bound port 3000 via docker-proxy (this means the container-side listener is live)
ss -tlnp | grep 3000
# Expect: LISTEN ... 0.0.0.0:3000 ... docker-proxy

# 3. Real functional test — browser on https://domwarehouse.com
#    Log in, hit one endpoint that exercises the new code path.
```

If 1 + 2 pass, the app is alive. Skip log-staring and `(healthy)`-watching — they're structurally absent by design, not broken.

### Related Memory
`feedback_verify_deploy.md` says "if a fix is ineffective 2+ turns, suspect the deploy pipeline not the code." The flip side is equally true: **if the deploy pipeline completed but the in-container signals look off, check whether those signals are even defined** before escalating. The absence of a signal ≠ a failed signal.

### Files / Config References
- `docker-compose.yml:38-59` — `backend` service block, no `healthcheck:` defined (intentional; adding one is future work)
- `backend/src/index.ts` — Fastify `logger` config (prod level)

### Rule
When verifying a production deploy, rely on **inspect + port binding + real HTTP response**, not on status labels (`healthy`) or stdout logs that the service may not emit. If you expect a signal, first check whether it's configured to exist.

---

## [2026-04-19] Password Visibility Toggle on Login Forms (v2.13.12)

### Change
Added an eye/eye-off icon button to the right of the password input on both desktop login (`Login.tsx`) and handheld scan login (`ScanLogin.tsx`). Clicking toggles `type` between `password` and `text` so the user can verify what they typed.

### Implementation Notes
- `button type="button"` is **mandatory** — default is `type="submit"`, which would trigger the login form on every click. Miss this and the form submits with whatever is currently typed.
- `aria-label` swaps dynamically between `"Show password"` / `"Hide password"` — no extra `aria-pressed` needed.
- Toggle defaults to hidden (`showPassword=false`) so the security posture at page load is unchanged from before.
- `autoComplete="current-password"` preserved on the input → password managers keep autofilling regardless of the current `type`.
- Settings.tsx admin password inputs intentionally left without a toggle (different UX context — admin setting someone else's password).

### Rule
Whenever adding a visual toggle next to a form input, set `type="button"` explicitly on the button element. Default-`submit` on a button inside a `<form>` is one of the most common "my toggle submits the form" bugs.

### Files Affected
- `frontend/src/pages/Login.tsx` — `showPassword` state + eye toggle button, input `paddingRight` 44px
- `frontend/src/pages/ScanLogin.tsx` — same pattern, 18×18 SVG, `paddingRight` 46px

---

## [2026-04-19] Dashboard Looks Stale After Handheld Scans — Missing Socket Emit on `picker.ts` / `packer.ts` (v2.13.11)

### Problem
Dashboard's Picker Summary and Packer Summary cards felt "behind the times" — a picker or packer could complete an order on the handheld, but the admin's dashboard would not update for up to 10 seconds. Admin routes (`pickerAdmin.ts`, `packerAdmin.ts`, `orders.ts`) updated the dashboard immediately; only the handheld endpoints felt stale.

### Root Cause
Frontend `Dashboard.tsx` invalidates `['dashboard-stats']` on the socket event `order:stats_changed`. That event was emitted from the admin/crud routes but **not** from the handheld completion routes:

| Route | Emits `order:stats_changed`? |
|---|---|
| `backend/src/routes/orders.ts` (create / bulk) | ✅ |
| `backend/src/routes/pickerAdmin.ts` (assign / unassign / bulk-complete) | ✅ |
| `backend/src/routes/packerAdmin.ts` (assign / unassign) | ✅ |
| `backend/src/routes/picker.ts` `POST /complete` (handheld) | ❌ — bug |
| `backend/src/routes/packer.ts` `POST /complete` (handheld) | ❌ — bug |

So order-state mutations from the handheld did not reach the dashboard via socket; admins had to wait for the 10s react-query polling interval.

### Fix
Add the same emit pattern used in the admin routes, to both handheld completion handlers, after the successful DB update:
```ts
import { getIO } from '../lib/socket'
// ...
try { getIO().to(`tenant:${tenantId}`).emit('order:stats_changed') } catch {}
```
`try/catch {}` is intentional — matches the existing pattern (socket down should never fail the request). `GET /packer/find` does not mutate order state (verified in `packerService.ts`: only `findFirst` / raw SELECT), so no emit is needed there.

### Rule
**Any route that mutates order status MUST emit `order:stats_changed` to the tenant room.** When adding a new mutation endpoint, grep existing mutation routes for `getIO().to(\`tenant:\`` to confirm the pattern, and replicate it. Missing the emit doesn't break anything loudly — the dashboard just feels "laggy" — which is why the bug survived review. If you only see socket emits from admin routes but have handheld routes that do the same state transition, that is a red flag.

Secondary rule: when debugging "dashboard data looks stale", first check whether the mutation path is emitting the event. Polling-only updates (10s in this project) mask the missing emit long enough to be misdiagnosed as a cache bug.

### Files Affected
- `backend/src/routes/picker.ts` — emit on `POST /complete`
- `backend/src/routes/packer.ts` — emit on `POST /complete`

---

## [2026-04-19] CARRY Badge Showed on Today's Orders — String-Slice Timezone Comparison (v2.13.9)

### Problem
Orders created **today** in Manila time were sometimes badged as "CARRY" (carryover from a previous day) on the PickerAdmin and PackerAdmin workload panels. The CARRY tag should only appear on orders whose `workDate` is strictly before today in Manila.

### Root Cause
Both admin pages compared work date against today using raw ISO slicing:
```ts
{order.workDate?.slice(0, 10) < todayStr && (
```
`order.workDate` comes from the backend as a UTC ISO string. `todayStr` was computed as today's date in **Manila** (via `getManilaDateString()`). Slicing the UTC ISO string skips the timezone conversion entirely. So an order created in Manila at, say, 01:30 on 2026-04-19 (Manila) — which is 17:30 on 2026-04-18 (UTC) — would have `workDate.slice(0, 10) === '2026-04-18'`, while `todayStr === '2026-04-19'`. Comparison says past → CARRY badge shown, even though the order is genuinely from today in the operating timezone.

### Fix
Use the shared `getManilaDateString()` helper for both sides of the comparison:
```ts
{order.workDate && getManilaDateString(new Date(order.workDate)) < todayStr && (
```
Both values now represent the same timezone's calendar date, so the comparison matches user-perceived reality.

### Rule
**Never compare a date string by slicing its first 10 characters unless you are certain the string is already in the target timezone.** In this project all comparisons of "was this on or before today?" must use `getManilaDateString()` on both sides. The raw `workDate` ISO is UTC; using `.slice(0, 10)` is a hidden timezone conversion and will silently lie whenever a user operates across the Manila/UTC midnight.

When you spot a `slice(0, 10)` on any date field that will be compared to something timezone-aware, treat it as a bug by default — either remove the slice or convert to Manila first.

### Files Affected
- `frontend/src/pages/PackerAdmin.tsx` — CARRY badge conditional
- `frontend/src/pages/PickerAdmin.tsx` — CARRY badge conditional

---

## [2026-04-19] Archive Page Returns HTML Instead of JSON — Missing `/archive` in Vite proxyRoutes

### Problem
After v2.13.4 shipped, clicking **Archive OUTBOUND Now** still showed *"Archive failed"*. DevTools network tab:
```
POST https://domwarehouse.com/archive/trigger  →  404 Not Found
GET  https://domwarehouse.com/archive/stats    →  200 text/html (SPA index.html)
```
No archived records were visible either — the stats/list GETs returned HTML, so React Query got `undefined` for `.total` and `.orders`.

### Root Cause (correction — earlier diagnosis was wrong)
Initial suspicion was **nginx** missing a `location /archive` block. **That was wrong.** This project's nginx config only has three locations: `/socket.io/`, `/api/`, and `/` (catch-all → Vite on port 5173). Per-prefix routing happens one layer deeper: **Vite's dev-server `server.proxy` config** (`frontend/vite.config.ts`) decides which prefixes get forwarded to Fastify on `:3000` and which get served the SPA.

The real bug: `proxyRoutes` in `frontend/vite.config.ts:8` listed every other prefix but **`/archive` was missing**. So Vite did this:

| Request | Vite behavior | Result |
|---|---|---|
| `GET /archive/stats` | No proxy match → SPA fallback → `index.html` | 200 `text/html`, React Query sees undefined fields → empty UI |
| `GET /archive` (list) | Same SPA fallback | 200 `text/html`, empty table |
| `POST /archive/trigger` | No proxy match, static HTML can't POST | 404 → frontend generic *"Archive failed"* toast |

Archive feature (Phase 7) worked locally because `npm run dev` hits Fastify directly; the Vite proxy gap only bites when traffic actually flows `browser → nginx → Vite`.

### Wasted detour
I initially edited the nginx config on the Vultr host thinking it needed a `location /archive` block. nginx was already correct (the catch-all sends everything to Vite); I nearly broke the site by adding an unnecessary location outside the `server {}` block. Lesson: **before blaming nginx, read the nginx config** and identify whether per-prefix routing actually happens there.

### Fix
One line in `frontend/vite.config.ts:8`:
```diff
- const proxyRoutes = ['/auth', '/users', '/orders', '/assign', '/reports', '/health', '/picker-admin', '/packer-admin', '/picker', '/packer', '/outbound']
+ const proxyRoutes = ['/auth', '/users', '/orders', '/assign', '/reports', '/health', '/picker-admin', '/packer-admin', '/picker', '/packer', '/outbound', '/archive']
```
Shipped as **v2.13.6**. Deploy via CD → frontend container rebuild → Vite picks up new proxy list.

### Rules
- **When you register a new route prefix in `backend/src/index.ts`, you MUST also add it to `frontend/vite.config.ts` `proxyRoutes`.** Otherwise Vite will SPA-fallback that prefix and every API call silently returns `index.html`.
- **SPA-fallback + unproxied API = silent failure.** GETs return 200 HTML (React Query sees undefined → "no data"), POSTs return 404 (→ generic "failed" toast). Neither surfaces the real cause. When debugging a 404 on an API path, first check `Content-Type` of a GET on the same prefix — `text/html` means it never reached Fastify.
- **Read the actual nginx config before theorising about nginx.** In this stack nginx is a thin shell (`/api/`, `/socket.io/`, `/ → :5173`); the real per-route allowlist lives in Vite.

### Verification commands
```bash
# audit every backend prefix at once
for p in /auth/me /users /orders /picker-admin/pickers /packer-admin/packers \
         /picker/my-orders /packer/my-orders /outbound/stats /reports/dashboard \
         /archive/stats; do
  ct=$(curl -sS -o /dev/null -w "%{content_type}" "https://domwarehouse.com$p")
  code=$(curl -sS -o /dev/null -w "%{http_code}" "https://domwarehouse.com$p")
  echo "$code $ct $p"
done
```
Every row should report `application/json`. Any `text/html` row = that prefix is not in `proxyRoutes`.

### Files Affected
- `frontend/vite.config.ts` — added `/archive` to `proxyRoutes`
- `CLAUDE.md` — bumped to v2.13.6
- `SOLUTIONS.md` — this (corrected) entry

---

## [2026-04-19] Operational Tips — Uploading Long Terminal Output + nginx Recovery

### When Terminal Copy Doesn't Work: Upload to Termbin for a Shareable URL

**Problem:** SSH'de uzun çıktı geldiğinde (nginx config, log tail, error dump) terminal'den copy-paste ya başarısız ya da satırları bozar. Chat'e yapıştırmak için URL lazım.

**Fix — pipe the command through `nc termbin.com 9999`:**
```bash
# tek komut çıktısı
<command> 2>&1 | nc termbin.com 9999

# örnekler
sudo nginx -t 2>&1 | nc termbin.com 9999
cat -n /etc/nginx/sites-available/dom | nc termbin.com 9999
tail -n 30 /etc/nginx/sites-available/dom | nc termbin.com 9999
docker compose logs backend --tail=200 | nc termbin.com 9999
```
`nc` komutu bir URL döner (`https://termbin.com/xxxx`). URL 1 ay kalır, public — sensitive content (API key, password, session token) varsa önce redakte et:
```bash
<command> | sed 's/Authorization: Bearer [^"]*/Authorization: Bearer REDACTED/g' | nc termbin.com 9999
```

**Rule:** Uzun çıktı için artık screenshot / satır satır copy deneme — tek komut termbin. İki çıktı lazımsa iki ayrı URL at.

---

### nginx Recovery — Stray `sites-enabled` File + Missing Canonical Symlink

**Context:** Archive bug için debug yaparken, yanlışlıkla `location /archive` bloğunu `sites-enabled/domwarehouse.com` adıyla ayrı bir dosya olarak kaydetmişiz. Bu dosya `server { }` bloğu içermediği için `nginx -t` reddetti (*"location directive is not allowed here"*). Asıl config ise `/etc/nginx/sites-available/dom` idi ve `sites-enabled/dom` symlink'i hiç yoktu. Yani nginx sadece bozuk dosyayı görüyordu.

**Diagnostic probe:**
```bash
ls -la /etc/nginx/sites-enabled/
# beklenen: symlink → /etc/nginx/sites-available/<site>
# bu kazada: sadece bozuk duplicate dosya vardı, symlink yoktu
sudo nginx -t 2>&1 | nc termbin.com 9999
```

**Fix:**
```bash
sudo rm /etc/nginx/sites-enabled/domwarehouse.com        # stray bozuk dosya
sudo ln -s /etc/nginx/sites-available/dom /etc/nginx/sites-enabled/dom
sudo nginx -t && sudo systemctl reload nginx
```

### Heredoc Trap — Leading Whitespace on EOF Terminator

Heredoc ile çok satırlı config yazarken, kapanış `EOF`'un başında boşluk olursa bash onu terminator saymaz ve bekler. Bazen paste'de `EOF` satıra iki kez yazılıp dosyanın içine **literal "EOF" metni olarak** kaydolur — `nginx -t` sonra "unexpected end of file" verir.

**Recovery:** Dosyayı tamamen yeniden yazmaya uğraşma — stray EOF satırlarını tek `sed` ile temizle:
```bash
sudo sed -i '/^[[:space:]]*EOF[[:space:]]*$/d' /etc/nginx/sites-available/<site>
sudo nginx -t
```

**Rules (genel):**
- **Bir site için `sites-available/` canonical, `sites-enabled/` sadece symlink olmalı.** Eğer `sites-enabled/` içinde symlink değil gerçek dosya varsa şüphelen — yanlış editörle yaratılmış veya önceki bir kaza.
- **nginx düzenleme kesin çalışıyorsa önce doğrulama:** `ls -la /etc/nginx/sites-enabled/` (symlink kontrolü) + `sudo nginx -t` (syntax) + `sudo systemctl reload nginx` (uygulama). `systemctl reload` hatada graceful fail verir, site ayakta kalır — `restart` yerine her zaman `reload` tercih et.
- **Heredoc yerine `sudo tee` + `<<'EOF'` daha güvenli** çünkü `<'EOF'` quotes expansion'ı durdurur ve çoğu paste bug'ını engeller. Ama kapanış EOF yine de column 0'da ve tamamen yalnız olmalı — whitespace yok.

### Files Affected
- (server-only) `/etc/nginx/sites-enabled/dom` (symlink restored), `/etc/nginx/sites-enabled/domwarehouse.com` (stray file removed)
- `SOLUTIONS.md` — this entry

---

## [2026-04-18] Archive Now — Wrong Schedule Text in UI + Brittle Manual-Trigger Route

### Problem
1. On `/archive`, the "Archive OUTBOUND Now" confirm popup showed: *"This normally runs automatically at 7:00 PM. Proceed?"* and the empty-state copy referred to *"the daily 7 PM archive job"*. The actual cron fires at **23:30 Manila**.
2. Clicking Archive Now surfaced *"Archive failed"* with no server-side detail.
3. Archive list appeared empty even when admins expected archived rows to be there.

### Root Cause
**Stale UI text:** The cron pattern in `backend/src/index.ts:118` is `'30 23 * * *', tz: 'Asia/Manila'` (23:30 nightly). `frontend/src/pages/Archive.tsx` lines 381 + 468 and the comment at `backend/src/lib/queues.ts:25` were never updated when the schedule moved from 19:00 to 23:30 in an earlier phase.

**Brittle route:** `backend/src/routes/archive.ts` POST `/trigger` did:
```ts
const result = await archiveOutboundOrders(tenantId)                    // DB update
await archiveOutboundQueue.add('archive', { tenantId }, {...})          // Redis enqueue
return reply.send({ archived: result.archived })
```
If the BullMQ `add(...)` threw (Redis hiccup, auth issue, etc.), Fastify surfaced a 500 with no `error` field, so the frontend fell back to a generic *"Archive failed"* toast — **even though the DB archive had already committed**. The audit enqueue is not the critical path; treating it as critical collapsed a successful operation into a user-visible failure.

### Fix
- UI/comment text aligned with the real cron: `"11:30 PM (Manila time)"` / `23:30 Manila`.
- Route wrapped with an outer try/catch around the DB archive (explicit error log + typed 500 with message) and an **inner try/catch around the queue enqueue** that logs-and-swallows, so the main flow always reflects the DB outcome. Also added structured info/warn/error logs so future failures leave a trail in `docker compose logs backend`.

### Rules
- **Best-effort telemetry/audit queues must never fail the critical path.** Isolate them with a local try/catch and log the enqueue error — the response must describe the main operation's outcome, not the audit hop.
- **Any UI copy that mentions a schedule must match the cron definition.** Single source of truth: `backend/src/index.ts` `repeat: { pattern, tz }`. When changing either, grep the frontend for the old time (`7 PM`, `19:00`, etc.) in the same change.

### Files Affected
- `frontend/src/pages/Archive.tsx`
- `backend/src/lib/queues.ts`
- `backend/src/routes/archive.ts`

---

## [2026-04-18] Outbound / Reports 403 for PICKER_ADMIN and PACKER_ADMIN — Frontend/Backend Role List Mismatch

### Problem
After a picker + packer completed an order via scan, a PICKER_ADMIN or PACKER_ADMIN user navigating to `/outbound` saw repeating `GET /outbound/grouped 403` and `GET /outbound/stats 403` errors. The same user on `/reports` saw `Failed to load performance data. Please try again.` (also from a 403 on `/reports/performance`).

### Root Cause
Frontend route guards in `frontend/src/App.tsx` allow the page:
```
/outbound → [ADMIN, INBOUND_ADMIN, PICKER_ADMIN, PACKER_ADMIN]
/reports  → [ADMIN, INBOUND_ADMIN, PICKER_ADMIN, PACKER_ADMIN]
```
So the user reaches the page and React Query starts polling. But the backend `requireRole(...)` preHandler for the endpoints those pages hit was narrower:
```
/outbound/{grouped,stats,stuck}           → [ADMIN, INBOUND_ADMIN]
/reports/performance (+ export, export-pdf) → [ADMIN, INBOUND_ADMIN]
/reports/sla (+ export-pdf)               → [ADMIN, INBOUND_ADMIN]
```
Result: page renders, every poll 403s, user sees error toasts while the sidebar link that got them there is clearly "allowed."

### Fix
Widen the backend `requireRole` lists to match the frontend `allowedRoles` for the exact endpoints those pages call:
- `backend/src/routes/outbound.ts` — shared `preHandler` → add PICKER_ADMIN + PACKER_ADMIN.
- `backend/src/routes/reports.ts` — `/performance`, `/performance/export`, `/performance/export-pdf`, `/sla`, `/sla/export-pdf` → add PICKER_ADMIN + PACKER_ADMIN.

Intentionally **not** widened:
- `/reports/dashboard` — only called from `/` (Dashboard) and `/dashboard` (Inbound), both gated to ADMIN + INBOUND_ADMIN. Widening would grant data access a *_ADMIN never needs.
- `/reports/trigger-nightly` — admin-only debug trigger.
- `/reports/order-timeline` — already correctly 4-role.

### Rule
**Frontend `ProtectedRoute allowedRoles` and backend `requireRole(...)` for the endpoints that page calls MUST stay in sync.** When adding a role to a page's `allowedRoles` in `App.tsx`, grep the page component for every `api.get(...)` / `api.post(...)` path and update the matching backend routes in the same commit. A narrower backend than frontend produces a 403-spam UX; a wider backend is a privilege leak.

When debugging a `403` that only hits some user roles: first check frontend allowedRoles vs backend requireRole for the exact URL path in the network tab — the list mismatch is the most common cause.

### Files Affected
- `backend/src/routes/outbound.ts`
- `backend/src/routes/reports.ts`

---

## [2026-04-18] Picker/Packer "Order not assigned to you" on Scan — Archived Duplicate

### Problem
`picker1` sees an assigned order in their mobile list. Scanning that order's waybill and pressing **Confirm Complete** returns HTTP 403 `"Order not assigned to you"`. The order is clearly the picker's — list says so — but completion fails.

### Root Cause
`backend/prisma/schema.prisma:108` replaced the `@@unique([tenantId, trackingNumber])` constraint with a **partial unique index** (`archived_at IS NULL`) via a raw SQL migration. So the same `(tenantId, trackingNumber)` pair can legally exist multiple times: one active row + any number of archived rows (re-shipment of the same logistics code over time).

`pickerService.completeByTracking` looked up the order like this:
```ts
const order = await prisma.order.findFirst({
  where: { trackingNumber: { equals: trackingNumber, mode: 'insensitive' }, tenantId },
})
```
No `archivedAt: null` filter, no status filter, no `orderBy`. Postgres returns **any** matching row in undefined order — `findFirst` could return the **old archived** row whose `pickerAssignment.completedAt` was already set long ago. The follow-up `pickerAssignment.findFirst({ orderId: <archived-id>, pickerId, completedAt: null })` then matched nothing → `"Order not assigned to you"` → route mapped that message to HTTP 403.

The same latent anti-pattern existed in `packerService.completeByTracking`.

Meanwhile, `getMyOrders` correctly joins on `order.status ∈ {PICKER_ASSIGNED, PICKING}` (never on archived rows), so the picker's **list** always shows the active row — the mismatch made the bug look like a permission error.

### Fix
Add `archivedAt: null` + status filter inside the Prisma `findFirst` for both services. Because the status filter now lives in the query, the redundant post-fetch status check is dropped.

```ts
// pickerService.completeByTracking
const order = await prisma.order.findFirst({
  where: {
    trackingNumber: { equals: trackingNumber, mode: 'insensitive' },
    tenantId,
    archivedAt: null,
    status: { in: [OrderStatus.PICKER_ASSIGNED, OrderStatus.PICKING] },
  },
})

// packerService.completeByTracking
const order = await prisma.order.findFirst({
  where: {
    trackingNumber: { equals: trackingNumber, mode: 'insensitive' },
    tenantId,
    archivedAt: null,
    status: OrderStatus.PICKER_COMPLETE,
  },
})
```

The canonical filter pattern was already used correctly in `pickerAdminService.lookupOrderByScan` (`backend/src/services/pickerAdminService.ts:94-96`, `archivedAt: null`) — reference it for any future scan-resolution code.

### Rule
**Every Prisma query that resolves a scan to an `Order` by `trackingNumber` MUST include `archivedAt: null` in its `where`.** The partial unique index makes archived duplicates legal; any query that omits this filter is a time bomb that fires when a carrier re-uses a tracking number.

Also prefer putting the expected `status` filter inside the query (single round trip, clearer intent) rather than fetching and re-checking in application code.

### Files Affected
- `backend/src/services/pickerService.ts` — `completeByTracking`
- `backend/src/services/packerService.ts` — `completeByTracking`

---

## [2026-04-18] Backend Container Never Rebuilt on CD — All Backend Fixes Silently No-Op'd

### Problem
After 6+ rounds of backend fixes (v2.5.4 → v2.12.5) addressing the "deleted users still visible" bug, none of them actually took effect on production. The backend container on Vultr was running the ORIGINAL image built weeks ago — every backend change pushed since then was silently ignored.

### Root Cause
Three-way config mismatch between Dockerfile, docker-compose.yml, and the CD script:

1. **`backend/Dockerfile`** — runtime command: `CMD ["node", "backend/dist/index.js"]`. Runs compiled JS from `/app/backend/dist/` which is baked into the image at build time.

2. **`docker-compose.yml`** — volume mount: `./backend/src:/app/backend/src`. Mounted the source directory, but the runtime never reads from there (it reads `dist/`, which was NOT mounted). So source updates on the host were invisible to the running process.

3. **`.github/workflows/cd.yml`** — deploy script:
   ```bash
   git pull origin main      # updates /opt/dom/backend/src (irrelevant — not used at runtime)
   docker compose pull       # no-op: services declared `build:` not `image:`
   docker compose up -d      # no config change → no container restart
   ```

Combined effect: `git pull` updated files the container didn't read, `pull` had no images to fetch (no `image:` field), and `up -d` saw no config diff so it left the container running. The old compiled `dist/index.js` kept running forever.

### How the Bug Looked
- Frontend fixes appeared to work (frontend runs `npx vite --host` in dev mode, reads source directly from volume — git pull propagates immediately).
- Backend fixes appeared to have no effect even after waiting, refreshing, clearing cache.
- Live `/packer-admin/stats` and `/picker-admin/stats` returned inactive users regardless of DB state, because the old baked-in code had no `isActive: true` filter.
- UI "Delete user" succeeded (backend DELETE /users/:id worked because that CRUD route was written long enough ago to be in the baked image), but the stats endpoint read the DB without filtering, so "deleted" users kept showing up.

### Fix
Two changes:
1. **`.github/workflows/cd.yml`** — force rebuild on every deploy:
   ```yaml
   docker compose up -d --build --remove-orphans
   ```
2. **`docker-compose.yml`** — tag the backend image (`ghcr.io/ozcan-k/dom-backend:latest`) and remove the useless `./backend/src` volume mount that misled every future reader into thinking the backend was in dev mode.

After the next CD run, the Vultr server will actually `docker build` fresh backend and frontend images from the pulled source, then recreate the containers — so all subsequent code changes will actually reach production.

### Rule — INFRASTRUCTURE DEBUGGING
If a "fixed" backend bug persists across multiple deploy cycles, **stop fixing the code** and verify the running container is executing the code you think it is. Ways to verify:
- `docker exec dom_backend cat /app/backend/dist/<file>.js | grep <expected-string>` — does the compiled code contain the new filter?
- `docker inspect dom_backend --format='{{.Created}}'` — when was this container created? If weeks ago, it's not running current code.
- `docker images ghcr.io/ozcan-k/dom-backend --format "{{.CreatedAt}}"` — when was the image built locally on the server?

A deploy pipeline that pushes images to a registry but doesn't actually consume them on the deploy target is a silent time bomb. Always trace the full path: source → build → image → container → process.

### Files Affected
- `.github/workflows/cd.yml` — `--build` flag on `docker compose up`
- `docker-compose.yml` — `image:` tag added; dead `backend.volumes` entry removed

---

## [2026-04-18] "Deleted" Users Still Visible — They Were Never Actually Deleted (True Root Cause)

### Problem
Across 6 fix rounds (v2.5.4 → v2.12.4) focused on cache invalidation, backend `isActive` filters, `staleTime`, orphaned assignments, and `invalidateQueries` vs `removeQueries` — test pickers (`picker1_test`, `picker2_test`, `picker3_test`, `picker11`) kept appearing in PickerAdmin workload.

### True Root Cause
**Those users had `isActive = true` in the database the whole time** — they were never successfully deleted. Direct inspection of the live `/picker-admin/stats` response proved the backend was correctly returning active-only users; they just happened to still be active.

The underlying bug: `deleteMutation` in `Settings.tsx` had **no `onError` handler**. Any failure (transaction rollback, permission error, network hiccup) was silently swallowed — the modal stayed open on failure but closed on success, making the two indistinguishable to the user. The user thought they clicked delete; the API call actually never succeeded, or was never made for those specific users.

All 6 prior cache-invalidation fixes were addressing a **symptom that wasn't the actual bug** — the data was never stale; it was always correct-per-DB. The DB was the wrong state.

### Fix
1. **Add `onError` to `deleteMutation` in `Settings.tsx`** — surface backend error messages via alert() so silent failures can never happen again:
   ```ts
   onError: (err: unknown) => {
     const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error
       ?? (err instanceof Error ? err.message : 'Failed to delete user')
     alert(`Delete failed: ${msg}`)
   }
   ```

2. **Manual cleanup of the orphan test users on live DB** (one-time):
   ```bash
   docker exec dom_backend node -e "
   const { PrismaClient } = require('@prisma/client');
   const p = new PrismaClient();
   p.user.updateMany({
     where: { username: { in: ['picker1_test','picker2_test','picker3_test','picker11','packer1_test','packer2_test','packer3_test'] } },
     data: { isActive: false }
   }).then(r => { console.log('Deactivated:', r.count); return p.\$disconnect(); }).catch(e => { console.error(e); process.exit(1); });
   "
   ```

### Rule — DEBUGGING LESSON
**Verify the DB state before blaming cache.** Before attempting any cache-invalidation fix for a "stale data" bug, check what the API is actually returning. If the API returns the "wrong" data, the bug is in the backend filter or the DB state — NOT in frontend cache.

In this case, a 30-second `curl` to `/picker-admin/stats` on day one would have proved the users were still active in the DB, saving 5 rounds of misdirected fixes.

**Always add `onError` handlers to destructive mutations.** A silent failure is strictly worse than a loud one.

### Files Affected
- `frontend/src/pages/Settings.tsx` — `deleteMutation` now has `onError`

---

## [2026-04-18] Deleted Users Still Appear in Workload — `removeQueries` vs `invalidateQueries` (Final Fix)

### Problem
After multiple fix rounds (v2.5.4 → v2.5.9), deleted users still appeared in the PickerAdmin / PackerAdmin workload sections. Switching from `invalidateQueries` to `removeQueries` in `Settings.tsx` did NOT solve it — earlier SOLUTIONS.md entry [2026-04-17 "Cache Not Cleared"] had this guidance backwards.

### Root Cause
`removeQueries` wipes the cache entry. But if PickerAdmin / PackerAdmin is **currently mounted** (common: admin deletes a user in Settings while another tab or the page above still holds the component), `removeQueries` does NOT force the mounted component's active `useQuery` observer to refetch. The observer keeps its last-rendered React state until:
- the next `refetchInterval` tick (up to 10s later), or
- the component unmounts and remounts.

`invalidateQueries`, in contrast, marks the query stale AND immediately triggers a refetch on every active observer — exactly what we need for cross-page deletions.

### Fix
`Settings.tsx` `deleteMutation.onSuccess` uses `invalidateQueries` for all cross-page keys:
```ts
queryClient.invalidateQueries({ queryKey: ['users'] })
queryClient.invalidateQueries({ queryKey: ['picker-admin-stats'] })
queryClient.invalidateQueries({ queryKey: ['picker-admin-pickers'] })
queryClient.invalidateQueries({ queryKey: ['packer-admin-stats'] })
```

Combined with the prior `staleTime: 0` + `refetchOnMount: 'always'` overrides on those queries (from entry [2026-04-18 "Global staleTime:30s"]), this covers both code paths:
- Mounted component → `invalidateQueries` forces an immediate refetch.
- Unmounted component → next mount refetches because `staleTime: 0` + `refetchOnMount: 'always'`.

### Rule
For cross-page cache updates triggered by a mutation, use `invalidateQueries` (NOT `removeQueries`). The only time to prefer `removeQueries` is when you want to free memory for a query no component will ever observe again.

Earlier guidance in this file recommending `removeQueries` for "cross-page caches" is **incorrect** — this entry supersedes it.

### Files Affected
- `frontend/src/pages/Settings.tsx` — `deleteMutation.onSuccess`

---

## [2026-04-17] Nightly Report — Sent at 11:30 AM Instead of 11:30 PM (Manila)

### Problem
The nightly report email was arriving around 11:30 AM Philippines time (PHT) instead of the expected 11:30–11:40 PM.

### Root Cause
Two compounding issues:
1. **Stale BullMQ repeatable job in Redis** — an old cron job registered by a previous deployment (e.g. `'30 3 * * *'` UTC = 11:30 AM Manila) was never fully cleared. BullMQ's `getRepeatableJobs()` can miss keys registered by older BullMQ versions or with a different key format, so the ghost job kept firing.
2. **UTC-converted cron patterns** — using UTC-equivalent times (`'30 15 * * *'`) is error-prone and breaks if the server timezone changes.

### Fix
1. **Explicit Manila timezone** — cron patterns now use `tz: 'Asia/Manila'` with local Manila times directly. No UTC math required, timezone-proof:
   ```ts
   repeat: { pattern: '30 23 * * *', tz: 'Asia/Manila' }  // archive 23:30 PHT
   repeat: { pattern: '40 23 * * *', tz: 'Asia/Manila' }  // report  23:40 PHT
   ```
2. **Redis SCAN+DEL sweep** — alongside `getRepeatableJobs()`, a direct Redis scan clears any leftover `bull:{queue}:repeat:*` keys that the BullMQ API may not list:
   ```ts
   const [next, keys] = await redis.scan(cursor, 'MATCH', `bull:${queueName}:repeat:*`, 'COUNT', '100')
   if (keys.length > 0) await redis.del(...keys)
   ```

### Rule
- **Always use `tz: 'Asia/Manila'`** when defining cron schedules — never convert to UTC manually.
- When changing a cron schedule, the Redis sweep ensures no ghost jobs survive across deployments.

### Files Affected
- `backend/src/index.ts` — `clearQueue()` helper + `tz: 'Asia/Manila'` on both cron registrations

---

## [2026-04-17] Deleted Users Still Appear on Picker/Packer Admin Pages

### Problem
Users deleted from Settings remained visible in the PickerAdmin and PackerAdmin pages.

### Root Cause
`DELETE /users/:id` is a **soft delete** — it sets `isActive = false`, it does not remove the record. `getPickerStats()` and `getPackerStats()` queried users without an `isActive` filter, so inactive users were included.

`getPickers()` and `getPackers()` already had `isActive: true` — only the stats functions were missing it.

### Fix
Added `isActive: true` to both stats queries:
```ts
// pickerAdminService.ts — getPickerStats()
where: { tenantId, role: UserRole.PICKER, isActive: true }

// packerAdminService.ts — getPackerStats()
where: { tenantId, role: UserRole.PACKER, isActive: true }
```

### Rule
User deletion in this project is **soft delete** (`isActive = false`). Every Prisma query that returns a user list **must** include `isActive: true`. Never omit this filter when writing new user-list queries.

### Files Affected
- `backend/src/services/pickerAdminService.ts` — `getPickerStats()`
- `backend/src/services/packerAdminService.ts` — `getPackerStats()`

---

## [2026-04-17] Deleted Users Still Visible in Workload Section After Deletion (Cache Not Cleared)

### Problem
After deleting a picker or packer from Settings, the deleted user continued to appear in the PickerAdmin assignment dropdown and workload stats — even though the backend filter (`isActive: true`) was correct.

### Root Cause (Three Layers — discovered progressively)

1. **Missing stats cache update**: `deleteMutation.onSuccess` only refreshed `['users']`, not `['picker-admin-stats']` / `['packer-admin-stats']`.
2. **Wrong invalidation method**: `invalidateQueries` marks cache as stale but serves old data on next mount (stale-while-revalidate). `removeQueries` wipes cache entirely → no flash.
3. **Missing dropdown cache**: `['picker-admin-pickers']` (the picker assignment dropdown query) was NEVER cleared on delete — this was the root cause of the persistent bug. Deleted pickers kept appearing in the "assign to picker" dropdown even after stats were fixed.

### Fix
All four caches must be cleared in `deleteMutation.onSuccess` in `Settings.tsx`:
```ts
queryClient.invalidateQueries({ queryKey: ['users'] })             // same-page list: invalidate OK
queryClient.removeQueries({ queryKey: ['picker-admin-stats'] })    // workload stats cards
queryClient.removeQueries({ queryKey: ['picker-admin-pickers'] })  // ← THE REAL FIX: assignment dropdown
queryClient.removeQueries({ queryKey: ['packer-admin-stats'] })    // packer workload stats
```

### Rule
When deleting a user, trace ALL query keys that display that user — not just the obvious ones. A user can appear in: (a) their own list, (b) stats cards, AND (c) assignment dropdowns. Each is a separate query key that must be cleared.

~~Use `removeQueries` (not `invalidateQueries`) for cross-page caches: removes data entirely so no stale flash occurs on next mount.~~ **SUPERSEDED** — see [2026-04-18 "Final Fix"] entry at top of file. `removeQueries` does not refetch on mounted components; use `invalidateQueries` for cross-page cache updates.

### Files Affected
- `frontend/src/pages/Settings.tsx` — `deleteMutation.onSuccess`

---

## [2026-04-18] Global staleTime:30s Preventing Immediate Refetch on Page Navigation

### Problem
After deleting a picker/packer from Settings, the workload section and picker assignment dropdown in PickerAdmin/PackerAdmin still showed the deleted user when navigating back to those pages — even though `removeQueries` was being called.

### Root Cause
`App.tsx` sets a global `staleTime: 30_000` for all queries. This means React Query considers fetched data "fresh" for 30 seconds. When PickerAdmin mounts after a deletion:
- If cache still exists and was fetched < 30s ago → `refetchOnMount: true` does NOT refetch (data is "fresh")
- The deleted user remains visible until the staleTime expires or `refetchInterval` fires

The `['picker-admin-pickers']` query had no `refetchInterval`, so it could show stale data for the full 30 seconds.

### Fix
Override the global staleTime at the query level for all picker/packer admin queries:

```ts
// PickerAdmin.tsx — pickers dropdown
const { data: pickers } = useQuery({
  queryKey: ['picker-admin-pickers'],
  staleTime: 0,
  refetchOnMount: 'always',   // bypasses staleTime entirely on mount
  ...
})

// PickerAdmin.tsx — stats workload
const { data: statsData } = useQuery({
  queryKey: ['picker-admin-stats'],
  staleTime: 0,              // always stale → always refetches on mount
  refetchInterval: 10_000,
  ...
})

// PackerAdmin.tsx — stats workload
const { data: statsData } = useQuery({
  queryKey: ['packer-admin-stats'],
  staleTime: 0,
  refetchInterval: 10_000,
  ...
})
```

Combined with `removeQueries` in `Settings.tsx deleteMutation.onSuccess`, this ensures deleted users never appear regardless of timing or navigation pattern.

### Rule
When a query displays data that can be changed by a mutation on ANOTHER page, always set `staleTime: 0` (and `refetchOnMount: 'always'` if no `refetchInterval`) on that query. Never rely solely on the global staleTime for cross-page consistency.

Do NOT set a high global `staleTime` for queries that must reflect deletions/deactivations across pages.

### Files Affected
- `frontend/src/pages/PickerAdmin.tsx` — `['picker-admin-pickers']` and `['picker-admin-stats']` queries
- `frontend/src/pages/PackerAdmin.tsx` — `['packer-admin-stats']` query

---

## [2026-04-18] deleteUser Leaves Orphaned pickerAssignment / packerAssignment Records

### Problem
When a picker or packer was deactivated (soft-deleted) via `DELETE /users/:id`, their incomplete assignments (`completedAt: null`) were NOT deleted from the `PickerAssignment` / `PackerAssignment` tables. The orders were correctly moved back to INBOUND / PICKER_COMPLETE, but the assignment rows remained. This is a data integrity issue that could cause subtle bugs in future queries.

### Root Cause
`deleteUser` in `userService.ts` correctly reassigned orders but did not call `deleteMany` on the assignment records afterwards.

### Fix
After reassigning orders, delete the now-orphaned incomplete assignments:
```ts
// For PICKER
await tx.pickerAssignment.deleteMany({
  where: { pickerId: userId, completedAt: null },
})

// For PACKER
await tx.packerAssignment.deleteMany({
  where: { packerId: userId, completedAt: null },
})
```

### How to delete test users from live DB (one-time cleanup)
SSH into the Vultr server, then run:
```bash
docker exec dom_backend node -e "
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
p.user.updateMany({
  where: { username: { in: ['picker1_test','picker2_test','picker3_test','picker11','packer1_test','packer2_test','packer3_test'] } },
  data: { isActive: false }
}).then(r => { console.log('Deactivated:', r.count); return p.\$disconnect(); }).catch(e => { console.error(e); process.exit(1); });
"
```

### Rule
When deactivating a user, ALWAYS clean up their incomplete assignment records in the same transaction. Orphaned assignments with `completedAt: null` are invisible to the UI (filtered by `isActive: true`) but pollute the DB and can cause subtle bugs.

### Files Affected
- `backend/src/services/userService.ts` — `deleteUser()`

---

## [2026-04-17] Packer Scan — Final Fix Summary

The "not found" scan issue was resolved across multiple steps. All steps work together:

| Step | File | What it does |
|---|---|---|
| 1 | `packerService.ts` | `buildCandidates()` — tries all URL query params + path segments |
| 2 | `packerService.ts` | Bidirectional SQL substring fallback |
| 3 | `packer.ts` route | `GET /packer/orders` returns real PICKER_COMPLETE list |
| 4 | `PackerMobile.tsx` | Client-side queue match — compares scan against known queue before hitting API |
| 5 | `PackerMobile.tsx` | Debug card — shows Scanned vs Queue values on failure |

---

## [2026-04-17] Packer Scan — "Not Found" Error (URL Barcode Format Mismatch)

### Problem
Packer got "Order not found in this tenant" when scanning a barcode.

### Root Cause
**Two different barcode formats colliding:**
- Inbound admin enters a plain tracking number → stored in DB as `JT1234567890`
- Packer camera reads a QR code that encodes a full URL (e.g. `https://track.jtexpress.ph/tracking?logisticNo=JT1234567890`)

The old `extractTrackingNumber` only checked `?tn=` and `?tracking=` query params. Carriers like J&T, Shopee, etc. use different param names (`logisticNo`, `billCode`, `no`). When no matching param was found, it fell back to the last URL path segment — returning `TRACKING` instead of the actual tracking number.

### Fix (3 layers)

**1. Frontend — improved `extractTrackingNumber` (`PackerMobile.tsx`):**
- Tries every URL query param using an alphanumeric heuristic (`[A-Z0-9]{6,40}`)
- Applies same heuristic to URL path segments in reverse order
- Sends raw barcode value as `raw` param to backend

**2. Backend — `buildCandidates()` (`packerService.ts`):**
- Builds a deduplicated candidate list from extracted `tn` + raw barcode
- If raw is a URL: all query param values + all path segments are added as candidates
- Each candidate is tried for exact match in sequence

**3. Backend — Bidirectional substring fallback (raw SQL):**
```sql
AND (
  ${candidate} ILIKE '%' || tracking_number || '%'
  OR tracking_number ILIKE '%' || ${candidate} || '%'
)
```
Handles: URL barcode contains DB tracking number, or DB has longer format than what was scanned.

**Error message improvement:**
Shows `extracted: "XYZ" | raw: "https://..."` when values differ — format mismatch is immediately visible.

### Files Affected
- `frontend/src/pages/PackerMobile.tsx` — `extractTrackingNumber`, `handleScan`, `?raw=` param
- `backend/src/services/packerService.ts` — `buildCandidates()`, `findOrderForPacking()`, `diagnoseTracking()`
- `backend/src/routes/packer.ts` — accepts `raw` query param, passes to both service functions

### Rule
When working on packer scan: always check how inbound stores tracking numbers (plain text vs URL) and what barcode type the packer reads. Never assume a single format — always use bidirectional search + multi-candidate approach.

---

## [2026-04-17] Packer Scan — Client-Side Queue Match (Backend Search Bypass)

### Problem
Even after the backend multi-strategy search, scanning still returned "not found". The queue showed 2 orders but no search strategy matched.

### Root Cause
Relying solely on the backend was insufficient: deployment delays, SQL enum cast issues, or a completely different barcode format could cause all server-side searches to fail.

### Fix
Added client-side queue match in `handleScan` — runs before the API call:

```ts
const queue = queueData?.orders ?? []
const clientMatch = queue.find(order => {
  const dbTn = order.trackingNumber.toUpperCase()
  return (
    dbTn === tnUp ||
    dbTn === rawUp ||
    rawUp.includes(dbTn) ||   // barcode URL contains tracking number
    dbTn.includes(tnUp) ||    // DB has longer format, scan has shorter
    tnUp.includes(dbTn)       // scan has longer format, DB has shorter
  )
})
if (clientMatch) { setPendingOrder(clientMatch); return }
```

Error message also shows `queue: [tn1, tn2]` — scan value and DB values visible side by side, format mismatch detected instantly.

### Rule
- Even if backend search fails, always do client-side bidirectional match against the local queue cache
- Always show both the scanned value and queue tracking numbers in the error message
- `GET /packer/orders` must always return real PICKER_COMPLETE orders (never an empty array)

### Files Affected
- `frontend/src/pages/PackerMobile.tsx` — `handleScan` client-side match + queue hint in error
- `backend/src/routes/packer.ts` — `/orders` endpoint returns real queue

---

## [2026-04-17] Packer Scan — Debug Card (Scanned vs Queue Visualization)

### Problem
Client-side match also failed — there was no common substring between the scanned value and the queue tracking numbers. The cause was not visible.

### Fix
A yellow debug card appears after a failed scan showing:
- `Scanned:` — extracted tracking number
- `Raw:` — raw barcode value (full URL if applicable)
- `Queue:` — DB PICKER_COMPLETE tracking numbers line by line

This card made the format mismatch immediately visible. Once the mismatch was diagnosed and the client-side match corrected, scanning worked.

### Rule
For packer scan issues: activate the debug card first, compare Scanned vs Queue values.

### Files Affected
- `frontend/src/pages/PackerMobile.tsx` — `debugInfo` state + yellow debug card UI

---

## [2026-04-14] Packer Mobile — List Was Full, Should Be Empty

### Problem
When logged in as `PACKER`, the mobile page listed all tenant's `PICKER_COMPLETE` orders. Expected behavior: empty list — packer self-assigns by scanning.

### Root Cause
`GET /packer/orders` returned all `PICKER_COMPLETE` orders via `getAllPickerCompleteOrders(tenantId)`. No per-user filtering.

### Fix
1. `GET /packer/orders` → returns actual PICKER_COMPLETE queue (later changed from always-empty)
2. New endpoint: `GET /packer/find?tn=TRACKING_NUMBER` — looks up a PICKER_COMPLETE order by tracking number
3. `PackerMobile.tsx` updated: list query removed, scan triggers `/packer/find`, confirm dialog shows order details, confirm → `/packer/complete`

### Files Affected
- `backend/src/services/packerService.ts` — `findOrderForPacking()` added
- `backend/src/routes/packer.ts` — `/find` endpoint added
- `frontend/src/pages/PackerMobile.tsx` — list query removed, `handleScan` does API lookup

---

## [2026-04-14] Picker/Packer Mobile — Camera Scan Feature Added

### Change
`enableCamera` prop added to `ScanInput`. When active, shows a camera button that reads barcodes via `@zxing/browser`.

### Files Affected
- `frontend/src/components/ScanInput.tsx` — camera button + overlay + BrowserMultiFormatReader
- `frontend/src/pages/PickerMobile.tsx` — `enableCamera` prop enabled
- `frontend/src/pages/PackerMobile.tsx` — `enableCamera` prop enabled

---

## [2026-04-14] InboundScan + PickerAdminScan — Sign Out Button Added

### Change
Sign Out button added to the top-right corner of both scan pages.

### Files Affected
- `frontend/src/pages/InboundScan.tsx`
- `frontend/src/pages/PickerAdminScan.tsx`

---

## [2026-04-13] Philippines Inbound Panel — Scan Pop-up Not Appearing (WebSocket Nginx Fix)

### Problem
INBOUND_ADMIN scanning a waybill on mobile did not trigger a pop-up on the desktop Inbound panel. Same flow worked in Canada. Both devices on the same WiFi.

### Root Cause
**Missing `/socket.io/` location block in Nginx.**

Pop-up flow:
1. Phone → `POST /api/orders/handheld-scan` → Backend
2. Backend → `io.to('user:X').emit('order:handheld-scan', ...)` → Socket
3. Desktop → `wss://domwarehouse.com/socket.io` → WebSocket → Pop-up

Desktop connects to Nginx at `https://domwarehouse.com`. Nginx only proxied `/api/` to the backend. Without a `/socket.io/` location block, the WebSocket connection was never established — desktop could not join the `user:X` room — no pop-up.

In Canada, HTTP IP (`http://45.32.107.63:5173`) was used, bypassing Nginx and hitting Vite's dev server proxy directly (`ws: true`), so WebSocket worked.

### Fix

**1. Add `/socket.io/` location block to Nginx:**

```bash
sudo nano /etc/nginx/sites-available/dom
```

Add to the HTTPS server block:

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

**2. Check `CORS_ORIGIN` env var:**

```bash
docker exec dom_backend printenv CORS_ORIGIN
```

If `https://domwarehouse.com` is missing, add to `/opt/dom/.env`:

```
CORS_ORIGIN=https://domwarehouse.com,https://www.domwarehouse.com
```

```bash
docker compose -f /opt/dom/docker-compose.yml restart backend
```

**3. `vite.config.ts` — permanent `allowedHosts` fix:**

```typescript
server: {
  allowedHosts: ['domwarehouse.com', 'www.domwarehouse.com'],
}
```

---

## [2026-04-11] Modal / Fixed Overlay Not Rendering

### Problem
A `position: fixed` overlay/modal component renders but is not visible.

### Root Cause
If any parent element has `transform`, `filter`, `will-change`, or `perspective` CSS properties, `position: fixed` children are contained within that element instead of the viewport. Also, `overflow: hidden` on a parent can clip fixed children.

### Fix
Use `createPortal` to render the modal directly under `document.body`:

```tsx
import { createPortal } from 'react-dom'

export default function Modal({ onClose }: Props) {
  const modal = (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9999 }}>
      {/* modal content */}
    </div>
  )
  return createPortal(modal, document.body)
}
```

### Used In This Project
- `frontend/src/components/BulkScanModal.tsx`

---

## [2026-04-11] White Page (React Crash)

### Problem
App opens but shows a completely white page.

### Possible Causes & Checks

**1. Vite cache issue**
```bash
rm -rf frontend/node_modules/.vite
cd frontend && npx vite --force
```

**2. Multiple Vite processes running**
```bash
npx kill-port 5173 5174 5175 3000
taskkill /F /IM node.exe   # Windows
```

**3. Stale browser cache**
Hard refresh with `Ctrl+Shift+R`.

**4. Temporary error handler to capture runtime errors**
Add to `main.tsx`, note the error, then remove:
```tsx
window.addEventListener('error', (e) => {
  document.getElementById('root')!.innerHTML =
    `<pre style="color:red;padding:20px">[Error] ${e.message}\n${e.filename}:${e.lineno}</pre>`
})
```

**5. Shared package not built**
If `@dom/shared` was updated, always rebuild:
```bash
cd shared && npm run build
```
Then clear Vite cache (Vite caches the old dist):
```bash
rm -rf frontend/node_modules/.vite
```

---

## [2026-04-11] Shared Package — Adding a New Export

### Problem
New export added to `shared/src/index.ts` but backend or frontend can't find it.

### Fix (in order)
```bash
# 1. Build shared package
cd shared && npm run build

# 2. Prisma generate if schema changed
cd backend && npx prisma db push && npx prisma generate

# 3. Clear frontend Vite cache
rm -rf frontend/node_modules/.vite

# 4. Restart services
cd backend && npm run dev
cd frontend && npx vite
```

---

## [2026-04-11] Docker — Shared Export Not Found (SyntaxError: does not provide an export named 'X')

### Problem
New export added to `@dom/shared`. Works locally but Docker shows white page + error:
```
SyntaxError: The requested module '/node_modules/.vite/deps/@dom_shared.js?v=...'
does not provide an export named 'CARRIER_LABELS'
```

### Root Cause
The Docker image build compiled `shared/dist`. The new export was added locally and rebuilt, but the container's `node_modules/@dom/shared/dist/` still has the old version. Vite cached the old dist.

**Note:** Vite cache in Docker is at `/app/frontend/node_modules/.vite/` — not `/app/node_modules/.vite/`.

### Fix
```bash
# 1. Rebuild shared inside container
docker exec dom_frontend sh -c "cd /app && npm run build --workspace=shared"

# 2. Clear correct Vite cache
docker exec dom_frontend sh -c "rm -rf /app/frontend/node_modules/.vite/deps"

# 3. Restart frontend container
docker restart dom_frontend

# 4. Hard refresh browser
# Ctrl+Shift+R
```

### Permanent Fix
After changing `shared/src`, rebuild the Docker image:
```bash
docker compose build frontend && docker compose up -d frontend
```

---

## [2026-04-11] Docker — Backend Route / Prisma Client Stale

### Problem
New route or Prisma schema field added to backend. Works locally but Docker returns 404 or "Unknown argument".

### Root Cause
Docker container can have stale code in three layers:
1. `backend/dist/` — TypeScript not recompiled, old JS running
2. `node_modules/@prisma/client` — `prisma generate` not run
3. `node_modules/@dom/shared/dist/` — shared package not updated

### Fix (in order)
```bash
# 1. Build shared locally
cd shared && npm run build

# 2. Copy shared dist into container
docker cp shared/dist/. dom_backend:/app/node_modules/@dom/shared/dist/

# 3. Compile backend locally
cd backend && npm run build

# 4. Copy new dist into container
docker cp backend/dist/. dom_backend:/app/backend/dist/

# 5. Regenerate Prisma client if schema changed
docker cp backend/prisma/schema.prisma dom_backend:/app/backend/prisma/schema.prisma
docker exec dom_backend sh -c "cd /app/backend && npx prisma generate"

# 6. Restart backend
docker compose restart backend
```

### Permanent Fix
After every backend change:
```bash
cd backend && npm run build
docker cp backend/dist/. dom_backend:/app/backend/dist/
docker compose restart backend
```

---

## [2026-04-11] Rate Limiter Triggered — Page Won't Load (429)

### Problem
Backend returns `Too many requests. Please slow down.` for all requests. Orders, stats, and other data fail to load.

### Root Cause
Two compounding issues:
1. **Bulk action `Promise.all`**: All selected orders fired N simultaneous requests. 50 orders = 50 concurrent requests → rate limit exceeded.
2. **Aggressive polling**: Each page polled multiple endpoints every 3–5 seconds. With multiple tabs/users, this multiplied fast (3 tabs × 3 queries × 12/min = 108 req/min → exceeded limit of 100).

### Fix (3 layers)

**1. Backend: Single bulk endpoint**
```
POST /picker-admin/bulk-complete   { orderIds[], pickerId }
POST /picker-admin/bulk-unassign   { orderIds[], pickerId }
```
Backend processes sequentially in a for-loop — one HTTP request for N operations.

**2. Backend: Rate limit raised**
`backend/src/plugins/rateLimit.ts` → `max: 100` → `max: 500`

**3. Frontend: Polling interval extended**
All `refetchInterval: 3000 / 5000` → `10_000` ms. Socket handles real-time updates; polling is just a fallback — 10s is sufficient.

### Files Affected
- `backend/src/services/pickerAdminService.ts` — `bulkCompleteOrders`, `bulkUnassignOrders`
- `backend/src/routes/pickerAdmin.ts` — `/bulk-complete`, `/bulk-unassign`
- `backend/src/plugins/rateLimit.ts` — max: 500
- `frontend/src/pages/PickerAdmin.tsx` — `executeBulkAction` single API call
- `frontend/src/pages/Inbound.tsx`, `Outbound.tsx`, `PackerAdmin.tsx` — polling 10s

---

## [2026-04-11] `docker cp` Followed by Backend Crash Loop (exit code 0)

### Problem
Updated dist files with `docker cp backend/dist/... dom_backend:/app/...`. Then ran `docker compose up -d backend` — container entered a constant restart loop (exit code 0).

### Root Cause
`docker compose up` recreates the container from the image — changes made via `docker cp` are lost. A missing JS file at runtime can cause a silent exit instead of a visible error.

### Fix
Always **rebuild the image** when backend code changes:
```bash
docker compose build backend
docker compose up -d backend
```

`docker compose restart` restarts the existing container (cp changes preserved).
`docker compose up` creates a new container (cp changes lost) — be careful.

---

## [2026-04-13] Vultr Server — Domain + HTTPS + iPhone Camera Setup

### Problem
- iPhone Safari does not allow camera access over `http://`
- App was running at `http://45.32.107.63:5173`, camera wouldn't open on iPhone

### Fix

#### 1. Buy Domain (Namecheap)
- Purchase domain (e.g. `domwarehouse.com`)
- **Advanced DNS** → **Host Records** → add two A Records:
  - `@` → `45.32.107.63`
  - `www` → `45.32.107.63`
- DNS propagation takes 10–30 min, verify with `nslookup domwarehouse.com 8.8.8.8`

#### 2. Install Nginx + Certbot
```bash
sudo apt update && sudo apt install nginx -y
sudo apt install certbot python3-certbot-nginx -y
```

#### 3. Write Nginx Config
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

#### 4. Open Firewall Ports (IMPORTANT)
```bash
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw allow 22/tcp
sudo ufw reload
```

#### 5. Obtain SSL Certificate
```bash
sudo certbot --nginx -d domwarehouse.com -d www.domwarehouse.com
```

#### 6. Vite `allowedHosts` Setting (IMPORTANT)
```ts
server: {
  allowedHosts: ['domwarehouse.com', 'www.domwarehouse.com'],
}
```

### Common Errors

| Error | Cause | Fix |
|---|---|---|
| `certbot: connection refused` | UFW port 80 closed | `sudo ufw allow 80/tcp && sudo ufw reload` |
| `certbot: NXDOMAIN` | DNS not propagated yet | Wait 10–30 min, check with `nslookup` |
| `Blocked request. This host not allowed` | Vite allowedHosts missing | Add domain to vite.config.ts, restart container |
| `403 Forbidden` | Nginx default config conflict | `sudo rm /etc/nginx/sites-enabled/default` |
| `This site can't be reached` | UFW port 443 closed | `sudo ufw allow 443/tcp && sudo ufw reload` |

### Mobile URL (All Roles)
```
https://domwarehouse.com/scan
```

| Role | Redirected Page |
|---|---|
| ADMIN / INBOUND_ADMIN | `/inbound-scan` |
| PICKER_ADMIN | `/picker-admin-scan` |
| PICKER | `/picker` |
| PACKER | `/packer` |

---

## [2026-04-11] Handheld Socket Event Lost — Page Closed When Send Is Pressed

### Problem
When phone (InboundScan / PickerAdminScan) sends "Send to Desktop", backend emits a socket event. If the desktop Inbound/PickerAdmin page is not open at that moment, the event is lost — nothing happens when the page opens later.

### Root Cause
Socket events are fire-and-forget. If the listener is not connected at that moment, the event is dropped — it is not queued.

### Fix
Two-layer approach:

**1. Backend — write to Redis (TTL 5 min):**
- `POST /orders/handheld-scan` → `redis.setex('pending:handheld:single:{userId}', 300, tn)`
- `POST /orders/handheld-bulk-scan` → `redis.setex('pending:handheld:bulk:{userId}', 300, JSON.stringify(tns))`
- New GET endpoints: `/orders/pending-handheld` and `/picker-admin/pending-staged`

**2. Frontend — check Redis on page mount:**
```tsx
useEffect(() => {
  api.get('/orders/pending-handheld').then(res => {
    if (res.data.bulk?.length > 0) { setBulkInitialTNs(res.data.bulk); setShowBulkModal(true) }
    else if (res.data.single) { setPendingScan(res.data.single) }
  }).catch(() => {})
}, [])
```

When the socket event arrives, Redis is cleared first to prevent double display.

### Files Affected
- `backend/src/routes/orders.ts` — Redis write + `GET /pending-handheld`
- `backend/src/routes/pickerAdmin.ts` — Redis write + `GET /pending-staged`
- `frontend/src/pages/Inbound.tsx` — mount effect
- `frontend/src/pages/PickerAdmin.tsx` — mount effect

---

## [2026-04-11] Inbound — Duplicate Waybill Opens QuickScanModal

### Problem
Scanning a waybill already in the inbound list opened the QuickScanModal. User selected carrier/shop and hit Confirm, then got a 409 from the backend. Unnecessary UX step.

### Fix
Check `allOrders` list before opening the modal:
```tsx
<ScanInput
  onScan={(tn) => {
    const exists = allOrders.some(o => o.trackingNumber.toUpperCase() === tn.trim().toUpperCase())
    if (exists) { setScanFeedback({ type: 'error', message: `Already in inbound list: ${tn}` }); return }
    setPendingScan(tn)
  }}
/>
```
Backend 409 stays as a safety net for edge cases.

### Files Affected
- `frontend/src/pages/Inbound.tsx`

---

## [2026-04-11] PickerAdminScan Bulk — Non-Existent Waybill Added to List

### Problem
In bulk mode, a scanned waybill was added to the list immediately. On "Send", backend returned not_found. User didn't realize the wrong item was added.

### Fix
In bulk mode, each scan immediately calls `/picker-admin/scan`:
- Success → add to list with `status: staged`
- Error (404/409) → beep + vibrate + error message, **not added to list**

### Files Affected
- `frontend/src/pages/PickerAdminScan.tsx`

---

## [2026-04-11] Bulk Scan — Carrier and Shop Name Required

### Behavior
- Carrier and Shop Name are both **required** (not optional)
- If either is empty after scanning, a yellow warning message is shown
- Confirm button stays disabled until both are filled
- Backend validates with `z.string().min(1)` → returns 400

### Files Affected
- `frontend/src/components/BulkScanModal.tsx` — `canConfirm` condition, label, warning message
- `backend/src/routes/orders.ts` — `BulkScanSchema.shopName` no longer optional

---

## General Rules

- Always use `createPortal(modal, document.body)` for modal/overlay components
- Always run `npm run build` in `shared/` after any update to `@dom/shared`
- Multiple Vite processes running can cause white page or stale code
- Run `npx tsc --noEmit` after every change
- For backend Docker changes: `docker compose build backend && docker compose up -d backend`
- Never use `Promise.all(allIDs)` for bulk API operations — add a single bulk endpoint on the backend
- Frontend polling: if socket handles real-time updates, `refetchInterval` should be at least `10_000` ms
- All user-list Prisma queries must include `isActive: true` — user deletion is soft delete
- All cron schedules must use `tz: 'Asia/Manila'` with local Manila time — never convert to UTC manually
