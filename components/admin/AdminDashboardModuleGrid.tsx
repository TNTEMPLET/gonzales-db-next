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
import { resolvePreviewUserAccess, type PreviewUserSnapshot } from "@/lib/admin/viewPreview";
import { canAccessAdminModule, type AdminModule, type AdminRole } from "@/lib/auth/adminRoles";
import { CONTENT_ORGS, type ContentOrgId } from "@/lib/siteConfig";

type AdminDashboardCard = AdminDashboardCardDescriptor;

const previewRoleLabel: Record<AdminViewPreviewRole, string> = {
  NONE: "Live access",
  ADMIN: "Admin",
  BOARD_MEMBER: "Board Member",
  PARK_DIRECTOR: "Park Director",
  ALL_STAR_VIEW_ONLY: "All-Star Vault Limited Admin",
};

function asAdminModule(module: AdminDashboardCardModule): AdminModule {
  return module;
}

function previewRoleToAdminRole(previewRole: AdminViewPreviewRole): AdminRole | null {
  if (previewRole === "ADMIN" || previewRole === "BOARD_MEMBER" || previewRole === "PARK_DIRECTOR") {
    return previewRole;
  }
  return null;
}

function canPreviewAccessModule(
  previewRole: AdminViewPreviewRole,
  module: AdminDashboardCardModule,
  allStarVaultView: boolean,
) {
  if (previewRole === "NONE") return true;
  if (previewRole === "ALL_STAR_VIEW_ONLY") {
    return module === "ALL_STAR_VAULT" && allStarVaultView;
  }
  if (module === "ALL_STAR_VAULT" && previewRole !== "ADMIN") {
    return false;
  }
  const previewAs = previewRoleToAdminRole(previewRole);
  if (!previewAs) return false;
  return canAccessAdminModule(previewAs, asAdminModule(module));
}

function canPreviewUserAccessModule(
  user: PreviewUserSnapshot,
  module: AdminDashboardCardModule,
  organizationId: ContentOrgId | null,
) {
  const organizationIds: ContentOrgId[] = organizationId
    ? [organizationId]
    : [...CONTENT_ORGS];
  return organizationIds.some((orgId) => {
    const access = resolvePreviewUserAccess(user, orgId);
    if (module === "ALL_STAR_VAULT") return access.allStarVaultView;
    const previewAs =
      access.effectiveRole === "MASTER_ADMIN" ? "ADMIN" : access.effectiveRole;
    return canPreviewAccessModule(previewAs, module, access.allStarVaultView);
  });
}

export default function AdminDashboardModuleGrid({
  cards,
  masterMode,
  allowRolePreview,
  allStarVaultView,
  currentOrg = null,
}: {
  cards: AdminDashboardCard[];
  masterMode: boolean;
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
        canPreviewUserAccessModule(previewUser, card.module, currentOrg),
      );
    }
    return cards.filter((card) =>
      canPreviewAccessModule(previewRole, card.module, allStarVaultView),
    );
  }, [
    allowRolePreview,
    cards,
    previewRole,
    allStarVaultView,
    previewContext,
    currentOrg,
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
