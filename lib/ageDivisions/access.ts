import { hasAdminRoleAtLeast, type AdminRole } from "@/lib/auth/adminRoles";

export const DIVISION_AGES_WRITE_DENIED = "Division ages editing requires an admin.";

export type DivisionAgesAuth =
  | { ok: true; role: AdminRole }
  | { ok: false; status: number; message: string };

/**
 * Module access is checked by `ensureAdminModule(..., "DIVISION_AGES")`.
 * Writes also require ADMIN so a later view-only widening of the key cannot
 * open editing.
 */
export function gateDivisionAges(
  auth: DivisionAgesAuth,
  write: boolean,
): { ok: true } | { ok: false; status: number; message: string } {
  if (!auth.ok) return { ok: false, status: auth.status, message: auth.message };
  if (write && !hasAdminRoleAtLeast(auth.role, "ADMIN")) {
    return { ok: false, status: 403, message: DIVISION_AGES_WRITE_DENIED };
  }
  return { ok: true };
}
