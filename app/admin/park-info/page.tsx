import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import AdminSectionHeader from "@/components/admin/AdminSectionHeader";
import ParkInfoEditorClient from "@/components/admin/ParkInfoEditorClient";
import { canAccessAdminModule, hasAdminRoleAtLeast, type AdminRole } from "@/lib/auth/adminRoles";
import { ADMIN_SESSION_COOKIE, getAdminUserFromCookieToken } from "@/lib/auth/adminSession";
import { getEffectiveAdminRoleForOrg } from "@/lib/auth/effectiveAdminRole";
import { getSiteConfig, resolveAdminTargetOrg } from "@/lib/siteConfig";
import prisma from "@/lib/prisma";

export function generateMetadata() {
  const site = getSiteConfig();
  return {
    title: `Park Info & Rules | ${site.name}`,
    description: "Manage tournament rules, parking guidelines, and field layout maps.",
  };
}

export default async function ParkInfoPage({
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
    redirect(`/admin/login?next=/admin/park-info?org=${currentOrg}`);
  }

  const effectiveRole = await getEffectiveAdminRoleForOrg(
    adminUser.id,
    adminUser.isMaster,
    currentOrg,
  );
  const role: AdminRole = effectiveRole ?? (adminUser.isMaster ? "MASTER_ADMIN" : "PARK_DIRECTOR");

  if (!canAccessAdminModule(role, "PARK_INFO")) {
    redirect("/admin?denied=park-info");
  }

  const parkInfoRow = await prisma.parkInfoPage.findUnique({ where: { organizationId: currentOrg } });
  const parkInfoInitial = {
    rulesMarkdown: parkInfoRow?.rulesMarkdown ?? "",
    parkingMarkdown: parkInfoRow?.parkingMarkdown ?? "",
    fieldLayoutImageUrl: parkInfoRow?.fieldLayoutImageUrl ?? null,
  };

  return (
    <main className="min-h-screen bg-zinc-950 py-10 text-white sm:py-14">
      <section className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="mb-8">
          <AdminSectionHeader
            badge="PARK INFO & RULES"
            currentOrg={currentOrg}
            currentPath={`/admin/park-info?org=${currentOrg}`}
            allowRolePreview={hasAdminRoleAtLeast(role, "ADMIN")}
            allowViewByUser={adminUser.isMaster}
          />
          <h1 className="mb-3 text-4xl font-bold tracking-tight md:text-5xl">Park Info & Rules</h1>
          <p className="max-w-3xl text-zinc-400">
            Manage tournament rules, parking guidelines, and field layout maps.
          </p>
        </div>

        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4 sm:p-6">
          <ParkInfoEditorClient org={currentOrg} initial={parkInfoInitial} />
        </div>
      </section>
    </main>
  );
}
