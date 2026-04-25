import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { canAccessAdminModule, toAdminRole } from "@/lib/auth/adminRoles";
import AdminSectionHeader from "@/components/admin/AdminSectionHeader";
import AdminUsersManager from "@/components/admin/AdminUsersManager";
import {
  ADMIN_SESSION_COOKIE,
  getAdminUserFromCookieToken,
} from "@/lib/auth/adminSession";
import { getSiteConfig, resolveAdminTargetOrg } from "@/lib/siteConfig";

export function generateMetadata() {
  const site = getSiteConfig();
  return {
    title: `Admin Users | ${site.name}`,
    description: `Promote and demote admin accounts for ${site.name}.`,
  };
}

export default async function AdminUsersPage({
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
    redirect("/admin/login?next=/admin/users");
  }

  const role = toAdminRole(adminUser.role, adminUser.isMaster);
  if (!canAccessAdminModule(role, "USERS")) {
    redirect("/admin?denied=users");
  }

  return (
    <main className="min-h-screen bg-zinc-950 text-white py-14">
      <section className="max-w-6xl mx-auto px-6">
        <div className="mb-8">
          <AdminSectionHeader
            badge="ACCESS CONTROL"
            currentOrg={currentOrg}
            currentPath="/admin/users"
          />
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-3">
            Admin User Management
          </h1>
          <p className="text-zinc-400 max-w-2xl">
            Promote registered Google users to admin access and demote admins as
            needed.
          </p>
        </div>

        <AdminUsersManager targetOrg={currentOrg} />
      </section>
    </main>
  );
}
