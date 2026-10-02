"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import {
  readAdminViewPreviewContext,
  readAdminViewPreviewRole,
  type AdminViewPreviewRole,
} from "@/components/admin/AdminRolePreviewControl";
import {
  ADMIN_DASHBOARD_CATEGORY_META,
  groupAdminDashboardCards,
  type AdminDashboardCardDescriptor,
} from "@/lib/admin/dashboardModules";
import type { AdminDashboardCardModule } from "@/lib/admin/dashboardModules";
import {
  canPreviewDashboardModule,
  type DashboardRolePreview,
} from "@/lib/admin/dashboardRolePreview";
import { resolvePreviewUserAccess, type PreviewUserSnapshot } from "@/lib/admin/viewPreview";
import { CONTENT_ORGS, type ContentOrgId } from "@/lib/siteConfig";

type AdminDashboardCard = AdminDashboardCardDescriptor;

const previewRoleLabel: Record<AdminViewPreviewRole, string> = {
  NONE: "Live access",
  ADMIN: "Admin",
  BOARD_MEMBER: "Board Member",
  PARK_DIRECTOR: "Park Director",
  ALL_STAR_VIEW_ONLY: "All-Star Vault Limited Admin",
};

function canPreviewUserAccessModule(
  user: PreviewUserSnapshot,
  module: AdminDashboardCardModule,
  organizationId: ContentOrgId | null,
  masterMode: boolean,
  ordersModuleEnabled: boolean,
) {
  const organizationIds: ContentOrgId[] = organizationId
    ? [organizationId]
    : [...CONTENT_ORGS];
  return organizationIds.some((orgId) => {
    const access = resolvePreviewUserAccess(user, orgId);
    if (module === "ALL_STAR_VAULT") return access.allStarVaultView;
    // A master user keeps the Admin card set, except Orders follows the server
    // switch. Collapsing the whole preview to Admin would hide those cards
    // even after ORDERS_ENABLED is turned on.
    if (access.effectiveRole === "MASTER_ADMIN" && module === "ORDERS") {
      return canPreviewDashboardModule("MASTER_ADMIN", module, {
        masterMode,
        allStarVaultView: access.allStarVaultView,
        ordersModuleEnabled,
      });
    }
    const previewAs: DashboardRolePreview =
      access.effectiveRole === "MASTER_ADMIN" ? "ADMIN" : access.effectiveRole;
    return canPreviewDashboardModule(previewAs, module, {
      masterMode,
      allStarVaultView: access.allStarVaultView,
      ordersModuleEnabled,
    });
  });
}

export default function AdminDashboardModuleGrid({
  cards,
  masterMode,
  ordersModuleEnabled,
  allowRolePreview,
  allStarVaultView,
  currentOrg = null,
}: {
  cards: AdminDashboardCard[];
  masterMode: boolean;
  /** Server value of `isOrdersModuleEnabled()`. Do not read `ORDERS_ENABLED` here. */
  ordersModuleEnabled: boolean;
  allowRolePreview: boolean;
  allStarVaultView: boolean;
  currentOrg?: ContentOrgId | null;
}) {
  const [previewRole, setPreviewRole] = useState<AdminViewPreviewRole>("NONE");
  const [previewContext, setPreviewContext] = useState<ReturnType<typeof readAdminViewPreviewContext>>({
    mode: "role",
    role: "NONE",
    user: null,
  });

  useEffect(() => {
    if (!allowRolePreview) return;
    const sync = () => {
      setPreviewRole(readAdminViewPreviewRole(currentOrg));
      setPreviewContext(readAdminViewPreviewContext());
    };
    sync();
    window.addEventListener("admin-view-preview-updated", sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener("admin-view-preview-updated", sync);
      window.removeEventListener("storage", sync);
    };
  }, [allowRolePreview, currentOrg]);

  const visibleCards = useMemo(() => {
    if (!allowRolePreview || previewRole === "NONE") return cards;
    if (previewContext.mode === "user" && previewContext.user) {
      const previewUser = previewContext.user;
      return cards.filter((card) =>
        canPreviewUserAccessModule(
          previewUser,
          card.module,
          currentOrg,
          masterMode,
          ordersModuleEnabled,
        ),
      );
    }
    return cards.filter((card) =>
      canPreviewDashboardModule(previewRole, card.module, {
        masterMode,
        allStarVaultView,
        ordersModuleEnabled,
      }),
    );
  }, [
    allowRolePreview,
    cards,
    previewRole,
    allStarVaultView,
    previewContext,
    currentOrg,
    masterMode,
    ordersModuleEnabled,
  ]);

  const groupedCards = useMemo(
    () => groupAdminDashboardCards(visibleCards),
    [visibleCards],
  );

  if (visibleCards.length === 0) {
    return (
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4 text-sm text-zinc-300">
        No modules available for this preview role.
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <h2 className="text-xl font-semibold tracking-tight text-white sm:text-2xl">
          {masterMode ? "Control modules" : "Admin modules"}
        </h2>
        <p className="max-w-3xl text-sm text-zinc-400">
          {masterMode
            ? "Open the administrative surface for each operational area, grouped by how work is organized across AP Baseball."
            : "Open the administrative tools available for your organization."}
        </p>
      </div>

      {allowRolePreview ? (
        <div className="text-xs text-zinc-400">
          Previewing module access as{" "}
          <span className="font-semibold text-zinc-200">
            {previewContext.mode === "user" && previewContext.user
              ? previewContext.user.label
              : previewRoleLabel[previewRole]}
          </span>
          .
        </div>
      ) : null}

      <div className="space-y-8">
        {groupedCards.map((group) => {
          const categoryMeta = ADMIN_DASHBOARD_CATEGORY_META[group.category];

          return (
            <section key={group.category} className="space-y-4">
              <div className="space-y-1">
                <h3 className="text-[11px] font-semibold uppercase tracking-[0.28em] text-zinc-500">
                  {categoryMeta.label}
                </h3>
                <p className="text-sm text-zinc-400">{categoryMeta.description}</p>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 sm:gap-4 xl:grid-cols-3">
                {group.cards.map((card) => (
                  <article
                    key={card.href}
                    className={`rounded-2xl border p-4 ${
                      masterMode
                        ? "border-zinc-800 bg-[linear-gradient(180deg,rgba(24,24,27,0.9),rgba(9,9,11,0.95))] shadow-[0_12px_36px_rgba(0,0,0,0.16)]"
                        : "border-zinc-800 bg-zinc-900/70"
                    }`}
                  >
                    <h4 className="text-base font-semibold text-white sm:text-lg">{card.title}</h4>
                    <p className="mt-2 line-clamp-2 text-sm text-zinc-400">
                      {card.description}
                    </p>
                    {card.comingSoon ? (
                      <span className="mt-4 inline-block text-sm font-semibold text-zinc-500">
                        {card.action}
                      </span>
                    ) : (
                      <Link
                        href={card.href}
                        className={`mt-4 inline-flex min-h-10 items-center text-sm font-semibold ${
                          masterMode
                            ? "text-red-100 hover:text-red-50"
                            : "text-brand-gold hover:text-brand-gold/80"
                        }`}
                      >
                        {card.action}
                      </Link>
                    )}
                  </article>
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
