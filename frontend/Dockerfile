FROM node:20-alpine

WORKDIR /app

# Copy root package files (monorepo workspace config)
COPY package.json package-lock.json* ./
COPY shared/package.json ./shared/
COPY frontend/package.json ./frontend/

# Install all dependencies
RUN npm ci

# Copy source
COPY shared/ ./shared/
COPY frontend/ ./frontend/

# Build shared package so frontend can resolve @dom/shared
RUN npm run build --workspace=shared

WORKDIR /app/frontend

EXPOSE 5173

CMD ["npx", "vite", "--host"]
