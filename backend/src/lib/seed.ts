import 'dotenv/config'
import bcrypt from 'bcrypt'
import { prisma } from './prisma'

const PLATFORMS = ['SHOPEE', 'LAZADA', 'TIKTOK', 'OTHER'] as const
const PREFIXES: Record<string, string[]> = {
  SHOPEE: ['PH', 'PHS', 'PHP'],
  LAZADA: ['MP', 'P', 'LZD'],
  TIKTOK: ['JT', 'TTK'],
  OTHER:  ['EX', 'OTH', 'GEN'],
}

function randInt(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min
}
function randFrom<T>(arr: readonly T[] | T[]): T {
  return arr[Math.floor(Math.random() * arr.length)] as T
}
function tracking(platform: string) {
  const prefix = randFrom(PREFIXES[platform])
  return `${prefix}${randInt(100_000_000, 999_999_999)}`
}

async function main() {
  // ── Tenant ────────────────────────────────────────────────────────────────
  const tenant = await prisma.tenant.upsert({
    where: { slug: 'demo' },
    update: {},
    create: { name: 'Demo Warehouse', slug: 'demo', isActive: true },
  })
  console.log(`Tenant: ${tenant.name}`)

  // ── Admin ─────────────────────────────────────────────────────────────────
  const adminHash = await bcrypt.hash('admin123', 12)
  const admin = await prisma.user.upsert({
    where: { tenantId_username: { tenantId: tenant.id, username: 'admin' } },
    update: {},
    create: { tenantId: tenant.id, username: 'admin', passwordHash: adminHash, role: 'ADMIN', isActive: true },
  })
  console.log(`Admin: ${admin.username}`)

  // ── 20 Pickers ────────────────────────────────────────────────────────────
  const pickerHash = await bcrypt.hash('picker123', 12)
  const pickers = []
  for (let i = 1; i <= 20; i++) {
    const username = `Picker ${i}`
    const p = await prisma.user.upsert({
      where: { tenantId_username: { tenantId: tenant.id, username } },
      update: {},
      create: { tenantId: tenant.id, username, passwordHash: pickerHash, role: 'PICKER', isActive: true },
    })
    pickers.push(p)
  }
  console.log(`Pickers: 20 created (Picker 1–20)`)

  // ── Clear old test orders ─────────────────────────────────────────────────
  await prisma.orderStatusHistory.deleteMany({ where: { order: { tenantId: tenant.id } } })
  await prisma.pickerAssignment.deleteMany({ where: { order: { tenantId: tenant.id } } })
  await prisma.order.deleteMany({ where: { tenantId: tenant.id } })
  console.log('Old orders cleared.')

  // ── 30 INBOUND orders (waiting for assignment) ────────────────────────────
  for (let i = 0; i < 30; i++) {
    const platform = randFrom(PLATFORMS)
    const hoursAgo = randInt(0, 8)
    const delayLevel = hoursAgo >= 8 ? 4 : hoursAgo >= 6 ? 3 : hoursAgo >= 4 ? 2 : hoursAgo >= 2 ? 1 : 0
    const createdAt = new Date(Date.now() - hoursAgo * 3600_000)
    await prisma.order.create({
      data: {
        tenantId: tenant.id,
        trackingNumber: tracking(platform),
        platform,
        status: 'INBOUND',
        priority: delayLevel * 200,
        delayLevel,
        slaStartedAt: createdAt,
        scannedById: admin.id,
        createdAt,
        updatedAt: createdAt,
        statusHistory: { create: { fromStatus: null, toStatus: 'INBOUND', changedById: admin.id, changedAt: createdAt } },
      },
    })
  }
  console.log('30 INBOUND orders created')

  // ── 40 PICKER_ASSIGNED / PICKING / PICKER_COMPLETE orders ─────────────────
  const activeStatuses = ['PICKER_ASSIGNED', 'PICKING', 'PICKER_COMPLETE'] as const
  for (let i = 0; i < 40; i++) {
    const platform = randFrom(PLATFORMS)
    const hoursAgo = randInt(1, 12)
    const delayLevel = hoursAgo >= 8 ? 4 : hoursAgo >= 6 ? 3 : hoursAgo >= 4 ? 2 : hoursAgo >= 2 ? 1 : 0
    const createdAt = new Date(Date.now() - hoursAgo * 3600_000)
    const status = randFrom(activeStatuses)
    const picker = randFrom(pickers)
    const assignedAt = new Date(createdAt.getTime() + randInt(5, 30) * 60_000)

    const order = await prisma.order.create({
      data: {
        tenantId: tenant.id,
        trackingNumber: tracking(platform),
        platform,
        status,
        priority: delayLevel * 200,
        delayLevel,
        slaStartedAt: createdAt,
        scannedById: admin.id,
        createdAt,
        updatedAt: assignedAt,
        statusHistory: {
          create: [
            { fromStatus: null,       toStatus: 'INBOUND',          changedById: admin.id,  changedAt: createdAt },
            { fromStatus: 'INBOUND',  toStatus: 'PICKER_ASSIGNED',  changedById: admin.id,  changedAt: assignedAt },
          ],
        },
      },
    })

    await prisma.pickerAssignment.create({
      data: {
        orderId: order.id,
        pickerId: picker.id,
        assignedById: admin.id,
        assignedAt,
        completedAt: status === 'PICKER_COMPLETE' ? new Date(assignedAt.getTime() + randInt(10, 45) * 60_000) : null,
      },
    })
  }
  console.log('40 active orders created (PICKER_ASSIGNED / PICKING / PICKER_COMPLETE)')

  console.log('\nSeed complete.')
  console.log('  Admin   : admin / admin123')
  console.log('  Pickers : Picker 1–20 / picker123')
  console.log('  Orders  : 30 inbound + 40 active across 20 pickers')
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
