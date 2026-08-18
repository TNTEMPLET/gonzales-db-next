import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import AdminSectionHeader from "@/components/admin/AdminSectionHeader";
import SurveyAnalyticsCard from "@/components/admin/surveys/SurveyAnalyticsCard";
import { canAccessAdminModule, hasAdminRoleAtLeast, type AdminRole } from "@/lib/auth/adminRoles";
import { ADMIN_SESSION_COOKIE, getAdminUserFromCookieToken } from "@/lib/auth/adminSession";
import { getEffectiveAdminRoleForOrg } from "@/lib/auth/effectiveAdminRole";
import { getSiteConfig, resolveAdminTargetOrg } from "@/lib/siteConfig";

export function generateMetadata() {
  const site = getSiteConfig();
  return {
    title: `Surveys | ${site.name}`,
    description: "Parent survey response analytics and public survey links.",
  };
}

export default async function AdminSurveysPage({
  searchParams,
}: {
  searchParams: Promise<{ org?: string }>;
}) {
  const { org } = await searchParams;
  const currentOrg = resolveAdminTargetOrg(org);
  const cookieStore = await cookies();
  const token = cookieStore.get(ADMIN_SESSION_COOKIE)?.value;
  const adminUser = await getAdminUserFromCookieToken(token);

  if (!adminUser) {
    redirect("/admin/login?next=/admin/surveys");
  }

  const effectiveRole = await getEffectiveAdminRoleForOrg(
    adminUser.id,
    adminUser.isMaster,
    currentOrg,
  );
  const role: AdminRole = effectiveRole ?? (adminUser.isMaster ? "MASTER_ADMIN" : "PARK_DIRECTOR");

  // Same module the survey admin API routes gate on (ensureAdminModule(request, "TEAMS"))
  // — keep this in sync with app/api/admin/surveys/*.
  if (!canAccessAdminModule(role, "TEAMS")) {
    redirect("/admin?denied=surveys");
  }

  return (
    <main className="min-h-screen bg-zinc-950 py-10 text-white sm:py-14">
      <section className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="mb-8">
          <AdminSectionHeader
            badge="SURVEYS"
            currentOrg={currentOrg}
            currentPath="/admin/surveys"
            allowRolePreview={hasAdminRoleAtLeast(role, "ADMIN")}
            allowViewByUser={adminUser.isMaster}
          />
          <h1 className="mb-3 text-4xl font-bold tracking-tight md:text-5xl">
            Survey Analytics
          </h1>
          <p className="max-w-3xl text-zinc-400">
            Parent survey response ratings, priority breakdowns, and the public share link for this organization&apos;s active survey.
          </p>
        </div>

        <Suspense
          fallback={
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 px-4 py-8 text-zinc-400">
              Loading survey analytics…
            </div>
          }
        >
          <SurveyAnalyticsCard organizationId={currentOrg} isMasterAdmin={adminUser.isMaster} />
        </Suspense>
      </section>
    </main>
  );
}
