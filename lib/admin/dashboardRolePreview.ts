import type { AdminDashboardCardModule } from "@/lib/admin/dashboardModules";
import { canAccessAdminModule, type AdminModule } from "@/lib/auth/adminRoles";

export type DashboardRolePreview =
  | "NONE"
  | "ADMIN"
  | "BOARD_MEMBER"
  | "PARK_DIRECTOR"
  | "ALL_STAR_VIEW_ONLY";

/**
 * Role-preview filter for dashboard cards.
 * `masterMode` comes from the server page. The client must not read SITE_ORG:
 * that env value is not inlined in the browser bundle, so isMasterDeployment()
 * falls back to gonzales and hides master-only cards on the master site.
 */
export function canPreviewDashboardModule(
  previewRole: DashboardRolePreview,
  module: AdminDashboardCardModule,
  options: { masterMode: boolean; allStarVaultView: boolean },
): boolean {
  if (previewRole === "NONE") return true;
  if (previewRole === "ALL_STAR_VIEW_ONLY") {
    return module === "ALL_STAR_VAULT" && options.allStarVaultView;
  }
  if (module === "ALL_STAR_VAULT" && previewRole !== "ADMIN") {
    return false;
  }
  if (
    previewRole !== "ADMIN" &&
    previewRole !== "BOARD_MEMBER" &&
    previewRole !== "PARK_DIRECTOR"
  ) {
    return false;
  }
  return canAccessAdminModule(previewRole, module as AdminModule, {
    masterDeployment: options.masterMode,
  });
}

export function filterDashboardCardsForRolePreview<T extends { module: AdminDashboardCardModule }>(
  cards: readonly T[],
  previewRole: DashboardRolePreview,
  options: { masterMode: boolean; allStarVaultView: boolean },
): readonly T[] {
  if (previewRole === "NONE") return cards;
  return cards.filter((card) =>
    canPreviewDashboardModule(previewRole, card.module, options),
  );
}
