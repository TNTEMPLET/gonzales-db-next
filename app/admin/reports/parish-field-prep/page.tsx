import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import AdminSectionHeader from "@/components/admin/AdminSectionHeader";
import ReportSendPanel from "@/components/admin/ReportSendPanel";
import { canAccessAdminModule, hasAdminRoleAtLeast, type AdminRole } from "@/lib/auth/adminRoles";
import { getEffectiveAdminRoleForOrg } from "@/lib/auth/effectiveAdminRole";
import { ADMIN_SESSION_COOKIE, getAdminUserFromCookieToken } from "@/lib/auth/adminSession";
import { getSiteConfig, resolveAdminTargetOrg } from "@/lib/siteConfig";

export function generateMetadata() {
  const site = getSiteConfig();
  return { title: `Parish field prep | ${site.name}` };
}

export default async function ParishFieldPrepPage({
  searchParams,
}: {
  searchParams: Promise<{ org?: string }>;
}) {
  const { org } = await searchParams;
  const orgId = resolveAdminTargetOrg(org);
  const cookieStore = await cookies();
  const token = cookieStore.get(ADMIN_SESSION_COOKIE)?.value;
  const adminUser = await getAdminUserFromCookieToken(token);
  if (!adminUser) redirect(`/admin/login?next=/admin/reports/parish-field-prep?org=${orgId}`);
  const effectiveRole = await getEffectiveAdminRoleForOrg(adminUser.id, adminUser.isMaster, orgId);
  const role: AdminRole = effectiveRole ?? (adminUser.isMaster ? "MASTER_ADMIN" : "PARK_DIRECTOR");
  if (!canAccessAdminModule(role, "TEAMS")) redirect("/admin?denied=reports");

  return (
    <main className="min-h-screen bg-zinc-950 py-10 text-white sm:py-14">
      <section className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="mb-8">
          <AdminSectionHeader
            badge="REPORTING"
            currentOrg={orgId}
            currentPath="/admin/reports/parish-field-prep"
            allowRolePreview={hasAdminRoleAtLeast(role, "ADMIN")}
            allowViewByUser={adminUser.isMaster}
          />
          <p className="mb-3">
            <Link href={`/admin/reports?org=${orgId}`} className="text-sm font-semibold text-red-300 hover:text-red-200">
              All reports
            </Link>
          </p>
          <h1 className="mb-3 text-4xl font-bold tracking-tight md:text-5xl">Parish field prep</h1>
          <p className="max-w-2xl text-zinc-400">
            Review each park calendar, then email the PDF to the parish when it is ready. Red means
            any game that night — they should set that field up for play.
          </p>
        </div>
        <ReportSendPanel kind="parish-field-prep" org={orgId} />
      </section>
    </main>
  );
}
