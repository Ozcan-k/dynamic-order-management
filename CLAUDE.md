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

**Mevcut versiyon:** `v2.13.5`

### Kesinlikle commit edilmeyecekler:
- `.env`
- `node_modules/`
- `dist/` ve `build/`
- `.claude/`

---

## Geliştirme Kuralları

- Değişiklik yapmadan önce kullanıcıdan izin al.
- Phase'leri sırayla yap: Phase 1 → 2 → ... → 11 (ARCHITECTURE.md Section 15).
- Her phase kodu önce `test`'e gider, kullanıcı onayı sonrası `main`'e geçer.
- Her push öncesi `git pull origin <branch> --rebase` ile remote'u kontrol et.
