# Docker Setup — Progress Log

## Changes Applied

### 1. `.env` — Host names corrected for Docker networking
```
DB_HOST=postgres          (was: localhost → postgres)
REDIS_HOST=redis          (was: localhost → redis)
DATABASE_URL=postgresql://dom_user:changeme@postgres:5432/dom_db?schema=public
```

### 2. `backend/src/plugins/auth.ts` — TypeScript type error fixed
Used `@fastify/jwt` module augmentation for `FastifyRequest.user`:
```ts
declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: JWTPayload
    user: JWTPayload
  }
}
```

### 3. `docker-compose.yml` — NODE_ENV=production override added for backend
```yaml
backend:
  environment:
    NODE_ENV: production
```

### 4. `backend/Dockerfile` — Prisma generate step added (builder stage)
```dockerfile
RUN npx prisma generate --schema=backend/prisma/schema.prisma
```

### 5. `backend/Dockerfile` — Prisma files copied to runner stage
```dockerfile
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma
```

### 6. `backend/prisma/schema.prisma` — Correct binary target for Alpine Linux
```prisma
generator client {
  provider      = "prisma-client-js"
  binaryTargets = ["linux-musl-openssl-3.0.x"]
}
```

---

## Remaining Issue (Action Required)

**Error:** `libssl.so.1.1: No such file or directory`

Alpine Linux 3.17+ no longer ships OpenSSL 1.1 (only OpenSSL 3.x is available).
Prisma fails to detect the OpenSSL version and selects the wrong binary.

**Next step:**
Add the following to the Dockerfile runner stage:
```dockerfile
RUN apk add --no-cache openssl
ENV PRISMA_QUERY_ENGINE_LIBRARY=/app/node_modules/.prisma/client/libquery_engine-linux-musl-openssl-3.0.x.so.node
```

Then rebuild with `--no-cache`:
```bash
cd "/c/Users/okili/OneDrive/Documents/Programs/dynamic-order-management"
docker compose down
docker compose build --no-cache backend
docker compose up
```

Then run migrations:
```bash
docker exec -it dom_backend npx prisma migrate deploy --schema=/app/backend/prisma/schema.prisma
```

Verify:
```bash
curl http://localhost:3000/health
```
