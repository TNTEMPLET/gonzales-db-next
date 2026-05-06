"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import {
  readAdminViewPreviewContext,
  readAdminViewPreviewRole,
  type AdminViewPreviewRole,
} from "@/components/admin/AdminRolePreviewControl";
import type { AdminModule } from "@/lib/auth/adminRoles";

type AdminDashboardCard = {
  module: AdminModule;
  href: string;
  title: string;
  description: string;
  action: string;
};

const moduleMinimumRole: Record<AdminModule, "MASTER_ADMIN" | "ADMIN" | "BOARD_MEMBER" | "PARK_DIRECTOR"> = {
  DASHBOARD: "PARK_DIRECTOR",
  USERS: "ADMIN",
  TEAMS: "ADMIN",
  SPONSORS: "ADMIN",
  REPORTS: "PARK_DIRECTOR",
  SCORES: "BOARD_MEMBER",
  DUGOUT_MODERATION: "BOARD_MEMBER",
  NEWS_ADMIN: "BOARD_MEMBER",
  ALL_STAR_VAULT: "ADMIN",
  COMMUNICATIONS: "ADMIN",
  SOCIAL_MEDIA: "BOARD_MEMBER",
  ORG_DOCUMENTS: "BOARD_MEMBER",
};

const roleRank: Record<"MASTER_ADMIN" | "ADMIN" | "BOARD_MEMBER" | "PARK_DIRECTOR", number> = {
  MASTER_ADMIN: 5,
  ADMIN: 4,
  BOARD_MEMBER: 3,
  PARK_DIRECTOR: 2,
};

const masterOnlyModules = new Set<AdminModule>([
  "SPONSORS",
  "NEWS_ADMIN",
  "SOCIAL_MEDIA",
  "ORG_DOCUMENTS",
]);

const previewRoleLabel: Record<AdminViewPreviewRole, string> = {
  NONE: "Live access",
  ADMIN: "Admin",
  BOARD_MEMBER: "Board Member",
  PARK_DIRECTOR: "Park Director",
  ALL_STAR_VIEW_ONLY: "All-Star Vault View-Only",
};

function canPreviewAccessModule(
  previewRole: AdminViewPreviewRole,
  module: AdminModule,
  masterMode: boolean,
  allStarVaultView: boolean,
) {
  if (previewRole === "NONE") return true;
  if (previewRole === "ALL_STAR_VIEW_ONLY") {
    return module === "ALL_STAR_VAULT" && allStarVaultView;
  }
  if (module === "ALL_STAR_VAULT" && previewRole !== "ADMIN") {
    return false;
  }
  if (masterOnlyModules.has(module) && !masterMode) {
    return false;
  }
  const previewAs =
    previewRole === "ADMIN"
      ? "ADMIN"
      : previewRole === "BOARD_MEMBER"
        ? "BOARD_MEMBER"
        : "PARK_DIRECTOR";
  return roleRank[previewAs] >= roleRank[moduleMinimumRole[module]];
}

export default function AdminDashboardModuleGrid({
  cards,
  masterMode,
  allowRolePreview,
  allStarVaultView,
}: {
  cards: AdminDashboardCard[];
  masterMode: boolean;
  allowRolePreview: boolean;
  allStarVaultView: boolean;
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
      setPreviewRole(readAdminViewPreviewRole());
      setPreviewContext(readAdminViewPreviewContext());
    };
    sync();
    window.addEventListener("admin-view-preview-updated", sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener("admin-view-preview-updated", sync);
      window.removeEventListener("storage", sync);
    };
  }, [allowRolePreview]);

  const visibleCards = useMemo(() => {
    if (!allowRolePreview || previewRole === "NONE") return cards;
    if (previewContext.mode === "user" && previewContext.user) {
      return cards.filter((card) => {
        if (card.module === "ALL_STAR_VAULT") return previewContext.user.allStarVaultView;
        return canPreviewAccessModule(
          previewContext.user.effectiveRole === "MASTER_ADMIN"
            ? "ADMIN"
            : previewContext.user.effectiveRole,
          card.module,
          masterMode,
          previewContext.user.allStarVaultView,
        );
      });
    }
    return cards.filter((card) =>
      canPreviewAccessModule(previewRole, card.module, masterMode, allStarVaultView),
    );
  }, [allowRolePreview, cards, masterMode, previewRole, allStarVaultView, previewContext]);

  if (visibleCards.length === 0) {
    return (
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4 text-sm text-zinc-300">
        No modules available for this preview role.
      </div>
    );
  }

  return (
    <div className="space-y-3">
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
      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
        {visibleCards.map((card) => (
          <article
            key={card.href}
            className={`rounded-3xl border p-6 ${
              masterMode
                ? "border-zinc-800 bg-[linear-gradient(180deg,rgba(24,24,27,0.9),rgba(9,9,11,0.95))] shadow-[0_18px_50px_rgba(0,0,0,0.18)]"
                : "border-zinc-800 bg-zinc-900/70"
            }`}
          >
            <div className="mb-3 inline-flex rounded-full border border-zinc-700 px-3 py-1 text-[10px] uppercase tracking-[0.22em] text-zinc-400">
              {masterMode ? "Control Module" : "Admin"}
            </div>
            <h2 className="text-2xl font-semibold mb-2">{card.title}</h2>
            <p className="text-zinc-400 text-sm mb-5">{card.description}</p>
            <Link
              href={card.href}
              className={`inline-block text-sm font-semibold ${
                masterMode
                  ? "text-red-100 hover:text-red-50"
                  : "text-brand-gold hover:text-brand-gold/80"
              }`}
            >
              {card.action}
            </Link>
          </article>
        ))}
      </div>
    </div>
  );
}
