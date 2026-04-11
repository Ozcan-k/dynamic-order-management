# Debugging & Solutions Log

Bu dosya, projede karşılaşılan sorunları ve çözümlerini kayıt altına alır.
Bir sorunla tekrar karşılaşıldığında buradan hızlıca çözüm bulunabilir.

---

## [2026-04-11] Modal / Fixed Overlay Açılmıyor

### Sorun
`position: fixed` ile tanımlanan overlay/modal bileşeni render olmuyor veya görünmüyor.

### Kök Neden
React, `position: fixed` elementleri normal DOM hiyerarşisine göre render eder.
Eğer herhangi bir parent element `transform`, `filter`, `will-change` veya `perspective`
CSS özelliğine sahipse, `position: fixed` o elementin içinde kalır (viewport'a göre değil).
Ayrıca `overflow: hidden` olan bir parent içinde `position: fixed` child görünmeyebilir.

### Çözüm
`createPortal` kullanarak modal'ı `document.body`'ye render etmek:

```tsx
import { createPortal } from 'react-dom'

export default function Modal({ onClose }: Props) {
  const modal = (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9999, ... }}>
      {/* modal içeriği */}
    </div>
  )
  return createPortal(modal, document.body)
}
```

### Bu Projede Kullanılan Yerler
- `frontend/src/components/BulkScanModal.tsx`

---

## [2026-04-11] Beyaz Sayfa (White Page / React Crash)

### Sorun
Uygulama açılıyor ama tamamen beyaz sayfa görünüyor.

### Olası Nedenler ve Kontroller

**1. Vite cache sorunu**
```bash
# Vite cache'ini temizle ve yeniden başlat
rm -rf frontend/node_modules/.vite
cd frontend && npx vite --force
```

**2. Birden fazla Vite process çalışıyor**
Port 5173 dolu görünüyorsa eski process'ler temizlenmemiş demektir.
```bash
npx kill-port 5173 5174 5175 3000
taskkill /F /IM node.exe   # Windows
```

**3. Stale tarayıcı cache**
Tarayıcıda `Ctrl+Shift+R` ile hard refresh yap.

**4. Runtime hatayı yakalamak için geçici hata handler**
`main.tsx`'e geçici olarak ekle, hatayı gör, sonra kaldır:
```tsx
window.addEventListener('error', (e) => {
  document.getElementById('root')!.innerHTML =
    `<pre style="color:red;padding:20px">[Error] ${e.message}\n${e.filename}:${e.lineno}</pre>`
})
```

**5. Shared package build edilmemiş**
`@dom/shared` paketi güncellendiyse mutlaka build et:
```bash
cd shared && npm run build
```
Sonra Vite cache'ini temizle (Vite eski dist'i cache'ler):
```bash
rm -rf frontend/node_modules/.vite
```

---

## [2026-04-11] Shared Package Yeni Export Ekleme

### Sorun
`shared/src/index.ts`'e yeni export eklendikten sonra backend veya frontend bulamıyor.

### Çözüm (Sırayla)
```bash
# 1. Shared paketi build et
cd shared && npm run build

# 2. Backend için Prisma generate (schema değiştiyse)
cd backend && npx prisma db push && npx prisma generate

# 3. Frontend Vite cache'ini temizle
rm -rf frontend/node_modules/.vite

# 4. Servisleri yeniden başlat
cd backend && npm run dev
cd frontend && npx vite
```

### TypeScript Kontrolü
```bash
# Backend
cd backend && npx tsc --noEmit

# Frontend
cd frontend && npx tsc --noEmit
```

---

## [2026-04-11] `Re-export` Pattern — platformDetect.ts

### Sorun
Aynı fonksiyon hem `shared/` hem `backend/src/lib/` içinde tanımlıydı.
İkisinin de sync tutulması gerekiyordu.

### Çözüm
`backend/src/lib/platformDetect.ts` içeriği tamamen shared'den re-export'a dönüştürüldü:
```typescript
export { detectPlatform } from '@dom/shared'
```
Tek kaynak `shared/src/index.ts` — değişiklik sadece orada yapılır.

---

## [2026-04-11] `React.CSSProperties` Kullanımı

### Sorun
`React` import edilmeden `React.CSSProperties` tip annotation'ı kullanılırsa
bazı konfigürasyonlarda TypeScript hata verebilir.

### Çözüm
```typescript
// Yerine şunu kullan:
const myStyle: Record<string, string | number> = { ... }

// Veya React'i import et:
import type { CSSProperties } from 'react'
const myStyle: CSSProperties = { ... }
```

---

## Genel Kurallar

- Modal/overlay bileşenlerinde her zaman `createPortal(modal, document.body)` kullan
- `@dom/shared` güncellenince mutlaka `npm run build` çalıştır
- Birden fazla Vite process çalışıyorsa beyaz sayfa veya stale kod görünebilir
- `npx tsc --noEmit` her değişiklikten sonra çalıştırılmalı
