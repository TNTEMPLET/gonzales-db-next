/**
 * Server-side volunteer role catalog (Master Admin CRUD).
 */

import prisma from "@/lib/prisma";

import { FALLBACK_VOLUNTEER_ROLES, validateRoleKey } from "./types";

export type VolunteerRoleDefRow = {
  id: string;
  key: string;
  label: string;
  description: string | null;
  isActive: boolean;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
};

export async function ensureDefaultRoleDefs() {
  const count = await prisma.volunteerRoleDef.count();
  if (count > 0) return;
  for (const r of FALLBACK_VOLUNTEER_ROLES) {
    await prisma.volunteerRoleDef.upsert({
      where: { key: r.key },
      create: {
        key: r.key,
        label: r.label,
        isActive: true,
        sortOrder: r.sortOrder,
      },
      update: {},
    });
  }
}

export async function listRoleDefs(includeInactive = false): Promise<VolunteerRoleDefRow[]> {
  await ensureDefaultRoleDefs();
  return prisma.volunteerRoleDef.findMany({
    where: includeInactive ? undefined : { isActive: true },
    orderBy: [{ sortOrder: "asc" }, { label: "asc" }],
  });
}

export async function getRoleLabelMap(
  includeInactive = true,
): Promise<Map<string, string>> {
  const rows = await listRoleDefs(includeInactive);
  return new Map(rows.map((r) => [r.key, r.label]));
}

export async function assertRoleKeyActive(roleKey: string): Promise<string> {
  await ensureDefaultRoleDefs();
  const row = await prisma.volunteerRoleDef.findUnique({ where: { key: roleKey } });
  if (!row) throw new Error(`Unknown volunteer role: ${roleKey}`);
  if (!row.isActive) throw new Error(`Volunteer role is inactive: ${roleKey}`);
  return row.key;
}

export async function createRoleDef(input: {
  key?: string;
  label: string;
  description?: string | null;
  isActive?: boolean;
  sortOrder?: number;
  createdByAdminId?: string | null;
}) {
  const label = input.label.trim();
  if (!label) throw new Error("Label is required");

  let key: string;
  if (input.key?.trim()) {
    const v = validateRoleKey(input.key);
    if (!v.ok) throw new Error(v.error);
    key = v.key;
  } else {
    const v = validateRoleKey(label);
    if (!v.ok) throw new Error(v.error);
    key = v.key;
  }

  const existing = await prisma.volunteerRoleDef.findUnique({ where: { key } });
  if (existing) throw new Error("That role key already exists");

  const sortOrder =
    typeof input.sortOrder === "number" && Number.isFinite(input.sortOrder)
      ? Math.trunc(input.sortOrder)
      : ((await prisma.volunteerRoleDef.aggregate({ _max: { sortOrder: true } }))._max
          .sortOrder ?? 0) + 10;

  return prisma.volunteerRoleDef.create({
    data: {
      key,
      label,
      description: input.description?.trim() || null,
      isActive: input.isActive === false ? false : true,
      sortOrder,
      createdByAdminId: input.createdByAdminId ?? null,
    },
  });
}

export async function updateRoleDef(
  id: string,
  input: {
    label?: string;
    description?: string | null;
    isActive?: boolean;
    sortOrder?: number;
  },
) {
  const existing = await prisma.volunteerRoleDef.findUnique({ where: { id } });
  if (!existing) throw new Error("Role not found");

  return prisma.volunteerRoleDef.update({
    where: { id },
    data: {
      ...(input.label !== undefined ? { label: input.label.trim() || existing.label } : {}),
      ...(input.description !== undefined
        ? { description: input.description?.trim() || null }
        : {}),
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      ...(input.sortOrder !== undefined && Number.isFinite(input.sortOrder)
        ? { sortOrder: Math.trunc(input.sortOrder) }
        : {}),
    },
  });
}

export async function deleteRoleDef(id: string) {
  const existing = await prisma.volunteerRoleDef.findUnique({ where: { id } });
  if (!existing) throw new Error("Role not found");

  const inUse = await prisma.volunteerRoleAssignment.count({
    where: { roleKey: existing.key },
  });
  if (inUse > 0) {
    // Soft-delete so assignments keep a valid FK
    return prisma.volunteerRoleDef.update({
      where: { id },
      data: { isActive: false },
    });
  }

  return prisma.volunteerRoleDef.delete({ where: { id } });
}
