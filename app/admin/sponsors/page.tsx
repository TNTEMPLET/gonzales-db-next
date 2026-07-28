import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { canAccessAdminModule, hasAdminRoleAtLeast, type AdminRole } from "@/lib/auth/adminRoles";
import { getEffectiveAdminRoleForOrg } from "@/lib/auth/effectiveAdminRole";
import {
  ADMIN_SESSION_COOKIE,
  getAdminUserFromCookieToken,
} from "@/lib/auth/adminSession";
import AdminSectionHeader from "@/components/admin/AdminSectionHeader";
import AdminSponsorsManager from "@/components/admin/AdminSponsorsManager";
import {
  getSiteConfig,
  isAdminModuleEnabledForOrg,
  resolveAdminTargetOrg,
} from "@/lib/siteConfig";

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
  if (!isAdminModuleEnabledForOrg(currentOrg, "SPONSORS")) {
    redirect(`/admin?org=${currentOrg}&denied=sponsors`);
  }

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
  const role: AdminRole = effectiveRole ?? (adminUser.isMaster ? "MASTER_ADMIN" : "PARK_DIRECTOR");
  if (!canAccessAdminModule(role, "SPONSORS")) {
    redirect("/admin?denied=sponsors");
  }

  return (
    <main className="min-h-screen bg-zinc-950 py-10 text-white sm:py-14">
      <section className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="mb-8">
          <AdminSectionHeader
            badge="SPONSORS MODULE"
            currentOrg={currentOrg}
            currentPath="/admin/sponsors"
            allowRolePreview={hasAdminRoleAtLeast(role, "ADMIN")}
            allowViewByUser={adminUser.isMaster}
          />
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-3">
            Sponsors Management
          </h1>
          <p className="text-zinc-400 max-w-3xl">
            Track sponsor packages, upload logo assets, assign organizations, and
            decide which sponsors appear on public AP Baseball pages. Footer
            scroller changes can be visible to families immediately after saving.
          </p>
        </div>
        <AdminSponsorsManager targetOrg={currentOrg} />
      </section>
    </main>
  );
}
