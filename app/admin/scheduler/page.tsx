import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { canAccessAdminModule, hasAdminRoleAtLeast, toAdminRole } from "@/lib/auth/adminRoles";
import { getEffectiveAdminRoleForOrg } from "@/lib/auth/effectiveAdminRole";
import {
  ADMIN_SESSION_COOKIE,
  getAdminUserFromCookieToken,
} from "@/lib/auth/adminSession";
import AdminSectionHeader from "@/components/admin/AdminSectionHeader";
import AdminSchedulerManager from "@/components/admin/AdminSchedulerManager";
import { getSiteConfig, resolveAdminTargetOrg } from "@/lib/siteConfig";

export function generateMetadata() {
  const site = getSiteConfig();
  return {
    title: `Scheduler | ${site.name}`,
    description: "Build Fall Ball schedules, review draft conflicts, and export CSV files.",
  };
}

export default async function AdminSchedulerPage({
  searchParams,
}: {
  searchParams: Promise<{ org?: string }>;
}) {
  const { org } = await searchParams;
  const currentOrg = resolveAdminTargetOrg(org || "fallball");

  const cookieStore = await cookies();
  const token = cookieStore.get(ADMIN_SESSION_COOKIE)?.value;
  const adminUser = await getAdminUserFromCookieToken(token);

  if (!adminUser) {
    redirect(`/admin/login?next=/admin/scheduler?org=${currentOrg}`);
  }

  const effectiveRole = await getEffectiveAdminRoleForOrg(
    adminUser.id,
    adminUser.isMaster,
    currentOrg,
  );
  const role = effectiveRole ?? toAdminRole(adminUser.role, adminUser.isMaster);
  if (!canAccessAdminModule(role, "TEAMS")) {
    redirect("/admin?denied=teams");
  }

  return (
    <main className="min-h-screen bg-zinc-950 py-10 text-white sm:py-14">
      <section className="mx-auto max-w-7xl px-4 sm:px-6">
        <div className="mb-8">
          <AdminSectionHeader
            badge="SCHEDULER"
            currentOrg={currentOrg}
            currentPath="/admin/scheduler"
            allowRolePreview={hasAdminRoleAtLeast(role, "ADMIN")}
            allowViewByUser={adminUser.isMaster}
          />
          <h1 className="mb-3 text-4xl font-bold tracking-tight md:text-5xl">
            Fall Ball Scheduler
          </h1>
          <p className="max-w-3xl text-zinc-400">
            Configure Fall Ball seasons, parks, fields, division rules, generated
            drafts, manual fixes, and CSV exports from one admin workspace. The
            scheduler keeps the selected organization in the query string so it can
            grow beyond Fall Ball without changing the workflow.
          </p>
        </div>

        <AdminSchedulerManager targetOrg={currentOrg} />
      </section>
    </main>
  );
}
