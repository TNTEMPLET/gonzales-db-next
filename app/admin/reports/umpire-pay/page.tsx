import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import AdminReportsManager from "@/components/admin/AdminReportsManager";
import AdminSectionHeader from "@/components/admin/AdminSectionHeader";
import ReportOrgPicker from "@/components/admin/ReportOrgPicker";
import { parseReportContentOrg } from "@/lib/admin/reportOrg";
import { canAccessAdminModule, hasAdminRoleAtLeast, type AdminRole } from "@/lib/auth/adminRoles";
import { getEffectiveAdminRoleForOrg } from "@/lib/auth/effectiveAdminRole";
import {
  ADMIN_SESSION_COOKIE,
  getAdminUserFromCookieToken,
} from "@/lib/auth/adminSession";
import {
  getDefaultContentOrg,
  getOrgDisplayName,
  getSiteConfig,
  isMasterDeployment,
  resolveAdminTargetOrg,
} from "@/lib/siteConfig";

export function generateMetadata() {
  const site = getSiteConfig();
  return {
    title: `Umpire Pay | ${site.name}`,
    description: "Generate umpire reports and payout summaries.",
  };
}

export default async function AdminUmpirePayPage({
  searchParams,
}: {
  searchParams: Promise<{ org?: string }>;
}) {
  const { org } = await searchParams;
  const selectedOrg = parseReportContentOrg(org) ?? (isMasterDeployment() ? null : getDefaultContentOrg());
  const authOrg = selectedOrg ?? resolveAdminTargetOrg(org);

  const cookieStore = await cookies();
  const token = cookieStore.get(ADMIN_SESSION_COOKIE)?.value;
  const adminUser = await getAdminUserFromCookieToken(token);

  if (!adminUser) {
    redirect(`/admin/login?next=/admin/reports/umpire-pay${org ? `?org=${org}` : ""}`);
  }

  const effectiveRole = await getEffectiveAdminRoleForOrg(
    adminUser.id,
    adminUser.isMaster,
    authOrg,
  );
  const role: AdminRole = effectiveRole ?? (adminUser.isMaster ? "MASTER_ADMIN" : "PARK_DIRECTOR");
  if (!canAccessAdminModule(role, "REPORTS")) {
    redirect("/admin?denied=reports");
  }

  return (
    <main className="min-h-screen bg-zinc-950 py-10 text-white sm:py-14">
      <section className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="mb-8">
          <AdminSectionHeader
            badge="REPORTING"
            currentOrg={selectedOrg}
            currentPath="/admin/reports/umpire-pay"
            orgSwitcherShowAllSites={false}
            allowRolePreview={hasAdminRoleAtLeast(role, "ADMIN")}
            allowViewByUser={adminUser.isMaster}
          />
          <p className="mb-3">
            <Link
              href={`/admin/reports?org=${selectedOrg ?? "all"}`}
              className="text-sm font-semibold text-red-300 hover:text-red-200"
            >
              All reports
            </Link>
          </p>
          <h1 className="mb-3 text-4xl font-bold tracking-tight md:text-5xl">Umpire Pay</h1>
          <p className="max-w-2xl text-zinc-400">
            Game assignment totals and payouts for one organization. Generate the date range, review
            the AP Baseball PDFs, then email the treasurer who gathers and distributes pay for that
            site.
          </p>
        </div>

        {selectedOrg ? (
          <>
            <p className="mb-4 text-sm text-zinc-300">
              This file is <span className="font-semibold text-white">{getOrgDisplayName(selectedOrg)}</span>{" "}
              only.
            </p>
            <AdminReportsManager targetOrg={selectedOrg} />
          </>
        ) : (
          <ReportOrgPicker path="/admin/reports/umpire-pay" title="Umpire pay" />
        )}
      </section>
    </main>
  );
}
