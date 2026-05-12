import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { canAccessAdminModule, hasAdminRoleAtLeast, toAdminRole } from "@/lib/auth/adminRoles";
import { getEffectiveAdminRoleForOrg } from "@/lib/auth/effectiveAdminRole";
import AdminCommunicationsManager from "@/components/admin/AdminCommunicationsManager";
import AdminSectionHeader from "@/components/admin/AdminSectionHeader";
import { isCommunicationsModuleEnabled } from "@/lib/communications/config";
import {
  ADMIN_SESSION_COOKIE,
  getAdminUserFromCookieToken,
} from "@/lib/auth/adminSession";
import { getSiteConfig, resolveAdminTargetOrg } from "@/lib/siteConfig";

export function generateMetadata() {
  const site = getSiteConfig();
  return {
    title: `Admin Communications | ${site.name}`,
    description: `Broadcast communications to audiences for ${site.name}.`,
  };
}

export default async function AdminCommunicationsPage({
  searchParams,
}: {
  searchParams: Promise<{ org?: string }>;
}) {
  const { org } = await searchParams;
  const currentOrg = resolveAdminTargetOrg(org);
  if (!isCommunicationsModuleEnabled()) {
    redirect("/admin?denied=communications");
  }

  const cookieStore = await cookies();
  const token = cookieStore.get(ADMIN_SESSION_COOKIE)?.value;
  const adminUser = await getAdminUserFromCookieToken(token);

  if (!adminUser) {
    redirect("/admin/login?next=/admin/communications");
  }

  const effectiveRole = await getEffectiveAdminRoleForOrg(
    adminUser.id,
    adminUser.isMaster,
    currentOrg,
  );
  const role = effectiveRole ?? toAdminRole(adminUser.role, adminUser.isMaster);
  if (!canAccessAdminModule(role, "COMMUNICATIONS")) {
    redirect("/admin?denied=communications");
  }

  return (
    <main className="min-h-screen bg-zinc-950 text-white py-14">
      <section className="max-w-6xl mx-auto px-6">
        <div className="mb-8">
          <AdminSectionHeader
            badge="COMMUNICATIONS"
            currentOrg={currentOrg}
            currentPath="/admin/communications"
            allowRolePreview={hasAdminRoleAtLeast(role, "ADMIN")}
            allowViewByUser={adminUser.isMaster}
          />
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-3">
            Centralized Communications
          </h1>
          <p className="text-zinc-400 max-w-2xl">
            Draft, approve, schedule, and send audience-targeted campaign messages.
            Email delivery is active; SMS consent and infrastructure are staged.
          </p>
        </div>

        <AdminCommunicationsManager
          targetOrg={currentOrg}
          isMaster={adminUser.isMaster}
        />
      </section>
    </main>
  );
}
