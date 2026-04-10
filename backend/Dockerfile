# ── Stage 1: Build shared + backend ──────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Copy root package files (monorepo workspace config)
COPY package.json package-lock.json* ./
COPY shared/package.json ./shared/
COPY backend/package.json ./backend/

# Install all dependencies
RUN npm ci

# Copy source
COPY shared/ ./shared/
COPY backend/ ./backend/

# Generate Prisma client
RUN npx prisma generate --schema=backend/prisma/schema.prisma

# Build shared first, then backend
RUN npm run build --workspace=shared
RUN npm run build --workspace=backend

# ── Stage 2: Production image ─────────────────────────────────────────────────
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PRISMA_QUERY_ENGINE_LIBRARY=/app/node_modules/.prisma/client/libquery_engine-linux-musl-openssl-3.0.x.so.node

# Install OpenSSL 3.x for Prisma engine
RUN apk add --no-cache openssl

# Copy root package files
COPY package.json package-lock.json* ./
COPY shared/package.json ./shared/
COPY backend/package.json ./backend/

# Install production deps only
RUN npm ci --omit=dev

# Copy built artifacts
COPY --from=builder /app/shared/dist ./shared/dist
COPY --from=builder /app/backend/dist ./backend/dist
COPY --from=builder /app/backend/prisma ./backend/prisma
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma

EXPOSE 3000

CMD ["node", "backend/dist/index.js"]
