import { z } from "zod";

import {
  VOLUNTEER_REQUIREMENT_KEYS,
  VOLUNTEER_REQUIREMENT_STATUSES,
} from "@/lib/volunteers/types";

export const volunteerRequirementPatchSchema = z.object({
  status: z.enum(VOLUNTEER_REQUIREMENT_STATUSES).optional(),
  completedAt: z.union([z.string(), z.null()]).optional(),
  expiresAt: z.union([z.string(), z.null()]).optional(),
  externalRef: z.union([z.string(), z.null()]).optional(),
  notes: z.union([z.string(), z.null()]).optional(),
});

export const volunteerRoleCreateSchema = z.object({
  key: z.string().trim().min(1).max(80).optional(),
  label: z.string().trim().min(1).max(120),
  description: z.union([z.string().max(2000), z.null()]).optional(),
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
});

export const volunteerRoleUpdateSchema = z.object({
  label: z.string().trim().min(1).max(120).optional(),
  description: z.union([z.string().max(2000), z.null()]).optional(),
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
});

export function isVolunteerRequirementKey(
  value: string,
): value is (typeof VOLUNTEER_REQUIREMENT_KEYS)[number] {
  return (VOLUNTEER_REQUIREMENT_KEYS as readonly string[]).includes(value);
}
