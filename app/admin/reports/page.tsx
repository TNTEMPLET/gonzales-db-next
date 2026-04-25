import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import AdminReportsManager from "@/components/admin/AdminReportsManager";
import AdminSectionHeader from "@/components/admin/AdminSectionHeader";
import { hasAdminRoleAtLeast, toAdminRole } from "@/lib/auth/adminRoles";
import {
  ADMIN_SESSION_COOKIE,
  getAdminUserFromCookieToken,
} from "@/lib/auth/adminSession";
import { getSiteConfig, resolveAdminTargetOrg } from "@/lib/siteConfig";

export function generateMetadata() {
  const site = getSiteConfig();
  return {
    title: `Reporting | ${site.name}`,
    description: "Generate umpire reports and payout summaries.",
  };
}

export default async function AdminReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ org?: string }>;
}) {
  const { org } = await searchParams;
  const orgId = resolveAdminTargetOrg(org);

  const cookieStore = await cookies();
  const token = cookieStore.get(ADMIN_SESSION_COOKIE)?.value;
  const adminUser = await getAdminUserFromCookieToken(token);

  if (!adminUser) {
    redirect("/admin/login?next=/admin/reports");
  }

  const role = toAdminRole(adminUser.role, adminUser.isMaster);
  if (!hasAdminRoleAtLeast(role, "PARK_DIRECTOR")) {
    redirect("/admin?denied=reports");
  }

  return (
    <main className="min-h-screen bg-zinc-950 text-white py-14">
      <section className="max-w-6xl mx-auto px-6">
        <div className="mb-8">
          <AdminSectionHeader
            badge="REPORTING"
            currentOrg={orgId}
            currentPath="/admin/reports"
          />
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-3">
            Umpire Reports
          </h1>
          <p className="text-zinc-400 max-w-2xl">
            Generate game and umpire payout reports in the AP Baseball control
            center style.
          </p>
        </div>

        <AdminReportsManager targetOrg={orgId} />
      </section>
    </main>
  );
}
