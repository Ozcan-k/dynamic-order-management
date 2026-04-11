import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const PLATFORMS = ['SHOPEE', 'LAZADA', 'TIKTOK', 'OTHER']
const PREFIXES = {
  SHOPEE: ['PH', 'PHS', 'PHP'],
  LAZADA: ['MP', 'P', 'LZD'],
  TIKTOK: ['JT', 'TTK'],
  OTHER:  ['EX', 'OTH', 'GEN', 'INT'],
}

const CARRIERS = [
  'SPX',
  'JT_EXPRESS',
  'FLASH',
  'LEX',
  'LBC',
  'NINJA_VAN',
  'OTHER',
]

const SHOP_NAMES = [
  'Picky_Farm',
  'Eco_Tree',
  'Chef_Mela',
  'Super_Food',
  'Every_Bite',
  'Natures_Blend_Shope',
  'Luxe',
  'Green_Tree',
  'Nuture_Blend_Online',
  'Nature_Finest',
  'Supper_Essantial',
  'Green_Fuel',
  'Zozo_Helth',
  'Master_Chef',
  'Daily_Nuts',
  'Sport_Snack',
  'Wimow',
  'Raven_Wellnes',
]

// Delay levels: D0–D4 evenly distributed (100 orders each for 500 total)
const DELAY_LEVELS = [0, 1, 2, 3, 4]

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

  const scanner = await prisma.user.findFirst({
    where: { tenantId: tenant.id, isActive: true },
  })
  if (!scanner) {
    console.error('No users found. Run the main seed first.')
    process.exit(1)
  }

  const TOTAL = 500
  console.log(`Creating ${TOTAL} test orders for tenant "${tenant.name}"...`)
  console.log(`  Carriers: ${CARRIERS.join(', ')}`)
  console.log(`  Shops: ${SHOP_NAMES.length} shops`)
  console.log(`  Delay levels: D0–D4 (100 each)\n`)

  let created = 0
  let skipped = 0

  for (let i = 0; i < TOTAL; i++) {
    const platform = randomFrom(PLATFORMS)
    const trackingNumber = generateTrackingNumber(platform)
    const carrierName = randomFrom(CARRIERS)
    const shopName = randomFrom(SHOP_NAMES)

    // Evenly distribute delay levels: D0=100, D1=100, D2=100, D3=100, D4=100
    const delayLevel = DELAY_LEVELS[i % DELAY_LEVELS.length]

    // Random creation time in the last 7 days
    const hoursAgo = randomInt(0, 7 * 24)
    const createdAt = new Date(Date.now() - hoursAgo * 60 * 60 * 1000)

    try {
      await prisma.order.create({
        data: {
          tenantId: tenant.id,
          trackingNumber,
          platform,
          carrierName,
          shopName,
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

  // Summary
  console.log('\n── Delay level summary ───────────────────────')
  console.log(`  D0 (no delay):  ~100 orders`)
  console.log(`  D1:             ~100 orders`)
  console.log(`  D2:             ~100 orders`)
  console.log(`  D3:             ~100 orders`)
  console.log(`  D4:             ~100 orders`)
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
