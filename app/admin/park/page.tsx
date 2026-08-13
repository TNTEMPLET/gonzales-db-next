import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import AdminSectionHeader from "@/components/admin/AdminSectionHeader";
import ParkHub, { type ParkTab } from "@/components/admin/park/ParkHub";
import { canAccessAdminModule, hasAdminRoleAtLeast, type AdminRole } from "@/lib/auth/adminRoles";
import { ADMIN_SESSION_COOKIE, getAdminUserFromCookieToken } from "@/lib/auth/adminSession";
import { getEffectiveAdminRoleForOrg } from "@/lib/auth/effectiveAdminRole";
import { getSiteConfig, resolveAdminTargetOrg } from "@/lib/siteConfig";

export function generateMetadata() {
  const site = getSiteConfig();
  return {
    title: `Park & Tournaments | ${site.name}`,
    description: "Brackets, tournament monitors, rainout alerts, and field rules.",
  };
}

export default async function ParkPage({
  searchParams,
}: {
  searchParams: Promise<{ org?: string; tab?: string }>;
}) {
  const { org, tab: tabParam } = await searchParams;
  const currentOrg = resolveAdminTargetOrg(org);
  const cookieStore = await cookies();
  const token = cookieStore.get(ADMIN_SESSION_COOKIE)?.value;
  const adminUser = await getAdminUserFromCookieToken(token);

  if (!adminUser) {
    redirect("/admin/login?next=/admin/park");
  }

  const effectiveRole = await getEffectiveAdminRoleForOrg(
    adminUser.id,
    adminUser.isMaster,
    currentOrg,
  );
  const role: AdminRole = effectiveRole ?? (adminUser.isMaster ? "MASTER_ADMIN" : "PARK_DIRECTOR");

  const canBrackets = canAccessAdminModule(role, "TOURNAMENT_BRACKETS");
  const canAlerts = canAccessAdminModule(role, "PARK_ALERTS") || canAccessAdminModule(role, "TOURNAMENT_ALERTS");
  const canParkInfo = canAccessAdminModule(role, "PARK_INFO");

  if (!canBrackets && !canAlerts && !canParkInfo) {
    redirect("/admin?denied=park");
  }

  const initialTab: ParkTab = (tabParam as ParkTab) || "brackets";

  return (
    <main className="min-h-screen bg-zinc-950 py-10 text-white sm:py-14">
      <section className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="mb-8">
          <AdminSectionHeader
            badge="PARK & TOURNAMENTS"
            currentOrg={currentOrg}
            currentPath={`/admin/park?tab=${initialTab}`}
            allowRolePreview={hasAdminRoleAtLeast(role, "ADMIN")}
            allowViewByUser={adminUser.isMaster}
          />
          <h1 className="mb-3 text-4xl font-bold tracking-tight md:text-5xl">
            Park & Tournament Operations
          </h1>
          <p className="max-w-3xl text-zinc-400">
            Build tournament brackets, monitor alert provider readiness, issue park rainouts, and update park rules and layouts from one hub.
          </p>
        </div>

        <Suspense
          fallback={
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 px-4 py-8 text-zinc-400">
              Loading park hub…
            </div>
          }
        >
          <ParkHub
            targetOrg={currentOrg}
            initialTab={initialTab}
            isMaster={adminUser.isMaster || role === "MASTER_ADMIN"}
          />
        </Suspense>
      </section>
    </main>
  );
}
