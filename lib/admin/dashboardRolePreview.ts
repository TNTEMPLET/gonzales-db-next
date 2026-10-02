import type { AdminDashboardCardModule } from "@/lib/admin/dashboardModules";
import { canAccessAdminModule, type AdminModule } from "@/lib/auth/adminRoles";

export type DashboardRolePreview =
  | "NONE"
  | "MASTER_ADMIN"
  | "ADMIN"
  | "BOARD_MEMBER"
  | "PARK_DIRECTOR"
  | "ALL_STAR_VIEW_ONLY";

export type DashboardRolePreviewOptions = {
  masterMode: boolean;
  allStarVaultView: boolean;
  /**
   * Server value of `isOrdersModuleEnabled()`. The preview runs in the browser
   * and must not read `ORDERS_ENABLED`. `false` keeps Orders cards hidden.
   */
  ordersModuleEnabled: boolean;
};

/**
 * Role-preview filter for dashboard cards.
 * `masterMode` and `ordersModuleEnabled` come from the server page. The client
 * must not read SITE_ORG or ORDERS_ENABLED: those env values are not inlined
 * in the browser bundle, so a missing flag falls back to off and hides cards
 * the server meant to show.
 */
export function canPreviewDashboardModule(
  previewRole: DashboardRolePreview,
  module: AdminDashboardCardModule,
  options: DashboardRolePreviewOptions,
): boolean {
  if (previewRole === "NONE") return true;
  if (previewRole === "ALL_STAR_VIEW_ONLY") {
    return module === "ALL_STAR_VAULT" && options.allStarVaultView;
  }
  if (
    module === "ALL_STAR_VAULT" &&
    previewRole !== "ADMIN" &&
    previewRole !== "MASTER_ADMIN"
  ) {
    return false;
  }
  if (
    previewRole !== "MASTER_ADMIN" &&
    previewRole !== "ADMIN" &&
    previewRole !== "BOARD_MEMBER" &&
    previewRole !== "PARK_DIRECTOR"
  ) {
    return false;
  }
  return canAccessAdminModule(previewRole, module as AdminModule, {
    masterDeployment: options.masterMode,
    ordersModuleEnabled: options.ordersModuleEnabled,
  });
}

export function filterDashboardCardsForRolePreview<T extends { module: AdminDashboardCardModule }>(
  cards: readonly T[],
  previewRole: DashboardRolePreview,
  options: DashboardRolePreviewOptions,
): readonly T[] {
  if (previewRole === "NONE") return cards;
  return cards.filter((card) =>
    canPreviewDashboardModule(previewRole, card.module, options),
  );
}
