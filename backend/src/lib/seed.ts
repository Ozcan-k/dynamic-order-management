import 'dotenv/config'
import bcrypt from 'bcrypt'
import { prisma } from './prisma'

async function main() {
  // Create default tenant
  const tenant = await prisma.tenant.upsert({
    where: { slug: 'default' },
    update: {},
    create: {
      name: 'Default Warehouse',
      slug: 'default',
      isActive: true,
    },
  })
  console.log(`Tenant: ${tenant.name} (${tenant.id})`)

  // Create admin user
  const adminHash = await bcrypt.hash('admin123', 12)
  const admin = await prisma.user.upsert({
    where: { tenantId_username: { tenantId: tenant.id, username: 'admin' } },
    update: {},
    create: {
      tenantId: tenant.id,
      username: 'admin',
      passwordHash: adminHash,
      role: 'ADMIN',
      isActive: true,
    },
  })
  console.log(`Admin user: ${admin.username} (${admin.id})`)

  // Create 10 picker users
  const pickerHash = await bcrypt.hash('picker123', 12)
  for (let i = 1; i <= 10; i++) {
    const username = `Picker ${i}`
    const picker = await prisma.user.upsert({
      where: { tenantId_username: { tenantId: tenant.id, username } },
      update: {},
      create: {
        tenantId: tenant.id,
        username,
        passwordHash: pickerHash,
        role: 'PICKER',
        isActive: true,
      },
    })
    console.log(`Picker user: ${picker.username} (${picker.id})`)
  }

  console.log('\nSeed complete.')
  console.log('  Admin login  : admin / admin123')
  console.log('  Picker login : Picker 1..10 / picker123')
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
