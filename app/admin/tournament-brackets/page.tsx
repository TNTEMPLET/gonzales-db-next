import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import AdminSectionHeader from "@/components/admin/AdminSectionHeader";
import TournamentBracketsClient from "@/components/admin/TournamentBracketsClient";
import { canAccessAdminModule, hasAdminRoleAtLeast, type AdminRole } from "@/lib/auth/adminRoles";
import { ADMIN_SESSION_COOKIE, getAdminUserFromCookieToken } from "@/lib/auth/adminSession";
import { getEffectiveAdminRoleForOrg } from "@/lib/auth/effectiveAdminRole";
import { getSiteConfig, resolveAdminTargetOrg } from "@/lib/siteConfig";

export function generateMetadata() {
  const site = getSiteConfig();
  return {
    title: `Tournament Brackets | ${site.name}`,
    description: "Build tournament brackets from seeds, review layout, and export printable flyers.",
  };
}

export default async function TournamentBracketsPage({
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
    redirect(`/admin/login?next=/admin/tournament-brackets?org=${currentOrg}`);
  }

  const effectiveRole = await getEffectiveAdminRoleForOrg(
    adminUser.id,
    adminUser.isMaster,
    currentOrg,
  );
  const role: AdminRole = effectiveRole ?? (adminUser.isMaster ? "MASTER_ADMIN" : "PARK_DIRECTOR");

  if (!canAccessAdminModule(role, "TOURNAMENT_BRACKETS")) {
    redirect("/admin?denied=tournament-brackets");
  }

  return (
    <main className="min-h-screen bg-zinc-950 py-10 text-white sm:py-14">
      <section className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="mb-8">
          <AdminSectionHeader
            badge="TOURNAMENT BRACKETS"
            currentOrg={currentOrg}
            currentPath={`/admin/tournament-brackets?org=${currentOrg}`}
            allowRolePreview={hasAdminRoleAtLeast(role, "ADMIN")}
            allowViewByUser={adminUser.isMaster}
          />
          <h1 className="mb-3 text-4xl font-bold tracking-tight md:text-5xl">Tournament Brackets</h1>
          <p className="max-w-3xl text-zinc-400">
            Build tournament brackets from seeds, review layout, and export printable flyers.
          </p>
        </div>

        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4 sm:p-6">
          {/* eslint-disable-next-line @typescript-eslint/no-explicit-any -- pre-existing gap: this page resolves the narrower ContentOrgId, TournamentBracketsClient wants the wider BracketOrgId (see resolveBracketAdminTargetOrg) */}
          <TournamentBracketsClient organizationId={currentOrg as any} />
        </div>
      </section>
    </main>
  );
}
