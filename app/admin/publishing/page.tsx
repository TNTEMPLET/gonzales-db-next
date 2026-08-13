import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import AdminSectionHeader from "@/components/admin/AdminSectionHeader";
import PublishingHub, { type PublishingTab } from "@/components/admin/publishing/PublishingHub";
import { canAccessAdminModule, hasAdminRoleAtLeast, type AdminRole } from "@/lib/auth/adminRoles";
import { ADMIN_SESSION_COOKIE, getAdminUserFromCookieToken } from "@/lib/auth/adminSession";
import { getEffectiveAdminRoleForOrg } from "@/lib/auth/effectiveAdminRole";
import { getSiteConfig, resolveAdminTargetOrg } from "@/lib/siteConfig";

export function generateMetadata() {
  const site = getSiteConfig();
  return {
    title: `Publishing & Comms | ${site.name}`,
    description: "Email campaigns, news publishing, social media, dugout feed, and shared drive.",
  };
}

export default async function PublishingPage({
  searchParams,
}: {
  searchParams: Promise<{ org?: string; tab?: string }>;
}) {
  const { org, tab: tabParam } = await searchParams;
  const currentOrg = resolveAdminTargetOrg(org);
  const cookieStore = await cookies();
  const token = cookieStore.get(ADMIN_SESSION_COOKIE)?.value;
  const adminUser = await getAdminUserFromCookieToken(token);

  if (!adminUser) {
    redirect("/admin/login?next=/admin/publishing");
  }

  const effectiveRole = await getEffectiveAdminRoleForOrg(
    adminUser.id,
    adminUser.isMaster,
    currentOrg,
  );
  const role: AdminRole = effectiveRole ?? (adminUser.isMaster ? "MASTER_ADMIN" : "PARK_DIRECTOR");

  const canComms = canAccessAdminModule(role, "COMMUNICATIONS");
  const canNews = canAccessAdminModule(role, "NEWS_ADMIN");
  const canSocial = canAccessAdminModule(role, "SOCIAL_MEDIA");
  const canDugout = canAccessAdminModule(role, "DUGOUT_MODERATION");
  const canDrive = canAccessAdminModule(role, "ORG_DOCUMENTS");

  if (!canComms && !canNews && !canSocial && !canDugout && !canDrive) {
    redirect("/admin?denied=publishing");
  }

  const initialTab: PublishingTab = (tabParam as PublishingTab) || "comms";

  return (
    <main className="min-h-screen bg-zinc-950 py-10 text-white sm:py-14">
      <section className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="mb-8">
          <AdminSectionHeader
            badge="PUBLISHING & COMMS"
            currentOrg={currentOrg}
            currentPath={`/admin/publishing?tab=${initialTab}`}
            allowRolePreview={hasAdminRoleAtLeast(role, "ADMIN")}
            allowViewByUser={adminUser.isMaster}
          />
          <h1 className="mb-3 text-4xl font-bold tracking-tight md:text-5xl">
            Publishing & Communications Center
          </h1>
          <p className="max-w-3xl text-zinc-400">
            Publish email broadcasts, draft news stories, manage Facebook posts, moderate Dugout community discussions, and access shared Google Drive files.
          </p>
        </div>

        <Suspense
          fallback={
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 px-4 py-8 text-zinc-400">
              Loading publishing hub…
            </div>
          }
        >
          <PublishingHub
            targetOrg={currentOrg}
            initialTab={initialTab}
            isMaster={adminUser.isMaster || role === "MASTER_ADMIN"}
          />
        </Suspense>
      </section>
    </main>
  );
}
