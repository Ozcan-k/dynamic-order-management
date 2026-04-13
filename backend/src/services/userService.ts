import bcrypt from 'bcrypt'
import { z } from 'zod'
import { prisma } from '../lib/prisma'
import { UserRole, OrderStatus } from '@dom/shared'

export const CreateUserSchema = z.object({
  username: z.string().min(3).max(50),
  password: z.string().min(6).max(100),
  role: z.nativeEnum(UserRole),
  email: z.string().email().optional().nullable(),
})

export const UpdateUserSchema = z.object({
  username: z.string().min(3).max(50).optional(),
  password: z.string().min(6).max(100).optional(),
  role: z.nativeEnum(UserRole).optional(),
  isActive: z.boolean().optional(),
  email: z.string().email().optional().nullable(),
})

export type CreateUserInput = z.infer<typeof CreateUserSchema>
export type UpdateUserInput = z.infer<typeof UpdateUserSchema>

export async function listUsers(tenantId: string) {
  return prisma.user.findMany({
    where: { tenantId },
    select: {
      id: true,
      username: true,
      role: true,
      isActive: true,
      email: true,
      createdAt: true,
      createdBy: { select: { id: true, username: true } },
    },
    orderBy: { createdAt: 'asc' },
  })
}

export async function createUser(
  tenantId: string,
  createdById: string,
  input: CreateUserInput,
) {
  const existing = await prisma.user.findUnique({
    where: { tenantId_username: { tenantId, username: input.username } },
  })
  if (existing) {
    throw new Error(`Username "${input.username}" already exists in this tenant`)
  }

  const passwordHash = await bcrypt.hash(input.password, 12)
  return prisma.user.create({
    data: {
      tenantId,
      username: input.username,
      passwordHash,
      role: input.role,
      createdById,
      email: input.email ?? null,
    },
    select: {
      id: true,
      username: true,
      role: true,
      isActive: true,
      createdAt: true,
    },
  })
}

export async function deleteUser(tenantId: string, userId: string, adminId: string) {
  const user = await prisma.user.findFirst({ where: { id: userId, tenantId } })
  if (!user) throw new Error('User not found')

  return prisma.$transaction(async (tx) => {
    const updated = await tx.user.update({
      where: { id: userId },
      data: { isActive: false },
      select: { id: true, username: true, role: true, isActive: true },
    })

    if (user.role === UserRole.PICKER) {
      const assignments = await tx.pickerAssignment.findMany({
        where: { pickerId: userId, completedAt: null },
        select: { orderId: true },
      })
      const orderIds = assignments.map((a) => a.orderId)
      if (orderIds.length > 0) {
        await tx.order.updateMany({
          where: { id: { in: orderIds } },
          data: { status: OrderStatus.INBOUND },
        })
        await tx.orderStatusHistory.createMany({
          data: orderIds.map((orderId) => ({
            orderId,
            fromStatus: null,
            toStatus: OrderStatus.INBOUND,
            changedById: adminId,
          })),
        })
      }
    }

    if (user.role === UserRole.PACKER) {
      const assignments = await tx.packerAssignment.findMany({
        where: { packerId: userId, completedAt: null },
        select: { orderId: true },
      })
      const orderIds = assignments.map((a) => a.orderId)
      if (orderIds.length > 0) {
        await tx.order.updateMany({
          where: { id: { in: orderIds } },
          data: { status: OrderStatus.PICKER_COMPLETE },
        })
        await tx.orderStatusHistory.createMany({
          data: orderIds.map((orderId) => ({
            orderId,
            fromStatus: null,
            toStatus: OrderStatus.PICKER_COMPLETE,
            changedById: adminId,
          })),
        })
      }
    }

    return updated
  })
}

export async function updateUser(
  tenantId: string,
  userId: string,
  input: UpdateUserInput,
) {
  // Verify the user belongs to this tenant
  const user = await prisma.user.findFirst({
    where: { id: userId, tenantId },
  })
  if (!user) {
    throw new Error('User not found')
  }

  const data: Record<string, unknown> = {}
  if (input.username) data.username = input.username
  if (input.role) data.role = input.role
  if (typeof input.isActive === 'boolean') data.isActive = input.isActive
  if (input.password) {
    data.passwordHash = await bcrypt.hash(input.password, 12)
  }
  if ('email' in input) data.email = input.email ?? null

  return prisma.user.update({
    where: { id: userId },
    data,
    select: {
      id: true,
      username: true,
      role: true,
      isActive: true,
      createdAt: true,
    },
  })
}
