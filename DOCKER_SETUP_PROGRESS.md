# Docker Setup - İlerleme Durumu

## Yapılan Değişiklikler

### 1. `.env` — Docker için host isimleri düzeltildi
```
DB_HOST=postgres          (localhost → postgres)
REDIS_HOST=redis          (localhost → redis)
DATABASE_URL=postgresql://dom_user:changeme@postgres:5432/dom_db?schema=public
```

### 2. `backend/src/plugins/auth.ts` — TypeScript tip hatası düzeltildi
`FastifyRequest.user` için `@fastify/jwt` modülü kullanıldı:
```ts
declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: JWTPayload
    user: JWTPayload
  }
}
```

### 3. `docker-compose.yml` — Backend için NODE_ENV=production override eklendi
```yaml
backend:
  environment:
    NODE_ENV: production
```

### 4. `backend/Dockerfile` — Prisma generate adımı eklendi (builder stage)
```dockerfile
RUN npx prisma generate --schema=backend/prisma/schema.prisma
```

### 5. `backend/Dockerfile` — Runner stage'e Prisma dosyaları kopyalandı
```dockerfile
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma
```

### 6. `backend/prisma/schema.prisma` — Alpine Linux için doğru binary target
```prisma
generator client {
  provider      = "prisma-client-js"
  binaryTargets = ["linux-musl-openssl-3.0.x"]
}
```

---

## Kalan Sorun (Devam Etmek Gerekiyor)

**Hata:** `libssl.so.1.1: No such file or directory`

Alpine Linux 3.17+ artık OpenSSL 1.1 içermiyor (OpenSSL 3.x var).
Prisma OpenSSL versiyonunu detect edemiyor ve eski binary'yi seçiyor.

**Sonraki adım:**
Dockerfile runner stage'e şunlar eklenecek:
```dockerfile
RUN apk add --no-cache openssl
ENV PRISMA_QUERY_ENGINE_LIBRARY=/app/node_modules/.prisma/client/libquery_engine-linux-musl-openssl-3.0.x.so.node
```

Sonra `--no-cache` rebuild:
```bash
cd "/c/Users/okili/OneDrive/Documents/Programs/dynamic-order-management"
docker compose down
docker compose build --no-cache backend
docker compose up
```

Sonra migration:
```bash
docker exec -it dom_backend npx prisma migrate deploy --schema=/app/backend/prisma/schema.prisma
```

Test:
```bash
curl http://localhost:3000/health
```
