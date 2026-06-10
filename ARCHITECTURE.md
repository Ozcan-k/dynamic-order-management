# Dynamic Order Management System — Architecture Document

> **Version:** 2.67.0  
> **Date:** 2026-06-09  
> **Status:** **v2.67.0 (test → main pending deploy)** — **Employee Schedule → Employees tab extended: contact/personal fields + active/inactive lifecycle.** Each employee gains optional **Contact Number, Email, Address, Birthday, Emergency Contact Name, Emergency Contact Number** (all additive nullable). New employees default **Active** (department-grouped list, now with a Contact column). An **active/inactive lifecycle**: each active row has **Set Inactive** → a modal requires a **Leave Date** → the employee moves to a separate **"Inactive / Former Employees"** table (ID/Name/Department/Start Date/**Leave Date**/Actions); inactive rows offer **Reactivate** (clears leave date). The Edit modal carries all fields + a Status select (Inactive reveals a required Leave Date). Inactive employees are **hidden from the Schedule grid** (`getWeek` filters `isActive:true`) but still appear in the **Report** for periods they have entries (history preserved). Schema: `EmpEmployee` +6 nullable fields + `isActive Boolean @default(true)` + `leaveDate Date?` (additive `db push`). Backend `EmployeeBody` (+fields, refine "leaveDate required when inactive") + service `buildData`; shared `EmpEmployeeDTO` extended; frontend `EmployeesTab` rewritten (extended add form + active grouped list + inactive list + DeactivateModal + EditModal). Hard delete (cascade) preserved. shared + backend `tsc` and frontend `tsc -b && vite build` green; **local `db push` PENDING** (dev pg down → applies on CD deploy). Previously **v2.66.0** — **New Employee Schedule module (Section 7.14) — independent staff attendance scheduler under Incident Report (ADMIN + WAREHOUSE_ADMIN only).** Single route `/employee-schedule` with a Warehouse-Report-style 3-tab bar (Schedule · Employees · Report). **Schedule:** weekly Sunday→Saturday grid (department bands + left `#ID + name + weekly-hours clock` column), each day cell a colour-coded attendance `<select>` (Present 8h / Half Day 4h / Absent / Vacation / Sick / Maternity = 0h; blank "—" = unscheduled) with a conditional OT `<select>` (0–5h) on Present; autosaves per cell (optimistic). **Employees:** add form (Department → First/Last name → Start Date) + department-grouped list (`#101…` auto `empNo`, Edit/Delete; hard delete cascades schedule rows). **Report:** Weekly|Monthly toggle, summary cards, department-grouped per-employee table (Present/Half/Absent/Vacation/Sick/Maternity/OT/Worked Days/Total Hours) with subtotals + grand total + **CSV & PDF export** (PDFKit landscape). Own `emp_*` tables (`EmpEmployee`/`EmpSchedule`/`EmpCounter`) + enums `EmpDepartment`/`AttendanceStatus`, tenant-scoped, NO FKs into existing models — order pipeline untouched. Backend `routes/employeeSchedule.ts` (prefix `/employee-schedule`, every route `requireRole(ADMIN, WAREHOUSE_ADMIN)`) + `services/employeeScheduleService.ts` + `services/employeeSchedulePdfService.ts`; `/employee-schedule` added to `vite.config.ts proxyRoutes` + `nginx.conf`. shared + backend `tsc` and frontend `tsc -b && vite build` green; **local `db push` PENDING** (dev pg down → applies on CD deploy). Plan: `EMPLOYEE_SCHEDULE.md`. Previously **v2.65.0** — **Incident Report: multiple documents per incident + delete + duplicate guard; incidents are historical (retention-exempt).** New IncidentDocument table (incidentId FK cascade, filePath, mime, originalName, uploadedAt) replaces the single signed_file_* columns; the legacy single file is lazily migrated into the first document so old uploads stay visible. Backend listIncidentDocuments/addIncidentDocument (rejects same name+same mime re-upload with 409)/readIncidentDocument/deleteIncidentDocument; deleteIncident now unlinks every document file. Routes GET/POST /incidents/:id/documents and GET/DELETE /incidents/:id/documents/:docId (10MB + MIME guard + friendly 413). Frontend ViewIncidentModal shows a document list (download + delete X), repeatable upload. Retention confirmed: archiveService and all jobs touch only order tables — incidents (Incident, IncidentDocument) are never auto-purged; only ADMIN/WAREHOUSE_ADMIN can manually delete an incident. Schema: IncidentDocument new table (additive, no data loss). Previously v2.64.0: **Accounting: Invoices renamed to "Sales" + invoice Note field/marker + new "Transactions" line-item ledger page.** (1) AccInvoices page title/subtitle/stat and the sidebar label become "Sales" (the "+ New Invoice" button is kept per request; documents stay "Invoice", numbers INV/...). (2) AccSale.note (String? @db.Text, additive — db push safe): shared type, saleSchema, create/update wired; InvoiceForm gets a Note textarea under Items; the Sales list shows an amber note icon next to the invoice number when a note exists. (3) New /accounting/transactions page: Sales | Expenses tabs, DateRangePicker, one row PER line item with a total — backed by read-only listSalesLedger/listExpenseLedger + GET /accounting/ledger/sales|expenses. Order pipeline untouched. Schema change: AccSale.note (additive, no data loss). Previously v2.63.2: **FIX: Incident Report signed-file upload — unfriendly error on large files.** @fastify/multipart@8 (throwFileSizeLimit defaults true) makes file.toBuffer() THROW FST_REQ_FILE_TOO_LARGE once a file passes limits.fileSize (10MB), so the route's truncated check was dead code and a raw 413 propagated (frontend showed axios's generic "Request failed with status code 413"). Phone photos / scanned signed PDFs easily exceed 10MB, so it triggered often. Fix: backend wraps toBuffer() in try/catch and returns a clean 413 with a human message (MAX_SIGNED_MB=10); frontend ViewIncidentModal validates size + MIME before upload and now surfaces the backend { error } message. Also PERF: accounting Invoices/Expenses lists no longer join every row's line items on the list query (serSale/serExpense tolerate a missing items relation → []); useSales/useExpenses use keepPreviousData + staleTime and form reference data (customers/items/categories/stores/agents) is cached. No schema change. Previously v2.63.1: **HOTFIX: Picker/Packer Admin In Progress + daily-completed showed 0.** v2.63.0 services returned inProgressTotal + completedTodayTotal, but the /stats route handlers in routes/pickerAdmin.ts and routes/packerAdmin.ts destructured a subset ({ stats, returnedCount, totalCompleted }) and only re-sent those — the new fields never reached the client, so the frontend rendered 0. Both handlers now forward the whole service result. Backend-only; no frontend/schema change. Previously v2.63.0: **Inbound / Picker / Packer header counters redefined.** (1) Inbound page "Inbound" card now counts orders SCANNED that day (order.createdAt, any status/archival) with a Today/Yesterday/Custom date picker, via new getInboundScannedCount + GET /orders/inbound-count. (2) Picker Admin: In Progress = orders assigned to pickers (PICKER_ASSIGNED + PICKING), equal to the sum of the workload cards (getPickerStats.inProgressTotal); Total Completed = pickers' completions today (completedTodayTotal, resets at Manila midnight). (3) Packer Admin: new In Progress card = orders assigned to packers (PACKER_ASSIGNED + PACKING, equal to workload sum); Total Packed = packers' completions today (resets daily). Status-based queues (In Queue / In Progress / Waiting to Pack) carry over automatically; daily totals reset via completedAt >= getManilaStartOfToday() (no cron). No schema change. Previously v2.62.1: **Old Orders drill-down: Assigned Picker + Assigned Packer columns; funnel badge text simplified (dropped "incl." prefix → just "N old orders").** The Old Orders sub-page now splits the single "Packed By" column into **Assigned Picker** and **Assigned Packer** (the users who completed picking / packing); backend `getOldOrdersList` selects the completed `PickerAssignment` username alongside the packer, `OldOrderRow.packedBy` → `assignedPicker` + `assignedPacker`. Read-only; order pipeline untouched. Previously v2.62.0: **Outbound Report: clickable "Old Orders" drill-down sub-page.** The funnel's "incl. N old orders" badge on the Outbound box is now a button that navigates, within the report, to `/outbound/report/old-orders?from=&to=` (Accounting's Invoice -> New-Page -> Back pattern; returns via "<- Back to Report"). The page reads the selected range from the query string and lists the backlog: Barcode (tracking) / Inbound Date / Packer Complete / Packed By (packer username) / Outbound Scan (Manila UTC+8; archived orders get an "archived" tag, missing fields show "--"). The list uses the SAME predicate as the funnel's oldOrders counter (in-house scan, packer-complete day < scan day, or order archived), so the row count matches the badge. New read-only backend `getOldOrdersList` + `GET /dispatch/old-orders` (ADMIN+OUTBOUND_ADMIN); orders fetched via `orderId in (...)`, packer username from the completed `PackerAssignment`. Never touches the order pipeline. New frontend `OldOrdersReport.tsx`, route, and `OldOrderRow`/`getOldOrders` API. No schema change. (Previously: **v2.61.0** — **Order Pipeline funnel: Outbound is now SCAN-driven, with an "Old Orders" backlog subset.** The funnel's Outbound stage no longer mirrors the `PACKER_COMPLETE → OUTBOUND` auto-advance; it counts only the in-house parcels the Outbound Admin actually scanned out in the range (`dispatchParcel.createdAt`). Packed-but-unscanned orders are excluded, so the old `Packer Complete = Outbound` (delta-0) coupling is gone. Of the scanned parcels, those whose order was packer-completed on an earlier Manila day than the scan day are counted as **old orders** (backlog packed before, shipped now) and shown as an amber "incl. N old orders" badge on the Outbound box; same-day packed-and-scanned is the normal flow. The former 5th stage "Dispatched" is removed (Outbound now *is* the scan count). Backend `getOrderPipeline` keeps stages 1-3 (OrderStatusHistory distinct) and computes stage 4 from in-house scans, comparing each parcel's `order.slaCompletedAt` Manila day to its scan day; orders are fetched via a separate `orderId in (...)` query since `DispatchParcel` has no `order` relation. Read-only — never touches the order pipeline. Frontend `OrderPipeline` type `dispatched`→`oldOrders`. No schema change. (Previously: **v2.60.0** — **Outbound Scan rejects an in-house parcel unless its order is packer-complete.** Previously the in-house outbound scan only checked that the order *exists* in our system; it would accept (and let you "Confirm & Save") a parcel the packer had never scanned complete. Now the order status must be `PACKER_COMPLETE` or `OUTBOUND` (packing-complete auto-advances `PACKER_COMPLETE → OUTBOUND` and the nightly archive keeps it `OUTBOUND`, so both mean "the packer scanned it"; including `OUTBOUND` preserves the [2026-06-01] fix that lets a parcel be dispatched days after packing). Any earlier status (INBOUND / PICKER_ASSIGNED / PICKING / PICKER_COMPLETE / PACKER_ASSIGNED / PACKING) is blocked with `Waybill X is not packer-complete yet — the packer must scan it before it can be dispatched. Outbound cannot accept it.` Two layers: (1) backend `dispatchService` — `lookupOrderForDispatch` now also returns `packerComplete: boolean` (instant block at scan time, before the confirm sheet) and `createDispatchParcel` IN_HOUSE branch throws a new `OrderNotPackerCompleteError` (→ route `409`) when the status is not dispatchable; (2) frontend `OutboundScan` blocks in the in-house lookup branch on `!packerComplete` (error beep + vibrate, confirm sheet never opens). Dispatch still **never touches the order pipeline** (read-only status check). No schema change. shared + backend + frontend `tsc` and `vite build` green. Previous: **v2.59.0 (test → main pending deploy)** — **Outbound Report pipeline funnel gains a 5th "Dispatched" stage.** The funnel is now `Inbound → Picker Complete → Packer Complete → Outbound → Dispatched`. Stages 1-4 come from the order pipeline (`OrderStatusHistory`, warehouse milestones — packing-complete auto-advances `PACKER_COMPLETE → OUTBOUND`, so those two track each other); the new **Dispatched** stage comes from the Dispatch module (in-house `dispatchParcel.createdAt`, same Manila range) and matches the header **In-house** counter exactly. Because "Outbound" (packing finished) and "Dispatched" (handed to courier) are different events on different timelines, Dispatched can exceed Outbound for a given range when backlog packed on earlier days ships now (not a bug — the funnel caption explains this). Backend `getOrderPipeline` returns `dispatched` (in-house dispatch count); frontend `OrderPipeline` type + a 5th funnel stage + clarified caption. No schema change. shared + backend + frontend `tsc` and `vite build` green. Previous: **v2.58.1 (test → main pending deploy)** — **Expense Report "Expenses by Category" main-category roll-up fix.** Categories were sometimes entered as a single flat name (e.g. "Packaging - Email Pouch" as the whole category name, with the subcategory field left empty → DB `categoryName="Packaging - Email Pouch"`, `subcategoryName=null`), so "Expenses by Category" showed each one as its own category. `getExpenseReport` gained `splitCat`, which normalises BOTH data shapes: it uses the real subcategory field when present, otherwise treats the part before a " - " inside the name as the **main category**. "Expenses by Category" now rolls everything up to the main category (and its % table is main-category based); "Expenses by Category & Subcategory" keeps the "Main - Sub" detail; the by-category chart's click-to-filter now matches on the raw stored value **or** the derived main/sub (`catMatch`/`subMatch`). A leftover null byte in the v2.58.0 combo key was also removed (now `JSON.stringify([main, sub])`). Note: differing spellings (e.g. "Packing" vs "Packaging") are not auto-merged — they remain distinct groups. No schema change. shared + backend + frontend `tsc` and `vite build` green. Previous: **v2.58.0 (test → main pending deploy)** — **Outbound Report order-pipeline funnel + Expense Report combined category/subcategory breakdown.** (1) **Outbound Report** gains an **Order Pipeline** funnel (Inbound → Picker Complete → Packer Complete → Outbound) driven by the page's selected date range; each stage counts the **distinct orders** that transitioned into it (from `OrderStatusHistory.changedAt`, Manila UTC+8), with delta chips between stages (amber = drop, green = parity, blue = gain) so you can see where parcels are still in flight. New read-only `getOrderPipeline` (dispatchService) + `GET /dispatch/pipeline` (ADMIN + OUTBOUND_ADMIN); it never touches the order pipeline, and since `OrderStatusHistory` is hard-deleted with the order at 180 days it covers the retention window. (2) **Expense Report:** the "Expenses by Subcategory" chart was removed and replaced by **"Expenses by Category & Subcategory"** — same layout as "by Category" (ranked horizontal bars + % table) but each row is a flattened category/subcategory: a category with no subcategory shows as its bare name (Investment, Office Expense), one with subcategories yields a row per sub labelled "Category - Subcategory" (e.g. "Packaging - Email Pouch"). Backend `getExpenseReport` now returns `byCategorySub` + `byCategorySubTotal` (country+vendor scope, all categories); the "Expenses by Category" chart and its category-level total table are unchanged. `BreakdownChart` gained a non-interactive mode. No schema change. shared + backend + frontend `tsc` and `vite build` green. Previous: **v2.57.0 (test → main pending deploy)** — **Mobile login fix + Outbound Report date parity + Accounting Report date-range/subcategory rework.** (1) **Mobile login:** the username inputs in `ScanLogin.tsx`/`Login.tsx` gained `autoCapitalize=none`/`autoCorrect=off`/`spellCheck=false` and the submit now trims the username — fixes the "Invalid credentials" that hit phones (while desktop worked) because the mobile keyboard auto-capitalised/autocorrected the username and `findUserByUsername` matches case-sensitively; applies to all roles. (2) **Outbound Report:** presets are now Today / Yesterday / Last 7 Days / Last 30 Days / Custom (default **Today**); Today/Yesterday are single-day (from=to) so picking the same day on the Outbound board and the Report yields identical Total/In-house/External counts (the backend Manila UTC+8 bounds were already consistent — only a single-day option was missing). (3) **Accounting Report → Expenses:** (a) the category filter is now sourced from the same managed catalog as the Expenses page (`useCategories('EXPENSE')`) plus a dependent **Subcategory** filter; (b) the "Expenses by Subcategory" chart now mirrors "by Category" (all subcategories as ranked horizontal bars + a % breakdown table, via a shared `BreakdownChart`); (c) Monthly/Yearly removed — **both Sales and Expenses tabs use the `DateRangePicker`** (All/This Month/Last Month/This Year/Custom, default This Month) with auto-bucketed trend charts (daily ≤92 days, monthly beyond). Backend: new `getSalesReport` (range) and a rewritten `getExpenseReport` (range + subcategory filter, new `bySubcategoryTotal`); date semantics match the Expenses list page (`dateWhere`) so report and list agree for the same range. New `GET /accounting/report/sales`, updated `GET /accounting/report/expenses` (from/to/subcategory). The old `/report` + `/report/yearly` + `getReport`/`getYearlyReport` are now unused by the frontend (left harmless in the backend). `DateRangePicker` now derives its active preset from the value (the default pill highlights correctly). No schema change. shared + backend + frontend `tsc` and `vite build` green. Previous: **v2.56.0 (test → main pending deploy)** — **Independent Sales/Expense catalogs + Expense subcategory + Invoice Store + Report subcategory chart + PDF header fix.** Category & item catalogs are now kind-scoped (SALE/EXPENSE independent) via new `AccCatalogKind` enum, `AccCategory.kind?`+`parentId?` (self-relation = subcategory) and `AccItem.kind?` (all additive nullable; legacy rows NULL = hidden from dropdowns). Line-item category is now **select-only** (managed `<select>`; free-text ComboBox removed) — added only via section-level "+ New Category" / "+ New Subcategory" popups; items stay combo+add. Expense gains a **category + dependent subcategory** dropdown (`AccExpenseItem.subcategoryId/Name`). Per-tenant **idempotent lazy seed** (`ensureCatalogs`, insert-based, no manual prod step): SALE 12 categories, EXPENSE 5 categories + subcategories, Store = `SALES_STORES` (17); legacy shared categories purged on first seed. New Invoice gets a **Store** dropdown (after Sales Channel) + "+ New Store" (`AccSale.storeName`), shown as a new **Store column** in the Invoices list. Report → Expenses adds an **"Expenses by Subcategory"** chart (`getExpenseReport` +`bySubcategory`). Expense list gains **Category + dependent Subcategory filters** (`items.some` relation). Invoice **PDF header fix**: a long company name no longer overlaps the address (address placed below name via PDFKit `doc.y` cursor; divider/INVOICE/meta/Bill-To made relative). New endpoints: `GET /categories?kind`, `POST/PUT/DELETE /categories`, `GET/POST /stores`, `GET /items?kind`. backend + frontend `tsc` and `vite build` green; local `db push` + E2E verified. Previous: **v2.55.0 (test → main pending deploy)** — **Report Expenses multi-filter + date-range picker on list pages.** (1) The Report → **Expenses** tab is now filterable by **Country + Vendor + Category**, and the filters drive the **whole tab** (top trend chart + category breakdown + table + stat cards). A single backend endpoint `GET /accounting/report/expenses` (`getExpenseReport`) returns `trend` (per-day for Monthly / per-month for Yearly, filtered by country+vendor+category), `byCategory` (country+vendor scope, all categories — stays a usable picker), and `total`/`byCategoryTotal`/`count`. Category totals are aggregated at the line-item level. The old `getExpenseCategoryReport` + `/report/expenses-by-category` + `AccExpenseCategoryReport` + `useExpenseCategoryReport` were removed in favour of `AccExpenseReport` + `useExpenseReport`. (2) The **Invoices** and **Expenses** list pages get a reusable **date-range picker** (`components/accounting/DateRangePicker.tsx` — preset pills All / This Month / Last Month / This Year / Custom From-To) replacing the two raw From/To inputs (`filters.from/to` semantics unchanged). No schema change. backend + frontend `tsc` and `vite build` green. Previous: **v2.54.1 (test → main pending deploy)** — **Report: Sales and Expenses split into separate tabs.** Per user request, v2.54.0's combined "Sales vs Expenses" chart was separated: `AccReport.tsx` now has a top-level **Sales | Expenses** tab; each tab shows its own **single-series** bar chart (Sales green / Expenses red), Monthly = per-day, Yearly = per-month, with tab-specific stat cards and title. The **"Expenses by Category"** section (dropdown + ranked bars / single-category 12-month trend + % table) lives only under the **Expenses** tab. The combined ComposedChart + Net line was removed. Frontend-only; backend, shared types, and schema unchanged (the v2.54.0 `/report/yearly` + `/report/expenses-by-category` endpoints are reused). `vite build` green. Previous: **v2.54.0 (test → main pending deploy)** — **Accounting Report analytics upgrade (recharts).** `AccReport.tsx` rewritten; the CSS-div bar chart replaced with **recharts**. (1) **Monthly | Yearly** mode toggle (month-picker / year-select) — the whole page reacts to the selected period. (2) **Hero "Sales vs Expenses"** — grouped bars (Sales green + Expenses red) + a **Net line** (`ComposedChart`); Monthly = per-day, Yearly = Jan–Dec per-month. (3) **"Expenses by Category"** — category dropdown + year: **All** → ranked horizontal bars of the year's categories; a **specific category** → that category's **12-month trend** bars + a percentage breakdown table (click a row to drill into a category). Category totals are aggregated at the **line-item level** (`AccExpenseItem.categoryName` + `lineTotal`), since category lives on line items, not the expense header. Only two charts — kept uncluttered. New backend `getYearlyReport` + `getExpenseCategoryReport` (`accountingService.ts`) + routes `/accounting/report/yearly` and `/accounting/report/expenses-by-category`; new shared types `AccYearlyReport`/`AccExpenseCategoryReport`; new hooks `useYearlyReport`/`useExpenseCategoryReport`. **No schema change** (pure read queries — no db push needed). backend + frontend `tsc` and frontend `vite build` green; all 3 endpoints verified live (yearly month buckets, category aggregation, single-category monthly trend math all correct). Previous: **v2.53.1 (test → main pending deploy)** — **CD deploy hardening + prod acc-schema recovery + invoice PDF button fix.** (1) After v2.52/v2.53, every prod `/accounting` endpoint returned 500: CD's `prisma db push --accept-data-loss` could not add the required `invoice_no`/`date_issued` columns to a non-empty `acc_sales` (1 leftover v2.51 row), so it applied nothing — and the trailing `docker image prune` exit 0 masked the failure, leaving the acc schema frozen at v2.51.0 while v2.53 client code expected the new tables. Recovered out-of-band by dropping only `acc_*` tables then `prisma db push` (no order/stock/incident data touched). `cd.yml` now sets `script_stop: true` on the Vultr ssh-action so a failing command (incl. a refused db push) fails the job instead of being masked. (2) The Invoices list **PDF** button used `window.open('/accounting/sales/:id/pdf')`; the html-accept navigation hit nginx's SPA fallback and rendered the login screen — replaced with `downloadInvoicePdf` (axios `responseType:'blob'` + `<a download>`, mirroring `downloadIncidentPdf`). Application image otherwise equals v2.53.0. See SOLUTIONS.md [2026-06-03]. Previous: **v2.53.0 (test → main pending deploy)** — **Accounting UX revamp + save bug fix** (Section 7.13). (1) **Save fix:** the accounting create/update routes wrapped every optional UUID field (`customerId`/`salesAgentId`/`vendorId`/`itemId`/`categoryId`) in a `nullableUuid = z.preprocess(v => v === '' ? null : v, z.string().uuid().nullish())` so a blank combo/select sending `""` (instead of `null`) no longer triggers `400 "Invalid uuid"` on save — root cause confirmed by live reproduction, fix verified 4/4 (empty-string sale/expense → 201, bad uuid still 400, valid uuid 201); frontend payloads also hardened with `|| null`. (2) **New Invoice / New Expense are now full in-shell pages, not modals** (`/accounting/sales/new`+`:id/edit`, `/accounting/expenses/new`+`:id/edit` under `AppLayout`); `InvoiceForm`/`PurchaseForm` became routed pages (a thin wrapper resolves the edit record via new `useSale`/`useExpense` hooks before rendering), and `AccInvoices`/`AccPurchases` list buttons navigate instead of opening a modal. (3) **"Purchases" renamed to "Expenses"** across the UI (sidebar, page title, button, stat cards, table + number label `Expense #`); the internal `PUR/001` counter prefix and `/expenses` backend route are unchanged (no data migration). (4) **Category added to Sales line items**: `AccSaleItem` gains `categoryId`/`categoryName` (additive `db push`), `createSale`/`updateSale` persist it and auto-populate the category catalog via `ensureItemsCatalog(true)`, `InvoiceForm` now passes `withCategory`. (5) **Invoice gains a "+ New Customer" popup when Corporation is selected** (full fields: type/name/address/email/contact person/number). (6) **Customers/Vendors page rebuilt as a Warehouse-Report-style tabbed view** (Customers | Vendors tab bar, full-width table per tab, search box + count badges; Company Profile button preserved). shared `AccSaleItem` interface +category. Backend + frontend `tsc` and frontend `vite build` green (CSS 52.95 kB / JS 1790 kB); save + category flows verified live (category persists, round-trips, auto-adds to catalog). Previous: **v2.52.0 (test → main pending deploy)** — **Accounting module v2 — line-item invoice/purchase redesign** (Section 7.13). Sales→**Invoices** and Expenses→**Purchases**, each a stat-card + filter + table list with a wide create/edit form-modal. Invoices: Individual/Corporation toggle, customer combo (auto-archived with sales-agent name), auto `INV/001`, Sales Agent (dom SALES_AGENT users) + Sales Channel, Paid/Unpaid→conditional payment fields, **multi-line items** (Item/Desc/Qty/Unit/Disc%/Tax%/Total + New Row + Subtotal/Discount/Tax/Total) + invoice PDF. Purchases: Vendor combo + **New Vendor** button, auto `PUR/001`, optional Invoice #, Country, Paid By, line items with **Category**. New tables AccSale+**AccSaleItem**, AccExpense+**AccExpenseItem**, **AccVendor** (replaces AccSupplier), **AccItem**+**AccCategory** managed catalogs (Create New persists); new enums AccPaymentStatus/AccCustomerType/AccSaleChannel, AccPaymentMethod+CREDIT_CARD. Free-typed customers/items/categories auto-captured by backend. Contacts = customer archive + vendor list + **Company Profile** modal button (standalone page removed). Landing = **Sales/Expense Report** (month picker + 2 tabs + daily bar chart + monthly lists). Schema applied by dropping only `acc_*` tables + old acc enums then `db push` (dom order data untouched). ₱ PHP. tsc + vite build green; E2E + browser smoke verified. Previous (v2.51.0): **New independent Accounting module** (Section 7.13). A self-contained finance module placed under **Incident Report** in the sidebar (collapsible parent: Dashboard / Sales / Expenses / Customers-Suppliers / Company Profile). It **never touches the order pipeline or any existing table** — own `acc_*` tables (`AccCustomer`, `AccSupplier`, `AccSale`, `AccExpense`, `AccCompanyProfile`, `AccInvoice`, `AccCounter`), own enums (`AccPaymentMethod`, `AccSalesStatus`, `AccCountry`, `AccPaidFrom`), all tenant-scoped with **no foreign keys into existing models**. New role **`ACCOUNTANT`** (additive to `UserRole` in Prisma + shared; Settings → Administration; sees only the Accounting module). Backend `routes/accounting.ts` (prefix `/accounting`, `requireRole(ADMIN, ACCOUNTANT)`): Customers/Suppliers/Sales/Expenses CRUD (conditional payment-field validation), Company profile (logo stored **base64 in DB** — no filesystem/volume), Invoice create + PDFKit render (`INV-YYYY-NNNN` via per-tenant `AccCounter`), Dashboard aggregates. `accountingService.ts` + `accountingPdfService.ts`. Frontend `pages/accounting/*` + `api/accounting.ts` + new shared `components/shared/ComboBox.tsx` (searchable dropdown with "Others" + match-rise + auto-fill + quick-add) + `styles/accounting.css` (all selectors namespaced under `.acc-page`). Wired into `App.tsx` (5 routes), `Sidebar.tsx`, `Login.tsx` (`ROUTE_ROLES` + `getDefaultRoute`), `App RootRoute.homeByRole`, `Settings.tsx` (role card). `/accounting` prefix added to **both** `vite.config.ts proxyRoutes` and `nginx.conf` (avoids the SPA-serves-HTML-to-backend gotcha). Sale rows snapshot the customer's address/email/number so deleting a customer never corrupts history. Single currency ₱ PHP. Schema all additive `db push` (no data loss). Backend + frontend + shared `tsc` green; frontend `vite build` green (CSS 50.67 kB); E2E (login → customer → sale w/ BANK_TRANSFER+PENDING → invoice PDF `%PDF-1.3` → expense → dashboard, GCASH-missing-number → 400) + browser smoke (3 pages render, no accounting console errors) verified. Previous: **v2.50.0 (test → main pending deploy)** — **`OUTBOUND_ADMIN` read-only access to Inbound / Picker Admin / Packer Admin.** The Outbound Admin can now **view** these three boards but performs **no** mutations. Two-layer enforcement: (1) backend — `OUTBOUND_ADMIN` added only to the **GET** guards (`orders.ts`: `/`, `/stats`, `/shops`, `/pending-handheld`, `/:id/sla-escalations`; `pickerAdmin.ts` + `packerAdmin.ts`: a separate read-only `readPreHandler` on `/orders`, `/pickers`|`/packers`, `/stats`, `/pending-staged`, `/picker|packer/:id/orders`), while every mutation endpoint still excludes the role (403); (2) frontend — `readOnly = role === OUTBOUND_ADMIN` hides all scan/assign/complete/remove/delete UI (incl. the row/bulk action columns and the picker/packer popup actions, SLA view kept), routes added to `/dashboard`/`/picker-admin`/`/packer-admin` (`App.tsx`) and Sidebar `roles`. Packed Report stays excluded — Packer Admin renders as a plain sidebar link for this role (Sidebar now branches on **visible** children). New shared `ViewOnlyBadge` in each panel header. Landing unchanged (`/outbound`). Build green (shared+backend tsc, frontend tsc -b + vite). Previous: **v2.49.0 (test → main pending deploy)** — **New `INCIDENT_REPORTER` role + Warehouse Report custom date-picker fix.** (1) New desktop role `INCIDENT_REPORTER` (Settings → Administration, label "Incident Reporter") that sees only the Incident Report module and can perform every incident operation **except delete** — added to `UserRole` (shared + Prisma, additive `db push`), to every `incidents` route guard except `DELETE /:id`, to both `branding` routes (logo + company info), `App.tsx` route + `RootRoute.homeByRole`, `Sidebar` nav `roles`, `Login` `ROUTE_ROLES`/`getDefaultRoute`; the Delete button is hidden in `IncidentReport.tsx` for this role (backend also blocks it). Not ownership-scoped — it edits any incident regardless of `createdById`; only delete is withheld. (2) Fixed the Live Performance **Custom** date pill (`LivePerformanceTab.tsx`) which never opened the `<input type="date">`: `datePreset` was derived from `selectedDate`, so selecting a custom day that equalled yesterday snapped to the Yesterday preset; now tracked with an explicit `customMode` boolean. Backend + frontend + shared `tsc`/build green; **local `db push` PENDING** (dev pg — applies on CD deploy). Previous: **v2.48.1 (test → main pending deploy)** — **Packer Workload popup fix** (§7.5). The packer card popup (`PackerOrdersModal`) now shows the packer's **active** orders instead of their last-50 *completed* (which made every busy packer's header read "50"), and mirrors the Picker popup: per-row **Remove** + **Complete** + bulk-select, with confirm dialogs. **Complete** → `PACKER_COMPLETE → OUTBOUND` → Packed Report; **Remove** → `unassign` back to the Packer Admin queue. New `POST /packer-admin/bulk-complete` + `/bulk-unassign`; `getPackerOrders` rewritten to return active assignments; modal subscribes to `order:stats_changed` so phone-completed orders drop in real time. Backend + frontend `tsc` green; frontend `vite build` green. No schema change. Previous: **v2.48.0 (test → main pending deploy)** — **Role split + independent Outbound module + UI polish.** (1) **`INBOUND_ADMIN` / `OUTBOUND_ADMIN` split** — the single "Inbound/Outbound Admin" role became two separate Settings roles: `INBOUND_ADMIN` relabelled **"Inbound Admin"** (enum value unchanged, no migration) and a **new `OUTBOUND_ADMIN`** role (added to `UserRole` in Prisma + `shared/src/index.ts`; wired through `App.tsx` RootRoute/homeByRole, `Login.tsx` getDefaultRoute/ROUTE_ROLES, `ScanLogin.tsx` getScanRoute). (2) **New independent Outbound module** (§7.12) — a phone-scan "handed-to-courier" log writing to its **own `dispatch_parcels` table** via `/dispatch` backend (`routes/dispatch.ts` + `services/dispatchService.ts`), **never touching the order pipeline or any existing report** (hard requirement). Outbound Admin scans on a handheld (`pages/OutboundScan.tsx`, no layout): pick **In-house** (looked up against our orders; blocked if not found) or **External** (manual Platform + Carrier, shop = "Others"). Desktop **board** (`pages/OutboundBoard.tsx`, `/outbound`) groups by carrier→shop for a day; **report** (`pages/OutboundReport.tsx`, `/outbound/report`) shows per-carrier totals over an Incident-style date range. Visible to **Admin + Outbound Admin only**; records kept indefinitely. New enum `DispatchSource`, new `/dispatch` proxy prefix in `vite.config.ts` + `nginx.conf`, new `api/dispatch.ts`. (3) **Old Outbound Panel → "Packed Report"** (§7.7) — the carrier-grouped dispatched-orders view was renamed (`pages/Outbound.tsx` → `pages/PackedReport.tsx`, route `/outbound` → `/packed-report`) and **nested under Packer Admin** in the sidebar; its `/outbound/*` backend is unchanged. (4) **Settings redesign** — the 5 ad-hoc role-card grids collapsed into a config-driven layout under 4 category headers (Administration / Warehouse Floor / Sales / Scanners); all add/edit/delete user flows unchanged. (5) **Live Performance** date control swapped from `DateNavigator` to the Incident-style pill picker (Today / Yesterday / Custom — still single-day, no backend change). (6) **Manila clock** — new reusable `components/shared/ManilaClock.tsx` (extracted from the Dashboard hero clock) added to Packer Admin + Picker Admin headers. Schema all additive `db push`, no data loss. Backend + frontend + shared `tsc` green; frontend `vite build` green (CSS 44.02 kB, JS 1715 kB). **Local `db push` PENDING** (dev Postgres was down) — applies on CD deploy. Previous: **v2.47.0 (test → main pending deploy)** — **Return & Cancel rework** (Section 7.11). Scanning moved off the desktop onto a dedicated **handheld-only role `RETURN_SCANNER`** (created in Settings → "Return & Cancel Scanners"); it logs in via `/scan` and lands on the new full-screen mobile page `pages/ReturnScanMobile.tsx` (`/returns/scan`, no `AppLayout` — sticky Type/Store/Courier + waybill keyboard-wedge/camera + `detectPlatform` + confirm sheet → POST `/returns`). The desktop sidebar is now a **single** `Return & Cancel` link → `/returns` (report only); the report's old "Scan Parcel" CTA became an **Add Parcel** popup (`AddParcelModal` — manual entry for barcodes the phone can't read). Backend `routes/returns.ts` guards **split**: `GET`/`DELETE` = ADMIN/WAREHOUSE_ADMIN/INBOUND_ADMIN, `POST` = those + `RETURN_SCANNER`. New enum value `RETURN_SCANNER` added to `UserRole` (Prisma + shared) — `db push`, no data loss. Old `pages/ReturnCancelScan.tsx` deleted. Backend + frontend `tsc --noEmit` green. Previous: **v2.46.0 (deployed)** — New **Return & Cancel Parcel** module (Section 7.11). Sidebar gains a `Return & Cancel` parent under Outbound with two children: **Scan** (`/returns/scan`) and **Report** (`/returns`). Scan flow: scan waybill → pick Return/Cancel → Store (17 `SALES_STORES`) → Platform (Shopee/Lazada/TikTok, auto-detected from the waybill prefix, editable) → Courier (`Carrier` enum). Report has summary cards (Total/Returns/Cancels), a search + type filter, and a date-range strip with `1 Day` / `7 Days` / `1 Month` / `Custom` presets (Incident-style date picker), paginated table with per-row Delete. Records are **hard-deleted after 180 days (6 months)** by the nightly job (`returnCancelService.hardDeleteExpiredReturnCancel`, called from `nightlyReport.ts`). **Role rename:** `INBOUND_ADMIN`'s display label changed to **"Inbound/Outbound Admin"** (enum value `INBOUND_ADMIN` unchanged — no data migration); this role now also reaches the Return & Cancel panel + scan. Access: `ADMIN`, `WAREHOUSE_ADMIN`, `INBOUND_ADMIN`. Schema (all `db push`, no data loss): new table `return_cancel_parcels`, new enums `ReturnCancelType {RETURN,CANCEL}` + `Carrier {SPX,JT_EXPRESS,FLASH,LEX,LBC,NINJA_VAN,OTHER}` (Carrier was previously only a shared TS enum; `orders.carrier_name` stays a free String and is untouched). New backend route `/returns` (GET list+stats / POST create / DELETE), registered in `index.ts`; proxy prefix `returns` added to `vite.config.ts` + `nginx.conf`. New frontend: `api/returns.ts`, `pages/ReturnCancelScan.tsx`, `pages/ReturnCancel.tsx`. Backend + frontend `tsc` green; frontend prod build green. Previous: **v2.45.0 (test → main pending deploy)** — Four changes: (1) Incident **Company Branding** gained **Address / Email / Contact Number** (optional; printed on the PDF letterhead under the company name). (2) Create Incident has an optional **Witness** block (Name + Position) → renders a Witness info section + a **third signature column** on the PDF. (3) **Recent Incidents** rows gained a **Delete** action (ConfirmModal → `DELETE /incidents/:id`, also unlinks the signed file). (4) New **`WAREHOUSE_ADMIN`** role — full access to every section **except Marketing and Settings** (added to `UserRole` in shared + Prisma, every warehouse `requireRole` gate, Sidebar `NAV_ITEMS`, `App.tsx` route guards + RootRoute, Settings role card; incident routes including the new DELETE allow ADMIN + WAREHOUSE_ADMIN). Schema (all `db push`, no data loss): `company_branding` +3 nullable cols, `incidents` +`witness_name`/`witness_position`, `UserRole` +`WAREHOUSE_ADMIN`. Backend + frontend `tsc --noEmit` green; frontend prod build green. Previous: **LIVE on https://domwarehouse.com since 2026-05-28** — **Incident Report module** (v2.43.0). User browser-tested in production + confirmed working. Merge commit `0ecb13d` (test → main), tag `v2.43.0`. **One open item:** SMTP credentials not yet provisioned in prod `/opt/dom/.env`; until then the Send Email button stays disabled in the UI with "SMTP not configured" tooltip — all other functionality (PDF download, signed re-upload, DB persistence, pivot table, branding upload) verified working. See SOLUTIONS.md [2026-05-28] for the full ship log + SMTP setup recipe. New admin-only module for documenting employee incidents and producing formal PDF reports. Section 7.10 covers the full scope. Highlights: (1) 2 new Prisma tables (`incidents`, `company_branding`) + 1 enum (`IncidentType`, 25 values matching the HR taxonomy from `Incident Report Type.txt`); (2) per-tenant Company Branding (name + logo, used as PDF letterhead, edit-anytime via cogwheel modal); (3) PDFKit-generated A4 incident report with logo header, Incident Information block, **25 statement templates** (4 parcel-context types substitute tracking number + platform + shop, the other 21 use name+date+reportedBy substitution), boxed admin description, blank employee statement/defense section with ruled lines, dual signature block (Employee · Reporting Officer); (4) signed-document re-upload (PDF/PNG/JPG, max 10 MB) persisted to `/app/uploads/incidents/` on a new named Docker volume `backend_uploads`; (5) Send-Email button (re-uses existing SMTP_HOST/PORT/USER/PASS/FROM env vars from slaD4Email worker — disabled in UI with tooltip when SMTP is not configured); (6) Sidebar entry "Incident Report" placed under "Marketing Report" (ADMIN-only); (7) Two-table layout — Recent Incidents (paginated 25/page with filter card on type + search) + Employee × Incident Type pivot matrix with sticky first column + horizontal scroll; (8) Create Incident modal — Employee dropdown reads from active User list, Full Name is editable text input (so PDFs show formal names instead of usernames like "picker1"), Reported By auto-fills from current admin session, parcel block (TN + Platform + Shop) conditionally appears for the 4 parcel types with a "Lookup" button that auto-fills Platform + Shop from a matching Order; (9) Vite proxy + nginx config gained `incidents|branding` route prefixes (otherwise SPA fallback would silently serve HTML to backend calls, per SOLUTIONS.md [2026-05-02]); (10) `@fastify/multipart` added (v8) for the 2 upload endpoints. **Backend tsc green; frontend `npm run build` green (9.6s, CSS 44.02 kB, JS 1652.51 kB).** SMTP credentials are NOT yet configured on prod — user will provide them separately; the module ships in a useful state (PDF download + signed upload + DB persistence all functional) and the Send Email button just stays disabled until env vars are set. Previous: PENDING browser smoke + main merge — **`vite build` + nginx static-serve migration** (v2.41.0). Root-cause fix for the 2026-05-23 v2.40.0 prod 502 incident: frontend prod surface migrated from `npx vite --host` (dev server) to `nginx:alpine` serving pre-built static assets + reverse-proxying all backend routes. Multi-stage `frontend/Dockerfile` (builder = node:20-alpine running `npm run build --workspace=shared` + `npm run build --workspace=frontend`, runtime = nginx:alpine), new `frontend/nginx.conf` mirroring `vite.config.ts proxyRoutes` (17 backend route prefixes + `/socket.io` WS upgrade with `proxy_http_version 1.1` + `Upgrade` / `Connection: upgrade` headers + 7d read/send timeout; per-route browser-navigation fallback via `if ($http_accept ~* text/html) { rewrite ^ /index.html last; }` to mirror Vite proxy `bypass` callback; SPA `try_files $uri $uri/ /index.html` for the catch-all `/`; `/assets/` 1-year immutable cache, `/index.html` no-cache; gzip on). `docker-compose.yml` frontend service drops `./frontend/src` + `./shared/src` + `./certs` volume mounts (CD `git pull` no longer auto-reloads live browser sessions) and changes host:container port from `5173:5173` to `5173:80` (outer nginx upstream `proxy_pass http://localhost:5173` unchanged). `VITE_BACKEND_URL` + `VITE_DISABLE_HMR` env vars removed (nginx proxy handles routing). **Why:** v2.40.0 deps bump (vite 5→6 + framer-motion) crashed prod because dev-server runtime is the prod surface; after migration `vite` runtime no longer exists in the prod container, so frontend dep upgrades cannot 502 prod (only CI build can fail). Also resolves the persistent `wss://...?token=...` console-noise that v2.35.2 attempted but couldn't fix without losing HMR — `@vite/client` is no longer injected at all (sentinel verified: SPA HTML now contains only the hashed bundle `<script type="module" crossorigin src="/assets/index-DmSvx-Z2.js">`). Local smoke test (Docker Desktop): `vite build` green (1610 KB JS gzip 427 KB, 8 Inter woff2 files, 44 KB CSS gzip 9 KB); `nginx -t` syntax ok; `GET /` 200 SPA index.html (no `@vite/client`); `GET /health` Accept: application/json → backend `{"status":"ok"}`; `GET /sales` Accept: text/html → SPA fallback; `GET /sales` Accept: application/json → backend 404 "Route not found" (proxy verified); `/assets/index-DmSvx-Z2.js` headers include `Cache-Control: public, immutable` + `max-age=31536000`; `/index.html` headers include `Cache-Control: no-cache, must-revalidate`; `/socket.io/?EIO=4&transport=websocket` upgrade handshake returns **HTTP 101 Switching Protocols** (Socket.io scan realtime preserved); browser console clean of `[vite]` / `wss://` retry noise, `[socket] connected, id: <real-id>` confirmed real socket connection over the proxied WS upgrade. Vultr deploy PENDING — awaiting (a) user browser smoke verification on `http://localhost:5173` (5-role login, StockScan flow with 2s banner + 3-note beep + 4-pulse vibrate, SPA refresh on /sales /picker-admin /inventory/stock), (b) optional Vultr host nginx upstream config pre-check via SSH, (c) user main-merge approval. **Risk note:** outer nginx on Vultr proxies to `http://localhost:5173`; container-internal port changed from `5173` (Vite) to `80` (nginx), but host:container mapping kept `5173:80` so the outer nginx config needs no edit. If outer nginx ever proxies a different port (e.g. `:5173` direct to container), this will break; SSH check is the safe pre-deploy step. Rollback path: `git revert <merge-commit>` on `main` (Dockerfile, nginx.conf, docker-compose.yml all single-file changes) + `docker compose up -d --build` (~2 min). Detail: SOLUTIONS.md [2026-05-24] migration entry. Previous: PENDING deploy — **SOLUTIONS.md addendum** for the 2026-05-23 v2.40.0 prod 502 incident (v2.40.2). Docs-only commit; code bit-identical to v2.40.1 (currently LIVE). Full post-mortem with hypothesized root cause, immediate-fix steps, and the **deferred `vite build` + nginx static-serve migration plan** lives at `SOLUTIONS.md` [2026-05-23]. Migration is the proper structural fix for the dev-server-in-prod pattern that made the vite 6 bump fatal; **deferred per user directive until Filipin operasyonu bittikten sonra** — do not touch frontend deps or attempt the vite 6 bump again until then. Previous: **v2.40.1 emergency rollback (LIVE)** — **v2.40.0 reverted** after prod 502. v2.40.0 had bumped `vite 5.4.21 → 6.4.2` and added `framer-motion ^12.40.0`; CD pipeline reported success (build + Vultr deploy + prisma db push all green), but the frontend container (which runs `npx vite --host` as the prod server, see `frontend/Dockerfile`) failed to serve on port 5173 post-restart and nginx returned `502 Bad Gateway`. Root cause not yet diagnosed in detail (no live container logs captured before rollback per user directive — fix-first, investigate-later); leading hypothesis is a Vite 6 runtime behavior change incompatible with the dev-server-in-prod pattern (e.g. `server.allowedHosts` semantics, HMR client token injection, or basic-ssl plugin interaction). Revert is `git revert 44af48c` on `test`, then merge to `main`. Frontend deps return to the v2.39.1 lockfile state: `vite ^5.4.10` restored, `framer-motion` removed (had zero consumers — was queued for future motion work). **Action items deferred to next session:** (1) before re-attempting the vite 6 bump, switch frontend to `vite build` + static serve (nginx or `vite preview`) so the prod surface stops depending on dev-server runtime quirks (this was already noted in SOLUTIONS.md [2026-05-19] as the proper v2.36.0 path — never executed); (2) only after that, retry the vite 5→6 bump on `test` with a smoke check before promoting to `main`; (3) framer-motion can be re-added in any future motion-consuming phase without coupling it to a vite major. Previous: **Legacy CSS cleanup (Phase I — visual polish program COMPLETE)** (v2.39.1). Frontend-only, pure deletion, no schema/API impact, all component APIs unchanged. **Final phase** of the Linear/Vercel visual polish program (plan: `.claude/plans/rustling-splashing-forest.md`). Pre-cleanup verification: `grep -rE '["'](inbound-header|inbound-body|inbound-section|order-table-wrap|picker-admin-toolbar|picker-admin-select|picker-admin-btn|picker-admin-row|picker-admin-stats-grid)' src/` returned **zero JSX className consumers** — the only hits were React Query string keys like `'picker-admin-stats'` (cache identifiers, not CSS class names; unaffected by CSS deletion). Changes: (1) **Deleted `frontend/src/styles/legacy.css`** (235 lines covering `.inbound-header-inner` / `.inbound-header-stats` / `.inbound-body` / `.inbound-section-header` + their `@media` responsive overrides, `.order-table-wrap` + nested table selectors, `.picker-admin-toolbar` / `.picker-admin-select` / `.picker-admin-btn-primary` / `.picker-admin-btn-outline` / `.picker-admin-btn-assign` / `.picker-admin-row` / `.picker-admin-stats-grid` + their `@media` overrides). All families were marked `@deprecated` since Phase B (v2.37.1) when they were quarantined into this isolated partial. Migration paths (active replacements) documented in DESIGN_SYSTEM.md Phase B partition map: `.inbound-*` → `.panel-*` (Phase 8 Phase B), `.order-table-wrap` → `.data-table-wrap` (Phase B + Phase C), `.picker-admin-*` → `.btn-*` / `.toolbar-card` / `.styled-select` / `.stats-grid` (Phase C). (2) **Removed `@import './styles/legacy.css'`** from `frontend/src/index.css`. The import order is now: `tokens → reset → layout → components → sales-dashboard → utilities` (6 partials, down from 7). (3) **Visual polish program officially complete** (Phases A → I, 9 versioned ships: v2.37.0 / v2.37.1 / v2.38.0 / v2.38.1 / v2.38.2 / v2.38.3 / v2.38.4 / v2.39.0 / v2.39.1). Cumulative net effect: ~30 inline-style blocks migrated to shared CSS classes across SalesDashboard / SalesEntry / SalesOrders / MarketingReport / ConfirmModal / SlaHistoryModal; +1 new design-token system (`space`/`fontSize`/`tracking`/`gray`/extended-`radius`/extended-`shadow`/extended-`motion`); +1 Inter Variable font swap (body app-wide); +1 prefers-reduced-motion global override; +1 sidebar glow drop + active label brightening + icon hover-shift; +1 row-flash on socket update (PickerAdmin/PackerAdmin staged orders); +1 row-stagger on initial mount (PickerAdmin/PackerAdmin main tables); +1 route fade-up on navigation (AppLayout, scan pages auto-skip); +1 alert slide-in (SlaAlertBanner D4); +1 modal scale-in with backdrop blur (ConfirmModal, SlaHistoryModal, reusable for others); +1 button focus-ring + active-scale system (all `.btn*`); +1 unified input/select 3px primary focus ring; +1 tabular-nums on all numeric surfaces (stat cards, badges, pagination, hero clock); +1 7 ordered CSS partials (was 1 monolithic file); +1 SalesDashboard CSS partial (`sales-dashboard.css`); +1 deferred Inventory/Settings/Archive/Outbound/Reports + 5 modals + PickerAdmin/PackerAdmin toolbar inline-style extractions (these all inherit Phase C primitive polish automatically through `.btn` / `.styled-select` / `.data-table-wrap` / `.modal-*` shared classes and can be migrated incrementally in future phases without a version bump). Saha-doğrulanmış scan-flow timings (2s banner / 3-note beep / 4-pulse vibrate / `lastResolvedIdRef` guard) bitwise-identical to v2.36.2 across the entire 9-phase sweep. Build: `npm run build` green (10.1s). CSS bundle 44.04 kB (Phase H baseline 46.90 kB; **-2.86 kB delta** = the full `legacy.css` payload removed). JS bundle 1610.01 kB (unchanged from Phase H; pure CSS-only cleanup). Memory sync: `DESIGN_SYSTEM.md` Phase H section augmented with the Phase I completion note + program-summary table. `CLAUDE.md` "Mevcut versiyon" bumped to `v2.39.1`. Previous: **Motion sweep (Phase H)** (v2.39.0). Frontend-only, additive, no schema/API impact, all component APIs unchanged. Eighth phase of the Linear/Vercel visual polish program (plan: `.claude/plans/rustling-splashing-forest.md`). First phase that introduces **new motion** (not just polishing existing transitions); every new keyframe is neutralized by the global `@media (prefers-reduced-motion: reduce)` rule added in Phase A, so users with the OS-level setting on get zero new animation. Changes: (1) **New CSS classes (`components.css`):** `@keyframes route-fade-in` + `.route-transition` — 200ms opacity 0→1 + translateY 8px→0 with `--ease-standard`. `@keyframes row-enter` + `.row-stagger` parent class + 12 explicit `:nth-child` rules (0/30/60/90/120/150/180/210/240/270/300/330 ms `animation-delay`); rows past the 12th get a 0ms delay so the list still feels coherent if longer than 12. `@keyframes alert-slide-down` + `.alert-slide-in` — `translateY(-100%)→0` + opacity 0→1 with `--duration-slow` (250ms) emphasized ease, for top-of-page banners. (2) **`AppLayout.tsx`:** new internal `PageContent` component uses `useLocation()` from `react-router-dom` and wraps `{children}` in a `<div key={location.pathname} className="route-transition">`. Keying on pathname forces the wrapper to re-mount on route navigation, re-firing the CSS animation; same-pathname navigation (query-param changes only) does NOT re-trigger because React reconciliation keeps the same wrapper. **Scan pages are automatically skipped** — `InboundScan`, `PickerAdminScan`, `PackerAdminScan`, `PickerMobile`, `PackerMobile`, `StockScan`, `ScanLogin` are all mounted directly under `<Route>` without `AppLayout`, so their saha-doğrulanmış scan-flow timing never competes with route motion. (3) **`PickerAdmin.tsx`:** main orders table `<tbody>` (line 1709, NOT the staged-orders list at line 1472) gains `className="row-stagger"`. Real-time socket-added staged rows still use the Phase E `.row-flash` for arrival feedback; the two animations operate on different DOM subtrees with orthogonal effects. (4) **`PackerAdmin.tsx`:** main orders table `<tbody>` (line 1010) gains `className="row-stagger"`. Same staged-orders separation as PickerAdmin. (5) **`SlaAlertBanner.tsx`:** both the single-alert and multi-alert variants gain `className="alert-slide-in"` on their outermost `<div>`. The banner is conditionally rendered (`if (d4Alerts.length === 0) return null`), so the animation only runs when the first D4 alert fires — a clear visual signal that an urgent order needs attention. Dismissing all alerts unmounts the banner; the next alert re-mounts and re-fires the animation. **Dashboard not given row-stagger** because it has only 4–5 stat cards (not a long enough list to benefit from cascade); Dashboard's heavy refactor remains deferred. **Real-time integrity:** CSS animations only run once per element, so React Query refetches that re-use existing DOM nodes do NOT re-trigger the stagger animation. The animation only re-runs if rows are genuinely new DOM nodes (initial mount, filter/sort change, pagination). Operator scan timings JS-driven and untouched. Build: `npm run build` green (12.5s). CSS bundle 46.90 kB (Phase G baseline 45.70 kB; +1.20 kB delta = 3 new keyframes + 14 nth-child rules + `.route-transition` / `.row-stagger` / `.alert-slide-in` classes). JS bundle 1610.01 kB (+0.23 kB; new `PageContent` wrapper + `useLocation` import). Memory sync: `DESIGN_SYSTEM.md` Phase G section augmented with the Phase H motion table + animation guardrails. `CLAUDE.md` "Mevcut versiyon" bumped to `v2.39.0` (MINOR bump since this introduces new app-wide motion behavior). Previous: **Tier 4 operator-scan typography polish (Phase G, single commit)** (v2.38.4). Frontend-only, ultra-surgical, no schema/API impact, all component APIs unchanged, **zero scan-flow JS touched**. Seventh phase of the Linear/Vercel visual polish program (plan: `.claude/plans/rustling-splashing-forest.md`). Highest-risk phase per the plan's guardrails — every saha-doğrulanmış operator-critical timer / audio call / haptic call / decode guard is provably untouched (verified by `git diff` filtered grep before commit). Changes: (1) **`ScanLogin.tsx`** (the handheld login screen, no scan-flow critical code): heading `letter-spacing: -0.4px` → `var(--tracking-display)` (-0.03em) for modern-minimal display feel; both `<label>` blocks (Username + Password) `letter-spacing: 0.07em` → `var(--tracking-wide)` (0.04em) for tighter label tracking matching the rest of the app. Inline submit button left as-is (gradient + shadow + scan-station handheld optimized; touching it would risk the mobile login UX). (2) **6 scan-flow pages: single-property letter-spacing swap on the hero/header text only.** `InboundScan.tsx` (line 294), `PickerAdminScan.tsx` (line 310), `PackerAdminScan.tsx` (line 280) — `letter-spacing: '-0.5px'` → `'var(--tracking-display)'` on the `Scan Barcode` / `Scan Next Barcode` / `Processing...` headline text (`fontSize: 22 / fontWeight: 800`). `PickerMobile.tsx` (line 308) + `PackerMobile.tsx` (line 365) — same change, `letter-spacing: '-0.4px'` → `'var(--tracking-display)'` on the `fontSize: 21 / fontWeight: 800` headline. **`StockScan.tsx` not touched** — it has no equivalent hero headline with hard-coded letter-spacing in this style; its existing typography is fine. **Verification (`git diff HEAD` on all 6 scan files, filtered to `^[+-]` lines):** 5 letter-spacing swaps, 0 other property changes, 0 JS lines added/removed/modified. `setTimeout` / `setInterval` / `AudioContext` / `playBeep` / `navigator.vibrate` / `lastResolvedIdRef` / `decodeFromStream` / scan event handlers / API calls all bitwise-identical to Phase F. The saha-doğrulanmış v2.36.2 scan UX (2s success banner / 880→1175→1480 Hz 3-note beep / 250+100+200+100+200 ms success vibrate / 180+100+180+100+180+100+280 ms error vibrate / `lastResolvedIdRef` double-fire guard) remains exactly as field-validated (30 ardışık scan hatasız). Visual diff per scan page: imperceptible to most operators — the headline shifts from `-0.4px / -0.5px` hard-coded tracking to `-0.03em` (which evaluates to `-0.63px` at 21px and `-0.66px` at 22px font sizes) — basically identical but now token-driven so future tracking-scale adjustments propagate. Operators will see literally identical scan flow timing and feedback. (3) **No new CSS classes added in this phase** — all changes use the existing `--tracking-display` token established in Phase A. Build: `npm run build` green (9.7s). CSS bundle 45.70 kB (unchanged from Phase F, no CSS edits). JS bundle 1609.78 kB (Phase F baseline 1609.65; +0.13 kB delta = the longer `'var(--tracking-display)'` string vs `'-0.4px'` / `'-0.5px'` × 5 occurrences). Memory sync: `DESIGN_SYSTEM.md` Phase F section augmented with the Phase G note + scan-page guardrail. `CLAUDE.md` "Mevcut versiyon" bumped to `v2.38.4`. Previous: **Tier 3 forms/data polish — shared page-hero + preset-btn + filter-card primitives, Sales suite + MarketingReport + SlaHistoryModal migrations (Phase F, single commit)** (v2.38.3). Frontend-only, additive, no schema/API impact, all component APIs unchanged. Sixth phase of the Linear/Vercel visual polish program (plan: `.claude/plans/rustling-splashing-forest.md`). **Scope-controlled single commit per user directive** — Inventory pages (`Products`, `Stock`, `Warehouses`, `InventoryItems`), `Reports.tsx`, `Settings.tsx`, `Outbound.tsx`, `Archive.tsx`, and the remaining shared modals (`BulkScanModal` / `QuickScanModal` / `GenerateDirectModal` / `DirectOrderFormModal` / `DayDetailModal`) inherit Phase C primitive polish (button focus rings, input/select focus, table hover, modal animation) **automatically** through the shared `.btn` / `.styled-select` / `.data-table-wrap` / `.modal-*` classes and were intentionally not touched in this commit; their per-file inline-style extraction is deferred to a future phase F.2 if needed. Changes: (1) **New shared primitives in `components.css`:** **`.page-hero`** family — reusable blue-gradient header strip generalized from the Phase-E `.sales-hero`; includes `.page-hero-content`, `.page-hero-label`, `.page-hero-title`, `.page-hero-actions`, `.page-hero-cta` (Phase C button triad: hover bg + shadow, `:focus-visible` ring, `:active scale(0.98)`). **`.preset-btn-group`** + `.preset-btn` + `.preset-btn--active` — pill-shaped toggle buttons for date-range presets, tinted for placement on the gradient hero (white/18% bg when idle, solid white + primary text when active). **`.live-pill`** + `.live-pill-dot` + `@keyframes live-pulse` — green pulsing "LIVE" indicator extracted from the inline `mktPulse` keyframe MarketingReport was carrying. **`.filter-card`** + `.filter-field` + `.filter-field-label` + `.filter-field-input` — grid-laid filter container (different from the flex/chip `.filter-bar`), used by `SalesOrders` and now available for any page with date/select-driven filters. (2) **`sales-dashboard.css` updates:** removed the old `.sales-hero*` block (replaced by the generalized `.page-hero*` in `components.css`). Added `.sales-stat-card--highlight-blue` sibling variant to the existing green `.sales-stat-card--highlight`. Added a new section: `.sales-entry-toolbar` + `.sales-entry-status` + `.sales-entry-progress` (`--done` variant) + `.sales-entry-save` (`--saving` variant) for the SalesEntry top toolbar. Added a generic `.section-card` family — `.section-card`, `.section-card-header` (`--open` variant), `.section-card-header-title`, `.section-card-badge` (`--warn` / `--info` variants), `.section-card-chevron` (`--open` variant rotates 180°), `.section-card-body` — used by SalesEntry's 4 collapsible daily-activity sections. (3) **`SalesDashboard.tsx`:** hero strip swapped from `.sales-hero*` → `.page-hero*`; rest unchanged. (4) **`MarketingReport.tsx`:** the entire range-filter hero strip migrated from a heavy inline-style block (78 lines) to `.page-hero` + `.live-pill` + `.preset-btn-group` + `.preset-btn` classes; the inline `<style>` tag carrying `@keyframes mktPulse` deleted (replaced by `@keyframes live-pulse` in `components.css`). Custom-range date inputs kept their inline styling (they're inverted-on-gradient and don't fit the standard `.filter-field-input` pattern). (5) **`SalesOrders.tsx`:** filters card → `.filter-card` + `.filter-field` + `.filter-field-input`; stat cards → `.sales-stats-grid` + `.sales-stat-card` (Total Sales uses new `--highlight-blue`); empty state → `.empty-state`; table → `.data-table-wrap` (gains hover/focus rings/tabular-nums for free); inline action button factory → `.btn .btn-sm .btn-outline` / `.btn .btn-sm .btn-danger`; channel pill → `.count-badge`. Internal `actionBtnStyle`, `inputStyle`, `Th`/`Td` factories simplified — only `text-align` and `vertical-align` remain inline. (6) **`SalesEntry.tsx`:** top controls toolbar → `.sales-entry-toolbar` + `.filter-field` + `.filter-field-input` + `.sales-entry-status` + `.sales-entry-progress` / `.sales-entry-save` chips; empty "select a store" state → `.empty-state`; `SectionCard` component → `.section-card` family (chevron rotates 180° via `.section-card-chevron--open` instead of inline `transform`). (7) **`SlaHistoryModal.tsx`:** shell migrated to `.modal-backdrop` + `.modal-card` (with `.modal-card--wide` modifier + bespoke `maxWidth: 520` / `maxHeight: 80vh` style overrides for the timeline layout). Close button now uses `.btn .btn-ghost .btn-sm` (gains focus ring + active scale automatically). Header + body internals kept inline because the timeline render is bespoke and not worth a per-element class set. The modal gets the new `backdrop-filter: blur(8px)` and `@keyframes modalCardIn` scale-in animation automatically. **Deferred to a possible Phase F.2 or rolled into Phase G/H:** Inventory pages full migration (Products / Stock / Warehouses / InventoryItems have 37+73+18+15 inline blocks); Settings.tsx (70); Archive.tsx (49); Outbound.tsx (28); MarketingReport.tsx body charts + leaderboard tables (kept their existing inline rendering); Reports.tsx (91); remaining 5 shared modals (`BulkScanModal` / `QuickScanModal` / `GenerateDirectModal` / `DirectOrderFormModal` / `DayDetailModal`) — these all benefit from Phase C inheritance and the `.modal-*` primitives are available when those pages are eventually touched. PickerAdmin/PackerAdmin remaining toolbar inline styles (160+146) still deferred per Phase E note. Operator scan timings (2s banner / 3-note beep / 4-pulse vibrate) JS-driven and untouched. Build: `npm run build` green (11s). CSS bundle 45.70 kB (Phase E baseline 41.36 kB; +4.34 kB delta = new shared primitives + sales-entry classes + section-card family). JS bundle 1609.65 kB (**-4.11 kB**; substantial inline-style cleanup across SalesEntry/SalesOrders/SalesDashboard/MarketingReport/SlaHistoryModal). Memory sync: `DESIGN_SYSTEM.md` Phase E section augmented with the Phase F bullet list + new primitive reference tables. `CLAUDE.md` "Mevcut versiyon" bumped to `v2.38.3`. Previous: **Tier 2 high-traffic polish — PickerAdmin/PackerAdmin row flash + SalesDashboard CSS extraction (Phase E)** (v2.38.2). Frontend-only, additive, no schema/API impact, all component APIs unchanged. Fifth phase of the Linear/Vercel visual polish program (plan: `.claude/plans/rustling-splashing-forest.md`). **Scope-controlled** — full PickerAdmin/PackerAdmin toolbar normalization (those files have 160+146 inline-style blocks) deferred to a later sub-phase to keep regression risk low; SalesEntry/SalesOrders inline extraction + MonthCalendar/DaySummaryCell typography refinement deferred to Phase F. Changes: (1) **New `.row-flash` class + `@keyframes row-flash` (in `components.css`):** 250ms primary-tint background pulse with `--ease-standard`, `forwards` fill-mode so it ends transparent (no layout shift — uses `background-color` only). Applies to any container (table row, staged list item, card). (2) **PickerAdmin row flash on socket update:** new `freshIds: Set<string>` state + `markFresh(id)` helper (adds ID, schedules removal after 350ms — slightly longer than the animation). When the `socket.on('order:staged', ...)` event fires, the newly-arriving handheld scan order gets its ID added to `freshIds`; the staged-orders list row renders with `className="row-flash"` while the ID is fresh. Existing Redis-backed pending-staged drain on mount (`api.get('/picker-admin/pending-staged')`) does NOT trigger the flash — only the real-time socket event does, so the visual signal stays meaningful. (3) **PackerAdmin row flash on socket update:** mirrors PickerAdmin pattern for the `socket.on('order:packer-staged', ...)` event. Same `freshIds` state + `markFresh` helper + conditional `className` on the staged list rows. (4) **New `sales-dashboard.css` partial (`frontend/src/styles/sales-dashboard.css`):** loaded in `index.css` between `components.css` and `utilities.css`. Contains `.sales-hero`, `.sales-hero-label`, `.sales-hero-title`, `.sales-hero-cta` (with `:hover` / `:focus-visible` / `:active scale(0.98)` triad — Phase C button pattern), `.sales-stats-grid`, `.sales-stat-card` + `.sales-stat-card--highlight` (green gradient for Direct Sales), `.sales-stat-card-icon`, `.sales-stat-card-label`, `.sales-stat-card-value`, `.sales-month-chips` + `.sales-month-chips-strong` + `.sales-month-chip` + `.sales-month-chips-loading`. All use design tokens (`--tracking-wide`, `--radius-xl`, `--space-3/4`, `--color-text-*`, `--color-border`, motion tokens). (5) **`SalesDashboard.tsx` migration:** all 13 inline `style={{}}` blocks (hero, stats grid, month chips, internal `StatCard` + `Chip` subcomponents) replaced with the new class names. Removed unused inline style payload, hero CTA gained focus ring + active scale automatically through the new `.sales-hero-cta` class. Page rendered identically; visual diff limited to: (a) `.sales-hero-cta` now responds to keyboard focus and click-press, (b) hero CTA radius aligned to `--radius-lg` (10px, was 10px hardcoded — no change), (c) chips and stat cards now use `--tracking-wide` (0.04em) instead of hardcoded `0.04em/0.06em` (functionally identical). Real-time socket flow on PickerAdmin/PackerAdmin verified by running build + tracing handlers; the `markFresh` call is sequenced AFTER `setStagedOrders` so React batches both state updates in the same render. Operator scan timings (2s banner / 3-note beep / 4-pulse vibrate) JS-driven and untouched. Build: `npm run build` green (13s). CSS bundle 41.36 kB (Phase D baseline 38.86 kB; +2.50 kB delta is the new sales-dashboard.css partial). JS bundle 1613.76 kB (-0.53 kB; SalesDashboard inline-style payload trimmed). Memory sync: `DESIGN_SYSTEM.md` Phase D section augmented with the Phase E bullet list. `CLAUDE.md` "Mevcut versiyon" bumped to `v2.38.2`. Previous: **Tier 1 showcase polish — Login + Dashboard + Sidebar (Phase D)** (v2.38.1). Frontend-only, additive, no schema/API impact, all component APIs unchanged. Fourth phase of the Linear/Vercel visual polish program (plan: `.claude/plans/rustling-splashing-forest.md`). Modest scope; heavy Dashboard component refactor (inline-styled `MetricCard` / `PipelineStage` / Volume Report buttons) deferred to Phase F per the plan's tier sequencing. Changes: (1) **Login card (`.login-card`):** border-radius tightened 16px → `var(--radius-xl)` (12px) — Linear/Vercel use smaller radii on focus surfaces. Card shadow kept bespoke (deeper than `--shadow-lg` because the card sits on a dark gradient and needs contrast). (2) **Login heading (`.login-card-heading h2`):** font-size → `var(--font-size-xl)` (24px, identical value, now token-driven), color → `var(--color-text-primary)`, letter-spacing tightened from `-0.5px` (≈-0.021em) to `var(--tracking-display)` (-0.03em) for modern-minimal display feel. (3) **Login submit (`.shimmer-btn`):** aligned to the Phase C button pattern — hover keeps the deeper shadow only, **no `translateY(-1px)` bounce**; `:active:not(:disabled) { transform: scale(0.98) }` 80ms tactile press; new `:focus-visible` ring stacked over the existing shimmer shadow so keyboard users get the white-on-primary doubled ring without losing the brand glow. Transition tokens swapped to `--duration-base` / `--duration-instant` / `--ease-standard`. (4) **`.stats-grid`:** gap snapped from 14px to `var(--space-4)` (16px) — aligns the dashboard stat-card grid to the 4px scale. Affects Dashboard's Outbound Summary grid + any other consumer. (5) **Dashboard hero clock (`.dashboard-hero-time`):** removed the inline `style={{ fontFamily: font.mono }}` that was forcing SF Mono. Clock now uses the body Inter Variable font with the existing `font-variant-numeric: tabular-nums` — Linear-style cleaner than the mono fallback. `font` import still used by `MetricCard` / `PipelineStage` subcomponents so kept. (6) **`NumberTicker` default duration unchanged at 900ms** — Phase 2 plan suggested aligning to `motion.duration.slow` (250ms), but on review 250ms is jarring for stat-counter tickers (the plan agent assumed a wrong baseline). 900ms is the field-tested value. (7) **Sidebar mobile drawer:** Phase C visual changes carried into Phase D for end-to-end verification across `@media (max-width: 768px)`; CSS unchanged in this phase. Particle bg, hero gradient, Brand block, Welcome banner, all preserved. Operator scan timings JS-driven and untouched. Build: `npm run build` green (16s). CSS bundle 38.86 kB (Phase C baseline 38.62 kB; +0.24 kB delta from shimmer-btn focus rule + comments). JS bundle 1614.29 kB (-0.10 kB; hero clock inline-style payload trimmed). Memory sync: `DESIGN_SYSTEM.md` Phase C section augmented with the Phase D bullet list. `CLAUDE.md` "Mevcut versiyon" bumped to `v2.38.1`. Previous: **Shared primitives polish (Phase C)** (v2.38.0). Frontend-only, additive, no schema/API contract impact, all component APIs unchanged. Third phase of the Linear/Vercel visual polish program (plan: `.claude/plans/rustling-splashing-forest.md`). **First phase with real but restrained visual changes.** Changes: (1) **Buttons (`.btn*`):** dropped `transform: translateY(-1px)` from `.btn-primary` / `.btn-outline` / `.btn-danger-solid` / `.btn-success` hover — modern minimal doesn't bounce; bg-darken + shadow lift handle the affordance. Added `:focus-visible` ring via `var(--shadow-focus-ring)` (white-on-primary doubled, Linear signature). Added `:active:not(:disabled) { transform: scale(0.98) }` 80ms tactile press. Per-variant focus-visible rings for danger/success use semantic colors. (2) **Tables (`.data-table-wrap tbody tr`):** hover bg tightened from `#fafbff` (bluish-white) to `var(--gray-50)` (`#fafafa`, neutral). Added `tr:focus-visible { box-shadow: inset 2px 0 0 var(--color-primary) }` for keyboard row navigation (additive; no row has `tabindex` today). `.row-d2/d3/d4` saha-doğrulanmış tints untouched. (3) **Inputs/Selects:** `.styled-select:focus` and `.filter-bar-input:focus` now use `var(--color-primary)` border + `var(--shadow-focus)` 3px ring (unified across the app). `.styled-select` gains a `:hover` border-strong fade. `.pagination-page-btn` gains `:focus-visible` ring + `font-variant-numeric: tabular-nums`. (4) **Sidebar (`.sidebar-link*` in `layout.css`):** dropped the `box-shadow: 0 0 10px rgba(37,130,235,0.6)` glow on `.sidebar-link--active::before` — Linear/Vercel don't glow; pure 2px accent rail instead (was 3px). Active label and icon color brightened from `#60a5fa` (washed) to `#ffffff`. Hover slides the icon `transform: translateX(2px)` over 150ms — Linear/Vercel micro-shift. (5) **Badges (`.count-badge`):** 12/700 → 11/600 with `--tracking-wide` + `font-variant-numeric: tabular-nums`. Padding bumped 2px→3px vertical to compensate. Colors preserved (`#e0e7ff` bg / `#4f46e5` text). (6) **StatCard typography:** value gains `tabular-nums`; label weight 500→600 with `--tracking-wide`. Colors and sizes preserved. (7) **Pagination info:** `tabular-nums` for "1–30 of N · Page X / Y". (8) **New shared modal primitives:** `.modal-backdrop` (`backdrop-filter: blur(8px)` + `rgba(15,23,42,0.55)` overlay + `modalBackdropIn` 200ms standard ease), `.modal-card` (scales in from `0.96 → 1` in 200ms emphasized ease `cubic-bezier(0.2,0,0,1)`, `--radius-2xl` + `--shadow-lg`), `.modal-card--wide` (640px), `.modal-header--danger/--primary`, `.modal-icon--danger/--primary`, `.modal-title`, `.modal-body`, `.modal-message`, `.modal-detail`, `.modal-footer`. New `@keyframes modalCardIn`. (9) **ConfirmModal migration (`components/shared/ConfirmModal.tsx`):** all heavy inline `style={{}}` blocks replaced with the new `.modal-*` classes; Confirm + Cancel buttons now use the `.btn`/`.btn-ghost`/`.btn-primary`/`.btn-danger-solid` system (gains focus rings + `:active` scale automatically). **Props/API unchanged** (`title`/`message`/`detail`/`confirmLabel`/`cancelLabel`/`tone`/`busy`/`onConfirm`/`onCancel`). Removed unused `colors` import. Other shared modals (`BulkScanModal`, `QuickScanModal`, `GenerateDirectModal`, `SlaHistoryModal`, `DayDetailModal`, `DirectOrderFormModal`) keep their existing inline styles — they migrate per-tier in Phases E/F where the surrounding page is also touched. `.shimmer-btn` (login submit) keeps its `translateY(-1px)` hover — Login is Tier 1 polish in Phase D. Operator scan timings (2s banner / 3-note beep / 4-pulse vibrate) JS-driven and untouched. Build: `npm run build` green; CSS bundle 38.62 kB (Phase B baseline 35.36 kB; +3.26 kB delta covers all new focus rings + modal classes + keyframes); JS bundle 1614.39 kB (-1 kB; ConfirmModal lost its inline-style payload). Memory sync: `DESIGN_SYSTEM.md` gained a "Phase C — Shared Primitives Polish (v2.38.0)" header section + Modal primitives reference. `CLAUDE.md` "Mevcut versiyon" bumped to `v2.38.0`. Previous: **CSS reorganization (Phase B)** (v2.37.1). Frontend-only, additive, no schema/API/visual impact. Second phase of the Linear/Vercel visual polish program (plan: `.claude/plans/rustling-splashing-forest.md`). `frontend/src/index.css` (2139 lines) carved into 6 ordered partials under `frontend/src/styles/`: `tokens.css` (already existed from Phase A), `reset.css` (reset block + `prefers-reduced-motion` override relocated), `layout.css` (`.app-layout`, `.app-content`, `.sidebar*`, `.panel-*`, sidebar chrome `.sidebar-hamburger` / `.header-signout-btn` / `.sidebar-close-btn`, `.sidebar-mobile-overlay`), `components.css` (everything else from the active stylesheet: `.stat-card*`, `.section-*`, `.count-badge`, `.data-table-wrap*`, `.toolbar-card`, `.btn*`, `.styled-select`, `.empty-state*`, `.stats-grid`, `.spinner*`, `.loading-state`, `.feedback-banner*`, `.pagination*`, `.dashboard-hero*`, `.picker-stat-card`, the responsive media-query block, `.login-*`, `.shimmer-btn*`, `.scan-input-row`, `celebrate-*` keyframes, `.beam-wrap*`, `.sortable-th*`, `.filter-bar*`, `.bulk-action-bar*`), `utilities.css` (`.tabular-nums` relocated from `tokens.css`, new `.truncate` + `.sr-only` helpers), `legacy.css` (`.inbound-*`, `.order-table-wrap`, `.picker-admin-*` deprecated families isolated with a removal-candidate header — planned for grep-and-delete in Phase I when zero consumers remain). `index.css` is now 17 lines of `@import` statements in cascade order: `tokens → reset → layout → components → utilities → legacy`. Selector-set diff vs `HEAD` (pre-split): zero removals, zero renames; only additions are the two new utilities (`.truncate`, `.sr-only`) — verified via `diff` of all `^\.[a-zA-Z]` selector starts between HEAD `index.css + tokens.css` and the new 7-file sourceset. Cascade preserved because: (a) deprecated `.inbound-*` / `.order-table-wrap` / `.picker-admin-*` selector names do not overlap any active selector elsewhere, so moving `legacy.css` to the end of the import chain has no observable effect; (b) the responsive `@media` block stays in `components.css` (loaded after `layout.css`), so media-query overrides on `.panel-*` still win over base `.panel-*` styles (cascade is positional within concatenated output). Initially explored adding a `:focus-visible` normalizer to `reset.css` but **reverted** — it would have removed default focus rings from `button`/`a`/`input` keyboard users (accessibility regression); proper per-component focus rings using the `--shadow-focus-ring` token are scheduled for Phase C primitives polish. Build: `npm run build` green; CSS bundle 35.36 kB (Phase A baseline 35.16 kB; +0.20 kB delta is exactly the two new utilities + comment headers in each partial); JS bundle unchanged at 1615.40 kB. Memory sync: `DESIGN_SYSTEM.md` Phase A section augmented with Phase B partition map; `CLAUDE.md` "Mevcut versiyon" bumped to `v2.37.1`. Previous: **Modern-minimal design-system token foundation (Phase A)** (v2.37.0). Frontend-only, additive, no schema or API contract impact. First phase of a Linear/Vercel-inspired visual polish program (plan: `.claude/plans/rustling-splashing-forest.md`, scope = all 25 pages, depth = visual polish only; routes/flows/component-APIs/operator-scan timings untouched). Code: (1) `frontend/src/theme.ts` extended additively — new `space` (4px scale), `fontSize`/`lineHeight`/`tracking`, extended `radius` (`xs`/`2xl`), extended `shadow` (layered `xs/sm/md/lg` + `focus`/`focusRing`), extended `motion` (`duration{instant,fast,base,slow,slower}` + `ease{standard,emphasized,exit}` cubic-beziers), new `colors.gray` 12-step neutral scale (50→950, Linear-flavoured). All legacy keys (`radius.{sm,md,lg,xl,full}`, `shadow.{card,cardHover,btn,xl}`, `font.{xs..xxl}`, `motion.{fast,normal,slow}`, every `colors.*` value) preserved verbatim — zero call-site breakage. `colors.delay*`, `colors.platform`, `colors.priority()` saha-doğrulanmış values explicitly untouched. (2) New `frontend/src/styles/tokens.css` mirrors every token as CSS custom properties on `:root` so non-TSX styles can consume them; includes `.tabular-nums` utility class. `@import`-ed at top of `index.css`. (3) `@fontsource-variable/inter` installed in `frontend` workspace; `main.tsx` imports `@fontsource-variable/inter/wght.css` (covers Latin + Cyrillic + Greek + Vietnamese, weight axis only — one woff2 covers 100–900); `body` font-family in `index.css` updated to lead with `'Inter Variable'` and fall back to the original `-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, …` stack. `font-display: swap` (built-in to fontsource) + identical fallback prevents FOUT-induced layout shift. No explicit `<link rel="preload">` in `index.html` because Vite hashes woff2 filenames at build time (verified: build emits `inter-latin-wght-normal-Dx4kXJAl.woff2` 48.26 kB); revisit with `vite-plugin-preload` if Lighthouse CLS regresses. (4) Global `@media (prefers-reduced-motion: reduce)` rule appended to `index.css` neutralises every transition/animation app-wide for users with the OS-level setting on; operator scan audio/haptic feedback is JS-driven (`AudioContext`, `navigator.vibrate`, `setTimeout`) and intentionally NOT affected, so the saha-doğrulanmış 2s banner + 3-note beep + 4-pulse vibrate remain exactly as shipped in v2.36.2. (5) Bundled side-fix: `frontend/src/pages/MarketingReport.tsx` lines 309/321/333 recharts `Tooltip formatter` type was `(v: number) => …`, incompatible with recharts 3.x `Formatter<ValueType, NameType>` (`ValueType | undefined`) — switched to `(v) => …(Number(v))` form so `npm run build` (= `tsc -b && vite build`) is green again. Pre-existing breakage since `28a592a` (April 2026) blocked Phase A from being taggable; included in this commit so the build gate clears. Visual diff: **negligible** — Inter renders nearly identically to the system stack at body text sizes; new tokens have zero consumers yet (Phase A is foundation; Phase C primitives polish will consume them). Memory sync: `DESIGN_SYSTEM.md` gained a "Phase A — Modern Minimal Token Foundation (v2.37.0)" header section listing every new token and the Inter swap. `CLAUDE.md` "Mevcut versiyon" bumped to `v2.37.0`. Previous (not previously docs-synced — see commit history): **v2.36.2 scan UX feedback bundle** (faster banner 7s→2s + louder/longer beep + stronger 4-pulse vibrate, commit `affc515`), **v2.36.1 single-mode scan auto-re-fire fix** (`lastResolvedIdRef` double-fire guard, saha-doğrulandı 30 ardışık scan hatasız, commit `1588486`), **v2.36.0 Stock UX cleanup + product delete cascade** (Stock row Delete removed, Remove-boxes Unit+Qty per box, deleteProduct cascade, commit `0e7bfa8`). Older base: **Label PDF — product name full-render fix (2-shot)** (v2.35.4 → v2.35.5). Pure backend render-side, no schema or API contract impact. Field photo showed thermal stickers printing product names as "Dried Di…" / "Dried Califor…" — `backend/src/services/stockService.ts buildStickerPdf` was ellipsis-truncating names that didn't fit on a single 10pt line in the ~18 mm text strip. **v2.35.4 (initial):** new `fitProductName` helper tries sizes `[10,9,8,7]` pt with 2-line greedy wrap. **Shipped but insufficient:** at 7pt, Helvetica-Bold "California Almonds" measures 64 pt > 51 pt text-W, so the 2-line budget never fit any "Dried California X" name and the fallback re-truncated with ellipsis. **v2.35.5 (success):** extend sizes to `[10,9,8,7,6]` pt + 3-line wrap fallback at 7/6 pt; `greedyWrap(doc, text, maxWidth, maxLines)` helper extracted. Local probe (same PDFKit version + Helvetica-Bold + `widthOfString`) verified the entire realistic cohort before push: `Dried California Almonds` → 6pt 2-line ("Dried California" / "Almonds"); `Premium Organic Walnut Halves` → 6pt 2-line. 3-line at 7pt = 25.2 pt of vertical space; baseline of line 3 = 39.4 pt; qty row at 42.5 pt → ~3 pt clearance, no collision. Ellipsis fallback only for pathological single-word names > 51 pt at 6pt (not seen on real products). Schema unchanged; QR settings (raw UUID payload, EC=M, margin 4, 36 mm canvas) unchanged. Detail: SOLUTIONS.md [2026-05-20] entry. Previous: **Role-aware root route fix** (v2.35.3). Pure frontend, no schema or API contract impact. Long-standing bug surfaced: when a non-admin session (SALES_AGENT, PICKER_ADMIN, PACKER_ADMIN, PICKER, PACKER, STOCK_KEEPER) hit the bare domain `/` with an active cookie, `<ProtectedRoute allowedRoles={[ADMIN, INBOUND_ADMIN]}>` bounced them to `/unauthorized` which renders the "Coming Soon — under construction" `PlaceholderPage`. A user logging in as `agent1` (SALES_AGENT) and going to `https://domwarehouse.com/` saw a 403 dead-end with no obvious recovery path; only `Login.tsx` post-submit redirect knew about `getDefaultRoute(role)`, so a stale-cookie return to `/` skipped that branch entirely. Fix: replaced the `/` route's `<ProtectedRoute>` wrapper with a new `RootRoute` component (`frontend/src/App.tsx:39-56`) that renders `<Dashboard>` for ADMIN/INBOUND_ADMIN as before, and `<Navigate>` redirects every other role to their own home (`/picker-admin`, `/packer-admin`, `/picker`, `/packer`, `/sales`, `/stock/scan`). Unknown roles fall through to `/login`. Admin behavior is byte-identical; the fix is strictly additive for the other six roles. Previous: v2.35.2 console-noise cleanup (partial — see SOLUTIONS.md [2026-05-19] addendum). Older base: **Console-noise cleanup (partial)** (v2.35.2). Pure frontend/infra, no schema or API contract impact. Two changes shipped, one fully successful, one partial — see SOLUTIONS.md [2026-05-19] addendum for the verified post-deploy behavior. (1) ✅ `App.tsx` `BrowserRouter` opted into React Router v7 future flags `v7_startTransition` + `v7_relativeSplatPath` — **both warnings now gone on live**. Splat route is a single `Navigate` (no nested children), so `v7_relativeSplatPath` is a no-op for this app; `v7_startTransition` wraps route transitions in `React.startTransition` — no observable regression. (2) ⚠️ `vite.config.ts` `server.hmr` is now gated by `VITE_DISABLE_HMR` env var; `docker-compose.yml` passes the env var through. On Vultr, `VITE_DISABLE_HMR=true` was added to `.env` and frontend was rebuilt. **However**, verification on live showed `server.hmr: false` only disables the server-side WS handler — Vite still injects `/@vite/client` into every page, which unconditionally tries to open a WebSocket and fails the same way as before. The `wss://domwarehouse.com/?token=…` + `wss://localhost:5173/?token=…` retries persist. The env-gated config is kept in place as a forward-compatible toggle (zero-cost no-op), but the real silence requires moving from Vite **dev mode** to `vite build` + static serve in production. That's tracked as v2.36.0; rationale and scope live in SOLUTIONS.md [2026-05-19] addendum. App behavior unchanged on live — real Socket.io still connects, all panels work; the leftover noise is purely cosmetic. Previous: **Products page filters + pagination** (v2.35.1). Pure frontend, no schema or API contract impact. Products tab now has a top-left **category filter** dropdown (`All categories` default) + **search box** (matches product name, productCode, or category name) side-by-side; the `+ Add Product` button moved right with `marginLeft: auto`. The table is paginated at **30 rows/page** with the same Prev/Next + numbered footer used on Stock. To avoid duplication, the Pagination component + `buildPageList` helper were lifted from `StockSummary.tsx` into a new reusable `components/shared/Pagination.tsx`; both pages import it. Previous: **Stock page UX polish + sidebar submenu visibility** (v2.35.0) — `#` row-number column on Stock, 30 rows/page pagination, prominent SVG chevron pill on the sidebar's Inventory parent, `.sidebar-submenu` container with left guide line + brighter child link styling. Pure frontend change, no schema or API contract impact. Older context: **Inventory thermal-label + scan UX iteration** (v2.33.1 – v2.34.5). All work in this band is application/UI/render-side: no schema or API-contract breakage. Highlights: A4 Avery (10 stickers/sheet) replaced with **thermal label roll 60 × 40 mm, 1 label per page** (v2.33.1). Mobile scan UX rewritten — fullscreen camera overlay, floating top bar with × close + Operation + Warehouse + Single/Bulk mode toggle, gradient bottom strip with result banner or running bulk log + counter (v2.34.2). **Single Scan** keeps the explicit Confirm bottom-sheet introduced in v2.33.5; **Bulk Scan** mirrors `InboundScan`/`PickerAdminScan` — auto-commit each detect with 800 ms debounce, log the result, no per-scan confirmation. **Strict re-IN block** (v2.34.1) — once a label is IN_STOCK or OUT_OF_STOCK, the Stock In op hard-errors and points the operator at Transfer / Stock Out. **Manual stock adjustment** (v2.34.0) — new `POST /stock/adjust` (ADMIN) creates / removes IN_STOCK rows without scanning labels; Stock page Edit modal grew a 3-section layout (Product details · Current per-warehouse breakdown · Adjust stock ADD/REMOVE), batch `ADJ-YYYYMMDD-NNN`, reusing MovementType IN/USED (no schema change). QR generation tuned for the smaller sticker — raw UUID payload (was `{id}` JSON), `errorCorrectionLevel: 'M'`, `margin: 4`, canvas 36 × 36 mm — module size restored from a marginal 0.81 mm to a comfortable 1.09 mm so phone cameras lock on quickly (v2.33.3). PDFKit `lineBreak: false + ellipsis` is unreliable with explicit `(x, y)` in v0.18.0, so a `fitText(doc, str, maxWidth)` helper measures with `doc.widthOfString` and manually truncates to a single line with `…` (v2.33.4). The printed sticker now omits the warehouse-name row entirely — it's in the DB and surfaces in the scan UI on decode — leaving room for product 10pt / qty 12pt / code+batch 7pt (v2.34.2). Vibrate patterns hardened (`[80,60,140]` on detect, `[200,60,80,60,80]` on success, `[100,60,100,60,100]` on error) for Android; iOS Safari still has no Web Vibration support and silently no-ops there (v2.33.6). **Inventory module overhaul** (v2.33.0). Operation-driven scan replaces the implicit IN/USED/TRANSFER state machine: the stock keeper picks **Stock In**, **Stock Out**, or **Stock Transfer** from a dropdown (with a second "to warehouse" picker for Transfer), and the server only validates the chosen transition. QR label generation no longer auto-inflates inventory — `POST /stock/labels` writes new `StockItem` rows in a new **`StockStatus.PENDING`** status, and the first **Stock In** scan flips them to `IN_STOCK`; until then they are invisible to `/stock/summary`, `/stock/stats`, and warehouse counters. Stock page rewritten: 4 KPI cards removed, search input added, Transfer/Used columns replaced with a **Box Quantity** column, hover on the In-Stock cell pops a per-warehouse breakdown tooltip (boxes × quantity per warehouse), and each row gains Edit + Delete actions. Product creation auto-generates `Product ID` as `{CategoryPrefix3}-NNN` (Nuts → NUT-001, …); collisions retry 5×. Native `window.confirm()` removed from every Inventory page in favour of a new `components/shared/ConfirmModal.tsx` (createPortal modal). Scan page rebuilt with operation/warehouse bottom-sheet pickers and an optional "Show raw QR" debug overlay for diagnosing field-side scan failures; the QR parser now accepts either raw UUID or `{id: "<uuid>"}` JSON. Frontend `StockSummaryRow` reshape — `inStockCount`/`transferCount`/`usedCount` replaced with `inStockQuantity`/`boxCount`/`byWarehouse[]`. **PickerAdmin workload performance** finished (v2.32.0 + v2.32.1). v2.32.0 collapsed `getPickerStats` from N+1 (4N+2 Prisma queries) to 6 batched queries with in-memory aggregation, but the workload section was still slow because the `returned` subquery (`statusHistory.some({ fromStatus IN (...), toStatus: PICKER_ASSIGNED })`) hit `OrderStatusHistory` without a covering index — Postgres did a sequential scan. v2.32.1 adds a composite index on `OrderStatusHistory(order_id, from_status, to_status)` (created on the live DB with `CREATE INDEX CONCURRENTLY` first to avoid blocking writes; schema change is then a no-op for `db push`). **Inventory module redesign** shipped (v2.31.0–v2.31.2) + picker badge filter & CD schema-flag fixes (v2.31.3) + PackerAdmin per-packer "Assigned" count (v2.31.4) + Dashboard clock format + PickerAdmin workload prefetch + Nightly report today-only refactor (v2.31.5) + Mobile app plan tracking doc `MOBILE_APP.md` added to project root (v2.31.6 — docs only, no code change). Sidebar gained a parent "Inventory" menu with 4 children: **Product** (admin master data — Category, Product Name, Product ID/code, Default Unit, Reserved threshold), **Inventory** (relocated label generator — Product dropdown, KG/PCS toggle, Quantity, Warehouse dropdown, auto Batch Number `YYYYMMDD-NNN`, Label count), **Warehouse** (warehouse master data with Name + Address), **Stock** (per-product summary table with Transfer / Used / In-Stock counts and Low-Stock badge when in-stock < reserved). New tables: `product_categories`, `products`, `warehouses`. `stock_items` rewritten with FKs (`productId`, `warehouseId`) plus `unit` (KG/PCS), `quantity`, `batchNumber`. `stock_movements.type` enum replaces `MovementDirection` — IN / USED / TRANSFER. Scan state machine in `/stock/scan` (body now requires `{ id, warehouseId }`): same warehouse → USED (out), different warehouse → TRANSFER (warehouse change, status stays IN), OUT_OF_STOCK re-scan → IN (re-stock). `/stock/labels` now creates `count` `StockItem` rows in DB at print time inside a transaction; QR payload is `{ id }`; sticker text shows product name + product code + quantity+unit + warehouse name + batch. New routes `/products` + `/warehouses` (CRUD, ADMIN-only except `GET` which is also STOCK_KEEPER for the scan dropdowns). `/stock/summary` returns per-product aggregates for the Stock page. StockScan UI has a top-of-screen warehouse selector (full-width pill button → bottom sheet) with `localStorage` persist. Sidebar `NavItem` interface gained `children?: NavItem[]` with collapse/expand state. Vite proxy `proxyRoutes` extended with `/products` and `/warehouses`.

Patch v2.31.1 (2026-05-05) — `frontend/vite.config.ts` `allowedHosts` extended with `localhost` and `127.0.0.1`. Vite 5 strict host check was returning 403 on local dev because the prod-only allowlist had stripped these. SOLUTIONS.md [2026-05-05] documents the regression.

Patch v2.31.2 (2026-05-05) — CD pipeline switched from `prisma migrate deploy` to `prisma db push --accept-data-loss --skip-generate`. The auto-generated migration captured only the v2.30.0 → v2.31.0 delta, but live was still v2.29.0 so the migration would have crashed on the first `TRUNCATE` against tables that did not exist. This project uses `db push` for schema sync (per SOLUTIONS.md [2026-04-20]); the migration file was deleted.

Patch v2.31.3 (2026-05-06) — two bundled fixes:
1. **PickerAdmin "↩ Returned" badge filter widening** — `getPickerStats` in `backend/src/services/pickerAdminService.ts` filtered the "returned" history match on `fromStatus = PICKER_COMPLETE` only, but `removeOrder` writes the transition with the order's current status as `fromStatus`. Returns from `PACKER_ASSIGNED` (the most common case — "packer rejected the order") wrote `PACKER_ASSIGNED → PICKER_ASSIGNED` history and were silently invisible to the badge. 7-day prod sample: 12 of 124 returns missed. Filter widened to `fromStatus IN [PICKER_COMPLETE, PACKER_ASSIGNED, PACKER_COMPLETE]` in both occurrences (per-picker `returned` count and tenant `returnedCount`).
2. **CD `--schema` flag** — `.github/workflows/cd.yml` line 86 now passes `--schema=backend/prisma/schema.prisma` to `prisma db push`. Dockerfile's `WORKDIR=/app` (monorepo root) doesn't co-locate the schema, so the previous flagless command exited "Could not find Prisma Schema". The v2.31.2 deploy required a one-off manual `db push` from SSH because of this; v2.31.3 onward auto-syncs.

Patch v2.31.4 (2026-05-06) — PackerAdmin per-packer card now shows an `Assigned` count (active `packerAssignment.completedAt = null` rows whose order is at `PACKER_ASSIGNED` and not archived) alongside the existing `Done Today`. Backend `getPackerStats` returns `{ packer, completed, completedToday, assigned }`; frontend `PackerStatCard` mirrors `PickerStatCard` layout — header "X active · Y packed today", blue Assigned chip, green Done Today chip, two-segment progress bar.

Patch v2.32.1 (2026-05-07) — **`OrderStatusHistory` composite index**. After v2.32.0 shipped, the `/picker-admin/stats` request still hung in `pending` (DevTools network tab). Container verification confirmed the new code was running (`docker exec dom_backend grep -c groupBy /app/backend/dist/services/pickerAdminService.js` returned `2`). The remaining bottleneck was the `returned` `findMany` and tenant-level `returnedCount` queries: both apply `statusHistory.some({ fromStatus IN [PICKER_COMPLETE, PACKER_ASSIGNED, PACKER_COMPLETE], toStatus: PICKER_ASSIGNED })`, which in Postgres becomes an `EXISTS` subquery against `order_status_history`. The table only had PK + FK auto-indexes, so Postgres did a sequential scan over the entire history every time. Fix: composite index `order_status_history(order_id, from_status, to_status)` added via `@@index([orderId, fromStatus, toStatus], map: "order_status_history_order_id_from_status_to_status_idx")`. To avoid blocking live picker/packer scans (which write status history rows on every transition), the index was created **first** on the live database with `CREATE INDEX CONCURRENTLY` from `psql`, then the schema change committed. CD's `prisma db push` sees the index already exists and no-ops, so deploy is also lock-free.

Minor v2.32.0 (2026-05-07) — **PickerAdmin workload performance**. Symptom: opening `/picker-admin` left the "Picker Workload" section empty for ~10 s before per-picker cards rendered. Root cause was `getPickerStats` in `backend/src/services/pickerAdminService.ts:274`: for each active picker it issued 4 parallel Prisma queries (active assignments, lifetime completed count, today completed count, returned count), then 2 tenant-level queries — so with N pickers the request fanned out to **4N+2** queries. The `returned` count was the worst offender: a `statusHistory.some({ fromStatus IN (...), toStatus: PICKER_ASSIGNED })` subquery against `OrderStatusHistory`, which has no composite index on `(order_id, from_status, to_status)`, so Postgres scanned the history table once per picker. Fix: rewrote the function to issue exactly **6 queries regardless of N** — one `findMany` for active assignments (selecting `pickerId`), two `groupBy({ by: ['pickerId'] })` aggregates (lifetime completed, today completed), one `findMany` for the returned set, and the two unchanged tenant-level counts. Per-picker bucketing happens in JS via `Map`. Same response shape and tenant scoping; `returnedCount` and `totalCompleted` queries unchanged. Frontend (`frontend/src/pages/PickerAdmin.tsx:1116`): `staleTime` flipped from `0` to `5_000` and `placeholderData: keepPreviousData` added (with `keepPreviousData` imported from `@tanstack/react-query`), so the workload grid keeps showing the previous frame during background refetches instead of going blank. The 10 s `refetchInterval` is preserved.

Patch v2.31.5 (2026-05-06) — three small UX fixes bundled:
1. **Dashboard clock zero-pad** — `frontend/src/pages/Dashboard.tsx` was calling `toLocaleTimeString` twice (one for hour, one for minute); the minute-only call returned single-digit minutes (`"4"` instead of `"04"`), so the live hero clock rendered `08:4`. Replaced with a single `toLocaleTimeString({ hour: '2-digit', minute: '2-digit', hour12: false })` + `split(':')`.
2. **PickerAdmin workload prefetch** — `PickerStatCard` now prefetches the picker's active orders on `onMouseEnter` / `onFocus` via `queryClient.prefetchQuery` (`staleTime: 5s`). Modal opens with data already in cache instead of waiting for the click-triggered fetch.
3. **Nightly report — today-only** — `backend/src/jobs/nightlyReport.ts` dropped lifetime totals (`inboundTotal`/`outboundTotal`), the yesterday delta badge, and the 7-day sparkline. Replaced with a `scannedToday` count (via `workDate` window) and a simple "Today's Pipeline" progress bar (`dispatchedToday / dailyWorkload`). KPI cards: Scanned Today · Dispatched Today · Still in Pipeline. SLA distribution + top carriers + top performers (all today-scoped) preserved. Subject line dropped the `(+N)` delta.

Previous (v2.30.0, in development) — Stock Control module (warehouse box inventory, fully isolated from order pipeline). New `STOCK_KEEPER` role added to `UserRole` enum. Single-page `/stock` admin dashboard with hardcoded `STOCK_CATEGORIES` list, `productType`/`category`/`weightKg` columns. Lazy-create flow: `POST /stock/labels` returned a PDF of QR codes with embedded JSON (`{id, p, c, w}`); `StockItem` row created on first scan. Replaced by v2.31.0 redesign above.

Previous (v2.29.0, deployed 2026-05-02, merge commit `13fb7c2`) — Packer flow rebuilt: shared queue replaced with per-packer pre-assignment (mirrors picker flow). `OrderStatus.PACKER_ASSIGNED` activated. New `/packer-admin/{assign,bulk-assign,scan,handheld-bulk-scan,pending-staged,unassign}` endpoints; new `/packer-admin-scan` phone page with green theme; PackerAdmin desktop gains Scan & Stage section + per-row PACKER_ASSIGNED badge; PackerMobile shows assigned-only list. Status flow `PICKER_COMPLETE → PACKER_ASSIGNED → PACKER_COMPLETE → OUTBOUND` (auto-dispatch preserved).

---

## 1. Project Overview

**Dynamic Order Management (DOM)** is a warehouse order tracking system designed to manage the full lifecycle of e-commerce orders from arrival (inbound) through picking, packing, and final dispatch (outbound).

### Business Context
- A single warehouse company currently, with architecture ready to support multiple companies (multi-tenant)
- Orders arrive daily from multiple e-commerce platforms: **Shopee**, **Lazada**, **TikTok Shop**, **Direct** (in-house waybills with DR prefix)
- **Timezone:** All timestamps, schedules, and "start of day" calculations are anchored to **Asia/Manila (UTC+8, PHT — no DST)**. The cron jobs use UTC values that map to Manila local time. The frontend displays all dates and times in Manila time regardless of the user's browser timezone.
- Physical waybills are scanned using barcode scanners to enter orders into the system
- 50–100 staff members use the system simultaneously
- Daily volume: ~10,000 orders
- Data retention: minimum 6 months (180 days) for `Order` and its child tables (`OrderStatusHistory`, `PickerAssignment`, `PackerAssignment`, `SlaEscalation`)
- **Stock module data is exempt from retention.** `StockItem` and `StockMovement` rows are never archived or hard-deleted; they accumulate as a permanent history so the Stock Out page and movement reports stay queryable indefinitely. Do not add archive/cleanup logic to stock tables.

### Core Workflow
```
07:00  Inbound Admin scans ~1500 waybills (work_date set to today)
        │  SLA 4-hour countdown starts (D0)
        │  [Direct] DR+8-digit tracking generated via "Generate Direct Inbound"
        ▼
  Picker Admin assigns → Picker prepares on handheld
        │
        ▼
  Packer Admin queue (auto) → Packer scans on handheld
        │   ↑ Remove → auto-reassigns back to original picker
        ▼
     Outbound ← SLA countdown ends
        │  [Historical view] Date navigator shows past days' carrier/shop reports
        │
23:30  Archive job runs: all OUTBOUND orders → archived_at set
        │  Active panels show 0 OUTBOUND rows
        │  Incomplete orders carry over to next day (CARRY badge)
        ▼
23:40  Nightly report email + hard-delete of orders > 180 days archived
```

**Carryover:** Orders not completed by end of shift remain active the next day. They are shown with an amber **CARRY** badge in all admin panels so supervisors can prioritize them.

**Daily cycle repeats** — new waybills each morning, incomplete orders carry forward, completed orders archived at 11:00.

### SLA Policy (D0–D4)
Every order must be completed (reach **OUTBOUND**) within **4 hours** of scanning. If it is not, it escalates through delay levels automatically:

| Level | Elapsed Time Since Scan | Priority Boost | Action Required |
|---|---|---|---|
| **D0** | 0–4 hours | +0 | Normal processing |
| **D1** | 4–8 hours | +200 | Prioritize over new orders |
| **D2** | 8–12 hours | +400 | Urgent — team lead attention |
| **D3** | 12–16 hours | +800 | Serious — immediate action |
| **D4** | 16+ hours | +1600 | Critical — supervisor notified by email & live alert |

- D-level escalation runs automatically every **15 minutes** via a background job
- D4 is the maximum — no further escalation, but supervisor is alerted immediately
- D-level is **independent** of status (an order can be D2 while still in PICKING)
- D-level **resets only when the order reaches OUTBOUND**

---

## 2. System Architecture

```
┌────────────────────────────────────────────────────────────────────────────┐
│                                 CLIENTS                                    │
│                                                                            │
│  ┌──────────────────────────────────┐  ┌────────────────────────────────┐ │
│  │  Desktop Browser (React)         │  │  Handheld Device (Android)     │ │
│  │  Admin / Inbound / Picker Admin  │  │  Picker & Packer               │ │
│  │  Packer Admin / Outbound         │  │  + Inbound Admin Scan          │ │
│  │  + HID Barcode Scanner (inbound) │  │  + Picker Admin Scan           │ │
│  │                                  │  │  Chrome browser — HTTPS/LAN    │ │
│  └──────────────────┬───────────────┘  └──────────────┬─────────────────┘ │
└─────────────────────┼────────────────────────────────── ┼──────────────────┘
                      │         HTTPS + WSS               │
┌─────────────────────▼───────────────────────────────────▼──────────────────┐
│                         BACKEND (Node.js + Fastify)                        │
│                                                                            │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐                    │
│  │   Auth API   │  │  Orders API  │  │  Users API   │                    │
│  │  POST /login │  │  GET/POST    │  │  CRUD        │                    │
│  │  POST /logout│  │  /orders/*   │  │  /users/*    │                    │
│  └──────────────┘  └──────────────┘  └──────────────┘                    │
│                                                                            │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────────────┐    │
│  │ Assign API   │  │ Reports API  │  │  WebSocket (Socket.io)       │    │
│  │ /assign/*    │  │ /reports/*   │  │  tenant:{id} — broadcast     │    │
│  └──────────────┘  └──────────────┘  │  user:{id}  — targeted push  │    │
│                                       └──────────────────────────────┘    │
│                                                                            │
│  ┌──────────────────────────────────────────────────────────────────────┐ │
│  │  BullMQ Job Queue                                                    │ │
│  │  → Archive job 23:30 PHT (15:30 UTC): OUTBOUND orders archived     │ │
│  │  → Nightly 23:40 PHT (15:40 UTC): email + hard-delete expired      │ │
│  │  → SLA sweep every 15 min: D0→D1→D2→D3→D4 escalation                │ │
│  │  → D4 supervisor alert email (triggered by sweep)                    │ │
│  └──────────────────────────────────────────────────────────────────────┘ │
└─────────────────────┬──────────────────────────┬───────────────────────────┘
                      │                          │
           ┌──────────▼──────────┐  ┌────────────▼───────────┐
           │    PostgreSQL 16    │  │         Redis           │
           │                    │  │                         │
           │  orders            │  │  JWT sessions           │
           │  users             │  │  order list cache       │
           │  tenants           │  │  BullMQ job queues      │
           │  assignments       │  │  socket user→room map   │
           │  status_history    │  └─────────────────────────┘
           │  sla_escalations   │
           └────────────────────┘
```

---

## 3. Order Status Lifecycle

```
┌───────────────────────────────────────────────────────────────────────┐
│                      ORDER STATUS FLOW                                │
│                                                                       │
│  [INBOUND]  ← sla_started_at set, delay_level = D0                   │
│      │  Inbound Admin scans waybill                                   │
│      ▼                                                                │
│  [PICKER_ASSIGNED]  ←──────────────────────────────────────────────┐ │
│      │  Picker Admin assigns to a Picker                            │ │
│      ▼                                                              │ │
│  [PICKING]                                                          │ │
│      │  Picker starts preparing the order                           │ │
│      ▼                                                              │ │
│  [PICKER_COMPLETE]                                                  │ │
│      │  Picker marks as complete (on handheld)                      │ │
│      │  Order appears in Packer Admin staging area                  │ │
│      ▼                                                              │ │
│  [PACKER_ASSIGNED]  ←─────────────────────────────────────────────┐ │ │
│      │  Packer Admin assigns to a specific Packer (Scan & Stage)  │ │ │
│      │  Order pushed to assigned packer's handheld queue          │ │ │
│      ▼                                                            │ │ │
│  ─ ─ ─ ─ ─ Packer scans waybill on handheld ─ ─ ─ ─ ─             │ │ │
│  │  Only the assigned packer can complete (race-protected)        │ │ │
│  │  OR: Packer Admin manually completes the assignment            │ │ │
│  │  OR: Packer Admin removes → reverts to PICKER_ASSIGNED ────────┼─┘ │
│  │  OR: Packer Admin unassigns → reverts to PICKER_COMPLETE ──────┘   │
│  ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─                              │
│      ▼                                                                │
│  [PACKER_COMPLETE]                                                    │
│      │  Packer completes packing                                      │
│      ▼                                                                │
│  [OUTBOUND]  ← sla_completed_at set, SLA countdown ends              │
│      │  Order dispatched                                              │
│      ▼                                                                │
│    Done                                                               │
└───────────────────────────────────────────────────────────────────────┘
```

> **Note:** `PACKER_ASSIGNED` is active since **v2.29.0** — Packer Admin pre-assigns orders to specific packers (mirroring the picker flow); the assigned packer then scans on their handheld to mark the order PACKER_COMPLETE. `PACKING` remains in the `OrderStatus` enum but is not currently used — the live flow goes `PICKER_COMPLETE → PACKER_ASSIGNED → PACKER_COMPLETE` with no intermediate PACKING state.

> **Important:** The SLA D-level escalates based on wall-clock time since scan — it is **independent of status**. An order can be at D2 while still in PICKING. Status and D-level are two separate dimensions.

### Priority Rules
| Scenario | Priority Change |
|---|---|
| Order scanned | 0 (default) |
| End of day — unassigned carryover | +100 |
| SLA escalates to D1 | +200 |
| SLA escalates to D2 | +400 (delta: +200 from D1) |
| SLA escalates to D3 | +800 (delta: +400 from D2) |
| SLA escalates to D4 | +1600 (delta: +800 from D3) |

Priority boosts are **additive** — a D2 carryover order has priority 500 (100 + 400). Orders are always sorted `priority DESC, created_at ASC`.

---

## 4. Waybill Scanning — Real-World Analysis

> Based on actual waybill analysis from Shopee, Lazada, and TikTok samples (real barcodes decoded).

### What a Barcode Scan Returns

All three platforms encode **only the tracking number** in their barcode/QR code — nothing else:

| Platform | Tracking Number Format | Example | Waybill Type |
|---|---|---|---|
| Shopee | Starts with `PH` | `PH269238346086D` | Text-based (PDF) |
| Lazada | Starts with `P` or `MP` | `P1416JAAX7QAJ`, `MP1455630180` | Image-based (scan) |
| TikTok | Starts with `JT` (J&T Express) | `JT0015937203819` | Text-based (PDF) |

Both barcode (CODE128) and QR code on the same waybill encode **identical data** — just the tracking number.

> **TikTok Note:** TikTok waybills contain a separate "TT Order ID" (e.g. `583406071177971250`) which is TikTok's internal order reference. The system uses the **tracking number** (`JT...`) as the unique key — not the TT Order ID.

### Scanner Hardware

| | Device |
|---|---|
| **Device** | HID Barcode Scanner (Zebra, Honeywell, or equivalent) |
| **Connection** | USB or Bluetooth |
| **Driver required** | None — OS sees it as a USB keyboard |
| **Library** | None needed |
| **Use case** | Main workstation inbound scanning |

> HID scanners emulate a keyboard at the OS level. No SDK, no driver, no special integration — plug in and it works in any browser input field.

### Inbound Entry Flow Per Order

```
Worker pulls trigger on HID scanner
        │
        ▼ (USB / Bluetooth — keyboard emulation)
OS receives keystrokes: "PH269238346086D\n"
        │
        ▼
Focused input field receives the string + Enter (terminator)
        │
        ├── tracking_number = "PH269238346086D"   ← from scan
        ├── platform = "Shopee"                    ← auto-detected from "PH" prefix
        │
        ▼
Order saved → appears in Picker Admin Panel
```

**Total time per order at inbound: ~2 seconds — zero manual input**

> `scanDetect.ts` distinguishes scanner input (keystroke interval < 50ms) from manual typing (> 200ms). The same input field handles both modes — no separate scanner UI needed.

### Platform Auto-Detection Rules

```
Tracking Number Prefix → Platform
─────────────────────────────────
PH...  →  Shopee
JT...  →  TikTok (J&T Express)
MP...  →  Lazada
P...   →  Lazada  (checked last — broadest pattern)
other  →  Unknown / Manual selection
```

> Detection order matters: `JT` and `PH` are checked before `P` to avoid false matches.

### Platform Waybill Comparison (verified from real samples)

| Feature | Shopee | Lazada | TikTok |
|---|---|---|---|
| PDF type | Text-based | Image-based | Text-based |
| Barcode → Tracking # | ✅ `PH...` | ✅ `P...` / `MP...` | ✅ `JT...` |
| QR code | ✅ Same as barcode | ✅ Same as barcode | ✅ Same as barcode |
| Platform logo on waybill | SPX | Flash / Lazada | TikTok Shop + J&T |
| Separate Order ID | ❌ | ❌ | ✅ TT Order ID (not used by system) |
| Product list on waybill | ✅ Packing List | ❌ | ✅ Full product list |
| Item count on waybill | ✅ | ❌ | ✅ Qty Total |
| Weight on waybill | ✅ | ❌ | ✅ |
| Payment type | ✅ COD / NonCOD | ✅ NonCOD | ✅ PP_PM (prepaid) |

> Product list and item count are visible on Shopee and TikTok waybills — workers read these directly from the physical waybill. The system does not record them.

### Fields Intentionally NOT Tracked

| Field | Reason Excluded |
|---|---|
| Store / seller name | Physical waybill shows this — not needed in system; no per-store reporting required |
| Item count | Worker reads from physical waybill; no system verification needed |
| Buyer name & address | Handled by courier — irrelevant to warehouse ops |
| Product names / SKU | Picker handles physical package, not product list |
| Weight | Measured by courier, not warehouse concern |
| COD amount | Accounting system responsibility |
| TikTok TT Order ID | System uses tracking number as unique key — TT Order ID is redundant |

---

## 5. Database Schema

### Entity Relationship Overview

```
tenants ──< users
tenants ──< orders
orders ──< order_status_history
orders ──< picker_assignments >── users (pickers)
orders ──< packer_assignments >── users (packers)
```

> **Design decision:** No separate `stores` table. Shop name is stored as a free-text nullable string on the `orders` table (`shop_name`). Distinct values are queried dynamically for the Bulk Scan dropdown — no additional CRUD UI needed.

### Table Definitions

#### `tenants`
| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| name | VARCHAR | Company name |
| slug | VARCHAR UNIQUE | URL-friendly identifier |
| is_active | BOOLEAN | |
| created_at | TIMESTAMPTZ | |

#### `users`
| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| tenant_id | UUID FK | → tenants |
| username | VARCHAR | Unique per tenant |
| password_hash | VARCHAR | bcrypt |
| role | ENUM | See roles below |
| is_active | BOOLEAN | |
| created_by | UUID FK | → users (admin who created) |
| created_at | TIMESTAMPTZ | |

**Role ENUM values:** `ADMIN`, `INBOUND_ADMIN`, `PICKER_ADMIN`, `PACKER_ADMIN`, `PICKER`, `PACKER`, `SALES_AGENT` (v2.23.1), `STOCK_KEEPER` (v2.30.0), `WAREHOUSE_ADMIN`, `RETURN_SCANNER` (v2.47.0 — handheld-only Return & Cancel scan station)

#### `orders`
| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| tenant_id | UUID FK | → tenants |
| tracking_number | VARCHAR | Unique per tenant |
| platform | ENUM | `SHOPEE`, `LAZADA`, `TIKTOK`, `DIRECT`, `OTHER` — auto-detected from tracking number prefix (DR→DIRECT) |
| carrier_name | VARCHAR | Logistics carrier (e.g. `SPX`, `JT_EXPRESS`, `FLASH`, `LEX`, `LBC`, `NINJA_VAN`, `OTHER`). **Required** at Bulk Scan time. |
| shop_name | VARCHAR | Seller shop name (e.g. "Picky_Farm"). **Required** at Bulk Scan time. Chosen from 18 preset shop names or typed manually. |
| status | ENUM | See status flow |
| priority | INTEGER | Higher = more urgent; default 0, carryover +100, SLA boosts added on escalation |
| delay_level | INTEGER | SLA delay level: 0=D0, 1=D1, 2=D2, 3=D3, 4=D4; default 0 |
| sla_started_at | TIMESTAMPTZ | Set on INSERT (when order is scanned); never overwritten |
| sla_completed_at | TIMESTAMPTZ NULLABLE | Set when status → OUTBOUND; null = SLA still active |
| d4_notified_at | TIMESTAMPTZ NULLABLE | Set when D4 supervisor alert is sent; prevents duplicate alerts |
| work_date | TIMESTAMPTZ | Start of the day the order was scanned (set explicitly at scan time, not derived from created_at) |
| archived_at | TIMESTAMPTZ NULLABLE | null = active; non-null = archived. OUTBOUND orders are archived at 23:30 PHT daily. |
| scanned_by | UUID FK | → users (inbound admin) |
| created_at | TIMESTAMPTZ | |
| updated_at | TIMESTAMPTZ | |

**Status ENUM values:** `INBOUND`, `PICKER_ASSIGNED`, `PICKING`, `PICKER_COMPLETE`, `PACKER_ASSIGNED`, `PACKING`, `PACKER_COMPLETE`, `OUTBOUND`

#### `order_status_history`
| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| order_id | UUID FK | → orders |
| from_status | ENUM NULLABLE | null on first entry |
| to_status | ENUM | |
| changed_by | UUID FK | → users |
| changed_at | TIMESTAMPTZ | |

#### `picker_assignments`
| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| order_id | UUID FK | → orders |
| picker_id | UUID FK | → users |
| assigned_by | UUID FK | → users (picker admin) |
| assigned_at | TIMESTAMPTZ | |
| completed_at | TIMESTAMPTZ NULLABLE | |

#### `packer_assignments`
| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| order_id | UUID FK | → orders |
| packer_id | UUID FK | → users |
| assigned_by | UUID FK | → users (packer admin) |
| assigned_at | TIMESTAMPTZ | |
| completed_at | TIMESTAMPTZ NULLABLE | |

#### `sla_escalations`
Append-only audit log of every D-level transition. Never updated or deleted.

| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| order_id | UUID FK | → orders |
| tenant_id | UUID FK | → tenants (for RLS) |
| from_level | INTEGER NULLABLE | null on initial D0 entry at scan time |
| to_level | INTEGER | 0–4 |
| triggered_at | TIMESTAMPTZ | When escalation occurred |
| trigger_source | VARCHAR | `SCAN` (initial), `JOB` (auto escalation) |

#### Inventory module tables (v2.30.0 – v2.33.0)

> Independent of the order pipeline. Detailed spec in `INVENTORY.md`.

**`product_categories`** — admin-defined categories per tenant. `(tenant_id, name)` unique.

| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| tenant_id | UUID FK | → tenants |
| name | VARCHAR | e.g. "Nuts", "Spices" |
| created_at | TIMESTAMPTZ | |

**`products`** — product master data. `productCode` auto-generated `{CAT3}-NNN` since v2.33.0.

| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| tenant_id | UUID FK | → tenants |
| category_id | UUID FK | → product_categories |
| product_code | VARCHAR | `(tenant_id, product_code)` unique |
| name | VARCHAR | |
| default_unit | ENUM | `KG`, `PCS` |
| reserved_threshold | INT | low-stock trigger threshold |

**`warehouses`** — physical locations. `(tenant_id, name)` unique.

| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| tenant_id | UUID FK | → tenants |
| name | VARCHAR | |
| address | TEXT | |
| created_at, updated_at | TIMESTAMPTZ | |

**`stock_items`** — one row per printed label / physical box.

| Column | Type | Notes |
|---|---|---|
| id | UUID PK | embedded in QR code (raw UUID payload since v2.33.3) |
| tenant_id | UUID FK | → tenants |
| product_id | UUID FK | → products |
| warehouse_id | UUID FK | → warehouses (current location) |
| unit | ENUM | `KG`, `PCS` |
| quantity | NUMERIC | |
| batch_number | VARCHAR | server-generated `YYYYMMDD-NNN` or `ADJ-YYYYMMDD-NNN` (v2.34.0 manual adjustments) |
| status | ENUM | `PENDING` (label printed, not yet scanned), `IN_STOCK`, `OUT_OF_STOCK`. PENDING added v2.33.0 |

**`stock_movements`** — scan event log (append-only).

| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| stock_item_id | UUID FK | → stock_items (cascade) |
| type | ENUM | `IN`, `USED`, `TRANSFER`. Replaces pre-v2.31.0 `MovementDirection` |
| from_warehouse_id | UUID FK NULLABLE | → warehouses (set on TRANSFER) |
| to_warehouse_id | UUID FK NULLABLE | → warehouses (set on TRANSFER) |
| scanned_by_id | UUID FK | → users |
| scanned_at | TIMESTAMPTZ | |

#### Sales module tables (v2.23.1 — agents-only, not tied to orders)

> Tracks SALES_AGENT daily activities. Detailed spec is in the v2.23.1 patch entry of this doc + `MEMORY.md`. All tables are `tenant_id`-scoped with RLS, same isolation rules as the order tables.

| Table | Purpose |
|---|---|
| `sales_daily_activities` | One row per agent per day — wrapper that owns the child rows for that date |
| `sales_content_posts` | Content posts logged by the agent (Reels, TikTok, Shopee Live thumbnails, etc.); enum `ContentPostType` |
| `sales_live_selling_metrics` | Per-live-session metrics: platform (`SalesPlatform`), viewers, orders count |
| `sales_marketplace_reports` | Shopee/Lazada/TikTok per-day report rows (revenue, orders, returns) |
| `sales_direct_orders` | Direct in-house orders captured by the agent; channel = `SaleChannel` enum |
| `sales_direct_order_items` | Line items for `sales_direct_orders` (product, qty, unit price) |

### Indexes
```sql
-- Active orders unique constraint (partial — archived orders with same TN can co-exist)
CREATE UNIQUE INDEX orders_tenant_tracking_active_unique
  ON orders (tenant_id, tracking_number)
  WHERE archived_at IS NULL;

CREATE INDEX ON orders (tenant_id, status);
CREATE INDEX ON orders (tenant_id, created_at DESC);
CREATE INDEX ON orders (tenant_id, priority DESC, created_at ASC);
CREATE INDEX ON orders (tenant_id, shop_name);   -- GET /orders/shops distinct query
CREATE INDEX ON picker_assignments (picker_id, completed_at);
CREATE INDEX ON packer_assignments (packer_id, completed_at);

-- Daily cycle & archive indexes
CREATE INDEX ON orders (tenant_id, work_date);
CREATE INDEX ON orders (tenant_id, archived_at);
CREATE INDEX ON orders (tenant_id, status, archived_at);  -- all active status queries

-- SLA sweep index: fast scan for escalation-eligible orders (partial — excludes completed orders)
CREATE INDEX ON orders (tenant_id, delay_level, sla_started_at)
  WHERE sla_completed_at IS NULL;

-- SLA dashboard summary
CREATE INDEX ON orders (tenant_id, delay_level)
  WHERE sla_completed_at IS NULL;

-- SLA audit trail
CREATE INDEX ON sla_escalations (order_id);
CREATE INDEX ON sla_escalations (tenant_id, triggered_at DESC);
```

> **Important:** The old `@@unique([tenantId, trackingNumber])` full unique constraint has been replaced by the partial index above. This allows the same tracking number to be re-scanned after the original order is archived (e.g. a redelivery the next day).

---

## 6. User Roles & Permissions

| Panel / Action | Admin | Inbound Admin | Picker Admin | Packer Admin | Picker | Packer |
|---|:---:|:---:|:---:|:---:|:---:|:---:|
| **Main Dashboard** | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| **Inbound — view** | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |
| **Inbound — scan & add** | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| **Inbound — delete** | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| **Picker Admin Panel** | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ |
| **Inbound Handheld Scan** (`/inbound-scan`) | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| **Picker Admin Handheld Scan** (`/picker-admin-scan`) | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ |
| **Picker Device View** (handheld) | ❌ | ❌ | ❌ | ❌ | Own only | ❌ |
| **Packer Admin Panel** | ✅ | ❌ | ❌ | ✅ | ❌ | ❌ |
| **Packer Device View** (handheld) | ❌ | ❌ | ❌ | ❌ | ❌ | Own only |
| **Packed Report** (`/packed-report`, was Outbound Panel) | ✅ | ❌ | ❌ | ✅ | ❌ | ❌ |
| **Outbound Module** (`/outbound`, §7.12 — Admin + **Outbound Admin** only) | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **User Management** | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Reports (all)** | ✅ | ✅ | Picker only | Packer only | ❌ | ❌ |
| **Archive Panel** | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |

> **Note (v2.50.0):** `OUTBOUND_ADMIN` additionally has **read-only** access to the **Inbound**, **Picker Admin** and **Packer Admin** panels — it can view orders/stats/workload (and the per-picker/packer popups, SLA history) but cannot scan, assign, complete, remove or delete. Backend grants the role only on the GET guards; all mutation endpoints still return 403. Packed Report is **not** included. See `App.tsx` route guards + the `readOnly` flag in `Inbound.tsx`/`PickerAdmin.tsx`/`PackerAdmin.tsx`.
>
> **Note (v2.48.0):** the `INBOUND_ADMIN` and `OUTBOUND_ADMIN` roles are now **split** and shown as two separate roles in Settings. `INBOUND_ADMIN` was relabelled **"Inbound Admin"** (enum value unchanged) and keeps its prior access (dashboard/inbound/reports/Return & Cancel). The **new `OUTBOUND_ADMIN`** role is scoped to the independent Outbound module + its phone scan only (§7.12). The old carrier-grouped Outbound Panel became **"Packed Report"** under Packer Admin. The matrix above predates `WAREHOUSE_ADMIN`, `SALES_AGENT`, `STOCK_KEEPER`, `RETURN_SCANNER` and `OUTBOUND_ADMIN`; see the per-route guards in `App.tsx` for the authoritative current access map.

### User Creation Rules
- Only **Admin** can create, edit, or deactivate users
- Admin sets both username and password at creation time
- New users cannot self-register
- Deactivated users cannot log in but their historical data is preserved

### Sales Agent Role (v2.23.1)

`SALES_AGENT` is a **cross-cutting role** — it does **not** participate in the order lifecycle (inbound → picker → packer → outbound). Sales agents track their own daily activities (content posts, live selling, marketplace reports, direct orders) and the admin aggregates these into a `/marketing-report` leaderboard + comparison charts.

| Panel / Action | Admin | Sales Agent |
|---|:---:|:---:|
| **Settings → Sales Agents** (create/disable agents) | ✅ | ❌ |
| **`/sales` — month calendar dashboard** | ❌ | ✅ Own only |
| **`/sales` — Enter Today's Report** (daily activity form) | ❌ | ✅ Own only |
| **`/sales` — day-detail modal** (historical drill-down) | ❌ | ✅ Own only |
| **`/marketing-report` — leaderboard + charts** (Today preset w/ LIVE auto-refresh v2.27.1) | ✅ | ✅ (v2.26.0) |
| **`/marketing-report` — `AgentDetailPanel`** (per-agent drill-down) | ✅ | ✅ (v2.26.0) |
| **Direct order edit + delete** (own orders from My Activity + My Orders; admin edits any via agent day modal — audit-logged, v2.28.0) | ✅ Any agent | ✅ Own only |
| **Any order/inbound/picker/packer panel** | (unchanged) | ❌ |

**Key isolation:** sales agents have zero read/write access to orders, users, or any warehouse data. The role only touches the `sales_*` tables. Marketing report read access (v2.26.0+) exposes other agents' `sales_*` aggregates — every call is logged by `backend/src/middleware/auditLog.ts` (userId, role, tenantId, method, url, ts) via fastify logger.

### Stock Keeper Role (v2.30.0)

`STOCK_KEEPER` is a **cross-cutting role** — it does **not** participate in the order lifecycle. Stock keepers scan QR labels on warehouse boxes (incoming and outgoing) to track inventory. Multiple stock keepers per warehouse; admin creates accounts from Settings → Stock Keepers section.

| Panel / Action | Admin | Stock Keeper |
|---|:---:|:---:|
| **Settings → Stock Keepers** (create/disable keepers) | ✅ | ❌ |
| **`/inventory/products`** (Product + Category master data) | ✅ | ❌ |
| **`/inventory/items`** (generate QR label PDF — was `/stock/create`) | ✅ | ❌ |
| **`/inventory/warehouses`** (Warehouse master data) | ✅ | ❌ |
| **`/inventory/stock`** (per-product summary + low-stock badges) | ✅ | ❌ |
| **`/stock/scan`** (mobile camera scan → IN / USED / TRANSFER state machine) | ✅ | ✅ |
| **`GET /products`, `GET /warehouses`** (read-only for scan dropdowns) | ✅ | ✅ |
| **Any order/inbound/picker/packer/sales panel** | (unchanged) | ❌ |

**Key isolation:** stock keepers can ONLY access `/stock/scan` plus the `GET /products` and `GET /warehouses` lists needed by the warehouse selector. They have zero read/write access to orders, users, sales data, or admin Inventory pages. The Inventory module touches `product_categories`, `products`, `warehouses`, `stock_items`, `stock_movements` tables. Login flow mirrors PICKER/PACKER: `/scan` URL → role-based redirect to `/stock/scan`.

---

## 7. Panels — Detailed Specification

### 7.1 Main Dashboard
**Visible to:** Admin, Inbound Admin

- Live date and time display
- "Dynamic Order Management" logo and branding
- Real-time stats updated via WebSocket:
  - Inbound order count | Outbound order count | Remaining order count
  - **Carryover Active** — orders scanned on a previous day still not completed (amber card)
  - Remaining orders breakdown by department (Picker / Packer)
- **Picker Summary:** Total | Unassigned | Assigned | In Progress | Complete
- **Packer Summary:** Total | Unassigned | Assigned | In Progress | Complete
- **SLA Summary Card:** Live D-level breakdown bar (D0 / D1 / D2 / D3 / D4 counts); D4 count highlighted in red; updates via Socket.io `sla:escalated` event
- **Nightly Report:** Automated email sent at **23:40 PHT** (15:40 UTC) daily to all Admin users

---

### 7.2 Inbound Panel ✅ Built (Phase 2 + Phase 10 + Daily Cycle)
**Visible to:** Admin (edit), Inbound Admin (edit+delete), Picker Admin (view), Packer Admin (view)

**Carryover Section:** Orders scanned on a previous day (`work_date < today`) that are still in INBOUND status appear in a separate "Carryover Orders" section above "Today's Orders", with an amber left-border and clock icon.

**Single Scan Flow:**
1. Worker focuses the scan input field
2. Scans waybill barcode → tracking number auto-filled, platform auto-detected
3. Order saved immediately, appears in table — carrier/shop left null

**Bulk Scan Flow (added Phase 10):**
1. Admin clicks "Bulk Scan" button → `BulkScanModal` opens (rendered via `createPortal`)
2. Admin scans barcodes one by one → staging list builds up (client-side only, no DB writes yet)
   - Duplicate TN in same batch: client-side warning, not re-added
   - Each row shows: index | tracking number | platform badge | remove button
3. Admin selects **Carrier** (required) from dropdown: SPX / J&T / Flash / LEX / LBC / Ninja Van / Other
4. Admin selects or types **Shop Name** (required): dropdown shows 18 preset shop names merged with distinct past values from `GET /orders/shops`; or type a new name manually. Confirm button stays disabled until both Carrier and Shop Name are filled — yellow warning shown if either is missing after items are staged.
5. Admin clicks Confirm → `POST /orders/bulk-scan` → all orders created atomically with carrier + shop
6. Modal closes; success/partial-duplicate banner shown; order table refreshes

**Order Table Columns:** Tracking Number | Platform | Carrier | Shop | Delay (D-badge) | Scan Time | Scanned By | Actions

**Pagination:** 25 orders per page, client-side. Header stats (Total + D0–D4 counts) reflect full dataset regardless of current page.

**Sort order:** priority DESC → delayLevel DESC → createdAt ASC (most urgent first)

**Actions:**
- Inbound Admin / Admin: Delete order button (with confirmation dialog)

**API Endpoints:**
| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/orders/scan` | ADMIN, INBOUND_ADMIN | Single scan — creates one order with carrier + shop |
| `POST` | `/orders/bulk-scan` | ADMIN, INBOUND_ADMIN | Bulk scan — creates up to 200 orders with carrier + shop; returns `{ created, duplicates[] }` |
| `GET` | `/orders/shops` | ADMIN, INBOUND_ADMIN | Returns distinct shop names used so far (for Bulk Scan dropdown) |
| `POST` | `/orders/handheld-scan` | ADMIN, INBOUND_ADMIN | Phone signals desktop (no DB write) — checks duplicate, emits `order:handheld-scan` socket event |
| `POST` | `/orders/handheld-bulk-scan` | ADMIN, INBOUND_ADMIN | Phone sends multiple TNs to desktop (no DB write) — emits `order:handheld-bulk-scan` socket event |

**Handheld Scan Flow (phone → desktop):**

```
Phone (/inbound-scan)                     Desktop (Inbound Panel)
──────────────────                        ───────────────────────
Single Scan mode:
  Camera scans barcode
  → POST /orders/handheld-scan
    (backend checks duplicate)
    → emits order:handheld-scan ────────→ QuickScanModal opens
                                           Admin selects Carrier + Shop
                                           → POST /orders/scan → order saved

Bulk Scan mode:
  Camera scans multiple barcodes
  → accumulate list on phone
  → POST /orders/handheld-bulk-scan
    → emits order:handheld-bulk-scan ──→ BulkScanModal opens (pre-filled)
                                          Admin selects Carrier + Shop
                                          → POST /orders/bulk-scan → orders saved
```

---

### 7.3 Picker Admin Panel ✅ Built (Phase 3 + 4 + 5 + Handheld PIN Management)
**Visible to:** Admin, Picker Admin

**Carryover:** Orders scanned on a previous day (`work_date < today`) are shown with an amber **CARRY** badge in the Inbound table. The section header shows a carryover count next to an amber clock icon so supervisors can prioritize them.

**Header Stats Bar:** Inbound count | Assigned Today | Total Completed | Returned from Packer | Pickers count | Sync indicator

> **Total Completed** stat: count of all picker assignments where `completedAt IS NOT NULL` for the tenant. Decreases when Packer Admin returns an order (the assignment's `completedAt` is reset to null).  
> **Returned from Packer** stat: counts orders currently in PICKER_ASSIGNED status that were returned by Packer Admin (have a status history entry PICKER_COMPLETE → PICKER_ASSIGNED). Picker workload cards show an amber `↩ Returned: N` badge for pickers who have re-assigned orders.

---

#### Scan & Stage Flow (primary assignment method)

The top section of the panel is designed for the real-world scenario where a Picker Admin has a stack of printed waybills and a handheld barcode scanner.

**Flow:**
1. Picker Admin scans a waybill into the Scan Input → system looks up the order by tracking number
2. If found and INBOUND: order is added to the **staging list** (client-side, no DB write yet)
3. Admin scans more waybills one by one — staging list grows
4. Admin selects a Picker from the dropdown
5. Clicks **"Assign N Staged Orders →"** → all staged orders are bulk-assigned in one request
6. Staging list clears; Inbound table updates automatically

**Feedback (inline, no alerts):**
- Success: green message `Staged: <tracking number>`
- Duplicate scan: yellow warning `Already staged: <tracking number>` (not re-added)
- Not found: red error `Order not found`
- Already assigned: yellow warning `Already assigned to <picker username>` — names the active picker so the admin can follow up directly
- Other non-INBOUND status (no active picker): red error `Not available (<status>)`

**Staged orders list:**
- Rows: # | Tracking Number | Platform badge | Delay badge | Priority | × remove button
- Header shows count + "Clear all" button
- Staged rows in the Inbound table get a green tint + **STAGED** pill badge

**Backend endpoint:**
```
POST /picker-admin/scan   { trackingNumber }
  → 200: order data (id, trackingNumber, platform, delayLevel, priority, status, createdAt)
  → 404: Order not found
  → 409: Already assigned to <picker> | Not available (<status>)
```

**Handheld Scan Flow — Picker Admin Phone (`/picker-admin-scan`):**

```
Phone (/picker-admin-scan)                Desktop (Picker Admin Panel)
──────────────────────────                ────────────────────────────
Single Scan mode:
  Camera scans barcode
  → POST /picker-admin/scan
    (validates order is INBOUND)
    → emits order:staged ─────────────→ Order auto-appears in Staging area
                                          Admin selects Picker from dropdown
                                          → Assign Staged Orders

Bulk Scan mode:
  Camera scans multiple barcodes
  → accumulate list on phone
  → POST /picker-admin/handheld-bulk-scan
    (validates each TN)
    → emits order:staged per valid TN → Orders added to Staging area
                                          Admin selects Picker → Assign all
```

```
POST /picker-admin/handheld-bulk-scan   { trackingNumbers: string[] }
  → 200: { results: [{ trackingNumber, status: 'staged'|'not_found'|'error' }] }
```
This endpoint performs a lookup only — it does NOT create orders. Order creation is handled exclusively by the Inbound Panel (`POST /orders/scan`).

---

#### Manual Assignment Flow (secondary, for browsing)

**Picker Select Dropdown:** Shared with Scan & Stage — single picker selection used by both flows.

**Toolbar (below scan area):**
- Select All checkbox + selected count badge
- Assign Selected button (assigns checked rows to selected picker)
- Assign All button (assigns all INBOUND orders to selected picker)

**Inbound Order Table:**
- Columns: Checkbox | # | Tracking Number | Platform (badge) | Delay (D-badge) | Scanned At | Scanned By (avatar) | Priority | Assign button
- Sort: priority DESC → delayLevel DESC → createdAt ASC (D4 always at top)
- Pagination: 10 orders per page, page number buttons, "Showing X–Y of Z" counter
- Row tinting: D2 = amber, D3/D4 = red; selected rows = blue; staged rows = green
- Assign button per row: assigns single order to currently selected picker

---

#### Picker Workload Section

- Grid of picker cards (auto-fill, min 240px per card)
- Each card shows: Avatar + username | active count badge | Assigned / Done status chips | segmented progress bar (blue/green)
- **Click on any card → opens Order Detail Modal**

**Order Detail Modal (per picker):**
- Shows all active orders assigned to that picker (completedAt = null)
- Columns: Tracking Number | Platform | Status chip | Delay | Assigned At | Actions
- Status chips: Assigned (blue) | Done (green)
- Actions per row (shown only for non-complete orders):
  - **Remove** (red) → opens styled Remove Confirmation Dialog → on confirm: order returns to INBOUND queue
  - **Complete** (green) → opens styled Complete Confirmation Dialog → on confirm: order marked PICKER_COMPLETE
- Modal refetches every 3 seconds
- Closes on overlay click or X button

**Complete Confirmation Dialog:**
- Custom styled modal (z-index above order detail modal)
- Green gradient header + checkmark icon
- Shows tracking number in a styled pill
- Cancel / ✓ Yes, Complete buttons

**Remove Confirmation Dialog:**
- Custom styled modal (z-index above order detail modal)
- Red gradient header + trash icon
- Shows tracking number in a styled pill
- Cancel / Yes, Remove buttons

**Seed data:** 20 pickers (Picker 1–20, password: `picker123`) created by seed script. Pickers log in via the standard `/login` page with username + password.

---

### 7.4 Picker Device View ✅ Built
**Visible to:** PICKER role (own orders only)  
**Route:** `/picker` (public — no traditional login required)  
**Target device:** Android/iOS handheld — Chrome browser over WiFi (same LAN as server)  
**Design:** Mobile-first, touch-optimized, no sidebar, dark PIN screen + light order list

**Authentication — Username + Password:**
- Picker opens `http://<server-ip>:5173/login` on the handheld browser (Chrome over WiFi)
- Enters username + password → standard JWT cookie set (same `/auth/login` endpoint as all roles)
- After login, automatically redirected to `/picker` (role-based routing)
- Session persists via JWT cookie — device reopened without re-entering credentials
- Logout button → session cleared → redirected to `/login`

**Connection setup (one-time per device):**
1. IT/admin opens `http://<server-ip>:5173/login` on the handheld browser
2. Save/bookmark as home screen shortcut

**Order list (after PIN auth):**
- Header: picker username + active order count + Logout button
- Order cards: Tracking Number (monospace) | Platform badge | Delay badge | Assigned time
- Left border color: red (D3+), amber (D1–D2), blue (D0)
- List auto-refreshes every 15 seconds

**Waybill scan → complete flow:**
1. Picker picks up physical waybill paper → scans barcode with handheld scanner (USB HID → keyboard)
2. Tracking number appears in scan input → matched against active order list
3. Match found → **Confirm Complete** dialog shown (tracking number + platform + delay displayed)
4. Picker taps **Confirm Complete ✓** → `POST /picker/complete { trackingNumber }` → order removed from list
5. No match → error toast "not found in your assigned orders"

**API endpoints (PICKER role only):**
- `GET /picker/orders` — fetch own active orders (PICKER_ASSIGNED + PICKING statuses)
- `POST /picker/complete { trackingNumber }` — complete order by tracking number scan

---

### 7.5 Packer Admin Panel ✅ Built (Phase 5 + 7 + v2.29.0 packer pre-assignment)
**Visible to:** Admin, Packer Admin  
**Route:** `/packer-admin`

Since **v2.29.0** the panel mirrors the Picker Admin pattern: Packer Admin **explicitly assigns** PICKER_COMPLETE orders to specific packers (Scan & Stage section), and only the assigned packer can scan to complete on their handheld. The shared-queue model was replaced — `PACKER_ASSIGNED` is now an active status in the order lifecycle.

> **v2.48.1 — Packer Workload popup now mirrors the Picker popup.** Clicking a packer card opens `PackerOrdersModal`, which now lists that packer's **active** orders (`getPackerOrders` returns `PACKER_ASSIGNED`, `completedAt: null` — was previously the last 50 *completed* orders, which is what made every busy packer's header read "50"). Each row has **Remove** + **Complete** (plus checkbox bulk-select with the same two actions), with confirm dialogs — identical to the Picker popup. **Complete** → `POST /packer-admin/complete` → `PACKER_COMPLETE → OUTBOUND` (auto-dispatch) → appears in the **Packed Report** (§7.7). **Remove** → `POST /packer-admin/unassign` → `PACKER_ASSIGNED → PICKER_COMPLETE`, returning the order to the **Packer Admin queue** (`/packer-admin/orders`). New bulk endpoints `POST /packer-admin/bulk-complete` + `/bulk-unassign`. The modal subscribes to the `order:stats_changed` socket event, so an order a packer completes **on the phone drops from the popup in real time**. No schema change.

**Carryover:** Orders from a previous day (`work_date < today`) appear with an amber **CARRY** badge in the order table. The section header shows a carryover count with an amber clock icon.

**Header Stats Bar:** Waiting to Pack (PICKER_COMPLETE, unassigned) | Assigned (PACKER_ASSIGNED, all packers) | Total Packed | Returned to Picker | Packers count | Sync indicator

> **Returned to Picker** stat: counts orders currently back in PICKER_ASSIGNED state (returned by packer admin via Remove). Updates every 5 seconds.

---

#### Scan & Stage Flow (primary assignment method, v2.29.0)

Mirrors PickerAdmin's Scan & Stage. The top section of the panel is designed for a Packer Admin with a stack of printed waybills (already pick-completed) and a handheld barcode scanner.

**Flow:**
1. Packer Admin scans a waybill → system looks up the order by tracking number
2. If found and PICKER_COMPLETE: order is added to the **staging list** (client-side, no DB write yet)
3. Admin scans more waybills one by one — staging list grows
4. Admin selects a Packer from the dropdown
5. Clicks **"Assign N Staged Orders →"** → all staged orders bulk-assigned to that packer in one request (status flips PICKER_COMPLETE → PACKER_ASSIGNED)
6. Staging list clears; order table updates automatically

**Handheld Scan Flow — Packer Admin Phone (`/packer-admin-scan`):**

```
Phone (/packer-admin-scan)                Desktop (Packer Admin Panel)
──────────────────────────                ────────────────────────────
Single Scan mode:
  Camera scans barcode
  → POST /packer-admin/scan
    (validates order is PICKER_COMPLETE)
    → emits order:staged ─────────────→ Order auto-appears in Staging area
                                          Admin selects Packer from dropdown
                                          → Assign Staged Orders

Bulk Scan mode:
  Camera scans multiple barcodes
  → accumulate list on phone
  → POST /packer-admin/handheld-bulk-scan
    → emits order:staged per valid TN → Orders added to Staging area
                                          Admin selects Packer → Assign all
```

---

#### Order Queue (below Scan & Stage)

**Tracking Number Search:**
- Input above the order table — type partial or full tracking number to filter the list in real time
- Background turns amber while active; shows match count
- Cleared automatically after a successful Complete or Remove action

**Order Table:**
- Source: PICKER_COMPLETE (waiting) + PACKER_ASSIGNED (staged to a packer); each row carries a PACKER_ASSIGNED badge with the assigned packer name when applicable
- Columns: Checkbox | # | Tracking Number | Platform | Delay | Picked By (avatar) | Arrived At | Status badge (PICKER_COMPLETE / PACKER_ASSIGNED → name) | Priority | Actions
- Sort: priority DESC → delayLevel DESC → createdAt ASC
- Pagination: 10 per page, resets on search
- Row tinting: D2 = amber, D3/D4 = red; selected = blue; staged = green tint + STAGED pill

**Actions per row:**
- **Complete** → green confirmation dialog → `POST /packer-admin/complete` → order → PACKER_COMPLETE (works whether the row is PICKER_COMPLETE or PACKER_ASSIGNED)
- **Remove** → red confirmation dialog → `POST /packer-admin/remove` → order back to PICKER_ASSIGNED (auto-reassigned to original picker); falls back to INBOUND if no previous picker
- **Unassign** (only for PACKER_ASSIGNED rows) → `POST /packer-admin/unassign` → clears PackerAssignment, status reverts to PICKER_COMPLETE so a different packer can be staged

**Remove behavior (important):**
When admin removes an order, the backend:
1. Finds the most recent completed PickerAssignment for the order
2. Resets that assignment's `completedAt` → `null` (no new assignment created)
3. Sets order status → PICKER_ASSIGNED
4. Logs the transition in orderStatusHistory (fromStatus is the order's current status — PICKER_COMPLETE, PACKER_ASSIGNED, or PACKER_COMPLETE)

Side effects of step 2:
- Picker's "Total Completed" count decreases (assignment is no longer counted as done)
- The same assignment becomes active again → order reappears on the picker's handheld within 15 seconds
- No duplicate assignments — one clean active assignment per order per picker
- Falls back to INBOUND (no assignment reset) if the order had no previous picker

**Backend endpoints:**
```
POST /packer-admin/scan { trackingNumber }                  → staging lookup
POST /packer-admin/handheld-bulk-scan { trackingNumbers[] } → bulk staging lookup
GET  /packer-admin/pending-staged                           → currently staged-but-not-yet-assigned
POST /packer-admin/assign     { orderId, packerId }         → PICKER_COMPLETE → PACKER_ASSIGNED
POST /packer-admin/bulk-assign{ orderIds[], packerId }      → bulk assign
POST /packer-admin/unassign   { orderId }                   → PACKER_ASSIGNED → PICKER_COMPLETE
GET  /packer-admin/orders                                   → PICKER_COMPLETE + PACKER_ASSIGNED (sorted)
GET  /packer-admin/stats                                    → { stats[], totalCompleted, returnedCount }
POST /packer-admin/complete { orderId }                     → PACKER_COMPLETE
POST /packer-admin/remove   { orderId }                     → PICKER_ASSIGNED (auto-reassign) or INBOUND
```

---

#### Packer Workload Section (bottom, v2.31.4)

- Grid of packer cards (auto-fill, min 220px) — mirrors PickerStatCard layout
- Each card: Avatar | username | header "X active · Y packed today" | blue **Assigned** chip + green **Done Today** chip | two-segment progress bar
- **Click card → Order Detail Modal:** table of that packer's active assignments + completed orders
- **Backend endpoints:**
```
GET  /packer-admin/packers                         → active PACKER users
GET  /packer-admin/packer/:packerId/orders         → packer's active + completed orders (last 50)
```

---

### 7.6 Packer Device View ✅ Built (Phase 7)
**Visible to:** PACKER role  
**Route:** `/packer` (public — PIN auth, no traditional login)  
**Target device:** Android handheld — same hardware as Picker Device View  
**Design:** Mobile-first, green/teal theme (vs blue for picker)

**Authentication — Username + Password:**
- Packer opens `http://<server-ip>:5173/login` on the handheld browser (Chrome over WiFi)
- Enters username + password → standard JWT cookie set (same `/auth/login` endpoint as all roles)
- After login, automatically redirected to `/packer` (role-based routing)
- Session persists via JWT cookie — device reopened without re-entering credentials

**Order queue (per-packer assigned list, v2.29.0):**
- Orders in **PACKER_ASSIGNED** status assigned to this specific packer (`PackerAssignment.completedAt IS NULL` + order in PACKER_ASSIGNED). Replaces the pre-v2.29.0 shared queue.
- Auto-refreshes every 15 seconds
- List sorted by priority DESC → delayLevel DESC → createdAt ASC
- Left border color: red (D3+), amber (D1–D2), blue (D0)
- Empty state if Packer Admin hasn't staged any orders to this packer yet

**Waybill scan → complete flow:**
1. Packer picks up physical package → scans waybill barcode
2. Tracking number matched against this packer's own PACKER_ASSIGNED list
3. Match found → **Confirm Complete** bottom sheet slides up (tracking + platform + delay)
4. Packer taps **Confirm ✓** → `POST /packer/complete { trackingNumber }` → PACKER_COMPLETE; assignment `completedAt` set
5. Order disappears from this packer's list within 15 seconds
6. No match → "not found in your assigned orders" (the order may belong to a different packer or hasn't been assigned yet)

**API endpoints (PACKER role only):**
- `GET /packer/orders` — orders in PACKER_ASSIGNED state assigned to this packer
- `POST /packer/complete { trackingNumber }` — complete by tracking number scan

---

### 7.7 Packed Report (formerly Outbound Panel) ✅ Built (Phase 8) · relocated (v2.48.0)
**Visible to:** Admin, Packer Admin, Warehouse Admin  
**Route:** `/packed-report` (was `/outbound`) — now a child under **Packer Admin** in the sidebar.

> **v2.48.0 note:** This carrier-grouped view of dispatched `OUTBOUND` orders was renamed **"Packed Report"** and moved under Packer Admin. Its backend (`/outbound/grouped|stats|stuck`, `services/outboundService.ts`) is **unchanged** — it still reads the order pipeline. The page component moved `pages/Outbound.tsx` → `pages/PackedReport.tsx`. The `/outbound` route is now owned by the independent **Outbound module** (§7.12). The original spec below describes the order-pipeline view it still renders.

Orders reach the Outbound Panel automatically when a packer marks them `PACKER_COMPLETE`. An Admin or Inbound Admin then dispatches them to `OUTBOUND`, which sets `sla_completed_at` and stops the SLA countdown.

#### Header Stats
| Card | Value | Color |
|---|---|---|
| Waiting to Dispatch | PACKER_COMPLETE order count | Sky blue |
| Dispatched Today | OUTBOUND orders with `slaCompletedAt ≥ today` | Green |
| D4 Orders | non-OUTBOUND orders with `delayLevel = 4` | Red |
| Missing | Total inbound − Total outbound | Amber |

#### Ready to Dispatch Table
- Lists all `PACKER_COMPLETE` orders sorted by `delayLevel DESC` → `createdAt ASC`
- Columns: Tracking Number · Platform · Packed By · Waiting Since · D-badge · Dispatch button
- **Search bar** — client-side filter on tracking number; clears after dispatch action
- **Checkbox selection** — select individual or all filtered orders
- **Dispatch** (single): confirm dialog → `POST /outbound/dispatch` → `PACKER_COMPLETE → OUTBOUND`, `slaCompletedAt = NOW()`
- **Dispatch Selected** (bulk): `POST /outbound/bulk-dispatch` → returns `{ dispatched, skipped }`
- Pagination: 10 orders/page; resets on search change and after dispatch

#### Comparison Report
Three stat tiles below the dispatch table:
- **Total Inbound** — all orders ever scanned for this tenant
- **Total Dispatched** — all OUTBOUND orders
- **Still in Pipeline** — Total Inbound − Total Dispatched (should approach 0 at end of day)

#### Stuck Orders Table
Lists every order **not yet at OUTBOUND** (INBOUND → PACKER_COMPLETE range).  
Sorted by `delayLevel DESC` then `slaStartedAt ASC` — most urgent at top.  
Columns: Tracking Number · Platform · Current Status (colored pill) · D-badge · Time in Status · In Pipeline Since  
Refetch: 10 s (less frequent than dispatch queue's 5 s).

#### Status Pill Colors
| Status | Background | Text |
|---|---|---|
| INBOUND | `#e5e7eb` | `#374151` |
| PICKER_ASSIGNED | `#dbeafe` | `#1d4ed8` |
| PICKING | `#e0e7ff` | `#4338ca` |
| PICKER_COMPLETE | `#ede9fe` | `#6d28d9` |
| PACKER_COMPLETE | `#ccfbf1` | `#0f766e` |

---

### 7.8 Archive Panel ✅ Built (v2.2.0)
**Visible to:** Admin only  
**Route:** `/archive`

The Archive Panel gives admins full visibility into soft-archived orders and control over the end-of-day archive cycle and long-term data retention.

#### Header Stats Bar
| Card | Value | Color |
|---|---|---|
| Total Archived | All orders with `archived_at IS NOT NULL` | Primary blue |
| Expiring in 30d | Archived orders whose `archived_at + 180 days <= now + 30 days` | Amber |
| Expiring in 7d | Archived orders whose `archived_at + 180 days <= now + 7 days` | Red |

**"Archive OUTBOUND Now" button** — appears alongside the stat cards. Opens a confirmation dialog: *"This will archive all currently OUTBOUND orders for your tenant. This normally runs automatically at 11:30 PM (Manila time). Proceed?"* On confirm: calls `POST /archive/trigger`.

#### Filter Bar
| Filter | Type | Behavior |
|---|---|---|
| Tracking number search | Text input | Partial match on `tracking_number` |
| Platform | Dropdown | SHOPEE / LAZADA / TIKTOK / DIRECT / OTHER |
| Archived date range | Two date pickers (From / To) | Filters `archived_at` |
| Expiring within | Dropdown (7d / 14d / 30d / 60d) | Shows orders expiring in ≤ N days |

A **"Clear filters"** button appears when any filter is active.

#### Archived Orders Table
**Columns:** # | Checkbox | Tracking Number | Platform | Carrier | Shop | Work Date | Archived At | Expires In (badge)

**Expires In badge** color coding:
- **Green** — more than 30 days remaining
- **Amber** — 7–30 days remaining
- **Red** — fewer than 7 days remaining

**Pagination:** 25 orders per page.

#### Bulk Delete
- Checkbox per row + "select all" header checkbox
- **"Delete Selected (N)"** danger button appears when any rows are checked
- Opens `ConfirmDialog` (variant: danger): *"You are about to permanently delete N archived orders. This action cannot be undone. All history records will also be deleted. Are you sure?"*
- On confirm: `POST /archive/bulk-delete` — hard-deletes orders and all child table records (assignments, status history, SLA escalations) for the selected IDs

#### Archive API Endpoints
| Method | Path | Role | Description |
|---|---|---|---|
| `GET` | `/archive` | ADMIN | Paginated archive list. Query: `page`, `pageSize`, `search`, `platform`, `dateFrom`, `dateTo`, `expiresWithin` |
| `GET` | `/archive/stats` | ADMIN | Summary: `{ total, expiring30, expiring7 }` |
| `POST` | `/archive/trigger` | ADMIN | Immediately archives all OUTBOUND orders for the caller's tenant; also enqueues background job |
| `POST` | `/archive/bulk-delete` | ADMIN | Body: `{ orderIds: string[] }`. Hard-deletes with cascade. Admin confirmation required in UI before calling. |

#### Archive Job
- **Queue:** `archiveOutbound` (BullMQ)
- **Schedule:** `'30 23 * * *', tz: 'Asia/Manila'` — every day at **23:30 PHT** (11:30 PM Manila time, 15:30 UTC). Single source of truth: `backend/src/index.ts:158`. SOLUTIONS.md [2026-04-18] / [2026-04-17] document the earlier mis-cron clean-up.
- **Action:** Sets `archived_at = NOW()` on all `status=OUTBOUND, archived_at IS NULL` orders (all tenants)
- **Manual trigger:** `POST /archive/trigger` → calls archive synchronously for the requester's tenant, then enqueues for background processing

#### Retention (6-Month Policy)
- **Hard-delete job** piggybacks on `nightlyReport` at **23:40 PHT (15:40 UTC)** — 11:40 PM Manila time, ~10 minutes after the archive job above
- Deletes orders where `archived_at <= NOW() - 180 days`
- Cascade-deletes all child records (`picker_assignments`, `packer_assignments`, `order_status_history`, `sla_escalations`)
- Per-tenant, per-order error catch — one failure does not abort the sweep

---

### 7.9 Inventory Module ✅ Operation-driven scan (v2.33.0)
**Visible to:** Admin (full); Stock Keeper (scan-only + read-only product/warehouse lookups)
**Sidebar:** parent "Inventory" with 4 children — **Product**, **Inventory**, **Warehouse**, **Stock**.
**Routes:** `/inventory/products`, `/inventory/items`, `/inventory/warehouses`, `/inventory/stock` (all admin); `/stock/scan` (admin + stock keeper mobile camera).

Independent inventory module for warehouse boxes. **Not connected to the order pipeline** — no shared tables, no shared queries, no shared queues.

#### Data model

| Table | Purpose | Key fields |
|---|---|---|
| `product_categories` | Admin-defined categories per tenant | `tenantId`, `name` (`@@unique [tenantId, name]`) |
| `products` | Product master data | `tenantId`, `categoryId`, `productCode` (auto `{CAT3}-NNN` when admin omits it), `name`, `defaultUnit` (KG/PCS), `reservedThreshold` |
| `warehouses` | Physical locations | `tenantId`, `name`, `address` (`@@unique [tenantId, name]`) |
| `stock_items` | One row per printed label / physical box | `productId` (FK), `warehouseId` (FK, current location), `unit`, `quantity`, `batchNumber`, `status` (`PENDING` / `IN_STOCK` / `OUT_OF_STOCK`) |
| `stock_movements` | Scan event log | `type` (IN / USED / TRANSFER), `fromWarehouseId?`, `toWarehouseId?`, `scannedById`, `scannedAt` |

Enums: `StockStatus { PENDING, IN_STOCK, OUT_OF_STOCK }` (PENDING added v2.33.0), `StockUnit { KG, PCS }`, `MovementType { IN, USED, TRANSFER }`.

#### Auto Product ID (v2.33.0)

The Products form no longer takes a `productCode` from the admin. `productService.createProduct` computes the next `{CategoryPrefix3}-NNN` per tenant — prefix is the uppercased first 3 ASCII alpha chars of the category name (padded with `X` if shorter, `PRD` fallback if zero letters), and NNN is the next free 3-digit sequence within that prefix. The route accepts an explicit `productCode` (kept for migrations / scripts), but the UI never sends one. Inserts collide-retry up to 5× on `P2002` before surfacing the error.

#### Scan state machine (POST `/stock/scan`, prefix `/stock`)

Body is now operation-driven: `{ id, operation: 'IN' | 'OUT' | 'TRANSFER', warehouseId, toWarehouseId? }`. The QR payload encodes `{ id }` (or a raw UUID — the parser accepts both). The state machine in `stockService.scanItem`:

| Operation | Existing item state | Action | Movement type | Error case |
|---|---|---|---|---|
| `IN` | `PENDING` or `OUT_OF_STOCK` | flip to `IN_STOCK`, set `warehouseId` | `IN` | `IN_STOCK` → "Already in stock at {warehouse}" |
| `OUT` | `IN_STOCK` | flip to `OUT_OF_STOCK` | `USED` | non-`IN_STOCK` → "Item is not in stock — cannot mark as out" |
| `TRANSFER` | `IN_STOCK` and `warehouseId !== toWarehouseId` | update `warehouseId` to `toWarehouseId` | `TRANSFER` | non-`IN_STOCK` or same warehouse → explicit error |

Result banner colors: IN → green, USED → red, TRANSFER → blue. Camera resumes 1.5s after each scan. A "Show raw QR (debug)" toggle on the start screen displays the most recent decoded text inside the camera frame — used to diagnose field-side scan failures.

#### Pre-created labels (POST `/stock/labels`) — PENDING flow (v2.33.0)

`POST /stock/labels` creates `count` `StockItem` rows in a single transaction with `status = 'PENDING'`. These rows are invisible to `/stock/summary`, `/stock/stats`, and the warehouse hover breakdown — they only contribute to inventory after a stock keeper scans each QR with the **Stock In** operation, which flips the row to `IN_STOCK` and writes an `IN` movement. Body: `{ productId, warehouseId, unit, quantity, count }`. Server generates a per-day batch number `YYYYMMDD-NNN`. PDF QR encodes `{ id }`; the printed sticker shows product name, product code, quantity+unit, destination warehouse name, batch, and a short id suffix. Avery L7173 / J8173 layout (10 per A4 sheet) preserved.

#### Sidebar — parent/child nav

`frontend/src/components/shared/Sidebar.tsx` `NavItem` interface gained `children?: NavItem[]`. Parent items render as a button (not NavLink) that toggles `expanded[path]`; children render as indented `NavLink`s when expanded. Parent auto-expands when `location.pathname.startsWith(parent.path)`. Currently only Inventory has children — pattern is reusable for future parent menus.

#### Per-product Stock Summary (`/inventory/stock`) — rewritten (v2.33.0)

Calls `GET /stock/summary` which returns one row per product:

```ts
{
  productId, productCode, productName, categoryId, categoryName, defaultUnit,
  reservedThreshold,
  inStockQuantity: number,          // sum(stock_items.quantity) where status=IN_STOCK
  boxCount: number,                 // count of IN_STOCK rows
  byWarehouse: Array<{
    warehouseId, warehouseName,
    boxes: number, quantity: number,
  }>,                               // per-warehouse breakdown (for hover tooltip)
  lowStock: boolean,                // inStockQuantity < reservedThreshold
}
```

PENDING and OUT_OF_STOCK rows are excluded from every aggregate above. Frontend (`pages/inventory/StockSummary.tsx`) renders a single toolbar (search input + categories dropdown + Low-stock-only toggle) above the table — the v2.31.0 KPI strip was removed. Columns: Category · Product · Product ID · In Stock (qty + unit) · Box Quantity · Reserved · Status · Actions. Hovering the In-Stock cell pops a dark tooltip with the `byWarehouse` breakdown (`Main WH · 3 box · 15 kg`). Actions: Edit (createPortal modal — kategori/name/unit/reserved alanları, Product ID immutable) + Delete (`ConfirmModal`).

#### API endpoints

`backend/src/routes/products.ts` (prefix `/products`):

| Method | Path | Body | Roles |
|---|---|---|---|
| GET | `/categories` | — | ADMIN, STOCK_KEEPER |
| POST | `/categories` | `{ name }` | ADMIN |
| DELETE | `/categories/:id` | — | ADMIN (409 if referenced) |
| GET | `/` | `?categoryId` | ADMIN, STOCK_KEEPER |
| POST | `/` | `{ categoryId, name, defaultUnit, reservedThreshold, productCode? }` — `productCode` auto-generated `{CAT3}-NNN` if omitted | ADMIN |
| PUT | `/:id` | (partial body) | ADMIN |
| DELETE | `/:id` | — | ADMIN (409 if has stock items) |

`backend/src/routes/warehouses.ts` (prefix `/warehouses`):

| Method | Path | Body | Roles |
|---|---|---|---|
| GET | `/` | — | ADMIN, STOCK_KEEPER |
| POST | `/` | `{ name, address }` | ADMIN |
| PUT | `/:id` | (partial) | ADMIN |
| DELETE | `/:id` | — | ADMIN (409 if has stock items) |

`backend/src/routes/stock.ts` (prefix `/stock`):

| Method | Path | Body | Roles | Notes |
|---|---|---|---|---|
| POST | `/labels` | `{ productId, warehouseId, unit, quantity, count }` | ADMIN | Creates `count` StockItems in `PENDING` status + returns PDF. Headers: `X-Labels-Generated`, `X-Batch-Number` |
| GET | `/items` | `?status&productId&warehouseId` | ADMIN | Includes product+warehouse relations; `status` accepts `PENDING`/`IN_STOCK`/`OUT_OF_STOCK` |
| POST | `/scan` | `{ id, operation: 'IN'\|'OUT'\|'TRANSFER', warehouseId, toWarehouseId? }` | ADMIN, STOCK_KEEPER | Operation-driven state machine above |
| DELETE | `/items/:id` | — | ADMIN | UUID validation; cascades movements |
| GET | `/movements` | `?limit&offset` | ADMIN | Joins fromWarehouse/toWarehouse/scannedBy |
| GET | `/stats` | — | ADMIN | KPI numbers (only IN_STOCK rows counted — PENDING excluded) |
| GET | `/summary` | — | ADMIN | Per-product aggregate with `byWarehouse` breakdown (only IN_STOCK rows; PENDING excluded) |

#### Vite proxy requirement

`frontend/vite.config.ts` `proxyRoutes` extended with `/products` and `/warehouses` in addition to the existing `/stock` (per SOLUTIONS.md [2026-05-02]). Any new top-level prefix not in this list is served by Vite's SPA fallback and returns 200 HTML for GET / 404 for POST — silent failure mode.

---

### 7.10 Incident Report Module ✅ Built (v2.43.0; v2.44.0 added edit + date-range filter + blob PDF download)
**Visible to:** Admin only
**Sidebar:** "Incident Report" — placed directly under "Marketing Report".
**Route:** `/incident-report`.

Formal HR/operations module for documenting employee incidents. Independent of the order pipeline.

#### Data model

| Table | Purpose | Key fields |
|---|---|---|
| `incidents` | One row per filed incident | `tenantId`, `incidentType` (enum), `incidentDate`, `employeeUserId/FullName/Email`, `recipientEmail`, `reportedByUserId/FullName/Role`, `adminDescription` (text), `trackingNumber?`, `platform?`, `shopName?`, `signedFilePath?`, `signedFileMime?`, `signedUploadedAt?`, `emailSentAt?`, `emailSentTo?`, `createdById`, `createdAt`, `updatedAt` |
| `company_branding` | One row per tenant — letterhead source | `tenantId @unique`, `companyName`, `logoPath?`, `logoMime?`, `updatedById`, `updatedAt` |

Enum `IncidentType` carries all 25 categories from the HR taxonomy (Wrong Item Picked → Mismatch in Parcel Count). The 4 parcel-context types (`WRONG_ITEM_PICKED`, `WRONG_ITEM_PACKED`, `MISSING_ITEM`, `PARCEL_DAMAGE`) require `trackingNumber + platform + shopName`; for the other 21 types these fields stay null. The list of which types require parcel context is centralised in `shared/src/index.ts` (`PARCEL_INCIDENT_TYPES` + `requiresParcelContext()`) so both backend validation and the frontend modal share a single source of truth.

#### File storage

Logos and signed (uploaded) incident files live under `/app/uploads` inside the backend container, mounted from a named Docker volume `backend_uploads` (declared in `docker-compose.yml`). Layout:
- `/app/uploads/branding/{tenantId}.{png|jpg|webp}` — one logo per tenant; old file is overwritten/deleted when admin uploads a new one
- `/app/uploads/incidents/{incidentId}-signed.{pdf|png|jpg}` — uploaded after the operator signs the printed report

In dev (`NODE_ENV !== 'production'`) the root falls back to `backend/uploads/`. `ensureUploadDirs()` is called at server startup.

> **Unsigned PDFs are never persisted.** Each download or email request re-generates the PDF in-memory via PDFKit so the document always reflects the current data, current logo, and current company name.

#### PDF generation (`incidentPdfService.ts`)

PDFKit, A4, 50pt margins. Single-page when possible — the Employee Statement and Signature blocks `ensureSpaceOnPage(160)` / `(100)` and page-break if the description is long.

Layout (top to bottom):
1. **Header** — logo (70×70 if uploaded) + Company Name + "INCIDENT REPORT" label on the left; Report ID (`INC-YYYY-XXXXXX`) + Issue Date on the right; divider line
2. **Incident Information** — Type / Date / Employee + email / Reported By + role / Recipient (4 fields in 2 columns)
3. **Parcel Reference** — Tracking + Platform + Shop in 3 columns (only for the 4 parcel-context types)
4. **Statement of Incident** — tinted box containing the per-type template paragraph (25 templates live in `TEMPLATES: Record<IncidentType, ...>`); names + date + tracking/platform/shop are substituted in
5. **Detailed Description by Reporting Officer** — boxed admin-typed description, justified
6. **Employee Statement / Defense** — empty box with 5 dashed ruled lines for the operator to handwrite their defense and sign
7. **Acknowledgement & Signatures** — two-column block (Employee · Reporting Officer), printed names + signature line + "Date: ____" line

Branding header gracefully degrades when no logo has been uploaded yet (Company Name still displays; logo slot is skipped).

#### Backend endpoints (all `ADMIN`-only)

`backend/src/routes/incidents.ts` (prefix `/incidents`):

| Method | Path | Description |
|---|---|---|
| GET | `/` | Paginated list. Query: `page`, `pageSize`, `search` (matches employee name / tracking / emails), `type`, `employeeUserId`, `from`/`to` (inclusive `incidentDate` range, `YYYY-MM-DD`). Ordered by `incidentDate desc, createdAt desc` |
| GET | `/stats` | `{ total, thisMonth, topType: {type,count} \| null, smtpConfigured }` |
| GET | `/pivot` | Employee × type pivot matrix sorted by total desc |
| GET | `/types` | The 25 IncidentType values with their human labels + `requiresParcel` flag |
| GET | `/lookup-tn?tn=...` | Looks up an Order by tracking number and returns `{platform, shopName}` for auto-fill |
| GET | `/selectable-users` | Active users in the tenant — feeds the Employee dropdown |
| GET | `/remembered-name/:userId` | Returns the most-recent `employeeFullName` or `reportedByFullName` previously typed for that user (so the form pre-fills a real name instead of a username) |
| POST | `/` | Create (JSON body validated by zod) |
| PATCH | `/:id` | Update an existing incident (same zod body as create). Parcel fields (TN/platform/shop) are cleared when the type is changed to a non-parcel type |
| GET | `/:id` | Single incident |
| GET | `/:id/pdf` | Stream the unsigned PDF (regenerated each request) |
| POST | `/:id/signed` | Multipart upload of the signed PDF/PNG/JPG (max 10 MB) |
| GET | `/:id/signed` | Stream the signed file |
| POST | `/:id/email` | Send PDF as attachment to recipient + employee email via SMTP. Returns 503 if SMTP is not configured |

`backend/src/routes/branding.ts` (prefix `/branding`):

| Method | Path | Description |
|---|---|---|
| GET | `/` | `{companyName, hasLogo, logoMime, updatedAt}` for the caller's tenant |
| GET | `/logo` | Streams the logo image (any authenticated user — used by Incident Report page hero) |
| POST | `/` | Multipart upsert: `companyName` field + optional `logo` file (PNG/JPG/WebP, max 2 MB) |

#### Email (`incidentEmailService.ts`)

Re-uses the existing `SMTP_HOST / SMTP_PORT / SMTP_USER / SMTP_PASS / SMTP_FROM` env vars (already used by `slaD4Email.ts` and `nightlyReport.ts`). Adds `SMTP_SECURE='true'` toggle for TLS. The Send Email button is disabled in the UI when `/incidents/stats` reports `smtpConfigured: false`, hover tooltip explains why.

#### Frontend (page + modals)

- `frontend/src/pages/IncidentReport.tsx` — page hero (logo + company name + 2 CTAs) · 4 stat cards · filter card · marketing-style date-range strip (All time / 7 / 30 / 90 / Custom) that filters Table A only · Table A (Recent Incidents, 25/page; each row has **Edit** + **Open** actions) · Table B (Pivot — employees × 25 incident types, sticky first column + horizontal scroll)
- `frontend/src/pages/incident/CreateIncidentModal.tsx` — wide modal with grid form, reused for both create and **edit** (optional `editing` prop). Conditional 3-field parcel block (TN + Platform + Shop) appears only for the 4 parcel-context types. TN "Lookup" button calls `/incidents/lookup-tn` to auto-fill Platform + Shop from a matching Order. Employee dropdown auto-fills Full Name (from `getRememberedFullName()`) + Email (from `User.email`). Reported By block auto-fills from the current admin session (create mode only)
- `frontend/src/pages/incident/ViewIncidentModal.tsx` — opened from any row in Table A. Shows admin description + 3-button action row (Download PDF · Upload Signed · Send Email) + status of signed/email. PDF + signed file are fetched as authenticated blobs via the api client (`downloadIncidentPdf`/`downloadSignedFile`) — a plain `<a href>` would hit the SPA fallback and render the login screen
- `frontend/src/pages/incident/CompanySettingsModal.tsx` — cogwheel modal in the page hero. Edit company name + replace logo
- `frontend/src/api/incidents.ts` + `frontend/src/api/branding.ts` — TanStack Query hooks; the only places that touch axios for this module

#### Sidebar wiring + route guards

`Sidebar.tsx` gained an `IncidentIcon` and a new nav entry "Incident Report" placed right after "Marketing Report". As of v2.49.0 the module is reachable by `[UserRole.ADMIN, UserRole.WAREHOUSE_ADMIN, UserRole.INCIDENT_REPORTER]` in both `Sidebar.tsx` `roles` and the `App.tsx` `ProtectedRoute allowedRoles`. `INCIDENT_REPORTER` is an incident-only role (no other sidebar entries) that can do everything in the module **except delete** — the Delete button is hidden for it in `IncidentReport.tsx`, and `DELETE /incidents/:id` stays guarded to `ADMIN, WAREHOUSE_ADMIN`. Non-authorized sessions get redirected as usual.

#### Vite proxy + nginx

`frontend/vite.config.ts proxyRoutes` and `frontend/nginx.conf` regex location both gained `incidents|branding` prefixes. Without these, the SPA fallback would silently return 200 HTML for backend routes (per SOLUTIONS.md [2026-05-02]).

#### Docker volume

`docker-compose.yml` backend service mounts named volume `backend_uploads` at `/app/uploads`. Survives container restarts (including CD redeploys). New volume entry added to the bottom-level `volumes:` map.

---

### 7.11 Return & Cancel Parcel Module ✅ Built (v2.46.0) · reworked (v2.47.0)

**Report page visible to:** Admin, Warehouse Admin, **Inbound/Outbound Admin** (`INBOUND_ADMIN`)
**Scan station role:** **Return & Cancel Scanner** (`RETURN_SCANNER`) — a dedicated, handheld-only role (+ Admin for testing).
**Sidebar:** single `Return & Cancel` link → `/returns` (the report). No Scan/Report split.

Tracks parcels that come back as **returns** or get **cancelled**, outside the normal inbound → outbound lifecycle.

**Architecture (v2.47.0):** scanning happens **on the phone** by the separate `RETURN_SCANNER` role — NOT mixed into Inbound/Outbound Admin. The desktop has no scan page; `/returns` is purely the report plus an **Add Parcel** manual-entry popup (fallback for barcodes the phone can't read). Confirmed phone scans land in the report automatically (POST `/returns` → React Query invalidation).

**Phone scan station (`/returns/scan`, `pages/ReturnScanMobile.tsx`)** — full-screen dark handheld page (no `AppLayout`), reached only via the `/scan` login station (`getScanRoute` maps `RETURN_SCANNER → /returns/scan`). Modeled on `StockScan.tsx` (camera + haptics). Flow:
1. **Sticky selectors** (persisted to `localStorage`): **Type** (`Return`/`Cancel` segmented), **Store** (`SALES_STORES`), **Courier** (`Carrier`/`CARRIER_LABELS`).
2. **Waybill** — auto-focused text input (keyboard-wedge / hardware scanner + manual typing) **or** an optional **camera** button (`@zxing/browser` `BrowserMultiFormatReader` reads the barcode as raw text). **Platform** auto-detects from the waybill prefix via `detectPlatform()` (`RETURN_CANCEL_PLATFORMS`), editable.
3. On Enter/scan a **confirm sheet** shows the full record → **Confirm & Save** → POST → success beep+vibrate; the waybill clears, sticky selectors stay; an in-memory **Recent Scans** list shows the session's saves.

**Report page (`/returns`, `pages/ReturnCancel.tsx`)** — summary cards (**Total / Returns / Cancels**), a **Search Waybill** + **Type** filter, and a **date-range strip** (`1 Day` / `7 Days` / `1 Month` / `Custom`, Manila `YYYY-MM-DD` → UTC+8). Paginated table (25/page): Waybill · Type · Store · Platform · Courier · Date/Time · Delete. The hero **Add Parcel** button opens `AddParcelModal` (manual-entry form with the same fields + `detectPlatform` auto-fill) → POST `/returns`.

**Data model:** table `return_cancel_parcels` (`id`, `tenant_id`, `tracking_number`, `type ReturnCancelType`, `store_name`, `platform Platform`, `carrier Carrier`, `created_by`, `created_at`), indexed on `(tenant_id, created_at desc)` and `(tenant_id, type)`. Enums `ReturnCancelType {RETURN, CANCEL}` and `Carrier {SPX, JT_EXPRESS, FLASH, LEX, LBC, NINJA_VAN, OTHER}`.

**Retention:** records are **hard-deleted after 180 days (6 months)** by the nightly job — `returnCancelService.hardDeleteExpiredReturnCancel(tenantId)` in `nightlyReport.ts`. (Independent of the Stock retention exemption.)

**Backend:** `routes/returns.ts` registered at prefix `/returns` in `index.ts`; `services/returnCancelService.ts`. Guards are **split**: `GET /returns` + `DELETE /returns/:id` → `requireRole(ADMIN, WAREHOUSE_ADMIN, INBOUND_ADMIN)` (report viewers); `POST /returns` → `requireRole(ADMIN, WAREHOUSE_ADMIN, INBOUND_ADMIN, RETURN_SCANNER)` (phone scanner can create but not read/delete the report). **Frontend:** `api/returns.ts` (React Query hooks), `pages/ReturnScanMobile.tsx` (phone), `pages/ReturnCancel.tsx` (report + Add Parcel modal). **Proxy:** `returns` prefix in `vite.config.ts proxyRoutes` + `nginx.conf` location regex.

**New role `RETURN_SCANNER`:** added to the `UserRole` enum (Prisma + `shared/src/index.ts`). Phone/handheld only — created in Settings (`Return & Cancel Scanners` section, like Stock Keepers), dispatched by `ScanLogin`/`Login`/`App.tsx RootRoute` to `/returns/scan`, and intentionally absent from the desktop sidebar. (The earlier v2.46.0 design that put scanning on a desktop page and gave it to `INBOUND_ADMIN` was replaced.)

---

### 7.12 Outbound Module ✅ Built (v2.48.0) — independent "handed-to-courier" log
**Visible to:** Admin, Outbound Admin only. The phone scan screen is **Outbound Admin only**.
**Routes:** `/outbound` (board), `/outbound/report` (historical), `/outbound/scan` (phone, no layout).

A **fully independent** module that records every parcel physically handed to a courier. It writes to its **own table `dispatch_parcels`** and **never touches the `orders` table or any existing report** — this isolation is a hard requirement. Internal backend names use `dispatch` / `/dispatch` to avoid colliding with the untouched `/outbound` (Packed Report) endpoints; the UI labels everything "Outbound."

**Two parcel kinds** (`DispatchSource` enum):
- **IN_HOUSE** — packed by our packers. The scanner looks up the waybill in our `orders` (read-only `GET /dispatch/lookup`) and auto-fills platform + shop + a suggested carrier. **If no matching order exists, the scan is blocked** (error beep) — in-house parcels must already be in the system.
- **EXTERNAL** — third-party parcels brought in from outside. The operator picks **Platform + Carrier (both mandatory)**; shop name is forced to **"Others"** (not asked).

The board groups parcels **carrier → shop → count** for a single Manila day (in-house under real shop names, external under "Others"), with an Incident-style date control. The Report sub-page shows per-carrier totals across a date range (Incident-style 1 Day / 7 Days / 1 Month / Custom), split by in-house vs external. Records are **kept indefinitely** (no retention purge).

**New role `OUTBOUND_ADMIN`:** added to `UserRole` (Prisma + `shared/src/index.ts`); the old `INBOUND_ADMIN` was relabelled "Inbound Admin" (enum value unchanged, no migration). Desktop default + scan route both point at Outbound (`App.tsx RootRoute`/`homeByRole`, `Login.getDefaultRoute`/`ROUTE_ROLES`, `ScanLogin.getScanRoute`). **Backend:** `routes/dispatch.ts` + `services/dispatchService.ts`, registered at prefix `/dispatch` in `index.ts`, guarded `requireRole(ADMIN, OUTBOUND_ADMIN)`. Endpoints: `GET /dispatch/lookup`, `POST /dispatch`, `GET /dispatch/grouped`, `GET /dispatch/stats`, `GET /dispatch/report`, `GET /dispatch` (list), `DELETE /dispatch/:id`. **Frontend:** `api/dispatch.ts`, `pages/OutboundScan.tsx` (reuses the field-validated scan primitives — 3-note beep, 4-pulse vibrate, camera double-fire guard), `pages/OutboundBoard.tsx`, `pages/OutboundReport.tsx`. **Proxy:** `dispatch` prefix added to `vite.config.ts proxyRoutes` + `nginx.conf` location regex. **Schema:** new enum `DispatchSource {IN_HOUSE, EXTERNAL}` + table `dispatch_parcels` (`source`, `platform`, `carrier`, `shop_name`, nullable `order_id` soft-link, `created_by`, `created_at`); all additive `db push`, no data loss.

---

### 7.13 Accounting Module ✅ Built (v2.51.0) · reworked with line items (v2.52.0) — independent finance module

A self-contained accounting module under **Incident Report** in the sidebar. **Never touches the order pipeline, existing tables, or existing reports** — own `acc_*` tables, tenant-scoped, no FKs into existing models. Access: **ADMIN + ACCOUNTANT**. Single currency **₱ PHP**. All UI in English.

**Sidebar:** collapsible "Accounting" parent → Dashboard · Sales · Expenses · Customers / Suppliers · Company Profile.

**Sub-pages**
- **Dashboard** (`/accounting`) — KPI cards (Total Sales / Total Expenses / Net / Pending Receivables) + Recent Sales/Expenses.
- **Sales** (`/accounting/sales`) — entry form: Product/Price/Quantity (live total), Customer (ComboBox + "Others" → auto-fills address/number/email/contact person), Payment Method (Gcash/Cash/Bank Transfer/Check — **conditional fields**: Bank→bank+account+ref, Gcash→gcash#+ref, Check→check#+account), Sales Status (Paid/Pending → **Due Date**), **Create New Invoice** (PDF), filterable list (date range + payment + status + search) with Invoice/Edit/Delete per row.
- **Expenses** (`/accounting/expenses`) — auto ID + date, Country (PH/CN/TR/CA), Item, Supplier (ComboBox + "Others"), Category, Amount/Quantity (live total), Paid From (Bank/Gcash/Credit Card/Cash/Check — conditional ref#/check#), Paid By; filterable list with Edit/Delete.
- **Customers / Suppliers** (`/accounting/contacts`) — two side-by-side master tables feeding the ComboBoxes; add/edit/delete each. Adding here surfaces instantly in Sales/Expenses dropdowns.
- **Company Profile** (`/accounting/company`) — name + logo (base64 in DB) + address/email/contact/taxId; used as the invoice letterhead.

**Data model (`acc_*`, tenant-scoped, no existing-table FKs):** `AccCustomer`, `AccSupplier`, `AccSale` (snapshots customer fields so deletes don't corrupt history; `customer` → `AccCustomer onDelete: SetNull`), `AccExpense` (`expenseNo` autoincrement), `AccCompanyProfile` (unique per tenant; `logoData` base64 `@db.Text`), `AccInvoice` (snapshots company + total; `@@unique([tenantId, invoiceNo])`; `sale onDelete: Cascade`), `AccCounter` (per-tenant invoice sequence). Enums: `AccPaymentMethod`, `AccSalesStatus`, `AccCountry`, `AccPaidFrom`.

**Backend:** `routes/accounting.ts` (prefix `/accounting`, every route `requireRole(ADMIN, ACCOUNTANT)`, all queries scoped by `tenantId` from the JWT), `services/accountingService.ts`, `services/accountingPdfService.ts` (PDFKit A4 invoice: logo + company header + bill-to + line item + totals + payment/status/due). Invoice numbering `INV-YYYY-NNNN` via atomic `AccCounter` upsert. Logo upload via multipart → base64 (no filesystem / Docker volume).

**Frontend:** `pages/accounting/{AccDashboard,AccSales,AccExpenses,AccContacts,AccCompany}.tsx`, `api/accounting.ts` (TanStack Query), `components/shared/ComboBox.tsx` (searchable; matching entries rise to top; "Others" → manual entry; inline "+ Add"), `styles/accounting.css` (all selectors namespaced under `.acc-page` to avoid collisions). Reuses dom's `ConfirmModal` + cookie-auth `api` client.

**Proxy:** `/accounting` added to `vite.config.ts proxyRoutes` + `nginx.conf` location regex (otherwise SPA fallback serves HTML to backend calls).

---

### 7.14 Employee Schedule Module ✅ Built (v2.66.0) — independent staff attendance scheduler · local `db push` PENDING (dev pg down → applies on CD deploy)

A self-contained workforce-scheduling module placed **directly under Incident Report** in the sidebar (single entry "Employee Schedule"). **Never touches the order pipeline, existing tables, or existing reports** — own `emp_*` tables, tenant-scoped, no FKs into existing models (same independent-module pattern as Accounting/Incident/Dispatch). Access: **ADMIN + WAREHOUSE_ADMIN** only (view + edit). All UI in English. Full plan: `EMPLOYEE_SCHEDULE.md`. shared + backend `tsc` and frontend `tsc -b && vite build` green.

**Layout:** single route `/employee-schedule` → `PageShell` + horizontal **tab bar** (the Warehouse Report pattern — NOT a sidebar submenu), three side-by-side tabs: **Schedule** · **Employees** · **Report**. Visual reference: a weekly grid mirroring the Everhour "Restaurant Schedule" template (department bands, left `#ID + name + weekly-total clock` column, 7 day columns of colour-coded cells), but each cell is an **attendance status** dropdown (not a role/time-range) with an OT dropdown on Present.

**Departments (fixed enum `EmpDepartment`):** Administrative · Picker · Packer · Logistic.
**Attendance (fixed enum `AttendanceStatus`):** Present (8h) · Half Day (4h) · Absent · Vacation Leave · Sick Leave · Maternity Leave (all leaves = 0h); blank "—" = unscheduled (not counted). **OT** dropdown (0–5h, default 0) appears only when Present. Day hours = base(status) + OT; the left "clock" shows the employee's weekly total (`HH:MM`).

**Sub-tabs**
- **Schedule** — week navigator (Sun→Sat, Manila); employees grouped by department; each day cell = colour-coded status `<select>` + conditional OT `<select>`; **autosaves per cell** (`PUT /employee-schedule/schedule`, optimistic). Sticky first column + horizontal scroll.
- **Employees** — add form (Department → First Name → Last Name → Start Date, plus optional **Contact Number · Email · Address · Birthday · Emergency Contact Name · Emergency Contact Number**), then a department-grouped list of **active** employees (**Employee ID #101… · Name · Contact · Start Date · Edit/Set Inactive/Delete**). `empNo` auto-assigned via an atomic per-tenant counter (starts at #101). New employees default **Active**. **Active/inactive lifecycle (v2.67.0):** *Set Inactive* opens a modal that requires a **Leave Date**, then the employee drops to a separate **"Inactive / Former Employees"** table (ID · Name · Department · Start Date · **Leave Date** · Edit/Reactivate/Delete); *Reactivate* clears the leave date. The Edit modal exposes every field + a Status select (Inactive → required Leave Date). Inactive staff are excluded from the Schedule grid but remain in the Report for periods they worked. Delete is still a hard delete (cascade).
- **Report** — Weekly | Monthly toggle + period navigator; 4 summary cards (Total Employees / Worked Days / Hours / OT); a department-grouped per-employee table (Present / Half Day / Absent / Vacation / Sick / Maternity / OT / **Worked Days** = present + 0.5·halfDay / **Total Hours** = 8·present + 4·halfDay + OT) with department subtotals + grand total, plus **CSV + PDF export**. Decisions (confirmed): blank "—" default (unscheduled, not counted), hard delete (cascade), week starts Sunday.

**Data model (`emp_*`, tenant-scoped, no existing-table FKs):** `EmpEmployee` (`empNo` Int, `@@unique([tenantId, empNo])`, department/firstName/lastName/`startDate @db.Date`; v2.67.0 +optional `contactNumber`/`email`/`address`/`birthday @db.Date`/`emergencyContactName`/`emergencyContactNumber` + `isActive Boolean @default(true)` + `leaveDate @db.Date?`), `EmpSchedule` (`date @db.Date`, `status`, `otHours`, `@@unique([tenantId, employeeId, date])`, `employee onDelete: Cascade`), `EmpCounter` (per-tenant `empNo` sequence, default 100). Enums `EmpDepartment`, `AttendanceStatus`. `Tenant` gains back-relations only. Employee delete is a **hard delete** (schedule rows cascade). All additive `db push` (no data loss).

**Backend:** `routes/employeeSchedule.ts` (prefix `/employee-schedule`, every route `requireRole(ADMIN, WAREHOUSE_ADMIN)`, all queries scoped by JWT `tenantId`) + `services/employeeScheduleService.ts`. Endpoints: `GET/POST /employees`, `PUT/DELETE /employees/:id`, `GET /schedule?weekStart=`, `PUT /schedule` (cell upsert; clear → delete), `GET /report?period=week|month&date=`. Manila UTC+8 bounds via `lib/manila.ts`.

**Frontend:** `pages/employeeSchedule/{EmployeeSchedule,ScheduleTab,EmployeesTab,ReportTab}.tsx` + `api/employeeSchedule.ts` (TanStack Query). Reuses `PageShell`, `ConfirmModal`, theme tokens, cookie-auth `api`.

**Wiring:** `shared/src/index.ts` enums+DTOs; `backend/src/index.ts` route register; `App.tsx` route (`allowedRoles={[ADMIN, WAREHOUSE_ADMIN]}`); `Sidebar.tsx` NAV_ITEMS entry under Incident Report; `/employee-schedule` added to `vite.config.ts proxyRoutes` + `nginx.conf` location regex.

---

## 8. Frontend Structure

```
frontend/
├── src/
│   ├── pages/
│   │   ├── Login.tsx              ← username/password login; role-aware redirect via getDefaultRoute
│   │   ├── ScanLogin.tsx          ← /scan — handheld URL entry; redirects each role to their own scan/list page
│   │   ├── Dashboard.tsx          ← / for ADMIN/INBOUND_ADMIN (Phase 11) — pipeline KPIs + SLA summary
│   │   ├── Inbound.tsx            ← /dashboard — Phase 2 (Single + Bulk scan modal, pagination 25/page)
│   │   ├── InboundScan.tsx        ← /inbound-scan — phase 10b handheld camera scan, single + bulk modes
│   │   ├── PickerAdmin.tsx        ← /picker-admin — Phase 3+4 + scan+stage + workload cards
│   │   ├── PickerAdminScan.tsx    ← /picker-admin-scan — phone scan station (relays via socket)
│   │   ├── PickerMobile.tsx       ← /picker — login + own PICKER_ASSIGNED orders + scan complete
│   │   ├── PackerAdmin.tsx        ← /packer-admin — v2.29.0 scan & stage + per-packer assignment + workload
│   │   ├── PackerAdminScan.tsx    ← /packer-admin-scan — v2.29.0 phone scan station (green theme)
│   │   ├── PackerMobile.tsx       ← /packer — v2.29.0 own PACKER_ASSIGNED list + scan complete (green theme)
│   │   ├── Outbound.tsx           ← /outbound — Phase 8 (dispatch queue, comparison report, stuck orders)
│   │   ├── Archive.tsx            ← /archive — v2.2.0 (stats, filters, expiry badges, bulk delete, manual trigger)
│   │   ├── Reports.tsx            ← /reports — 4 tabs: Live Performance, Performance, SLA Analytics, Order Timeline
│   │   ├── Settings.tsx           ← admin user management + sales-agent + stock-keeper creation
│   │   ├── Users.tsx              ← legacy placeholder (Settings replaced most functionality)
│   │   ├── SalesDashboard.tsx     ← /sales — v2.23.1 agent calendar dashboard
│   │   ├── SalesEntry.tsx         ← /sales/entry — daily activity form (content posts + live selling + marketplace + direct orders)
│   │   ├── SalesOrders.tsx        ← /sales/orders — agent's own direct-order history with edit/delete (v2.28.0)
│   │   ├── MarketingReport.tsx    ← /marketing-report — admin + sales-agent leaderboard + 5 comparison charts + AgentDetailPanel
│   │   ├── StockScan.tsx          ← /stock/scan — STOCK_KEEPER mobile camera, Single/Bulk modes, operation-driven (v2.33.0)
│   │   ├── IncidentReport.tsx     ← /incident-report — v2.43.0 admin HR module: page hero + 4 stat cards + filter + Recent table + Employee×Type pivot
│   │   ├── incident/
│   │   │   ├── CreateIncidentModal.tsx     ← form with 25-type dropdown + conditional parcel block
│   │   │   ├── ViewIncidentModal.tsx       ← row-action modal: PDF download + signed upload + send email
│   │   │   └── CompanySettingsModal.tsx    ← cogwheel: company name + logo upload (used as PDF letterhead)
│   │   └── inventory/
│   │       ├── Products.tsx       ← /inventory/products — Categories + Products CRUD (v2.31.0)
│   │       ├── InventoryItems.tsx ← /inventory/items — label generation PDF (v2.31.0 → v2.34.4 form rework)
│   │       ├── Warehouses.tsx     ← /inventory/warehouses — Warehouse CRUD
│   │       └── StockSummary.tsx   ← /inventory/stock — per-product table + manual adjust modal (v2.34.0)
│   ├── components/
│   │   ├── ScanInput.tsx          ← HID barcode scanner input (desktop inbound only)
│   │   ├── ProtectedRoute.tsx     ← role-gated route wrapper; redirects to /login or /unauthorized
│   │   ├── OrderTable.tsx         ← desktop table; includes DelayBadge column; D2+ rows tinted
│   │   ├── OrderCard.tsx          ← Phase 4: mobile card, touch-friendly, large tap targets
│   │   ├── ConfirmDialog.tsx      ← reusable confirmation modal
│   │   ├── DelayBadge.tsx         ← D-level badge: D0=none, D1=yellow, D2=orange, D3=red, D4=red+pulse
│   │   ├── SlaAlertBanner.tsx     ← Phase 9: dismissible D4 alert banner for ADMIN/INBOUND_ADMIN
│   │   ├── SlaHistoryModal.tsx    ← per-order SLA escalation timeline modal
│   │   ├── BulkScanModal.tsx      ← Phase 10 bulk staging + carrier/shop selector
│   │   ├── QuickScanModal.tsx     ← Phase 10b single-scan carrier/shop prompt (phone → desktop)
│   │   └── shared/
│   │       ├── AppLayout.tsx      ← desktop layout wrapper (Sidebar + content area)
│   │       ├── Sidebar.tsx        ← role-based nav; v2.31.0 gained `children?` for Inventory parent menu
│   │       ├── MobileHeader.tsx   ← Phase 4: handheld layout header (name + time, no nav)
│   │       ├── PageShell.tsx      ← sticky header + scrollable body for each panel
│   │       ├── Avatar.tsx         ← initials avatar component
│   │       ├── PlatformBadge.tsx  ← color-coded platform label (Shopee/Lazada/TikTok)
│   │       ├── StatCard.tsx       ← stat number card used in panel headers
│   │       ├── SectionHeader.tsx  ← section title + count badge
│   │       ├── ConfirmModal.tsx   ← v2.33.0 — createPortal modal replacing window.confirm() in Inventory
│   │       ├── Pagination.tsx     ← v2.35.1 — shared Prev/Next + numbered footer (StockSummary + Products)
│   │       └── DateNavigator.tsx  ← v2.27.0 — extracted from Outbound; prev/next + Today + date picker; minDate prop
│   ├── stores/                    ← Zustand global state
│   │   ├── authStore.ts
│   │   ├── notificationStore.ts   ← Phase 9: d4Alerts[], addD4Alert(), dismissD4Alert()
│   │   └── mobileSidebar.tsx      ← context for mobile sidebar open/close (handheld)
│   ├── api/                       ← TanStack Query hooks
│   │   ├── orders.ts
│   │   ├── assignments.ts
│   │   ├── users.ts
│   │   ├── reports.ts
│   │   ├── sales.ts               ← v2.23.1 — agent calendar + day-detail + direct order CRUD
│   │   ├── marketing.ts           ← v2.23.1 — leaderboard + drill-down
│   │   ├── products.ts            ← v2.31.0 — Product + Category CRUD hooks
│   │   ├── warehouses.ts          ← v2.31.0 — Warehouse CRUD hooks
│   │   ├── stock.ts               ← v2.31.0 + v2.33.0 — useStockSummary, useScanStock, useGenerateLabels
│   │   ├── incidents.ts           ← v2.43.0 — useIncidents/Stats/Pivot/Types, useCreateIncident, useUploadSignedFile, useSendIncidentEmail, useSelectableUsers + lookupTrackingNumber + fetchRememberedFullName
│   │   └── branding.ts            ← v2.43.0 — useBranding, useUpdateBranding (multipart logo upload), brandingLogoUrl()
│   ├── lib/
│   │   ├── platformDetect.ts      ← tracking number → platform logic
│   │   ├── scanDetect.ts          ← keystroke interval < 50ms = scanner, > 200ms = manual
│   │   └── manila.ts              ← timezone utilities: getManilaDateString() — Asia/Manila UTC+8, no deps
│   ├── theme.ts                   ← design tokens: colors, radius, shadow, font — single source of truth
│   └── index.css                  ← global design system CSS
```

### Route Access Control
```
/login                → Public
/dashboard            → ADMIN, INBOUND_ADMIN  (Inbound panel — also visible to PICKER_ADMIN, PACKER_ADMIN via sidebar)
/picker-admin         → ADMIN, PICKER_ADMIN
/picker               → PICKER            (mobile-first — PickerDevice.tsx)
/packer-admin         → ADMIN, PACKER_ADMIN
/packer               → PACKER            (mobile-first — PackerDevice.tsx)
/outbound             → ADMIN, INBOUND_ADMIN
/archive              → ADMIN only
/users                → ADMIN only
/incident-report      → ADMIN, WAREHOUSE_ADMIN, INCIDENT_REPORTER  (delete: ADMIN, WAREHOUSE_ADMIN only — v2.49.0)
/accounting           → ADMIN, ACCOUNTANT  (+ /accounting/sales, /expenses, /contacts, /company — v2.51.0)
```

> **Handheld routing note:** `/picker` and `/packer` routes are opened on the handheld device browser. After login the device stays on this route — no navigation to other pages. The layout renders without Sidebar/Header and uses mobile-first components.

---

## 9. Backend Structure

```
backend/
├── src/
│   ├── routes/
│   │   ├── auth.ts
│   │   ├── orders.ts              ← scan + bulk-scan + shops + handheld scan endpoints
│   │   ├── assignments.ts         ← /assign/picker, /assign/packer (legacy single-shot)
│   │   ├── picker-admin.ts        ← v2.x — scan-and-stage, assign, bulk-assign, stats, complete, unassign
│   │   ├── packer-admin.ts        ← v2.29.0 — scan-and-stage, assign, bulk-assign, stats, complete, remove, unassign
│   │   ├── picker.ts              ← PICKER handheld endpoints (own orders, complete)
│   │   ├── packer.ts              ← PACKER handheld endpoints (own assigned orders, complete)
│   │   ├── outbound.ts            ← dispatch single + bulk, stats, stuck list
│   │   ├── users.ts
│   │   ├── reports.ts             ← /reports/dashboard, /reports/sla, /reports/performance, /reports/live-performance, /reports/order-timeline (+ PDF/CSV)
│   │   ├── archive.ts             ← GET /archive, GET /archive/stats, POST /archive/trigger, POST /archive/bulk-delete
│   │   ├── products.ts            ← v2.31.0 — Product + Category CRUD (admin + read for STOCK_KEEPER)
│   │   ├── warehouses.ts          ← v2.31.0 — Warehouse CRUD (admin + read for STOCK_KEEPER)
│   │   ├── stock.ts               ← v2.31.0 + v2.33.0 rewrites — /labels, /scan (operation-driven), /summary, /stats, /items, /lookup/:id, /adjust, /movements
│   │   ├── sales.ts               ← v2.23.1 — agent daily activity + own direct-order CRUD
│   │   ├── marketing.ts           ← v2.23.1 — admin leaderboard + drill-down (audit-logged)
│   │   ├── incidents.ts           ← v2.43.0 — 12 endpoints: list/stats/pivot/types/lookup-tn/selectable-users/remembered-name + CRUD + signed upload + email send
│   │   └── branding.ts            ← v2.43.0 — GET / POST / GET /logo (multipart upsert, ADMIN-only)
│   ├── plugins/
│   │   ├── auth.ts                ← JWT verification plugin
│   │   ├── cors.ts
│   │   ├── rateLimit.ts
│   │   └── socket.ts              ← Socket.io integration; joins user to tenant:{id} + user:{id} rooms on connect
│   ├── middleware/
│   │   ├── rbac.ts                ← role-based access control
│   │   └── auditLog.ts            ← v2.26.0 — logs marketing-report reads/writes (userId, role, tenantId, method, url, ts)
│   ├── jobs/
│   │   ├── index.ts               ← registers all BullMQ workers and repeatable jobs
│   │   ├── nightlyReport.ts       ← BullMQ job: 23:40 PHT email + hardDeleteExpiredOrders() call
│   │   ├── archiveOutbound.ts     ← BullMQ job: 23:30 PHT daily, sets archived_at on OUTBOUND orders
│   │   ├── slaEscalation.ts       ← BullMQ job: every 15min sweep, D0→D4 escalation + priority boost
│   │   └── slaD4Email.ts          ← BullMQ job: supervisor alert email when order hits D4
│   ├── services/
│   │   ├── orderService.ts
│   │   ├── assignmentService.ts
│   │   ├── pickerAdminService.ts  ← v2.32.0 perf rewrite — getPickerStats batched (6 queries, was 4N+2)
│   │   ├── packerAdminService.ts  ← v2.29.0 + v2.31.4 — getPackerStats with Assigned + Done Today
│   │   ├── reportService.ts
│   │   ├── emailService.ts
│   │   ├── archiveService.ts      ← archiveOutboundOrders(), getArchivedOrders(), bulkDeleteArchivedOrders(), hardDeleteExpiredOrders()
│   │   ├── slaService.ts          ← escalateOrder(), calculatePriorityDelta(), markSlaComplete(), querySlaEligibleOrders()
│   │   ├── productService.ts      ← v2.31.0 + v2.33.0 — Product/Category CRUD + auto productCode generation
│   │   ├── warehouseService.ts    ← v2.31.0 — Warehouse CRUD + in-stock item count
│   │   ├── stockService.ts        ← v2.31.0 rewrite + v2.33.0 operation-driven scan state machine + v2.34.0 manual adjust + v2.34.5 bulk lookup
│   │   ├── salesActivityService.ts        ← v2.23.1 — calendar + day-detail + activity CRUD
│   │   ├── salesDirectOrderService.ts     ← v2.28.0 — direct order edit/delete (transactional item replace, cascade delete)
│   │   ├── marketingReportService.ts      ← v2.23.1 + v2.28.x — leaderboard + comparison charts + agent drill-down
│   │   ├── incidentService.ts             ← v2.43.0 — CRUD, list + stats + pivot, lookup-tn, signed file persistence, remembered-name lookup
│   │   ├── incidentPdfService.ts          ← v2.43.0 — PDFKit letterhead + 25 statement templates with name/TN substitution
│   │   ├── incidentEmailService.ts        ← v2.43.0 — SMTP send with PDF attachment, recipient + employee + isSmtpConfigured()
│   │   └── brandingService.ts             ← v2.43.0 — getBranding, upsertBranding, readLogoBuffer (filesystem + Prisma)
│   ├── lib/
│   │   ├── manila.ts              ← getManilaStartOfToday(), getManilaDateString() — pure UTC+8 arithmetic, no deps
│   │   └── uploads.ts             ← v2.43.0 — UPLOADS_ROOT (/app/uploads in prod, ./uploads in dev), ensureUploadDirs(), extFromMime()
│   └── middleware/
│       └── rbac.ts                ← Role-based access control
└── prisma/
    └── schema.prisma
```

### API Endpoints

| Method | Endpoint | Role | Description |
|---|---|---|---|
| POST | `/auth/login` | All | Login |
| POST | `/auth/logout` | All | Logout |
| GET | `/orders` | Role-filtered | List orders (includes `delay_level` in response) |
| POST | `/orders` | ADMIN, INBOUND_ADMIN | Create order (scan) — sets `sla_started_at`, `delay_level=0` |
| DELETE | `/orders/:id` | ADMIN, INBOUND_ADMIN | Delete order |
| PATCH | `/orders/:id/status` | Role-filtered | Update status — sets `sla_completed_at` when → OUTBOUND |
| GET | `/orders/:id/sla` | ADMIN, INBOUND_ADMIN, PICKER_ADMIN, PACKER_ADMIN | Full SLA escalation history for an order |
| GET | `/picker-admin/orders` | ADMIN, PICKER_ADMIN | List INBOUND orders sorted by priority DESC, delayLevel DESC, createdAt ASC |
| GET | `/picker-admin/pickers` | ADMIN, PICKER_ADMIN | List active pickers |
| POST | `/picker-admin/assign` | ADMIN, PICKER_ADMIN | Assign single order to picker → status: PICKER_ASSIGNED |
| POST | `/picker-admin/bulk-assign` | ADMIN, PICKER_ADMIN | Bulk assign up to 200 orders to one picker |
| GET | `/picker-admin/stats` | ADMIN, PICKER_ADMIN | Per-picker workload: PICKER_ASSIGNED / PICKING / PICKER_COMPLETE counts |
| GET | `/picker-admin/picker/:id/orders` | ADMIN, PICKER_ADMIN | Active orders assigned to a specific picker (completedAt = null) |
| POST | `/picker-admin/complete` | ADMIN, PICKER_ADMIN | Mark order as PICKER_COMPLETE; sets pickerAssignment.completedAt |
| POST | `/picker-admin/unassign` | ADMIN, PICKER_ADMIN | Return order to INBOUND; deletes PickerAssignment record |
| POST | `/assign/picker` | ADMIN, PICKER_ADMIN | Assign to picker → emits `order:assigned` to `user:{pickerId}` |
| POST | `/assign/packer` | ADMIN, PACKER_ADMIN | Assign to packer → emits `order:assigned` to `user:{packerId}` |
| GET | `/outbound/orders` | ADMIN, INBOUND_ADMIN | List PACKER_COMPLETE orders ready to dispatch, sorted by delayLevel DESC, createdAt ASC |
| GET | `/outbound/stats` | ADMIN, INBOUND_ADMIN | Header stats: waitingCount, dispatchedToday, inboundTotal, outboundTotal, missingCount, d4Count |
| GET | `/outbound/stuck` | ADMIN, INBOUND_ADMIN | All non-OUTBOUND orders sorted by delayLevel DESC, slaStartedAt ASC |
| POST | `/outbound/dispatch` | ADMIN, INBOUND_ADMIN | Dispatch single order → OUTBOUND; sets `sla_completed_at` |
| POST | `/outbound/bulk-dispatch` | ADMIN, INBOUND_ADMIN | Dispatch up to 200 orders at once; returns `{ dispatched, skipped }` |
| GET | `/reports/dashboard` | ADMIN, INBOUND_ADMIN | Dashboard stats |
| GET | `/reports/picker` | ADMIN, PICKER_ADMIN | Picker reports |
| GET | `/reports/packer` | ADMIN, PACKER_ADMIN | Packer reports |
| GET | `/reports/sla` | ADMIN, INBOUND_ADMIN | SLA summary: count by D-level, D4 order list, avg time-to-OUTBOUND |
| GET | `/archive` | ADMIN | Paginated archived orders. Query: `page`, `pageSize`, `search`, `platform`, `dateFrom`, `dateTo`, `expiresWithin` |
| GET | `/archive/stats` | ADMIN | Archive summary: `{ total, expiring30, expiring7 }` |
| POST | `/archive/trigger` | ADMIN | Manually archive all OUTBOUND orders for the caller's tenant |
| POST | `/archive/bulk-delete` | ADMIN | Permanently delete archived orders. Body: `{ orderIds: string[] }`. Cascades child tables. |
| GET | `/users` | ADMIN | List users |
| POST | `/users` | ADMIN | Create user |
| PATCH | `/users/:id` | ADMIN | Update/deactivate user |

---

## 10. Multi-Tenant Architecture

Every database table includes `tenant_id`. PostgreSQL Row Level Security (RLS) enforces data isolation at the database level — even if application code has a bug, one tenant cannot see another tenant's data.

```sql
-- Example RLS policy
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON orders
  USING (tenant_id = current_setting('app.tenant_id')::uuid);
```

Future multi-tenant onboarding: Admin creates a new tenant record → system is ready for that company immediately.

---

## 11. Security

| Concern | Solution |
|---|---|
| Authentication | JWT tokens, short expiry (15min access + 7day refresh) |
| Session storage | Redis (not localStorage — prevents XSS token theft) |
| Password storage | bcrypt with salt rounds ≥ 12 |
| SQL injection | Prisma ORM — parameterized queries always |
| XSS | React escapes by default; no dangerouslySetInnerHTML |
| Rate limiting | Fastify rate-limit plugin (100 req/min per IP) |
| HTTPS | Enforced at reverse proxy (Nginx) level |
| Data isolation | PostgreSQL RLS per tenant |
| Input validation | Zod schemas on all API inputs |
| CORS | Whitelist-only origins |
| Security testing | Run OWASP checklist at every deployment |

---

## 12. Performance

| Concern | Solution |
|---|---|
| 50–100 concurrent users | Fastify handles 30K+ req/sec — no issue |
| 2,000 orders/day (initial) | ~0.023 req/sec — ~20-25% of Vultr 4GB capacity |
| 10,000 orders/day (target) | ~0.12 req/sec — same server sufficient |
| Database connections | Prisma connection pool sufficient; pgBouncer to be added at 10,000+ orders/day |
| Frequent order list reads | Redis cache with 30-second TTL, invalidated on write |
| Real-time dashboard | Socket.io — push only on state change, no polling |
| 6 months data (≈360K orders initial) | PostgreSQL with proper indexes — performant |

---

## 13. Reporting

### Automated
- **Nightly email at 23:40 PHT** (15:40 UTC) — 11:40 PM Manila time, to all Admin users
- Contains: Inbound count, Outbound count, Remaining count, Picker & Packer summaries, **SLA data: D4 orders reached today (resolved vs still open), avg time-to-OUTBOUND, D-level breakdown at 9pm snapshot**

### On-Demand (in-app)
| Report | Where | Period |
|---|---|---|
| Dashboard summary | Main Dashboard | Live (real-time) |
| SLA summary (D0–D4 counts, D4 list, avg completion time) | Main Dashboard | Live (real-time) |
| **Live Performance** (per-role KPI cards, grouped hourly bar chart, per-worker **stacked** hourly bar charts for pickers and packers, per-worker tables with hourly sparklines) | Warehouse Report → Live Performance tab | Today (live) or any historical date up to 90 days back, Manila TZ — live: socket-pushed (`order:stats_changed`) + 30s polling; historical: no refetch, 5-min stale window |
| Picker / Packer daily performance (7/14/30 days, sparkline + CSV/PDF export) | Warehouse Report → Performance tab | Daily / Weekly / Monthly |
| SLA analytics (D-level distribution donut, D4 unresolved list, PDF export) | Warehouse Report → SLA Analytics tab | Last 7/14/30 days |
| Order Timeline (full per-order lifecycle audit — all status changes, picker/packer assignments, inter-event durations) | Warehouse Report → Order Timeline tab | Per tracking number (on-demand) |
| Inbound vs Outbound | Outbound Panel | Live |
| Stuck orders (with D-level) | Outbound Panel | Live |
| SLA escalation history (per order) | Any panel with order detail | On-demand |

**Warehouse Report access:** `ADMIN`, `INBOUND_ADMIN`, `PICKER_ADMIN`, `PACKER_ADMIN` — all four admin roles see the same 4 tabs. Tab order: **Live Performance** (default) → Performance → SLA Analytics → Order Timeline.

#### Live Performance tab — data model
- Endpoint: `GET /reports/live-performance?date=YYYY-MM-DD` (same RBAC tuple as `/reports/performance`)
  - Without `date` → today (live mode, socket-driven + 30s refetch)
  - With `date` → historical day in Manila TZ; max 90 days back (`400` otherwise); future dates rejected (`400`)
- Aggregates `PickerAssignment.completedAt` / `PackerAssignment.completedAt` within the 24-hour Manila-local window (`[from, from + 24h)`) into 24 hourly buckets using the `getManilaStartOf(dateStr)` / `getManilaStartOfToday()` helpers
- **Active now** = assignments where `completedAt IS NULL AND order.archivedAt IS NULL` — computed only in live mode; zero in historical
- **Items / hour** — live: `completedToday / max(1, hoursSinceFirstCompletionToday)` (per-worker elapsed so late starters aren't penalized); historical: `completedOnDay / hoursWithWork` (closed-day rate across active work hours)
- Worker list — live: every `isActive` picker/packer (idle workers shown as zero rows); historical: all pickers/packers regardless of `isActive` flag, so users who worked that day but were later deactivated still appear
- Sort: active users first, then by `completedToday` desc, then username asc — applied in both backend and frontend; inactive users carry an `Inactive` badge in the table
- Charts: aggregate grouped `BarChart` (Pickers vs Packers) + two stacked `BarChart`s with per-worker segments (hue-varied palette generated from base accent via HSL around `PICKER_COLOR` / `PACKER_COLOR`)
- Historical mode: no `refetchInterval`, no socket subscription, `staleTime: 5min`; `LiveStatusPill` renders amber "Historical · YYYY-MM-DD"
- Shared `DateNavigator` component (`frontend/src/components/shared/DateNavigator.tsx`) — extracted from the Outbound page; supports `minDate` prop; prev/next arrows, clickable date label opening native `<input type="date">`, "Today" shortcut
- No new DB migrations, no Redis caching — existing `[pickerId, completedAt]` / `[packerId, completedAt]` indexes cover the queries
- Socket event reused: `order:stats_changed` (already emitted on every picker/packer state transition); frontend subscribes only when not historical
- Files: `backend/src/routes/reports.ts` (endpoint), `frontend/src/pages/reports/LivePerformanceTab.tsx` (tab body), `frontend/src/components/shared/DateNavigator.tsx` (shared nav)

---

## 14. Deployment Strategy

### Environment Plan

| Environment | Where | Cost | Purpose |
|---|---|---|---|
| **Development** | Localhost | Free | Local development |
| **Production** | Vultr Manila 🇵🇭 | $12/month | Live system |

> No staging environment — features are developed on localhost and deployed directly to production once approved.

### Why Vultr Manila
- Closest datacenter to the Philippines (~5–10ms latency)
- Instant response for barcode scanning is critical — high latency is unacceptable
- $12/month handles 2,000–10,000 orders/day comfortably

### Production Server Specification

**Vultr Cloud Compute — Regular Performance (Manila, PH)**
| Resource | Value |
|---|---|
| CPU | 2 vCPU |
| RAM | 4 GB |
| Disk | 80 GB SSD |
| Bandwidth | 3 TB/month |
| Cost | **$12/month** |

At 2,000 orders/day the server runs at **~20–25% capacity**.

### Production Infrastructure (Docker Compose — Single Server)

```
[Vultr Manila VPS]
│
├── Nginx (reverse proxy + SSL — Let's Encrypt)
│       ├── /          → React static build
│       └── /api       → Node.js Fastify (backend)
│               ├── PostgreSQL 16
│               ├── Redis
│               └── BullMQ workers
```

### Branching Model
```
feature/xxx  →  main branch
                     │
              git tag v1.x.x
                     │
              docker build + push
                     │
              Deploy to Vultr
```

### Versioning
- Semantic versioning: `v1.0.0`, `v1.1.0`, `v1.2.0`
- Every production deploy is tagged in git
- Rollback: re-deploy the previous Docker image

### CI/CD (GitHub Actions)
```
On push to main branch:
  1. npm run lint
  2. npm run test
  3. docker build (tag with git tag)
  4. docker push → registry
  5. SSH to Vultr → git pull + `docker compose up -d --build --remove-orphans` (rebuilds images from source)
```

### Scaling Roadmap

| Phase | Load | Action |
|---|---|---|
| Launch | 2,000 orders/day | Vultr 2 vCPU / 4 GB — current plan |
| Growth | ~5,000 orders/day | Upgrade to Vultr 4 vCPU / 8 GB (~$24/month) |
| Scale | 10,000+ orders/day | Add separate DB server + pgBouncer |

---

## 15. Development Phases

| Phase | What Gets Built | Status | Exit Criteria |
|---|---|---|---|
| **1** | Project scaffold, auth system, user management, Socket.io dual-room join | ✅ Done | All 6 roles can log in; access restricted correctly |
| **2** | Inbound Panel — scan, auto-detect, zero manual input, SLA D0, pagination (25/page), delay-priority sort | ✅ Done | Orders appear after scan (~2 sec); D4 at top |
| **3** | Picker Admin Panel — custom picker dropdown, order table (10/page, delay sort), bulk assign, workload cards | ✅ Done | Orders assigned; workload grid accurate |
| **4** | Picker Admin — order detail modal, Remove (styled confirm dialog), Complete, unassign endpoint | ✅ Done | Remove → INBOUND; Complete → PICKER_COMPLETE; stats refresh within 5s |
| **5** | Packer Admin Panel (same pattern as Phase 3+4): order table, custom packer dropdown, workload cards, order detail modal with Remove/Complete | ✅ Done | PICKER_COMPLETE orders appear; packer workload visible; remove auto-reassigns to original picker |
| **6** | Picker Device View (mobile-first) — PIN auth, order list, scan complete | ✅ Done | Picker sees orders on handheld; complete works; PIN-based session |
| **7** | Packer Device View (mobile-first) — same pattern as Picker Device (green theme) | ✅ Done | Packer confirms on handheld; shared queue; race condition protected |
| **8** | Outbound Panel; `sla_completed_at` set on OUTBOUND | ✅ Done | End-to-end lifecycle works; SLA timer stops at dispatch |
| **9** | SLA escalation job (15-min sweep, D0→D4, priority boosts, D4 alert); SlaAlertBanner UI | ✅ Done | D-level updates automatically; D4 triggers Socket.io alert + supervisor email; banner shows stage + assigned picker/packer; collapse/expand for multiple alerts |
| **10** | Bulk Inbound Scan — `carrierName` + `shopName` fields on orders; `BulkScanModal` (createPortal), staging list, carrier dropdown, shop combobox; `POST /orders/bulk-scan`, `GET /orders/shops`; `Carrier` enum + `detectPlatform` moved to shared package. Carrier + Shop Name both **mandatory** (frontend disabled + yellow warning + backend 400 validation). 18 preset shop names always in dropdown. | ✅ Done | Batch of TNs staged, carrier + shop assigned, all saved; duplicates reported; single scan unaffected; carrier/shop columns visible in Inbound table |
| **10b** | Handheld Admin Scan — concurrent session support (`session:{userId}:{deviceType}`); `/inbound-scan` + `/picker-admin-scan` pages; Single/Bulk camera scan modes; phone→desktop real-time relay via Socket.io (no direct DB write from phone); duplicate check on handheld-scan routes; socket routed via Vite HTTPS proxy; custom SSL cert with IP SAN for LAN phone access | ✅ Done | Phone scans → desktop QuickScanModal or BulkScanModal opens; concurrent desktop+phone sessions without conflict; duplicate barcode blocked on phone with warning |
| **DC** | **Daily Cycle Tracking + End-of-Day Archiving** — `work_date` and `archived_at` fields on orders; partial unique index (archived tracking numbers reusable); `archiveService.ts` + `archiveOutbound` BullMQ job (23:30 PHT daily — was 19:00 PHT in early DC drafts, moved to 23:30 in v2.13.x per SOLUTIONS.md [2026-04-18]); `hardDeleteExpiredOrders` in nightly report (23:40 PHT, 180-day retention); `archivedAt: null` filter on all active service queries; Carryover badge (amber CARRY) in Inbound/PickerAdmin/PackerAdmin; Carryover Active stat on Dashboard; Archive Panel (`/archive`) with stats, filters, expiry badges, bulk delete, manual trigger. **Timezone localization:** all start-of-day calculations and cron schedules use Asia/Manila (UTC+8); `manila.ts` utilities in both backend and frontend; all UI date/time displays use `timeZone: 'Asia/Manila'`. **Auth unification:** Picker and Packer now use standard username+password login via `/login` (same as all other roles); PIN auth system removed; `picker_pin`/`packer_pin` columns dropped from DB | ✅ Done | OUTBOUND orders hidden at 23:30 PHT (11:30 PM Manila time); CARRY badge on previous-day orders; Archive Panel works; all timestamps in Manila time; Picker/Packer log in via Chrome with username+password |
| **11** | Main Dashboard + SLA Summary Card + real-time + nightly email | ✅ Done | Live stats update via Socket.io (`sla:escalated`, `order:stats_changed`); nightly HTML email with SLA breakdown sent at 23:40 PHT (11:40 PM Manila time); Dashboard shows pipeline, picker/packer summary, outbound summary, SLA D0–D4 |
| **SALES** | **Sales Agent Module (v2.23.1)** — new `SALES_AGENT` role (`UserRole` enum); 6 new Prisma models (`SalesDailyActivity`, `SalesContentPost`, `SalesLiveSellingMetric`, `SalesMarketplaceReport`, `SalesDirectOrder`, `SalesDirectOrderItem`) + 3 enums (`SalesPlatform`, `ContentPostType`, `SaleChannel`); backend routes `/sales` + `/marketing`; services `salesActivityService`, `salesDirectOrderService`, `marketingReportService`; agent-facing UI: `/sales` month calendar dashboard, day-entry form (content posts + live selling + marketplace + direct orders), day-detail modal, own history; admin-facing UI: `/marketing-report` leaderboard + 4 comparison charts + `AgentDetailPanel` (per-agent calendar drill-down); admin-only `Settings → Sales Agents` creation; Vite proxy extended for `/sales` + `/marketing` | ✅ Done (v2.23.1) | Agent logs in → `/sales` opens, calendar renders, daily entry saves + persists across refresh; admin `/marketing-report` shows leaderboard + charts + per-agent drill-down; existing picker/packer/inbound/outbound flows unaffected; **deploy note:** requires manual `prisma db push` on Vultr after CD (workflow runs `migrate deploy || true` — no migrations in repo yet, see SOLUTIONS.md 2026-04-20) |
| **12** | Reporting & Analytics + CSV/PDF export | 🟡 Partial | CSV/PDF exports for Performance + SLA (done). **Live Performance tab added (v2.25.0 + v2.25.1)**: intraday per-role KPIs, grouped hourly bar chart (Recharts `BarChart`, Pickers/Packers side-by-side), per-worker live tables with hourly sparklines; socket-driven updates via `order:stats_changed` + 30s polling fallback; Live/Polling status pill. Order Timeline tab (per-order lifecycle audit) also shipped. **Historical mode (v2.27.0)**: `DateNavigator` on Live Performance tab, up to 90 days back, per-worker stacked hourly bar charts, inactive-user inclusion in historical view. **Remaining:** CSV/PDF export for Live Performance (deferred), additional cross-period comparative analytics |
| **13** | Security hardening + load testing | 🔜 | OWASP checklist passed; 100 users load test passed |
| **14** | Multi-tenant, Docker, CI/CD, versioned deploy | 🔜 | Full regression on test branch; clean deploy to main |

---

## 16. SLA System — Technical Detail

### Escalation Job (`slaEscalation.ts`)
- **Schedule:** Every 15 minutes (`*/15 * * * *`) via BullMQ repeatable job
- **Logic:** For each tenant, query orders where `sla_completed_at IS NULL` AND `delay_level < 4` AND `NOW() - sla_started_at > (delay_level + 1) * 4 hours`
- **Per qualifying order (in a single DB transaction):**
  1. Calculate new `delay_level = MIN(4, FLOOR(elapsed_hours / 4))`
  2. Calculate priority delta: `SLA_PRIORITY_BOOSTS[newLevel] - SLA_PRIORITY_BOOSTS[oldLevel]`
  3. Update `orders`: set `delay_level`, increment `priority` by delta
  4. Insert into `sla_escalations`
  5. If `to_level === 4` and `d4_notified_at IS NULL`: set `d4_notified_at = NOW()`
- **After transaction:** emit Socket.io `sla:escalated` event; enqueue `slaD4Email` job for D4 orders
- **Error handling:** Per-order try/catch — one order failure does not abort the sweep

### D4 Supervisor Alert Flow
```
Sweep detects order elapsed ≥ 16 hours
        │
        ▼
DB Transaction: delay_level=4, priority+=800, d4_notified_at=NOW()
Insert sla_escalations (from=3, to=4)
        │
        ├──▶ Socket.io emit → sla:d4_alert → SlaAlertBanner appears for all ADMIN/INBOUND_ADMIN sessions
        │
        └──▶ BullMQ enqueue slaD4Email → Nodemailer → supervisor email
```

### Priority Delta Table
| Escalation | Delta Applied | Resulting Boost (cumulative) |
|---|---|---|
| D0 → D1 | +200 | 200 |
| D1 → D2 | +200 | 400 |
| D2 → D3 | +400 | 800 |
| D3 → D4 | +800 | 1600 |

### Shared Constants (`shared/src/sla.ts`)
Both frontend and backend import from this file — no magic numbers anywhere else:
- `SLA_HOURS_PER_LEVEL = 4`
- `SLA_MAX_LEVEL = 4`
- `SLA_PRIORITY_BOOSTS = [0, 200, 400, 800, 1600]`
- `SLA_LEVEL_COLORS = { 0: 'gray', 1: 'yellow', 2: 'orange', 3: 'red', 4: 'crimson' }`

### Socket.io Rooms

| Room | Members | Purpose |
|---|---|---|
| `tenant:{tenantId}` | All users of that tenant | Broadcast: dashboard stats, SLA alerts, order list updates |
| `user:{userId}` | Single user (their session) | Targeted push: new order assigned to this picker/packer |

On login, the socket server joins the user to both their `tenant:` room and their `user:` room automatically.

### Socket.io Events

| Event | Direction | Room | Payload | Consumer |
|---|---|---|---|---|
| `order:created` | Server → Client | `tenant:{id}` | `{ order }` | Invalidate order list cache |
| `order:updated` | Server → Client | `tenant:{id}` | `{ orderId, status }` | Invalidate order list cache |
| `order:deleted` | Server → Client | `tenant:{id}` | `{ orderId }` | Invalidate order list cache |
| `order:assigned` | Server → Client | `user:{pickerId/packerId}` | `{ order }` | Push new order to handheld device |
| `stats:updated` | Server → Client | `tenant:{id}` | `{ stats }` | Update dashboard stats |
| `sla:escalated` | Server → Client | `tenant:{id}` | `{ orderId, fromLevel, toLevel, tenantId }` | Invalidate order list cache |
| `sla:d4_alert` | Server → Client | `tenant:{id}` | `{ orderId, trackingNumber, tenantId, status, assignedPicker, assignedPacker }` | Show SlaAlertBanner |

> **Key design:** `order:assigned` goes to `user:{id}` room — only the assigned picker/packer receives it. All other events broadcast to the full tenant room.

### SlaAlertBanner (`frontend/src/components/SlaAlertBanner.tsx`)

Visible only to `ADMIN` and `INBOUND_ADMIN` roles. Rendered at the top of `AppLayout` (above page content).

| Alert count | Behaviour |
|---|---|
| 0 | Hidden |
| 1 | Full-width crimson bar: tracking number, stage (`OrderStatus`), assigned picker/packer (if any), `[Dismiss]` |
| 2+ | Summary bar: order count, `[Show ▼]` to expand individual rows, `[Dismiss All]` |

**Expanded rows** (2+ alerts): each row shows tracking number, stage, assigned picker/packer, individual `[Dismiss]`.

**Socket lifecycle fix:** `SlaAlertBanner` calls `connectSocket()` (not `getSocket()`) in its `useEffect`. React fires child effects before parent effects — at mount time `getSocket()` would return `null` because `AppLayout`'s `connectSocket()` call hasn't run yet. `connectSocket()` is idempotent and safe to call from either component.

**State:** `notificationStore` (Zustand, non-persisted) — `d4Alerts[]`, `addD4Alert()`, `dismissD4Alert(id)`, `dismissAllD4Alerts()`.

### RLS on `sla_escalations`
```sql
ALTER TABLE sla_escalations ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON sla_escalations
  USING (tenant_id = current_setting('app.tenant_id')::uuid);
```
The escalation job uses a privileged service-role connection (same as nightly report) — it is not tenant-scoped.

---

## 17. MCP Servers (Development Tooling)

| MCP | Purpose |
|---|---|
| **Figma MCP** | Design-to-code workflow, component inspection |
| **GitHub MCP** | PR management, branch operations |
| **PostgreSQL MCP** (DBHub) | Database query context in AI sessions |
| **Docker MCP** | Container management (Phase 10) |

---

*This document should be reviewed and approved before Phase 1 development begins. Any changes to the architecture after this point should be reflected in an updated version of this document.*
