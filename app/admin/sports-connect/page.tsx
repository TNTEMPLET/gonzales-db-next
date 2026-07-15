import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { canAccessAdminModule, hasAdminRoleAtLeast, toAdminRole } from "@/lib/auth/adminRoles";
import { getEffectiveAdminRoleForOrg } from "@/lib/auth/effectiveAdminRole";
import {
  ADMIN_SESSION_COOKIE,
  getAdminUserFromCookieToken,
} from "@/lib/auth/adminSession";
import AdminSectionHeader from "@/components/admin/AdminSectionHeader";
import AdminSportsConnectDesk from "@/components/admin/AdminSportsConnectDesk";
import { getSeasonConfigForOrg } from "@/lib/seasonConfig";
import { getSportsConnectRegistrationUrl } from "@/lib/sportsConnect/registrationUrl";
import {
  getSiteConfig,
  isContentOrgId,
  resolveAdminTargetOrg,
} from "@/lib/siteConfig";

export function generateMetadata() {
  const site = getSiteConfig();
  return {
    title: `Sports Connect Ops Desk | ${site.name}`,
    description:
      "Assisted SportsConnect export → import checklist, file plan, quality, and run history.",
  };
}

export default async function AdminSportsConnectPage({
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
    redirect("/admin/login?next=/admin/sports-connect");
  }

  if (!isContentOrgId(currentOrg)) {
    redirect("/admin/sports-connect?org=fallball");
  }

  const effectiveRole = await getEffectiveAdminRoleForOrg(
    adminUser.id,
    adminUser.isMaster,
    currentOrg,
  );
  const role = effectiveRole ?? toAdminRole(adminUser.role, adminUser.isMaster);
  if (!canAccessAdminModule(role, "TEAMS")) {
    redirect("/admin?denied=teams");
  }

  const season = getSeasonConfigForOrg(currentOrg);
  const reg = getSportsConnectRegistrationUrl(currentOrg);

  return (
    <main className="min-h-screen bg-zinc-950 py-10 text-white sm:py-14">
      <section className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="mb-8">
          <AdminSectionHeader
            badge="SPORTS CONNECT"
            currentOrg={currentOrg}
            currentPath="/admin/sports-connect"
            allowRolePreview={hasAdminRoleAtLeast(role, "ADMIN")}
            allowViewByUser={adminUser.isMaster}
          />
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-3">
            Sports Connect Ops Desk
          </h1>
          <p className="text-zinc-400 max-w-3xl">
            Single place for Master Admins to load SportsConnect exports into this platform:
            checklist, multi-file plan, mapping presets, roster quality, and import run history.
            Registration and payment stay in SportsConnect.
          </p>
        </div>

        <AdminSportsConnectDesk
          targetOrg={currentOrg}
          seasonYear={season.year}
          registrationHref={reg.href}
          registrationLabel={reg.label}
        />
      </section>
    </main>
  );
}
