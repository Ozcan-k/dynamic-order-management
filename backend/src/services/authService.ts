import bcrypt from 'bcrypt'
import { UserRole } from '@dom/shared'
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

export async function findPickerByPin(pin: string) {
  return prisma.user.findFirst({
    where: { pickerPin: pin, role: UserRole.PICKER, isActive: true },
    include: { tenant: { select: { isActive: true } } },
  })
}

export async function findPackerByPin(pin: string) {
  return prisma.user.findFirst({
    where: { packerPin: pin, role: UserRole.PACKER, isActive: true },
    include: { tenant: { select: { isActive: true } } },
  })
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash)
}
