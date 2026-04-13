# System Workflow — Dynamic Order Management (DOM)

## Overview

DOM, bir deponun günlük sipariş akışını yönetir. Siparişler sabah barkod okuma ile sisteme girer, picker ve packer süreçlerinden geçer, akşam outbound ile kapanır ve gece archive'e taşınır.

---

## Daily Lifecycle (Günlük Döngü)

```
07:00 PHT  Inbound Admin barkod okur → Siparişler sisteme girer (INBOUND)
           SLA 4 saatlik geri sayım başlar (D0)
               │
               ▼
           Picker Admin siparişleri picker'lara atar (PICKER_ASSIGNED)
               │
               ▼
           Picker handheld'den siparişi teslim alır (PICKING)
               │
               ▼
           Picker tamamlar (PICKER_COMPLETE)
               │
               ▼
           Packer Admin otomatik kuyruğa alır (PACKER_ASSIGNED)
               │
               ▼
           Packer handheld'den paketler (PACKING → PACKER_COMPLETE)
               │
               ▼
           Outbound panelinden gönderilir (OUTBOUND)
           sla_completed_at set edilir — SLA tamamlandı

19:00 PHT  Archive job çalışır:
           Tüm OUTBOUND siparişlere archived_at = NOW() yazılır
           Aktif panellerden kaybolur, Archive sayfasına taşınır

21:00 PHT  Nightly job çalışır:
           Nightly email raporu gönderilir
           180 günden eski archived siparişler kalıcı silinir
```

---

## Order Status Flow

```
[INBOUND]
    │  Picker Admin atar
    ▼
[PICKER_ASSIGNED]
    │  Picker handheld'den başlar
    ▼
[PICKING]
    │  Picker tamamlar
    ▼
[PICKER_COMPLETE]
    │  Packer Admin kuyruğa alır
    ▼
[PACKER_ASSIGNED]
    │  Packer handheld'den başlar
    ▼
[PACKING]
    │  Packer tamamlar
    ▼
[PACKER_COMPLETE]
    │  Outbound panelinden dispatch
    ▼
[OUTBOUND]  ← Sipariş tamamlandı
    │
    │  19:00 Archive Job
    ▼
archived_at = NOW()  → Archive sayfasında görünür
```

### Remove (Geri Al) Akışı

Packer Admin bir siparişi kaldırırsa:

```
[PACKER_ASSIGNED / PACKING]
    │  Remove tıklanır
    ▼
[INBOUND]  ← Orijinal picker'a otomatik yeniden atanır
```

---

## SLA Escalation (D0 → D4)

Her sipariş tarandığında 4 saatlik SLA saymaya başlar. 15 dakikada bir çalışan job delay level'ı günceller:

| Level | Geçen Süre | Priority Artışı | Aksiyon |
|-------|-----------|----------------|---------|
| D0    | 0–4 saat  | +0             | Normal işlem |
| D1    | 4–8 saat  | +200           | Yeni siparişlere göre öncelikli |
| D2    | 8–12 saat | +400           | Acil — takım liderinin dikkati |
| D3    | 12–16 saat| +800           | Kritik — hemen müdahale |
| D4    | 16+ saat  | +1600          | Supervisor'a email + live banner |

- D-level, sipariş statüsünden **bağımsız** çalışır (PICKING'deyken de D3 olabilir)
- D-level sadece sipariş **OUTBOUND** olduğunda sıfırlanır
- D4 alert: Socket.io üzerinden canlı kırmızı banner (ADMIN + INBOUND_ADMIN görür)

---

## Outbound — Archive İlişkisi

```
Outbound Paneli
    │  "Dispatch" tıklanır
    │  status → OUTBOUND
    │  sla_completed_at set edilir
    ▼
Saat 19:00 — Archive Job (BullMQ, Asia/Manila timezone)
    │  SELECT * FROM orders WHERE status = 'OUTBOUND' AND archived_at IS NULL
    │  UPDATE orders SET archived_at = NOW()
    ▼
Aktif Paneller (Inbound / Picker / Packer / Outbound)
    │  Tüm sorgularda WHERE archived_at IS NULL filtresi var
    │  → Archived siparişler aktif panellerde görünmez
    ▼
Archive Sayfası (/archive)
    │  WHERE archived_at IS NOT NULL
    │  Filtreler: tarih, shop, carrier, delay level
    │  Expiry rozeti: archivedAt + 180 gün
    │  Bulk delete, manuel archive trigger
    ▼
Saat 21:00 — Nightly Job
    │  Nightly email raporu gönderilir
    │  DELETE FROM orders WHERE archived_at < NOW() - 180 days
```

---

## Carryover (CARRY) — Tamamlanmayan Siparişler

Saat 19:00'da `OUTBOUND` olmayan siparişler **silinmez**, ertesi güne taşınır:

```
[INBOUND / PICKING / PACKER_ASSIGNED / ...]  ← 19:00'da hâlâ aktif
    │  archived_at set edilmez
    │  work_date = dünkü tarih
    ▼
Ertesi gün tüm panellerde görünür
    + Amber "CARRY" rozeti
    + SLA saymaya devam eder (D-level artmış olabilir)
    + Dashboard'da "Carryover Active" sayacı
```

---

## Kullanıcı Rolleri ve Erişim

| Rol | Panel | Yapabildiği |
|-----|-------|-------------|
| ADMIN | Tümü | Her şey |
| INBOUND_ADMIN | Inbound, Archive | Barkod okuma, bulk scan, archive görüntüleme |
| PICKER_ADMIN | Picker Admin | Picker atama, order detay, remove |
| PACKER_ADMIN | Packer Admin | Packer atama, order detay, remove |
| PICKER | Picker Device (handheld) | Kendi siparişlerini görme, tamamlama |
| PACKER | Packer Device (handheld) | Kendi siparişlerini görme, tamamlama |

---

## Scan Yöntemleri

| Yöntem | Nasıl | Kim |
|--------|-------|-----|
| Masaüstü HID scanner | Barkod okuyucu USB, QuickScanModal açılır | ADMIN, INBOUND_ADMIN |
| Masaüstü Bulk Scan | BulkScanModal — birden fazla TN, carrier + shop zorunlu | ADMIN, INBOUND_ADMIN |
| Handheld Single Scan | Telefon kamera → Socket.io → masaüstüne iletilir | ADMIN, INBOUND_ADMIN |
| Handheld Bulk Scan | Telefon kamera + staging listesi → masaüstüne iletilir | ADMIN, INBOUND_ADMIN |

---

## Background Jobs Özeti

| Job | Zaman | Ne Yapar |
|-----|-------|----------|
| SLA Sweep | Her 15 dakika | D-level günceller, D4 alert gönderir |
| Archive | 19:00 PHT (11:00 UTC) | OUTBOUND siparişlere archived_at yazar |
| Nightly | 21:00 PHT (13:00 UTC) | Email raporu + 180 gün üzeri sil |
