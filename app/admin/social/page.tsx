import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { canAccessAdminModule, toAdminRole } from "@/lib/auth/adminRoles";
import {
  ADMIN_SESSION_COOKIE,
  getAdminUserFromCookieToken,
} from "@/lib/auth/adminSession";
import AdminSectionHeader from "@/components/admin/AdminSectionHeader";
import AdminSocialManager from "@/components/admin/AdminSocialManager";
import { getSiteConfig, resolveAdminTargetOrg } from "@/lib/siteConfig";

export function generateMetadata() {
  const site = getSiteConfig();
  return {
    title: `Social media | ${site.name}`,
    description:
      "Draft and publish Facebook Page posts for your organization. Pulls recent posts from your Page when you sync.",
  };
}

export default async function AdminSocialPage({
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
    redirect("/admin/login?next=/admin/social");
  }

  const role = toAdminRole(adminUser.role, adminUser.isMaster);
  if (!canAccessAdminModule(role, "SOCIAL_MEDIA")) {
    redirect("/admin?denied=social");
  }

  return (
    <main className="min-h-screen bg-zinc-950 text-white py-14 pb-24">
      <section className="max-w-6xl mx-auto px-6">
        <div className="mb-8">
          <AdminSectionHeader
            badge="SOCIAL MEDIA"
            currentOrg={currentOrg}
            currentPath="/admin/social"
          />
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-3">
            Social media
          </h1>
          <p className="text-zinc-400 max-w-3xl">
            Draft posts for your Facebook Page, add an optional link and image URL,
            then publish when ready. Requires{" "}
            <code className="text-zinc-300">FACEBOOK_PAGE_ID</code> and{" "}
            <code className="text-zinc-300">FACEBOOK_PAGE_ACCESS_TOKEN</code> in
            server environment.
          </p>
        </div>
        <AdminSocialManager targetOrg={currentOrg} />
      </section>
    </main>
  );
}
