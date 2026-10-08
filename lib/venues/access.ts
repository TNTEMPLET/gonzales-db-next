import {
  canAccessAdminModule,
  type AdminRole,
} from "@/lib/auth/adminRoles";

export type VenuesPageAccess = "ok" | "not_found" | "login" | "forbidden";

/**
 * Shared parks are a master-site page. A non-master deployment is not found,
 * even for a master admin, so league sites do not grow a second parks editor.
 * On the master site the VENUES module is Master Admin only.
 */
export function venuesPageAccess(input: {
  masterDeployment: boolean;
  authenticated: boolean;
  role: AdminRole | null;
}): VenuesPageAccess {
  if (!input.masterDeployment) return "not_found";
  if (!input.authenticated) return "login";
  if (
    !input.role ||
    !canAccessAdminModule(input.role, "VENUES", { masterDeployment: true })
  ) {
    return "forbidden";
  }
  return "ok";
}
