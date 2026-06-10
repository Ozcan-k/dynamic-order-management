# Employee Schedule Module — Implementation Plan

> **Status:** ✅ BUILT (v2.66.0) — shared+backend `tsc`, frontend `tsc -b && vite build` green. Lokal `db push` PENDING (dev pg kapalı → CD deploy'da uygulanır). `test`'e push + main merge bekliyor.
> **Hedef versiyon:** `v2.66.0`
> **Konum:** Sidebar'da **Incident Report** girişinin **altında**, tek giriş "Employee Schedule".
> **Erişim:** **ADMIN + WAREHOUSE_ADMIN** (görür + edit yapar). Başka hiçbir rol göremez.
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
  empNo      Int           @map("emp_no")          // screenshot'taki #101, #102...
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
  value Int    @default(100)    // ilk employee #101 olur (screenshot ile uyumlu)
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
- Sol sabit kolon: avatar baş harfleri + `#101` + `Ad Soyad` + klok ikonu `45:00` (haftalık toplam).
- Departman bölüm başlık bantları (ADMINISTRATIVE STAFF, PICKER STAFF, PACKER STAFF, LOGISTIC STAFF) — renk kodlu.
- 7 gün sütunu (Sun→Sat, tarih etiketli). Her hücre:
  - Status `<select>` (renk-kodlu, 6 seçenek + "—").
  - Present seçiliyse yanında `OT 0 ▼` (0–5) dropdown'u + hücrede `8h` rozeti; Half Day'de `4h`.
  - Değişiklik **anında autosave** (`PUT /schedule`, optimistic update + React Query invalidate). Boş ("—") seçilirse satır silinir.
- Sticky ilk kolon + yatay scroll (data-table deseni).

### Sekme 2 — Employees
- Üstte ekleme formu (tek satır kart): **Department `<select>`** → **First Name** → **Last Name** → **Start Date** (date input) → **[+ Add Employee]**.
- Altta departmana göre gruplu liste (her departman bir kart/section):
  - Kolonlar: **Employee ID** (`#101`) · **Department** (Role) · **Name** · **Start Date** · **Actions [Edit] [Delete]**.
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
