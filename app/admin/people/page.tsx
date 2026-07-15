import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import AdminSectionHeader from "@/components/admin/AdminSectionHeader";
import PeopleHub, {
  parsePeopleSection,
  type PeopleSection,
} from "@/components/admin/people/PeopleHub";
import {
  canAccessAdminModule,
  hasAdminRoleAtLeast,
  toAdminRole,
} from "@/lib/auth/adminRoles";
import {
  ADMIN_SESSION_COOKIE,
  getAdminUserFromCookieToken,
} from "@/lib/auth/adminSession";
import { getEffectiveAdminRoleForOrg } from "@/lib/auth/effectiveAdminRole";
import { isCoachingInterestEnabled } from "@/lib/org/capabilities";
import { getSiteConfig, resolveAdminTargetOrg } from "@/lib/siteConfig";

export function generateMetadata() {
  const site = getSiteConfig();
  return {
    title: `People | ${site.name}`,
    description:
      "Directory, volunteer compliance cards, and coaching interest for league operations.",
  };
}

export default async function AdminPeoplePage({
  searchParams,
}: {
  searchParams: Promise<{ org?: string; section?: string; userId?: string }>;
}) {
  const { org, section: sectionParam, userId } = await searchParams;
  const currentOrg = resolveAdminTargetOrg(org);
  const cookieStore = await cookies();
  const token = cookieStore.get(ADMIN_SESSION_COOKIE)?.value;
  const adminUser = await getAdminUserFromCookieToken(token);

  if (!adminUser) {
    redirect("/admin/login?next=/admin/people");
  }

  const effectiveRole = await getEffectiveAdminRoleForOrg(
    adminUser.id,
    adminUser.isMaster,
    currentOrg,
  );
  const role = effectiveRole ?? toAdminRole(adminUser.role, adminUser.isMaster);

  const canDirectory = canAccessAdminModule(role, "USERS");
  const canVolunteers = canAccessAdminModule(role, "VOLUNTEERS");
  const canCoachingInterest =
    canAccessAdminModule(role, "TEAMS") && isCoachingInterestEnabled(currentOrg);

  if (!canDirectory && !canVolunteers && !canCoachingInterest) {
    redirect("/admin?denied=people");
  }

  let initialSection: PeopleSection = parsePeopleSection(sectionParam);
  if (userId && canVolunteers) {
    initialSection = "volunteers";
  } else if (initialSection === "directory" && !canDirectory) {
    initialSection = canVolunteers
      ? "volunteers"
      : canCoachingInterest
        ? "coaching-interest"
        : "directory";
  } else if (initialSection === "volunteers" && !canVolunteers) {
    initialSection = canDirectory
      ? "directory"
      : canCoachingInterest
        ? "coaching-interest"
        : "directory";
  } else if (initialSection === "coaching-interest" && !canCoachingInterest) {
    initialSection = canDirectory
      ? "directory"
      : canVolunteers
        ? "volunteers"
        : "directory";
  }

  return (
    <main className="min-h-screen bg-zinc-950 py-10 text-white sm:py-14">
      <section className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="mb-8">
          <AdminSectionHeader
            badge="PEOPLE"
            currentOrg={currentOrg}
            currentPath={`/admin/people?section=${initialSection}`}
            allowRolePreview={hasAdminRoleAtLeast(role, "ADMIN")}
            allowViewByUser={adminUser.isMaster}
          />
          <h1 className="mb-3 text-4xl font-bold tracking-tight md:text-5xl">
            People
          </h1>
          <p className="max-w-3xl text-zinc-400">
            One place for accounts, volunteer compliance (JDP and Abuse Awareness), and
            coaching interest. Permission changes apply to the organization selected above.
          </p>
        </div>

        <Suspense
          fallback={
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 px-4 py-8 text-zinc-400">
              Loading people console…
            </div>
          }
        >
          <PeopleHub
            targetOrg={currentOrg}
            initialSection={initialSection}
            focusUserId={userId || null}
            isMaster={adminUser.isMaster || role === "MASTER_ADMIN"}
            canDirectory={canDirectory}
            canVolunteers={canVolunteers}
            canCoachingInterest={canCoachingInterest}
          />
        </Suspense>
      </section>
    </main>
  );
}
