import { UserRole } from '@dom/shared'

// Settings → Users: role colours/labels and the page grouping (moved from pages/Settings.tsx in v2.92.0).

export interface AppUser {
  id: string
  username: string
  role: string
  isActive: boolean
  email?: string | null
  createdAt: string
  createdBy?: { id: string; username: string } | null
  employee?: { empNo: number } | null
}

// ─── Role config ──────────────────────────────────────────────────────────────

export interface RoleConfig {
  label: string
  pluralLabel: string
  color: string
  badgeBg: string
  badgeText: string
  hasEmail: boolean
}

export const ROLE_CONFIG: Record<string, RoleConfig> = {
  [UserRole.ADMIN]: {
    label: 'Admin',
    pluralLabel: 'Admins',
    color: '#1d4ed8',
    badgeBg: '#dbeafe',
    badgeText: '#1e40af',
    hasEmail: true,
  },
  [UserRole.WAREHOUSE_ADMIN]: {
    label: 'Warehouse Admin',
    pluralLabel: 'Warehouse Admins',
    color: '#4338ca',
    badgeBg: '#e0e7ff',
    badgeText: '#3730a3',
    hasEmail: false,
  },
  [UserRole.INBOUND_ADMIN]: {
    label: 'Inbound Admin',
    pluralLabel: 'Inbound Admins',
    color: '#b45309',
    badgeBg: '#fef3c7',
    badgeText: '#92400e',
    hasEmail: false,
  },
  [UserRole.OUTBOUND_ADMIN]: {
    label: 'Outbound Admin',
    pluralLabel: 'Outbound Admins',
    color: '#0e7490',
    badgeBg: '#cffafe',
    badgeText: '#155e75',
    hasEmail: false,
  },
  [UserRole.PICKER_ADMIN]: {
    label: 'Picker Admin',
    pluralLabel: 'Picker Admins',
    color: '#6d28d9',
    badgeBg: '#ede9fe',
    badgeText: '#5b21b6',
    hasEmail: false,
  },
  [UserRole.PACKER_ADMIN]: {
    label: 'Packer Admin',
    pluralLabel: 'Packer Admins',
    color: '#0e7490',
    badgeBg: '#cffafe',
    badgeText: '#155e75',
    hasEmail: false,
  },
  [UserRole.PICKER]: {
    label: 'Picker',
    pluralLabel: 'Pickers',
    color: '#7c3aed',
    badgeBg: '#ede9fe',
    badgeText: '#6d28d9',
    hasEmail: false,
  },
  [UserRole.PACKER]: {
    label: 'Packer',
    pluralLabel: 'Packers',
    color: '#0f766e',
    badgeBg: '#ccfbf1',
    badgeText: '#115e59',
    hasEmail: false,
  },
  [UserRole.SALES_AGENT]: {
    label: 'Sales Agent',
    pluralLabel: 'Sales Agents',
    color: '#15803d',
    badgeBg: '#dcfce7',
    badgeText: '#166534',
    hasEmail: false,
  },
  [UserRole.STOCK_KEEPER]: {
    label: 'Stock Keeper',
    pluralLabel: 'Stock Keepers',
    color: '#0891b2',
    badgeBg: '#cffafe',
    badgeText: '#155e75',
    hasEmail: false,
  },
  [UserRole.RETURN_SCANNER]: {
    label: 'Return & Cancel Scanner',
    pluralLabel: 'Return & Cancel Scanners',
    color: '#be123c',
    badgeBg: '#ffe4e6',
    badgeText: '#9f1239',
    hasEmail: false,
  },
  [UserRole.INCIDENT_REPORTER]: {
    label: 'Incident Reporter',
    pluralLabel: 'Incident Reporters',
    color: '#9333ea',
    badgeBg: '#f3e8ff',
    badgeText: '#6b21a8',
    hasEmail: false,
  },
  [UserRole.ACCOUNTANT]: {
    label: 'Accountant',
    pluralLabel: 'Accountants',
    color: '#0d9488',
    badgeBg: '#ccfbf1',
    badgeText: '#115e59',
    hasEmail: false,
  },
}

// ─── Role sections — drives the whole page layout ─────────────────────────────

export interface RoleSectionConfig {
  title: string
  desc: string
  roles: UserRole[]
}

export const ROLE_SECTIONS: RoleSectionConfig[] = [
  {
    title: 'Administration',
    desc: 'Desktop dashboard roles. Each admin manages their own area; Admins with an email also receive nightly reports. Incident Reporters only see the Incident Report module and can do everything there except delete. Accountants only see the Accounting module.',
    roles: [
      UserRole.ADMIN,
      UserRole.INBOUND_ADMIN,
      UserRole.OUTBOUND_ADMIN,
      UserRole.WAREHOUSE_ADMIN,
      UserRole.PICKER_ADMIN,
      UserRole.PACKER_ADMIN,
      UserRole.INCIDENT_REPORTER,
      UserRole.ACCOUNTANT,
    ],
  },
  {
    title: 'Warehouse Floor',
    desc: 'Pickers and packers work from handheld devices; stock keepers scan QR labels at the mobile stock station.',
    roles: [UserRole.PICKER, UserRole.PACKER, UserRole.STOCK_KEEPER],
  },
  {
    title: 'Sales',
    desc: 'Sales agents log daily marketing activity and direct orders from the web dashboard.',
    roles: [UserRole.SALES_AGENT],
  },
  {
    title: 'Scanners',
    desc: 'Handheld-only roles. Their scans feed a dedicated report and never touch the order pipeline.',
    roles: [UserRole.RETURN_SCANNER],
  },
]
