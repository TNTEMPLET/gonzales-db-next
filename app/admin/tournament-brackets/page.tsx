import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import TournamentBracketsClient from "@/components/admin/TournamentBracketsClient";
import AdminSectionHeader from "@/components/admin/AdminSectionHeader";
import {
  canAccessAdminModule,
  hasAdminRoleAtLeast,
  toAdminRole,
} from "@/lib/auth/adminRoles";
import { getEffectiveAdminRoleForOrg } from "@/lib/auth/effectiveAdminRole";
import {
  ADMIN_SESSION_COOKIE,
  getAdminUserFromCookieToken,
} from "@/lib/auth/adminSession";
import { getSiteConfig, isMasterDeployment, resolveAdminTargetOrg } from "@/lib/siteConfig";

export function generateMetadata() {
  const site = getSiteConfig();
  return {
    title: `Tournament Brackets | ${site.name}`,
    description:
      "Master-only bracket builder: structure rounds for the web preview, optional XLSX schedule import, HTML export, and flyer PDF.",
  };
}

export default async function AdminTournamentBracketsPage({
  searchParams,
}: {
  searchParams: Promise<{ org?: string }>;
}) {
  if (!isMasterDeployment()) {
    redirect("/admin?denied=tournament-brackets");
  }

  const { org } = await searchParams;
  const bracketOrg = resolveAdminTargetOrg(org);

  const cookieStore = await cookies();
  const token = cookieStore.get(ADMIN_SESSION_COOKIE)?.value;
  const adminUser = await getAdminUserFromCookieToken(token);

  if (!adminUser) {
    redirect(`/admin/login?next=${encodeURIComponent("/admin/tournament-brackets")}`);
  }

  if (!adminUser.isMaster) {
    redirect("/admin?denied=tournament-brackets-master");
  }

  const effectiveRole = await getEffectiveAdminRoleForOrg(
    adminUser.id,
    adminUser.isMaster,
    bracketOrg,
  );
  const role = effectiveRole ?? toAdminRole(adminUser.role, adminUser.isMaster);
  if (!canAccessAdminModule(role, "TOURNAMENT_BRACKETS")) {
    redirect("/admin?denied=tournament-brackets");
  }

  return (
    <main className="min-h-screen bg-zinc-950 text-white py-14">
      <section className="max-w-6xl mx-auto px-6">
        <div className="mb-8">
          <AdminSectionHeader
            badge="TOURNAMENT BRACKETS"
            currentOrg={bracketOrg}
            currentPath="/admin/tournament-brackets"
            orgSwitcherShowAllSites={false}
            allowRolePreview={hasAdminRoleAtLeast(role, "ADMIN")}
            allowViewByUser={adminUser.isMaster}
          />
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-3">Tournament Bracket Builder</h1>
          <p className="text-zinc-400 max-w-3xl">
            Master Admin: build single-elimination (and custom) brackets for any tournament, preview them in a
            printable program style, optionally import schedule XLSX into the games grid, export standalone HTML,
            and generate a flyer PDF.
          </p>
        </div>
        <TournamentBracketsClient key={bracketOrg} organizationId={bracketOrg} />
      </section>
    </main>
  );
}
