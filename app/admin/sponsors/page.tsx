import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { canAccessAdminModule, hasAdminRoleAtLeast, toAdminRole } from "@/lib/auth/adminRoles";
import { getEffectiveAdminRoleForOrg } from "@/lib/auth/effectiveAdminRole";
import {
  ADMIN_SESSION_COOKIE,
  getAdminUserFromCookieToken,
} from "@/lib/auth/adminSession";
import AdminSectionHeader from "@/components/admin/AdminSectionHeader";
import AdminSponsorsManager from "@/components/admin/AdminSponsorsManager";
import { getSiteConfig, resolveAdminTargetOrg } from "@/lib/siteConfig";

export function generateMetadata() {
  const site = getSiteConfig();
  return {
    title: `Sponsors Management | ${site.name}`,
    description: "Manage sponsor packages, logos, and footer scroller visibility.",
  };
}

export default async function AdminSponsorsPage({
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
    redirect("/admin/login?next=/admin/sponsors");
  }

  const effectiveRole = await getEffectiveAdminRoleForOrg(
    adminUser.id,
    adminUser.isMaster,
    currentOrg,
  );
  const role = effectiveRole ?? toAdminRole(adminUser.role, adminUser.isMaster);
  if (!canAccessAdminModule(role, "SPONSORS")) {
    redirect("/admin?denied=sponsors");
  }

  return (
    <main className="min-h-screen bg-zinc-950 text-white py-14">
      <section className="max-w-6xl mx-auto px-6">
        <div className="mb-8">
          <AdminSectionHeader
            badge="SPONSORS MODULE"
            currentOrg={currentOrg}
            currentPath="/admin/sponsors"
            allowRolePreview={hasAdminRoleAtLeast(role, "ADMIN")}
          />
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-3">
            Sponsors Management
          </h1>
          <p className="text-zinc-400 max-w-3xl">
            Track sponsor packages, upload logo assets, assign organizations, and
            manage which sponsors appear in the footer scroller.
          </p>
        </div>
        <AdminSponsorsManager targetOrg={currentOrg} />
      </section>
    </main>
  );
}
