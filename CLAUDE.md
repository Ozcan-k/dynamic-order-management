# Claude Code — Proje Kuralları

## GitHub — Her Değişiklikte Yapılacaklar (ZORUNLU)

**Remote URL:** `https://github.com/Ozcan-k/dynamic-order-management`
Bu URL'i her seferinde sormadan direkt kullan.

### Adım adım push süreci:

1. Değişiklikleri stage et:
   ```bash
   git add <değişen dosyalar>
   ```

2. Commit yap (açıklayıcı mesajla):
   ```bash
   git commit -m "feat/fix/chore: açıklama"
   ```

3. Yeni bir semantic version tag ekle:
   ```bash
   git tag vX.Y.Z
   ```

4. Main + tag'leri birlikte push et:
   ```bash
   git push origin main --tags
   ```

### Versioning kuralı (Semantic Versioning):

| Değişiklik türü | Versiyon |
|---|---|
| Küçük düzeltme, tek dosya | PATCH → v1.0.1 |
| Yeni özellik, phase tamamlandı | MINOR → v1.1.0 |
| Büyük mimari değişiklik | MAJOR → v2.0.0 |

**Mevcut versiyon:** `v1.0.0` (Phase 1 tamamlandı)

### Kesinlikle commit edilmeyecekler:
- `.env` (gizli bilgiler — `.gitignore`'da)
- `node_modules/`
- `dist/` ve `build/`
- `.claude/`

---

## Geliştirme Kuralları

- Değişiklik yapmadan önce kullanıcıdan izin al.
- Phase'leri sırayla yap: Phase 1 → 2 → ... → 11 (ARCHITECTURE.md Section 15).
- Her phase bitiminde commit + versioned push yap.
- Her push'tan önce `git pull origin main --rebase` ile remote'u kontrol et.
