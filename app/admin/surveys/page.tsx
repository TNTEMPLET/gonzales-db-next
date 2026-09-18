import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import AdminSectionHeader from "@/components/admin/AdminSectionHeader";
import SurveyDesk from "@/components/admin/surveys/SurveyDesk";
import { canAccessAdminModule, hasAdminRoleAtLeast, type AdminRole } from "@/lib/auth/adminRoles";
import { ADMIN_SESSION_COOKIE, getAdminUserFromCookieToken } from "@/lib/auth/adminSession";
import { getEffectiveAdminRoleForOrg } from "@/lib/auth/effectiveAdminRole";
import { getSeasonConfigForOrg } from "@/lib/seasonConfig";
import { getSiteConfig, resolveAdminTargetOrg } from "@/lib/siteConfig";

export function generateMetadata() {
  const site = getSiteConfig();
  return {
    title: `Surveys | ${site.name}`,
    description: "Create parent surveys, edit questions, and read responses.",
  };
}

export default async function AdminSurveysPage({
  searchParams,
}: {
  searchParams: Promise<{ org?: string; view?: string }>;
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

  if (!canAccessAdminModule(role, "TEAMS")) {
    redirect("/admin?denied=surveys");
  }

  const season = getSeasonConfigForOrg(currentOrg);
  const defaultSeason = currentOrg === "fallball" ? "FALL" : "SPRING";
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
          <h1 className="mb-3 text-4xl font-bold tracking-tight md:text-5xl">Surveys</h1>
          <p className="max-w-3xl text-zinc-400">
            Create a survey from the parent template, duplicate last season, or start blank. Edit, preview, then make it
            live and read responses here.
          </p>
        </div>

        <Suspense
          fallback={
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 px-4 py-8 text-zinc-400">
              Loading surveys…
            </div>
          }
        >
          <SurveyDesk
            organizationId={currentOrg}
            isMasterAdmin={adminUser.isMaster}
            defaultSeason={defaultSeason}
            defaultYear={season.year}
          />
        </Suspense>
      </section>
    </main>
  );
}
