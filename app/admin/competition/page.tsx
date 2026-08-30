import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import AdminSectionHeader from "@/components/admin/AdminSectionHeader";
import CompetitionHub, { type CompetitionTab } from "@/components/admin/competition/CompetitionHub";
import { canAccessAdminModule, hasAdminRoleAtLeast, type AdminRole } from "@/lib/auth/adminRoles";
import { ADMIN_SESSION_COOKIE, getAdminUserFromCookieToken } from "@/lib/auth/adminSession";
import { getEffectiveAdminRoleForOrg } from "@/lib/auth/effectiveAdminRole";
import { getSiteConfig, resolveAdminTargetOrg } from "@/lib/siteConfig";

export function generateMetadata() {
  const site = getSiteConfig();
  return {
    title: `Competition & Play | ${site.name}`,
    description: "Teams, scores, scheduler, Assignr umpires, registration import, enrollment KPIs, and registration windows.",
  };
}

export default async function CompetitionPage({
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
    redirect("/admin/login?next=/admin/competition");
  }

  const effectiveRole = await getEffectiveAdminRoleForOrg(
    adminUser.id,
    adminUser.isMaster,
    currentOrg,
  );
  const role: AdminRole = effectiveRole ?? (adminUser.isMaster ? "MASTER_ADMIN" : "PARK_DIRECTOR");

  const canTeams = canAccessAdminModule(role, "TEAMS");
  const canDraft = canAccessAdminModule(role, "DRAFT");
  const canScores = canAccessAdminModule(role, "SCORES");
  const canAssignr = canAccessAdminModule(role, "ASSIGNR");
  const canRegistration = canAccessAdminModule(role, "REGISTRATION_WINDOWS");
  const canEnrollment = canAccessAdminModule(role, "ENROLLMENT_KPI");

  if (!canTeams && !canDraft && !canScores && !canAssignr && !canRegistration && !canEnrollment) {
    redirect("/admin?denied=competition");
  }

  const initialTab: CompetitionTab = (tabParam as CompetitionTab) || "teams";

  return (
    <main className="min-h-screen bg-zinc-950 py-10 text-white sm:py-14">
      <section className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="mb-8">
          <AdminSectionHeader
            badge="COMPETITION & PLAY"
            currentOrg={currentOrg}
            currentPath={`/admin/competition?tab=${initialTab}`}
            allowRolePreview={hasAdminRoleAtLeast(role, "ADMIN")}
            allowViewByUser={adminUser.isMaster}
          />
          <h1 className="mb-3 text-4xl font-bold tracking-tight md:text-5xl">
            Competition & Play Hub
          </h1>
          <p className="max-w-3xl text-zinc-400">
            Import registration data, manage teams and rosters, view enrollment KPIs, enter scores, run the season scheduler, assign Assignr umpires, and configure registration windows in one workspace.
          </p>
        </div>

        <Suspense
          fallback={
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 px-4 py-8 text-zinc-400">
              Loading competition hub…
            </div>
          }
        >
          <CompetitionHub
            targetOrg={currentOrg}
            initialTab={initialTab}
            isMaster={adminUser.isMaster || role === "MASTER_ADMIN"}
          />
        </Suspense>
      </section>
    </main>
  );
}
