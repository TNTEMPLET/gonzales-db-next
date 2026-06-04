import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import ParkInfoEditorClient from "@/components/admin/ParkInfoEditorClient";
import AdminSectionHeader from "@/components/admin/AdminSectionHeader";
import {
  canAccessAdminModule,
  toAdminRole,
} from "@/lib/auth/adminRoles";
import {
  ADMIN_SESSION_COOKIE,
  getAdminUserFromCookieToken,
} from "@/lib/auth/adminSession";
import {
  BRACKET_ORGS,
  getSiteConfig,
  isMasterDeployment,
  resolveBracketAdminTargetOrg,
} from "@/lib/siteConfig";
import prisma from "@/lib/prisma";

export function generateMetadata() {
  return { title: `Park Info | ${getSiteConfig().name}` };
}

export default async function AdminParkInfoPage({
  searchParams,
}: {
  searchParams: Promise<{ org?: string }>;
}) {
  const cookieStore = await cookies();
  const token = cookieStore.get(ADMIN_SESSION_COOKIE)?.value;
  const user = await getAdminUserFromCookieToken(token);
  if (!user) redirect(`/admin/login?next=${encodeURIComponent("/admin/park-info")}`);

  const role = toAdminRole(user.role, user.isMaster);
  if (!canAccessAdminModule(role, "PARK_INFO")) redirect("/admin?denied=park-info");

  const { org: orgParam } = await searchParams;
  const org = resolveBracketAdminTargetOrg(orgParam);

  const row = await prisma.parkInfoPage.findUnique({ where: { organizationId: org } });
  const initial = {
    rulesMarkdown: row?.rulesMarkdown ?? "",
    parkingMarkdown: row?.parkingMarkdown ?? "",
    fieldLayoutImageUrl: row?.fieldLayoutImageUrl ?? null,
  };

  return (
    <main className="min-h-screen bg-zinc-950 py-6 text-white sm:py-8">
      <section className="mx-auto max-w-4xl px-4 sm:px-6">
        <div className="mb-4">
          <AdminSectionHeader
            badge="PARK INFO"
            currentOrg={org}
            currentPath="/admin/park-info"
            orgSwitcherShowAllSites={false}
            orgSwitcherOrgs={BRACKET_ORGS}
          />
        </div>
        <h2 className="mb-1 text-lg font-bold">Park Info Editor</h2>
        <p className="mb-6 text-sm text-zinc-400">
          Manage tournament rules, parking information, and the field layout image for{" "}
          <strong className="text-zinc-200">{org}</strong>.{" "}
          {!isMasterDeployment() && (
            <span>Visible at <code className="text-xs">/park-info</code> on this site.</span>
          )}
        </p>
        <ParkInfoEditorClient org={org} initial={initial} />
      </section>
    </main>
  );
}
