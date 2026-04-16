# Dynamic Order Management — Deployment Plan

> **Version:** 1.1.0-draft
> **Date:** 2026-04-09
> **Status:** Pre-development

---

## Project Overview

**Dynamic Order Management (DOM)** is a warehouse order tracking system managing the full lifecycle of e-commerce orders from inbound scan through picking, packing, and final dispatch (outbound).

- **Platforms:** Shopee, Lazada, TikTok Shop, Direct (in-house DR tracking)
- **Daily Volume:** ~10,000 orders
- **Concurrent Users:** 50–100 staff
- **Data Retention:** 6 months minimum

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React + TypeScript + TanStack Query + Zustand |
| Backend | Node.js + Fastify |
| Database | PostgreSQL 16 (with RLS multi-tenant isolation) |
| Cache / Queue | Redis + BullMQ |
| Real-time | Socket.io |
| ORM | Prisma |
| Validation | Zod |
| Email | Nodemailer |
| Reverse Proxy | Nginx + Let's Encrypt (SSL) |
| Containerization | Docker Compose |
| CI/CD | GitHub Actions |

---

## Deployment Environments

| Environment | Where | Cost | Purpose |
|---|---|---|---|
| **Development** | Localhost | Free | Local development |
| **Production** | Vultr Manila PH | 2/month | Live system |

> No staging environment — features are developed on localhost and deployed directly to production once approved.

### Why Vultr Manila
- Closest datacenter to the Philippines (~5–10ms latency)
- Instant response for barcode scanning is critical — high latency is unacceptable
- 2/month handles 2,000–10,000 orders/day comfortably

---

## Production URLs

| | URL |
|---|---|
| **App** | `https://domwarehouse.com` |
| **Server IP** | `45.32.107.63` |
| **SSH** | `ssh root@45.32.107.63` |
| **Project path** | `/opt/dom/` |
| **Handheld scan (tüm roller)** | `https://domwarehouse.com/scan` |

---

## Production Server Specification

**Vultr Cloud Compute — Regular Performance (Manila, PH)**

| Resource | Value |
|---|---|
| CPU | 2 vCPU |
| RAM | 4 GB |
| Disk | 80 GB SSD |
| Bandwidth | 3 TB/month |
| Cost | **2/month** |

At 2,000 orders/day the server runs at **~20–25% capacity**.

---

## Production Infrastructure (Docker Compose — Single Server)

```
[Vultr Manila VPS]
│
├── Nginx (reverse proxy + SSL — Let's Encrypt)
│       ├── /          → React static build
│       └── /api       → Node.js Fastify (backend)
│               ├── PostgreSQL 16
│               ├── Redis
│               └── BullMQ workers
```

---

## Branching Model

```
feature/xxx  →  main branch
                     │
              git tag v1.x.x
                     │
              docker build + push
                     │
              Deploy to Vultr
```

### Versioning
- Semantic versioning: `v1.0.0`, `v1.1.0`, `v1.2.0`
- Every production deploy is tagged in git
- Rollback: re-deploy the previous Docker image

---

## CI/CD Pipeline (GitHub Actions)

**Workflow files:** `.github/workflows/ci.yml` (build/type-check) + `.github/workflows/cd.yml` (deploy)

On push to `main`:
1. TypeScript check — `tsc --noEmit` (backend + frontend)
2. Docker build & push → `ghcr.io/ozcan-k/dom-backend:latest` + `ghcr.io/ozcan-k/dom-frontend:latest`
3. SSH to Vultr → `git pull origin main` → `docker compose pull && docker compose up -d --remove-orphans`
4. Run migrations → `docker exec dom_backend npx prisma migrate deploy`
5. Cleanup → `docker image prune -f`

### Required GitHub Secrets

| Secret | Value |
|---|---|
| `VULTR_HOST` | `45.32.107.63` |
| `VULTR_PASSWORD` | Vultr root password (from my.vultr.com) |

Add at: `https://github.com/Ozcan-k/dynamic-order-management/settings/secrets/actions`

### Authentication Note
SSH uses **password authentication** (not key-based). No SSH key is required on the server.

---

## Scaling Roadmap

| Phase | Load | Action |
|---|---|---|
| Launch | 2,000 orders/day | Vultr 2 vCPU / 4 GB — current plan |
| Growth | ~5,000 orders/day | Upgrade to Vultr 4 vCPU / 8 GB (~4/month) |
| Scale | 10,000+ orders/day | Add separate DB server + pgBouncer |

---

## Security Checklist

| Concern | Solution |
|---|---|
| Authentication | JWT — 15min access token + 7day refresh token |
| Session storage | Redis (not localStorage — prevents XSS token theft) |
| Password storage | bcrypt, salt rounds ≥ 12 |
| SQL injection | Prisma ORM — parameterized queries |
| XSS | React escapes by default |
| Rate limiting | Fastify rate-limit (100 req/min per IP) |
| HTTPS | Enforced at Nginx level |
| Data isolation | PostgreSQL RLS per tenant |
| Input validation | Zod schemas on all API inputs |
| CORS | Whitelist-only origins |
| Security testing | OWASP checklist at every deployment |

---

## Background Jobs (BullMQ)

| Job | Schedule (Manila PHT) | Description |
|---|---|---|
| SLA Escalation Sweep | Every 15 minutes | Escalates D0→D1→D2→D3→D4 based on elapsed time since scan |
| D4 Supervisor Alert | Triggered by sweep | Sends email alert when order reaches D4 |
| Archive Outbound | 11:00 AM daily (03:00 UTC) | Marks all OUTBOUND orders as archived — resets daily totals |
| Nightly Report | 11:10 AM daily (03:10 UTC) | Sends summary email to all Admin users + hard-deletes orders > 180 days |

---

## SLA Policy

| Level | Elapsed Time Since Scan | Priority Boost | Action |
|---|---|---|---|
| D0 | 0–4 hours | +0 | Normal processing |
| D1 | 4–8 hours | +200 | Prioritize over new orders |
| D2 | 8–12 hours | +400 | Urgent — team lead attention |
| D3 | 12–16 hours | +800 | Serious — immediate action |
| D4 | 16+ hours | +1600 | Critical — supervisor notified by email and live alert |

---

## Handheld Device Setup

All handheld roles (PICKER, PACKER, INBOUND_ADMIN, PICKER_ADMIN) use the same URL.

**One-time setup per device:**
1. Open Chrome on the device → navigate to `https://domwarehouse.com/scan`
2. Add to Home Screen for quick access (Chrome ⋮ menu → "Add to Home Screen")

**Daily use:**
- Worker opens the bookmark → enters username + password → taps Sign In
- System detects role and redirects automatically to the correct scan page
- Session persists 8 hours; no re-login needed during shift unless Logout is pressed

---

## Repository Structure

```
dynamic-order-management/
├── frontend/          # React + TypeScript
├── backend/           # Node.js + Fastify
│   └── prisma/        # Database schema
├── docker-compose.yml
├── .github/
│   └── workflows/
│       └── deploy.yml # CI/CD pipeline
└── DEPLOYMENT.md      # This file
```