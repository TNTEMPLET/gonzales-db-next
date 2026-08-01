import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import AdminRegistrationWindowsManager from "@/components/admin/AdminRegistrationWindowsManager";
import AdminSectionHeader from "@/components/admin/AdminSectionHeader";
import {
  canAccessAdminModule,
  type AdminRole,
} from "@/lib/auth/adminRoles";
import {
  ADMIN_SESSION_COOKIE,
  getAdminUserFromCookieToken,
} from "@/lib/auth/adminSession";
import {
  DEFAULT_REGISTRATION_WINDOWS,
  getRegistrationWindow,
  isRegistrationWindowOpen,
} from "@/lib/registrationStatus";
import {
  CONTENT_ORGS,
  getSiteConfig,
  isContentOrgId,
  isMasterDeployment,
  resolveAdminTargetOrg,
  type ContentOrgId,
} from "@/lib/siteConfig";

export function generateMetadata() {
  return { title: `Registration Windows | ${getSiteConfig().name}` };
}

export default async function AdminRegistrationWindowsPage({
  searchParams,
}: {
  searchParams: Promise<{ org?: string }>;
}) {
  if (!isMasterDeployment()) {
    redirect("/admin?denied=registration-windows");
  }

  const cookieStore = await cookies();
  const token = cookieStore.get(ADMIN_SESSION_COOKIE)?.value;
  const user = await getAdminUserFromCookieToken(token);
  if (!user) {
    redirect(
      `/admin/login?next=${encodeURIComponent("/admin/registration")}`,
    );
  }

  const role: AdminRole = user.isMaster ? "MASTER_ADMIN" : "PARK_DIRECTOR";
  if (!user.isMaster || !canAccessAdminModule(role, "REGISTRATION_WINDOWS")) {
    redirect("/admin?denied=registration-windows");
  }

  const { org: orgParam } = await searchParams;
  const resolved = resolveAdminTargetOrg(orgParam);
  const org: ContentOrgId = isContentOrgId(resolved)
    ? resolved
    : isContentOrgId(orgParam)
      ? orgParam
      : "fallball";

  if (!isContentOrgId(org)) {
    redirect("/admin/registration?org=fallball");
  }

  const window = await getRegistrationWindow(org);
  const initial = {
    organizationId: org,
    startLocal: window.startLocal,
    endLocal: window.endLocal,
    source: window.source,
    isOpenNow: isRegistrationWindowOpen(window),
    defaults: DEFAULT_REGISTRATION_WINDOWS[org],
    timezone: "America/Chicago",
  };

  return (
    <main className="min-h-screen bg-zinc-950 py-6 text-white sm:py-8">
      <section className="mx-auto max-w-3xl px-4 sm:px-6">
        <div className="mb-4">
          <AdminSectionHeader
            badge="REGISTRATION"
            currentOrg={org}
            currentPath="/admin/registration"
            orgSwitcherShowAllSites={false}
            orgSwitcherOrgs={CONTENT_ORGS}
          />
        </div>
        <h1 className="mb-2 text-3xl font-bold tracking-tight sm:text-4xl">
          Registration Windows
        </h1>
        <p className="mb-8 max-w-2xl text-sm text-zinc-400">
          Set when public registration shows as open on each league site—without a
          deploy. Fall Ball parents see this on the homepage strip, registration
          page, and header Register button. Payment still runs on APBaseball.com /
          SportsConnect.
        </p>
        <AdminRegistrationWindowsManager
          organizationId={org}
          initial={initial}
        />
      </section>
    </main>
  );
}
