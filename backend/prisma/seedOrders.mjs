import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const PLATFORMS = ['SHOPEE', 'LAZADA', 'TIKTOK', 'OTHER']
const PREFIXES = {
  SHOPEE: ['PH', 'PHS', 'PHP'],
  LAZADA: ['MP', 'P', 'LZD'],
  TIKTOK: ['JT', 'TTK'],
  OTHER:  ['EX', 'OTH', 'GEN', 'INT'],
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

function randomFrom(arr) {
  return arr[Math.floor(Math.random() * arr.length)]
}

function generateTrackingNumber(platform) {
  const prefix = randomFrom(PREFIXES[platform])
  const digits = String(randomInt(100000000, 999999999))
  return `${prefix}${digits}`
}

async function main() {
  const tenant = await prisma.tenant.findUnique({ where: { slug: 'demo' } })
  if (!tenant) {
    console.error('Tenant "demo" not found. Run the main seed first.')
    process.exit(1)
  }

  // Find any admin user to be the scanner
  const scanner = await prisma.user.findFirst({
    where: { tenantId: tenant.id, isActive: true },
  })
  if (!scanner) {
    console.error('No users found. Run the main seed first.')
    process.exit(1)
  }

  console.log(`Creating 500 test orders for tenant "${tenant.name}"...`)

  const TOTAL = 500
  let created = 0
  let skipped = 0

  for (let i = 0; i < TOTAL; i++) {
    const platform = randomFrom(PLATFORMS)
    const trackingNumber = generateTrackingNumber(platform)

    // Random delay level weighted toward 0-1
    const rand = Math.random()
    const delayLevel = rand < 0.55 ? 0 : rand < 0.75 ? 1 : rand < 0.88 ? 2 : rand < 0.95 ? 3 : 4

    // Random creation time in the last 7 days
    const hoursAgo = randomInt(0, 7 * 24)
    const createdAt = new Date(Date.now() - hoursAgo * 60 * 60 * 1000)

    try {
      await prisma.order.create({
        data: {
          tenantId: tenant.id,
          trackingNumber,
          platform,
          status: 'INBOUND',
          priority: 0,
          delayLevel,
          slaStartedAt: createdAt,
          scannedById: scanner.id,
          createdAt,
          updatedAt: createdAt,
          statusHistory: {
            create: {
              fromStatus: null,
              toStatus: 'INBOUND',
              changedById: scanner.id,
              changedAt: createdAt,
            },
          },
        },
      })
      created++
    } catch {
      // Duplicate tracking number — skip
      skipped++
    }

    if ((i + 1) % 50 === 0) {
      console.log(`  ${i + 1}/${TOTAL} processed (created: ${created}, skipped: ${skipped})`)
    }
  }

  console.log(`\nDone! Created: ${created}, Skipped (duplicates): ${skipped}`)
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
