# Claude Code — Proje Kuralları

## GitHub

- **Remote:** `https://github.com/Ozcan-k/dynamic-order-management`
- Remote URL'ini her seferinde sormadan kullan.
- Her commit + push işleminde **semantic versioning** ile yeni bir git tag ekle: `v1.0.0`, `v1.1.0`, `v1.2.0` ...
- Tag format: `vMAJOR.MINOR.PATCH`
  - PATCH: küçük düzeltme / tek dosya değişikliği
  - MINOR: yeni özellik / yeni phase tamamlandı
  - MAJOR: büyük mimari değişiklik
- Push sırası: önce commit → tag → `git push origin main --tags`

## Geliştirme Kuralları

- Değişiklik yapmadan önce izin al.
- Phase'leri sırayla yap: Phase 1 → 2 → ... → 11 (ARCHITECTURE.md Section 15)
- Her phase bitiminde commit + versioned push yap.
- `.env` dosyasını asla commit etme.
