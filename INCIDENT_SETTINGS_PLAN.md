# Incident Report yenileme + Settings (Stores · yeniden tasarım · yetki haritası) — Plan

> **Status:** ✅ v2.91.0 + v2.92.0 test'te — main onay bekliyor — **v2.91.0 (Incident) ✅ tamam** — I1 + I2 + I3 lokal test edildi, `v2.91.0-test` olarak test'e push; main kullanıcı onayı bekliyor. **S1 ✅ lokal** (additive `stores` tablosu — diff SQL yalnız CREATE TABLE + 2 index; ilk okumada `SALES_STORES`'tan idempotent seed; `GET /sales/stores` artık DB'den + tüm login'lere açık, `?all=1` arşivlileri de verir; sales activity / direct order yazımları bilinmeyen store'u 400 ile reddeder, arşivli store eski kaydı düzenlerken geçerli kalır; 7 frontend dropdown `useStores` / `<StoreOptions>`'a geçti; liste eskisiyle birebir aynı 17 isim + sıra — HTTP + Playwright doğrulandı). **S2 ✅ lokal** (Settings `?tab=users|stores`; Users yeniden tasarım: rol sayı çipleri → filtre, arama, Active/Removed/All, KPI şeridi, Removed kullanıcıya **Reactivate** (mevcut `PATCH isActive`), add/edit/remove modalları birebir taşındı; Stores: ekle (büyük/küçük harf duyarsız tekrar → 409), **yeniden adlandır** = canlı önizleme (activity / direct order / return sayıları) + tek transaction, mevcut store'a veya kayıtlarda zaten geçen bir isme yeniden adlandırma engelli, **arşivle/geri al**, **sil yalnız hiç kaydı olmayan store'da**, son aktif store arşivlenemez; listede olmayıp kayıtlarda geçen isimler salt-okunur panel + 'Add'; yeni additive `store_audit` tablosu → 'Recent changes'. HTTP + Playwright (desktop/mobil, taşma yok) + returns rename testi geçti.) **P1 ✅ lokal** (`requireRole` davranışı aynı + WeakMap rol metadata'sı; `onRoute` toplayıcı 232 route; `GET /users/permissions` ADMIN; Settings → Permissions matrisi + rol vurgulama + hücre → endpoint listesi; bilinen kurallar doğru çıktı: OUTBOUND_ADMIN Picker Admin'de salt-okunur, INCIDENT_REPORTER incident'ı silemez ama belge silebilir). **v2.92.0-test** push; main kullanıcı onayı bekliyor.
> **I2 ek bulgu/düzeltme:** tablo "Signed" sütunu yalnız eski `signedFilePath`'e bakıyordu → prod'da **87 incident imzalı kopyası olduğu halde "—"** görünüyordu (gerçekte eksik: 28). Liste artık `documentCount` / `hasSignedCopy` döner.
> **Hedef versiyonlar:** `v2.91.0` (Incident Report) → `v2.92.0` (Settings: Stores + redesign + Permissions). İki ayrı sürüm, risk ayrışsın diye.
> **En önemli kural:** **Veri kaybı yok.** Şema değişiklikleri yalnız *additive* (yeni nullable kolon / enum / tablo). Hiçbir kolon silinmez veya yeniden adlandırılmaz. Mevcut 115 incident ve 281 incident belgesi olduğu gibi kalır.

---

## 0. Kararlar (kullanıcı cevaplamadı → önerilen varsayılanlar, değiştirilebilir)

| # | Soru | Varsayılan |
|---|---|---|
| 1 | Uyarı basamakları | `NO_ACTION` / `COACHING` → `VERBAL_WARNING` → `WRITTEN_WARNING` → `FINAL_WARNING` → `SUSPENSION` → `TERMINATION` |
| 2 | Uyarı sayacı penceresi | **Tüm zamanlar** (her zaman gösterilir) + ek olarak **son 12 ay** sayısı |
| 3 | PDF'te disiplin satırı | **Evet, yalnız disiplin işlemi seçildiyse** ("Disciplinary action: Written Warning (2nd) · Previous incidents: 3") |
| 4 | Accounting store listesi (`acc_stores`) | **Ayrı kalır** — Settings'teki store yönetimi accounting kayıtlarına dokunmaz |
| 5 | Sıra | Önce Incident (v2.91), sonra Settings (v2.92) |

---

## 1. Incident Report (v2.91.0)

### 1.1 Bulgular (prod, 2026-09-24)
- 115 incident · 36 çalışan · 2026-06-01 → 2026-09-23 · 281 belge.
- 24 çalışanın > 1 kaydı var, kişi başı en fazla **13**; **28** (çalışan, tip) çifti tekrarlanmış.
- **"Warning" kavramı yok** — incident'te disiplin işlemi / seviye / sıra tutulmuyor → "uyarı verildi mi, kaçıncı?" cevapsız.
- Ana tabloda tekrar göstergesi yok; çalışan sayfası = sıralama + pivot, kişi zaman çizelgesi yok.
- Bir çalışanın birden fazla login'i olabildiği halde (v2.88 `User.employeeId`) sayımlar **login bazlı**.
- Grafikler: zaman, tip, çalışan maliyeti. 25 tip için kategori yok, önceki döneme kıyas yok, tekrar edenler / imzasız kopya görünmüyor.

### 1.2 Uyarı sistemi (veri kaybı sıfır)
- **Otomatik sıra (şema değişikliği yok):** okuma anında, tarih sırasına göre `occurrenceNo` (kişinin kaçıncı incident'i) + `typeOccurrenceNo` (bu tipin kaçıncısı) + son 12 ay sayısı. Mevcut 115 kayıtta anında görünür, DB'ye yazılmaz.
- **Kişi anahtarı:** bağlı Employee (`User.employeeId`) varsa kişi, yoksa login (`employeeUserId`).
- **Yeni alan:** `Incident.disciplinaryAction DisciplinaryAction?` (nullable). Mevcut kayıtlar `NULL` = **"Not recorded"** — tahminle doldurulmaz; admin mevcut Edit ile işaretleyebilir.
- **`warningNo`:** kişinin uyarı-seviyeli (Verbal…Termination) işlemlerinin sırası; okuma anında hesaplanır.
- **Form ipucu:** çalışan + tip seçilince "4. incident (Missing Item'ın 2.'si) · son uyarı: Written (12 Ağu) → önerilen: Final Warning" — yalnız öneri.
- **Tablo / detay:** "#4 · 2nd of type" rozeti + işlem etiketi ("Written #2"); detayda kişinin zaman çizelgesi.
- **PDF:** işlem seçildiyse tek satır (karar #3).

### 1.3 Görsel / rapor yenileme
- KPI'lar (önceki döneme göre Δ): toplam incident, etkilenen çalışan, tekrar eden (≥2), verilen uyarılar (seviyeye göre), toplam maliyet, imzalı kopyası eksik.
- 25 tip → 5 kategori: *Order handling · Inventory · Attendance & time · Conduct & safety · Sales & admin*.
- Grafikler: kategoriye göre trend, tipe göre sıralama, tip/çalışan maliyeti, **tekrar edenler paneli** (uyarı basamağı ilerlemesi), çalışan × ay heatmap.
- Filtreler: tip, çalışan, disiplin işlemi, rol + CSV export.
- Çalışan profili: zaman çizelgesi, uyarı basamağı, tip dağılımı, maliyet.

### 1.4 Aşamalar
| # | İçerik |
|---|---|
| I1 ✅ | Backend: `DisciplinaryAction` enum + nullable kolon; shared etiket/basamak/kategori; occurrence hesaplama; list/detail/history/report genişletmeleri; create/update validasyonu |
| I2 ✅ | Genel görünüm yenileme + tablo rozetleri + form uyarıları (+ Signed sütunu hatası, mobil taşma düzeltmesi) |
| I3 ✅ | Çalışan profili + zaman çizelgesi + PDF satırı → `v2.91.0-test` → kullanıcı onayıyla main |

---

## 2. Settings → Store yönetimi (v2.92.0)

### 2.1 Bulgular
- 17 store **kodda sabit** (`shared/src/sales.ts` `SALES_STORES`); backend `z.enum(SALES_STORES)` ile doğruluyor.
- İsimler **düz metin** olarak: `sales_daily_activity` (761) · `sales_direct_order` (593) · `return_cancel_parcels` (2 937) · `acc_sales` (458) — prod sayıları.
- `acc_stores` (19, 2'si listede yok) accounting'in **kendi** listesi → karar #4: ayrı kalır.
- `orders.shop_name` / `dispatch_parcels.shop_name` (24 farklı değer, kargo etiketlerinden) **farklı bir liste** — kapsam dışı, dokunulmaz.

### 2.2 Tasarım
- Yeni `stores` tablosu (tenant, name unique/tenant, isActive, sortOrder) — açılışta 17 isimle **idempotent** doldurulur.
- Tüm açılır listeler + backend doğrulaması tablodan okur (sabit liste yedek); geçmiş kayıtlardaki eski isimler geçerli kalır.
- **Ekle:** her yerde anında görünür.
- **Yeniden adlandır:** önizleme ("761 aktivite, 593 sipariş, 2 937 iade güncellenecek") → onay → **tek transaction** (store + `sales_daily_activity` + `sales_direct_order` + `return_cancel_parcels`); var olan bir isme yeniden adlandırma engellenir; audit log.
- **Sil:** varsayılan **arşivle** (yeni girişte gizli, geçmiş/raporlar korunur); **kalıcı silme yalnız hiç kaydı olmayan store'da**.

## 3. Settings yeniden tasarım (v2.92.0)
Sekmeler: **Users** (rol sayıları, arama, rol + aktif/pasif filtresi, yenilenmiş kartlar) · **Stores** · **Permissions**.

## 4. Yetki haritası (v2.92.0)
- Sorun: yetkiler 3 yerde (backend `requireRole` 86 route, frontend route'lar, sidebar) → elle tablo kayar.
- Çözüm: `requireRole` davranışı **değişmeden** rol listesini metadata olarak taşır; `onRoute` hook açılışta her route'un method + URL + rollerini toplar; `GET /settings/permissions` (ADMIN) **gerçekten uygulanan** matrisi döner.
- UI: roller × modüller ızgarası — View (GET) / Edit (POST/PUT/PATCH) / Delete; hücre → endpoint listesi; özel durumlar işaretli (OUTBOUND_ADMIN salt-okunur, INCIDENT_REPORTER silemez). **Bu fazda salt-görüntüleme.**

### Aşamalar
| # | İçerik |
|---|---|
| S1 | `stores` tablosu + listeleri DB'den okuma (davranış birebir aynı) |
| S2 | Settings sekmeleri + Stores sekmesi |
| P1 | Yetki endpoint'i + Permissions sekmesi → `v2.92.0-test` → kullanıcı onayıyla main |

---

## 5. Veri güvenliği kontrol listesi
- [x] (I1) Şema diff'i `prisma migrate diff` ile SQL olarak çıkarıldı → yalnız `CREATE TYPE "DisciplinaryAction"` + `ALTER TABLE "incidents" ADD COLUMN "disciplinary_action"` (nullable). Şema diff'i SQL olarak çıkarılır; **yalnız `ADD` / `CREATE`** içerdiği doğrulanır (CD `db push` yıkıcı değişikliği sessizce yutabiliyor — SOLUTIONS 2026-06-03).
- [ ] Her main merge öncesi prod DB'nin **elle ek yedeği** (`scripts/backup.sh`), gecelik yedeğe ek olarak.
- [ ] Incident tabloları retention'dan muaf kalır; belgeler/dosyalar değişmez.
- [ ] Store yeniden adlandırma tek transaction; kaydı olan store asla kalıcı silinmez.
- [ ] Deploy sonrası prod'da salt-okunur doğrulama (incident sayısı 115+ ve belge sayısı korunmuş).
