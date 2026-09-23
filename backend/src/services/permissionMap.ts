import type { FastifyInstance, RouteOptions } from 'fastify'
import { UserRole } from '@dom/shared'
import { rolesOf } from '../middleware/rbac'

// Permission map (v2.92.0) — read-only view of the access rules the server really
// enforces. An `onRoute` hook records every route while the app boots: its method,
// URL and the roles from its `requireRole(...)` preHandler (or "any signed-in user"
// when it only authenticates, or "public"). Nothing here changes how a request is
// authorised; Settings → Permissions only displays this list.

export type RouteAccess =
  | { kind: 'public' }
  | { kind: 'signed-in' }
  | { kind: 'roles'; roles: UserRole[] }

export interface RouteRule {
  method: string
  url: string
  module: string
  access: RouteAccess
}

// First URL segment → module shown in the matrix (order = display order)
export const PERMISSION_MODULES: { id: string; label: string; area: string }[] = [
  { id: 'orders', label: 'Inbound & orders', area: 'Warehouse' },
  { id: 'picker-admin', label: 'Picker Admin', area: 'Warehouse' },
  { id: 'picker', label: 'Picker handheld', area: 'Warehouse' },
  { id: 'packer-admin', label: 'Packer Admin', area: 'Warehouse' },
  { id: 'packer', label: 'Packer handheld', area: 'Warehouse' },
  { id: 'outbound', label: 'Outbound scan', area: 'Warehouse' },
  { id: 'dispatch', label: 'Outbound dispatch', area: 'Warehouse' },
  { id: 'returns', label: 'Return & Cancel', area: 'Warehouse' },
  { id: 'reports', label: 'Warehouse Report', area: 'Reports' },
  { id: 'archive', label: 'Archive', area: 'Reports' },
  { id: 'stock', label: 'Inventory — stock', area: 'Inventory' },
  { id: 'products', label: 'Inventory — products', area: 'Inventory' },
  { id: 'warehouses', label: 'Inventory — warehouses', area: 'Inventory' },
  { id: 'sales', label: 'Sales entry', area: 'Sales' },
  { id: 'marketing', label: 'Marketing Report', area: 'Sales' },
  { id: 'incidents', label: 'Incident Report', area: 'People' },
  { id: 'employee-schedule', label: 'Employee Schedule', area: 'People' },
  { id: 'accounting', label: 'Accounting', area: 'Finance' },
  { id: 'users', label: 'Settings — users', area: 'Admin' },
  { id: 'stores', label: 'Settings — stores', area: 'Admin' },
  { id: 'branding', label: 'Branding', area: 'Admin' },
  { id: 'auth', label: 'Sign-in', area: 'System' },
]

const rules: RouteRule[] = []

function moduleOf(url: string): string | null {
  if (url.startsWith('/sales/stores')) return url === '/sales/stores' ? 'sales' : 'stores'
  const seg = url.split('/')[1] ?? ''
  return PERMISSION_MODULES.some((m) => m.id === seg) ? seg : null
}

export function registerPermissionCollector(fastify: FastifyInstance) {
  fastify.addHook('onRoute', (route: RouteOptions) => {
    const methods = (Array.isArray(route.method) ? route.method : [route.method]).filter((m) => m !== 'HEAD' && m !== 'OPTIONS')
    const url = route.url
    const module = moduleOf(url)
    if (!module || methods.length === 0) return

    const pre = route.preHandler ? (Array.isArray(route.preHandler) ? route.preHandler : [route.preHandler]) : []
    const roleSets = pre.map((h) => rolesOf(h)).filter((r): r is UserRole[] => !!r)
    const authenticated = pre.some((h) => h === fastify.authenticate)
    let access: RouteAccess
    if (roleSets.length > 0) {
      // Several requireRole checks in a row → a role must pass all of them
      const roles = roleSets.reduce((acc, r) => acc.filter((x) => r.includes(x)))
      access = { kind: 'roles', roles }
    } else {
      access = authenticated ? { kind: 'signed-in' } : { kind: 'public' }
    }
    for (const method of methods) rules.push({ method, url, module, access })
  })
}

export function getPermissionMap() {
  const roles = Object.values(UserRole)
  return {
    roles,
    modules: PERMISSION_MODULES.map((m) => ({
      ...m,
      routes: rules
        .filter((r) => r.module === m.id)
        .sort((a, b) => a.url.localeCompare(b.url) || a.method.localeCompare(b.method)),
    })).filter((m) => m.routes.length > 0),
    generatedAt: new Date().toISOString(),
  }
}
