import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcrypt'

const prisma = new PrismaClient()

async function main() {
  // Tenant oluştur
  const tenant = await prisma.tenant.upsert({
    where: { slug: 'demo' },
    update: {},
    create: {
      name: 'Demo Şirket',
      slug: 'demo',
      isActive: true,
    },
  })
  console.log('✅ Tenant:', tenant.name)

  // Admin kullanıcı oluştur
  const passwordHash = await bcrypt.hash('admin123', 10)
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
  console.log('✅ Admin kullanıcı:', admin.username)

  console.log('\n🎉 Seed tamamlandı!')
  console.log('   Kullanıcı adı : admin')
  console.log('   Şifre         : admin123')
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
