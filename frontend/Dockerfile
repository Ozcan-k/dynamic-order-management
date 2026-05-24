# ── Stage 1: Build shared + frontend ─────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Copy root package files (monorepo workspace config)
COPY package.json package-lock.json* ./
COPY shared/package.json ./shared/
COPY frontend/package.json ./frontend/

# Install all dependencies (full install — vite + tsc needed in build stage)
RUN npm ci

# Copy source
COPY shared/ ./shared/
COPY frontend/ ./frontend/

# Build shared first so frontend can resolve @dom/shared during vite build
RUN npm run build --workspace=shared

# Build frontend → /app/frontend/dist
RUN npm run build --workspace=frontend

# ── Stage 2: Nginx static serve ──────────────────────────────────────────────
FROM nginx:alpine AS runner

# Replace default site with our SPA + proxy config
RUN rm -f /etc/nginx/conf.d/default.conf
COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf

# Copy built SPA
COPY --from=builder /app/frontend/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
