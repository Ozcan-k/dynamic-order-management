import bcrypt from 'bcrypt'
import { prisma } from '../lib/prisma'

export async function findUserByUsername(username: string, tenantId?: string) {
  return prisma.user.findFirst({
    where: {
      username,
      isActive: true,
      ...(tenantId ? { tenantId } : {}),
    },
    include: { tenant: true },
  })
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash)
}
