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
  /** v2.86.0 — Employee Schedule ID to link this picker/packer to; null = unlink. */
  employeeNo: z.number().int().min(1).max(99999).nullable().optional(),
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
      empEmployee: { select: { empNo: true } },
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

  if (existing && existing.isActive) {
    throw new Error(`Username "${input.username}" already exists in this tenant`)
  }

  const passwordHash = await bcrypt.hash(input.password, 12)

  // Reactivate a previously soft-deleted user so the username slot is reusable.
  // Preserves user.id so historical assignments/reports stay linked.
  if (existing && !existing.isActive) {
    return prisma.user.update({
      where: { id: existing.id },
      data: {
        passwordHash,
        role: input.role,
        email: input.email ?? null,
        isActive: true,
        createdById,
        createdAt: new Date(),
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
        // Remove orphaned incomplete assignments so they don't accumulate
        await tx.pickerAssignment.deleteMany({
          where: { pickerId: userId, completedAt: null },
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
        await tx.packerAssignment.deleteMany({
          where: { packerId: userId, completedAt: null },
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

  // v2.86.0 — the Employee ID sets the same EmpEmployee.userId link that the
  // Employee Schedule "Linked system user" dropdown edits (single source of truth).
  let linkTarget: { id: string } | null | undefined // undefined = leave link unchanged
  if (input.employeeNo !== undefined) {
    if (input.employeeNo === null) {
      linkTarget = null
    } else {
      const role = input.role ?? user.role
      if (role !== UserRole.PICKER && role !== UserRole.PACKER) {
        throw new Error('Only picker and packer accounts can be linked to an employee')
      }
      const emp = await prisma.empEmployee.findFirst({
        where: { tenantId, empNo: input.employeeNo },
        select: { id: true, isActive: true, userId: true, user: { select: { username: true } } },
      })
      if (!emp) throw new Error(`Employee ID ${input.employeeNo} not found in Employee Schedule`)
      if (!emp.isActive) throw new Error(`Employee ID ${input.employeeNo} is marked as left the company`)
      if (emp.userId && emp.userId !== userId) {
        throw new Error(`Employee ID ${input.employeeNo} is already linked to ${emp.user?.username ?? 'another user'}`)
      }
      linkTarget = { id: emp.id }
    }
  }

  return prisma.$transaction(async (tx) => {
    const updated = await tx.user.update({
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
    if (linkTarget !== undefined) {
      // userId is unique on emp_employees — drop the old link before setting the new one
      await tx.empEmployee.updateMany({
        where: { tenantId, userId, ...(linkTarget ? { NOT: { id: linkTarget.id } } : {}) },
        data: { userId: null },
      })
      if (linkTarget) await tx.empEmployee.update({ where: { id: linkTarget.id }, data: { userId } })
    }
    return updated
  })
}
