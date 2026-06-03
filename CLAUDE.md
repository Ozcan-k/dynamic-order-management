# Claude Code — Proje Kuralları

## Branch Yapısı

| Branch | Amaç |
|---|---|
| `test` | Tüm yeni kodlar buraya push edilir |
| `main` | Sadece test'te onaylanan kod gelir — kullanıcı izniyle |

---

## GitHub Workflow — Her Değişiklikte (ZORUNLU)

**Remote URL:** `https://github.com/Ozcan-k/dynamic-order-management`
Bu URL'i her seferinde sormadan direkt kullan.

### Adım adım:

**1. Kodu `test` branch'ine push et:**
```bash
git checkout test
git add <dosyalar>
git commit -m "feat/fix: açıklama"
git tag vX.Y.Z-test
git push origin test --tags
```

**2. Kullanıcıdan `main`'e merge izni iste.**

**3. İzin gelince `main`'e merge et:**
```bash
git checkout main
git merge test
git push origin main --tags
```

### Versioning kuralı (Semantic Versioning):

| Değişiklik türü | Versiyon |
|---|---|
| Küçük düzeltme, tek dosya | PATCH → v1.0.1 |
| Yeni özellik, phase tamamlandı | MINOR → v1.1.0 |
| Büyük mimari değişiklik | MAJOR → v2.0.0 |

**Mevcut versiyon:** `v2.52.0` — **Accounting modülü v2 — line-item'lı invoice/purchase yeniden tasarımı.** Sales→**Invoices** (stat kartları Total/Unpaid/Collected/This Month + filtre + tablo Invoice#/Record Date/Customer/Due/Amount/Status), **+New Invoice** geniş form-modal: Individual/Corporation seçimi, Customer (combo +New), oto `INV/001`, Date of Issue/Due, **Sales Agent** (dom SALES_AGENT kullanıcıları), **Sales Channel**, Paid/Unpaid→Paid'de Payment Method (Gcash/Bank koşullu), **çok satırlı line items** (Item combo + Create New / Desc / Qty / Unit / Disc% / Tax% / Total + New Row + Subtotal/Discount/Tax/Total). Expenses→**Purchases** (aynı yapı, **New Vendor** butonu, oto `PUR/001`, Invoice# input, Country, Paid By, line item'da **Category** combo). **Contacts** = müşteri arşivi (sales'te girilenler + sales agent adı otomatik yakalanır) + Vendor listesi + **Company Profile butonu** (modal; ayrı sayfa kalktı). **Dashboard→Sales/Expense Report** (ay date-picker + 2 sekme + günlük bar grafik + o ayın listeleri). Yeni tablolar: AccSale+**AccSaleItem**, AccExpense+**AccExpenseItem**, **AccVendor** (eski AccSupplier yerine), **AccItem**+**AccCategory** (yönetilen kataloglar, Create New ile kalıcı). Yeni enumlar AccPaymentStatus(PAID/UNPAID)/AccCustomerType/AccSaleChannel; AccPaymentMethod+CREDIT_CARD. Customer/item/category serbest yazıldığında backend otomatik arşive/kataloga ekler. Para birimi ₱ PHP. Şema force-reset gerektirdi ama sadece `acc_*` tabloları + eski acc enumları manuel drop edilip `db push` yapıldı (dom order verisine DOKUNULMADI). tsc+vite build green, E2E (line-item math 257.60, validation 400, PDF, report, auto-capture) + browser smoke geçti. (Önceki: v2.51.0 — Accounting modülü ilk sürüm) (Sidebar'da Incident Report'un altında, alt-menülü). Order pipeline'a/mevcut tablolara **hiç dokunmaz**: kendi `acc_*` tabloları (AccCustomer/AccSupplier/AccSale/AccExpense/AccCompanyProfile/AccInvoice/AccCounter), kendi enum'ları (`AccPaymentMethod/AccSalesStatus/AccCountry/AccPaidFrom`), tenant-scoped. Yeni rol **`ACCOUNTANT`** (UserRole'a additive; Settings → Administration). Backend `routes/accounting.ts` (`/accounting` prefix): Customers/Suppliers/Sales/Expenses CRUD + Company profile (logo base64 in DB) + Invoice (PDFKit, `INV-YYYY-NNNN`) + Dashboard. Frontend `pages/accounting/*` (Dashboard/Sales/Expenses/Contacts/Company) + `components/shared/ComboBox.tsx` (aranabilir dropdown + "Others" + auto-fill) + `styles/accounting.css` (`.acc-*` namespaced). Erişim: `ADMIN` + `ACCOUNTANT`. Sale müşteri bilgisini snapshot tutar. Para birimi ₱ PHP. `/accounting` prefix'i vite.config + nginx.conf'a eklendi. Şema additive `db push` (data loss yok). Backend + frontend `tsc` green, frontend `vite build` green, E2E + browser smoke geçti. (Önceki: v2.50.0 — OUTBOUND_ADMIN salt-okunur Inbound/Picker/Packer panelleri)

### Kesinlikle commit edilmeyecekler:
- `.env`
- `node_modules/`
- `dist/` ve `build/`
- `.claude/`

---

## Geliştirme Kuralları

- Değişiklik yapmadan önce kullanıcıdan izin al.
- Phase'leri sırayla yap: Phase 1 → 2 → ... → 14, ek olarak DC + 10b + SALES (ARCHITECTURE.md Section 15). Şu an Phase 12 partial, 13-14 henüz başlanmadı.
- Her phase kodu önce `test`'e gider, kullanıcı onayı sonrası `main`'e geçer.
- Her push öncesi `git pull origin <branch> --rebase` ile remote'u kontrol et.
- **Retention politikası:** Order ve child tabloları (OrderStatusHistory, PickerAssignment, PackerAssignment, SlaEscalation) 180 gün sonra hard-delete olur (`backend/src/services/archiveService.ts`). Stock tabloları (`StockItem`, `StockMovement`) bu politikadan **muaftır** ve history olarak süresiz tutulur. Stock'a retention/cleanup logic'i EKLEMEYİN — Stock Out raporu için tüm USED movements'in indefinitely queryable kalması şart.
