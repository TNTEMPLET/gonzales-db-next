import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { canAccessAdminModule, hasAdminRoleAtLeast, toAdminRole } from "@/lib/auth/adminRoles";
import { getEffectiveAdminRoleForOrg } from "@/lib/auth/effectiveAdminRole";
import AdminSectionHeader from "@/components/admin/AdminSectionHeader";
import DugoutModerationPanel from "@/components/admin/DugoutModerationPanel";
import {
  ADMIN_SESSION_COOKIE,
  getAdminUserFromCookieToken,
} from "@/lib/auth/adminSession";
import { getSiteConfig, resolveAdminTargetOrg } from "@/lib/siteConfig";

export function generateMetadata() {
  const site = getSiteConfig();
  return {
    title: `Dugout Moderation | ${site.name}`,
    description: "Edit and delete Dugout feed posts as an admin.",
  };
}

export default async function AdminDugoutPage({
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
    redirect("/admin/login?next=/admin/dugout");
  }

  const effectiveRole = await getEffectiveAdminRoleForOrg(
    adminUser.id,
    adminUser.isMaster,
    currentOrg,
  );
  const role = effectiveRole ?? toAdminRole(adminUser.role, adminUser.isMaster);
  if (!canAccessAdminModule(role, "DUGOUT_MODERATION")) {
    redirect("/admin?denied=dugout");
  }

  return (
    <main className="min-h-screen bg-zinc-950 py-10 text-white sm:py-14">
      <section className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="mb-8">
          <AdminSectionHeader
            badge="FEED MODERATION"
            currentOrg={currentOrg}
            currentPath="/admin/dugout"
            allowRolePreview={hasAdminRoleAtLeast(role, "ADMIN")}
            allowViewByUser={adminUser.isMaster}
          />
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-3">
            Dugout Moderation
          </h1>
          <p className="text-zinc-400 max-w-3xl">
            Review coach community posts, correct small issues, and remove content that should not remain visible in The Dugout. Use the selected site context because edits affect that organization&apos;s feed.
          </p>
          <div className="mt-4 rounded-xl border border-amber-800/50 bg-amber-950/20 p-3 text-sm text-amber-100">
            Moderation changes can affect public trust even when the discussion is coach-focused. Prefer edits for clarity and deletion for unsafe, private, or inappropriate content.
          </div>
        </div>

        <DugoutModerationPanel targetOrg={currentOrg} />
      </section>
    </main>
  );
}
