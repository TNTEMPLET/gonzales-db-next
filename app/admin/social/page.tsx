import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { canAccessAdminModule, toAdminRole } from "@/lib/auth/adminRoles";
import {
  ADMIN_SESSION_COOKIE,
  getAdminUserFromCookieToken,
} from "@/lib/auth/adminSession";
import AdminSectionHeader from "@/components/admin/AdminSectionHeader";
import AdminSocialManager from "@/components/admin/AdminSocialManager";
import { getSiteConfig } from "@/lib/siteConfig";

export function generateMetadata() {
  const site = getSiteConfig();
  return {
    title: `Social media | ${site.name}`,
    description:
      "Draft and publish posts for the AP Baseball Facebook Page. Sync pulls recent posts from that Page.",
  };
}

export default async function AdminSocialPage() {
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
          <AdminSectionHeader badge="SOCIAL MEDIA" />
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-3">
            Social media
          </h1>
          <p className="text-zinc-400 max-w-3xl">
            One shared feed for the AP Baseball Facebook Page—same list for every admin, not
            per league site. Add an optional link and image URL, then publish when ready. Requires{" "}
            <code className="text-zinc-300">FACEBOOK_PAGE_ID</code> and{" "}
            <code className="text-zinc-300">FACEBOOK_PAGE_ACCESS_TOKEN</code> in server
            environment.
          </p>
        </div>
        <AdminSocialManager />
      </section>
    </main>
  );
}
