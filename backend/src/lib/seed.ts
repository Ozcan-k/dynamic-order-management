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
  const passwordHash = await bcrypt.hash('admin123', 12)
  const admin = await prisma.user.upsert({
    where: { tenantId_username: { tenantId: tenant.id, username: 'admin' } },
    update: {},
    create: {
      tenantId: tenant.id,
      username: 'admin',
      passwordHash,
      role: 'ADMIN',
      isActive: true,
    },
  })
  console.log(`Admin user: ${admin.username} (${admin.id})`)
  console.log('Seed complete. Login: admin / admin123')
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
