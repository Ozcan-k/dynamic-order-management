# Employee Schedule Module — Implementation Plan

> **Status:** ✅ BUILT (v2.66.0) — shared+backend `tsc`, frontend `tsc -b && vite build` green. Lokal `db push` PENDING (dev pg kapalı → CD deploy'da uygulanır). `test`'e push + main merge bekliyor.
> **Hedef versiyon:** `v2.66.0`
> **Konum:** Sidebar'da **Incident Report** girişinin **altında**, tek giriş "Employee Schedule".
> **Erişim:** **ADMIN + WAREHOUSE_ADMIN** (görür + edit yapar). Başka hiçbir rol göremez.
> **Sonraki değişiklikler:**
> - **v2.84.0** — çalışan ↔ sistem login bağlantısı (Warehouse Report → Performance attendance'ı okur).
> - **v2.86.0** — Employee ID'ler **4 haneli, `#`'sız** (#101 → 1001; açılışta idempotent `migrateEmpNosToFourDigit`), Settings → Edit'e **Employee ID** alanı.
> - **v2.87.0** — Employee ID bağlantısı **tüm rollere** açık (Admin, Accountant vb.).
> - **v2.88.0** — **Bir çalışan birden fazla login'e** bağlanabilir (örn. picker + packer hesabı): bağlantı `User.employeeId`'de; eski `EmpEmployee.userId` deprecated. Edit modal'da *Linked system logins* (çoklu).
> - **v2.93.0 (main'de LIVE — 2026-09-24; deploy öncesi/sonrası prod snapshot'ı 0 fark)** — **Partial Day** (saatlik giriş) + Schedule / Employees / Report yenileme + Warehouse Report link fix. Plan: §11.
>
> **Bağımsızlık:** Order pipeline'a / mevcut tablolara / mevcut raporlara **HİÇ dokunmaz**. Kendi `emp_*` tabloları, tenant-scoped, mevcut modellere FK yok. Accounting/Incident/Dispatch modüllerindeki bağımsız-modül deseninin aynısı.

Görsel referans: `Downloads/employee.jpeg` (Everhour "Restaurant Schedule Template"). Haftalık grid + departman bölümleri + sol tarafta `#ID + isim + haftalık toplam saat klok` + 7 gün sütunu + her hücrede renk-kodlu dropdown. Bizim modül bu **layout'u** taklit eder, ama hücre dropdown'u **rol/saat aralığı yerine attendance status** olur ve present'te OT çıkar.

---

## 1. Genel Yapı — Tek sayfa, 3 sekme (Warehouse Report deseni)

Kullanıcı isteği: "iç içe geçmiş üç sayfa, alt alta (sidebar submenu) **değil**, Warehouse Report'taki gibi **yan yana sekme**."

Tek route `/employee-schedule` → `PageShell` + üstte yatay **tab bar** (Reports.tsx'teki birebir desen). 3 sekme:

| Sekme | İçerik |
|---|---|
| **Schedule** | Haftalık takvim grid'i (screenshot'taki sayfa). Departmanlara ayrılmış employee'ler; her gün için attendance dropdown + present'te OT. |
| **Employees** | Employee ekleme formu + departmanlara göre gruplu liste (Edit / Delete). Employee ID burada otomatik atanır. |
| **Report** | Haftalık + Aylık çalışma günü / saat / OT raporu, employee bazında, departman alt-toplamı + genel toplam. |

Sekme state'i URL query ile tutulur (`?tab=schedule|employees|report`) ki refresh'te sekme korunsun.

---

## 2. Departmanlar (sabit enum)

Kullanıcının verdiği 4 departman:

1. **Administrative Staff** (`ADMINISTRATIVE`)
2. **Picker Staff** (`PICKER`)
3. **Packer Staff** (`PACKER`)
4. **Logistic Staff** (`LOGISTIC`)

Renk kodu (grid + liste başlıkları için):
- Administrative → mor/indigo
- Picker → mavi
- Packer → amber
- Logistic → yeşil

---

## 3. Attendance Status (sabit enum) ve saat kuralı

Her gün hücresindeki dropdown 6 seçenek (+ default "—"):

| Status | Enum | Çalışma saati | Renk |
|---|---|---|---|
| (boş / atanmamış) | — | 0 (sayılmaz) | gri açık |
| Present | `PRESENT` | **8 saat** | yeşil |
| Half Day | `HALF_DAY` | **4 saat** | teal |
| Absent | `ABSENT` | 0 | kırmızı |
| Vacation Leave | `VACATION_LEAVE` | 0 | mavi |
| Sick Leave | `SICK_LEAVE` | 0 | amber |
| Maternity Leave | `MATERNITY_LEAVE` | 0 | pembe/mor |

**OT (Overtime):** yalnız **Present** seçilince hücrenin yanında ikinci bir dropdown çıkar. Default **0**, seçenekler **0–5 saat**. Present değilse OT alanı görünmez ve 0'a sıfırlanır.

**Gün toplam saati** = baseHours(status) + otHours. Present=8(+OT), Half Day=4, diğerleri 0.
**Haftalık toplam** (sol klok, screenshot'taki `45:00`) = o employee'nin 7 günlük gün-saatlerinin toplamı (OT dahil), `HH:MM` formatında.

> **Karar (onayına sunulur):** "—" (atanmamış) default'u ekliyorum çünkü yeni hafta açıldığında her hücre boş başlamalı; boş gün rapora "çalışma günü" olarak girmez. İstersen default'u "Absent" yapabiliriz — ama o zaman dokunulmayan günler "devamsız" sayılır. Önerim: boş default.

---

## 4. Veri Modeli (Prisma — `emp_*` tabloları, additive `db push`)

`backend/prisma/schema.prisma`'ya eklenecek (mevcut hiçbir tabloya dokunulmaz):

```prisma
enum EmpDepartment {
  ADMINISTRATIVE
  PICKER
  PACKER
  LOGISTIC
}

enum AttendanceStatus {
  PRESENT
  ABSENT
  VACATION_LEAVE
  SICK_LEAVE
  HALF_DAY
  MATERNITY_LEAVE
}

model EmpEmployee {
  id         String        @id @default(uuid())
  tenantId   String        @map("tenant_id")
  empNo      Int           @map("emp_no")          // v2.86.0: 4 haneli ID 1001, 1002... (# yok)
  department EmpDepartment
  firstName  String        @map("first_name")
  lastName   String        @map("last_name")
  startDate  DateTime      @map("start_date") @db.Date   // işe başlama tarihi
  createdAt  DateTime      @default(now()) @map("created_at")

  tenant   Tenant        @relation(fields: [tenantId], references: [id])
  schedule EmpSchedule[]

  @@unique([tenantId, empNo])
  @@index([tenantId, department])
  @@map("emp_employees")
}

model EmpSchedule {
  id         String           @id @default(uuid())
  tenantId   String           @map("tenant_id")
  employeeId String           @map("employee_id")
  date       DateTime         @db.Date              // Manila günü (00:00)
  status     AttendanceStatus
  otHours    Int              @default(0) @map("ot_hours")  // 0–5, sadece PRESENT'te anlamlı
  createdAt  DateTime         @default(now()) @map("created_at")
  updatedAt  DateTime         @updatedAt @map("updated_at")

  tenant   Tenant      @relation(fields: [tenantId], references: [id])
  employee EmpEmployee @relation(fields: [employeeId], references: [id], onDelete: Cascade)

  @@unique([tenantId, employeeId, date])
  @@index([tenantId, date])
  @@map("emp_schedules")
}

model EmpCounter {
  id    String @id              // "{tenantId}:employee"
  value Int    @default(1000)   // v2.86.0: ilk employee 1001
  @@map("emp_counters")
}
```

`Tenant` modeline back-relation eklenir: `empEmployees EmpEmployee[]` + `empSchedules EmpSchedule[]` (Prisma zorunluluğu; mevcut Tenant alanlarına dokunmaz).

**Delete davranışı:** Employee silinince `EmpSchedule` satırları **cascade** silinir (o kişinin geçmiş raporu da gider). Kullanıcı net "silme butonu" istedi → hard delete. (Alternatif: soft-delete `isActive` ile geçmişi korumak — istersen ekleriz; default planım hard delete.)

`empNo` atomik `EmpCounter` upsert ile üretilir (Accounting `AccCounter` deseni); silinen numara geri kullanılmaz.

---

## 5. Backend (`/employee-schedule` prefix)

Yeni dosyalar:
- `backend/src/routes/employeeSchedule.ts`
- `backend/src/services/employeeScheduleService.ts`

Her route `requireRole(ADMIN, WAREHOUSE_ADMIN)`, tüm sorgular JWT'deki `tenantId` ile scoped. `index.ts`'e `register(employeeScheduleRoutes, { prefix: '/employee-schedule' })`.

### Endpoints

**Employees (Sekme 2)**
| Method | Path | Açıklama |
|---|---|---|
| GET | `/employees` | Tüm employee'ler, departmana göre gruplu + `empNo` sıralı. |
| POST | `/employees` | `{ department, firstName, lastName, startDate }` → `empNo` otomatik atanır, 201. |
| PUT | `/employees/:id` | Düzenle (department/ad/soyad/startDate). |
| DELETE | `/employees/:id` | Hard delete (schedule cascade). |

**Schedule (Sekme 1)**
| Method | Path | Açıklama |
|---|---|---|
| GET | `/schedule?weekStart=YYYY-MM-DD` | Hafta grid'i: tüm employee'ler + o haftanın 7 günü için status/otHours. Atanmamış gün = entry yok. |
| PUT | `/schedule` | Tek hücre upsert: `{ employeeId, date, status, otHours }`. status "—" (clear) ise o satırı sil. |

**Report (Sekme 3)**
| Method | Path | Açıklama |
|---|---|---|
| GET | `/report?period=week\|month&date=YYYY-MM-DD` | Seçili dönem için employee bazında agregasyon (aşağıda). |

### Manila tarih sınırları
`lib/manila.ts` helper'ları kullanılır (dispatch/outbound deseni). Hafta başlangıcı = Pazar (screenshot Sunday→Saturday). Aylık = seçili ayın 1'i → son günü, Manila UTC+8.

### Report agregasyonu (employee başına)
- `present` (gün sayısı), `halfDay`, `absent`, `vacation`, `sick`, `maternity`
- `otHours` (toplam)
- `workedDays` = `present + 0.5 * halfDay`
- `totalHours` = `8*present + 4*halfDay + otHours`
- Departman alt-toplamı + genel toplam (workedDays, totalHours, otHours).

---

## 6. Shared tipler (`shared/src/index.ts`)

```ts
export enum EmpDepartment { ADMINISTRATIVE='ADMINISTRATIVE', PICKER='PICKER', PACKER='PACKER', LOGISTIC='LOGISTIC' }
export enum AttendanceStatus { PRESENT='PRESENT', ABSENT='ABSENT', VACATION_LEAVE='VACATION_LEAVE', SICK_LEAVE='SICK_LEAVE', HALF_DAY='HALF_DAY', MATERNITY_LEAVE='MATERNITY_LEAVE' }

export interface EmpEmployeeDTO { id, empNo, department, firstName, lastName, startDate }
export interface EmpScheduleCell { employeeId, date, status, otHours }
export interface EmpWeekRow { employee: EmpEmployeeDTO; cells: Record<string, EmpScheduleCell>; weekHours: number }
export interface EmpReportRow { employee, present, halfDay, absent, vacation, sick, maternity, otHours, workedDays, totalHours }
```

---

## 7. Frontend

Yeni dosyalar:
- `frontend/src/pages/employeeSchedule/EmployeeSchedule.tsx` — PageShell + tab bar + 3 sekme switch
- `frontend/src/pages/employeeSchedule/ScheduleTab.tsx`
- `frontend/src/pages/employeeSchedule/EmployeesTab.tsx`
- `frontend/src/pages/employeeSchedule/ReportTab.tsx`
- `frontend/src/api/employeeSchedule.ts` — TanStack Query hook'ları

### Sekme 1 — Schedule (grid, screenshot layout)
- Üstte: **Week navigation** (← prev / "Week # NN · 21 May – 27 May" / next →) + "This Week" butonu.
- Sol sabit kolon: avatar baş harfleri + `1001` + `Ad Soyad` + klok ikonu `45:00` (haftalık toplam).
- Departman bölüm başlık bantları (ADMINISTRATIVE STAFF, PICKER STAFF, PACKER STAFF, LOGISTIC STAFF) — renk kodlu.
- 7 gün sütunu (Sun→Sat, tarih etiketli). Her hücre:
  - Status `<select>` (renk-kodlu, 6 seçenek + "—").
  - Present seçiliyse yanında `OT 0 ▼` (0–5) dropdown'u + hücrede `8h` rozeti; Half Day'de `4h`.
  - Değişiklik **anında autosave** (`PUT /schedule`, optimistic update + React Query invalidate). Boş ("—") seçilirse satır silinir.
- Sticky ilk kolon + yatay scroll (data-table deseni).

### Sekme 2 — Employees
- Üstte ekleme formu (tek satır kart): **Department `<select>`** → **First Name** → **Last Name** → **Start Date** (date input) → **[+ Add Employee]**.
- Altta departmana göre gruplu liste (her departman bir kart/section):
  - Kolonlar: **Employee ID** (`1001`) · **Department** (Role) · **Name** · **Start Date** · **Actions [Edit] [Delete]**.
  - Edit → satır-içi veya modal düzenleme (`PUT`). Delete → `ConfirmModal` → `DELETE`.
- Boş durum: "No employees yet. Add your first employee above."

### Sekme 3 — Report (güzel tablo)
- Üstte mode toggle **Weekly | Monthly** + dönem navigatörü (hafta/ay seçici).
- 4 özet stat kartı: **Total Employees · Total Worked Days · Total Hours · Total OT Hours**.
- Departmana göre gruplu rapor tablosu, employee başına satır:
  | Emp ID | Name | Present | Half Day | Absent | Vacation | Sick | Maternity | OT (h) | Worked Days | Total Hours |
  - Departman alt-toplam satırı (vurgulu) + en altta **Grand Total** satırı.
  - "Total Hours" hücresinde küçük yatay bar (employee'ler arası görsel kıyas) — temiz, abartısız.
- **CSV + PDF export** (ilk sürümde dahil). CSV = sunucu stream (`reports.ts` export deseni); PDF = PDFKit (Accounting/Incident PDF servis deseni) başlıklı tablo, dönem etiketli.

Tüm UI metinleri **İngilizce** (proje kuralı).

---

## 8. Wiring (mevcut modül deseninin birebir aynısı)

1. **schema.prisma** — 2 enum + 3 model + Tenant back-relation; `prisma db push` (additive, data loss yok) + `prisma generate`.
2. **shared/src/index.ts** — enum + interface export.
3. **backend/src/routes/employeeSchedule.ts** + **services/employeeScheduleService.ts**.
4. **backend/src/index.ts** — `register(..., { prefix: '/employee-schedule' })`.
5. **frontend/src/App.tsx** — `import EmployeeSchedule` + `<Route path="/employee-schedule" ... allowedRoles={[ADMIN, WAREHOUSE_ADMIN]}>`.
6. **frontend/src/components/shared/Sidebar.tsx** — Incident Report'un **hemen altına** NAV_ITEMS girişi (`roles: [ADMIN, WAREHOUSE_ADMIN]`, yeni takvim ikonu).
7. **frontend/vite.config.ts** `proxyRoutes` — `'/employee-schedule'` eklenir.
8. **frontend/nginx.conf** `location ~ ^/(...)` regex — `employee-schedule` eklenir. *(SPA fallback'in backend'e HTML servis etmesini önler — SOLUTIONS [2026-05-02] tuzağı.)*
9. Login `getDefaultRoute`/`ROUTE_ROLES` — ADMIN/WAREHOUSE_ADMIN zaten warehouse landing'e gidiyor; yeni rol yok, ek değişiklik gerekmez (sadece sidebar + route guard yeterli).

---

## 9. Doğrulama
- `shared` + `backend` `tsc --noEmit` green.
- `frontend` `tsc -b && vite build` green.
- Lokal `db push` + E2E: employee ekle (empNo auto), grid'de status/OT autosave round-trip, hafta navigasyonu, rapor haftalık+aylık matematik (workedDays/totalHours), edit + delete (cascade).
- Tarayıcı smoke: 3 sekme render, console temiz.

## 10. Docs sync (proje kuralı)
- `CLAUDE.md` "Mevcut versiyon" → `v2.66.0` + özet.
- `ARCHITECTURE.md` Section **7.14** (bu plandan) + version header güncellenir (kod yazılınca "Built" işaretlenir).

---

### Kararlar (✅ kullanıcı onayladı — 2026-06-09)
1. ✅ Grid default'u **boş ("—")** — atanmamış gün rapora girmez.
2. ✅ Employee delete = **hard delete (cascade)**.
3. ✅ Hafta başlangıcı **Pazar** (Sunday→Saturday).
4. ✅ Report **CSV + PDF export ilk sürümde** dahil.

---

## 11. v2.93.0 planı — Partial Day + 3 sekme yenileme (2026-09-24)

> **Durum:** 🚧 DEVAM EDİYOR — **E1–E4 ✅** (2026-09-24) — hepsi lokal test edildi (servis + Playwright desktop/mobil), `v2.93.0-test` olarak test'e push; main kullanıcı onayı bekliyor. Kullanıcı önerilen tüm kararları onayladı (2026-09-24).
> **Kesin kural (kullanıcı):** geçmiş veri **kesinlikle** kaybolmayacak — yalnız additive şema, mevcut satırlara backfill / yeniden hesap / üzerine yazma YOK.

### 11.1 Bulgular (prod, salt-okunur sorgu, 2026-09-24)
- `emp_schedules`: **3 299** satır (2026-06-01 → 2026-09-25, 57 çalışan) — PRESENT 2 171 · DAY_OFF 784 · **HALF_DAY 205** · ABSENT 92 · VACATION 22 · SICK 16 · MATERNITY 9. OT girilen 81 gün (0.5–4 h).
- `emp_employees`: 40 aktif (Admin 10, Picker 12, Packer 12, Logistic 6) + 17 pasif; 45 login bağlı (`User.employeeId`).
- **Sorun:** saat sabit — Present 8 h, Half Day 4 h. 3 saat çalışan Half Day girildiğinden rapora 4 h yazılıyor; Warehouse Report'ta hedef yarıya iniyor (210 → 105) → olması gerekenden yüksek.
- Schedule: hücre başına 7 seçenekli `<select>` (40 × 7 = 280 dropdown), toplu işlem yok, kayıt hatası sessizce geri alınıyor. Employees: arama/filtre yok, çalışan geçmişi tek yerde yok. Report: yalnız tablo + 4 sayı; grafik, önceki dönem kıyası, çalışan detayı yok.

### 11.2 Kararlar (kullanıcı onayı)
1. **Yeni durum `PARTIAL_DAY` + saat kutusu** (0.5–7.5 h, 0.5 adım). Half Day 4 h, Present 8 h + OT **aynen** kalır.
2. **Warehouse Report hedefi saatle orantılı:** Partial Day faktörü = saat / 8 (3 h → 210 × 3/8 ≈ 79); canlı panoda vardiya = girilen saat.
3. **Eski 205 Half Day kaydına dokunulmaz** (4 h kalır); bilen kullanıcı tek tek düzenler.

### 11.3 Aşamalar
| # | İçerik |
|---|---|
| E1 ✅ | Şema: enum `AttendanceStatus` + `PARTIAL_DAY`, `emp_schedules.worked_hours Float?` (nullable, yalnız PARTIAL_DAY'de dolu). Backend doğrulama (PARTIAL_DAY → saat zorunlu 0.5–7.5), hafta / rapor / CSV / PDF hesapları, Warehouse Report faktörü + canlı vardiya. Schedule hücresine Partial seçeneği + saat kutusu. Eski dönem rapor toplamları eski/yeni motorla birebir karşılaştırılır. |
| E2 ✅ | Schedule: hücreye tıkla → renkli seçim paneli (kısayol P/H/R/A/O…, Partial + OT saat kutusu aynı panelde); toplu: gün sütununu Present yap, geçen haftayı kopyala, satırı doldur — **yalnız boş hücreler**; gün altı sayaçlar + "X kişinin girişi yok"; arama + departman filtresi; kayıt durumu (Saving / Saved / hata). |
| E3 ✅ | Employees: arama, departman + aktif/pasif filtresi, yenilenmiş liste (kıdem, bağlı login, iletişim); çalışan profili (sağ panel): son 30/90 gün devam, saat, OT, devamsızlık/izin, mini takvim. |
| E4 ✅ | Report: Hafta / Ay / Özel aralık; Δ'lı KPI'lar (devam oranı, toplam saat, OT, devamsızlık, izin); günlük devam yığılmış grafiği, departman saat/OT, en çok devamsızlık / OT, çalışan × gün devam haritası; sıralanabilir tablo + devam % + satır → profil; CSV/PDF'e Partial sütunu (mevcut sütunlar korunur). dataviz + vivid-charts. |
| + | **Ek fix (kullanıcı isteği):** Picker / Packer Admin → karşılaştırmalı performans → 'Open in Warehouse Report' Today'de Performance sekmesine gidiyordu → artık **Live Performance** (doğru rol seçili; Yesterday = o günün replay'i; 7 gün / ay = Performance). Uygulama geneli: sayfa değişince en üstten açılır (önceden eski scroll pozisyonu kalıyordu). |

Hepsi bitince `v2.93.0-test`; main yalnız kullanıcı onayıyla.

### 11.4 Veri güvenliği kontrol listesi
- [x] Şema diff SQL'i yalnız `ALTER TYPE "AttendanceStatus" ADD VALUE 'PARTIAL_DAY'` + `ALTER TABLE "emp_schedules" ADD COLUMN "worked_hours" DOUBLE PRECISION` (nullable) — doğrulandı.
- [x] Mevcut satırlar değişmiyor: prod'un 3 299 satırı (yalnız id/tarih/durum/OT, isim yok) izole lokal tenant'a yüklendi → yeni kod Haziran–Eylül 4 ay (190 çalışan satırı, tüm alanlar + toplamlar) ve 17 hafta (hücreler + haftalık saat) için prod'da deploy'dan önce alınan snapshot ile **birebir aynı**.
- [x] Toplu işlemler dolu hücrenin üzerine asla yazmıyor: backend `fillEmptyCells` yalnız boş hücreleri yazar (`createMany skipDuplicates` + önceden boş kontrolü), Undo yalnız o işlemin yarattığı ve o zamandan beri değişmemiş hücreleri siler — servis testi + UI testi geçti.
- [ ] Warehouse Report: Partial Day dışındaki günlerin hedefleri değişmiyor — kod yolu aynı; deploy sonrası prod snapshot'ı (3 306 gün-hedef kaydı, `es_before.json`) ile karşılaştırılacak. Partial 3 h → faktör 0.375, hedef 78.75 lokal doğrulandı.
- [ ] Main merge öncesi manuel prod yedeği; deploy sonrası `emp_schedules` ≥ 3 299 ve eski ay toplamları aynı.
