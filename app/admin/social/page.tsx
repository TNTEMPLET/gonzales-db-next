import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { canAccessAdminModule, hasAdminRoleAtLeast, type AdminRole } from "@/lib/auth/adminRoles";
import {
  ADMIN_SESSION_COOKIE,
  getAdminUserFromCookieToken,
} from "@/lib/auth/adminSession";
import AdminSectionHeader from "@/components/admin/AdminSectionHeader";
import AdminSocialManager from "@/components/admin/AdminSocialManager";
import { getMetaPrivacyPolicyUrl } from "@/lib/privacy/metaPrivacyPolicyUrl";
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

  const role: AdminRole = adminUser.isMaster ? "MASTER_ADMIN" : "PARK_DIRECTOR";
  if (!canAccessAdminModule(role, "SOCIAL_MEDIA")) {
    redirect("/admin?denied=social");
  }

  const metaPrivacyPolicyUrl = getMetaPrivacyPolicyUrl();

  return (
    <main className="min-h-screen bg-zinc-950 py-10 pb-24 text-white sm:py-14">
      <section className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="mb-8">
          <AdminSectionHeader
            badge="SOCIAL MEDIA"
            allowRolePreview={hasAdminRoleAtLeast(role, "ADMIN")}
            allowViewByUser={adminUser.isMaster}
          />
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-3">
            Social media
          </h1>
          <p className="text-zinc-400 max-w-3xl">
            Manage the shared AP Baseball Facebook Page. Drafts stay private here;
            publishing posts to Facebook can be visible to families and the public
            right away. Use Sync to pull recent Page posts back into this list.
          </p>
          <p className="mt-2 text-sm text-zinc-500 max-w-3xl">
            Publishing requires <code className="text-zinc-300">FACEBOOK_PAGE_ID</code> and{" "}
            <code className="text-zinc-300">FACEBOOK_PAGE_ACCESS_TOKEN</code> in server
            environment. The Meta app that issued the Page token must also be in Live mode. Use{" "}
            <a
              href={metaPrivacyPolicyUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-zinc-200 underline underline-offset-2 hover:text-white"
            >
              {metaPrivacyPolicyUrl}
            </a>{" "}
            as the Privacy Policy URL in Meta App settings before publishing the app.
          </p>
        </div>
        <AdminSocialManager />
      </section>
    </main>
  );
}
