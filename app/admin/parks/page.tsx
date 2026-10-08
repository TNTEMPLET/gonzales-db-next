import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";

import AdminSectionHeader from "@/components/admin/AdminSectionHeader";
import ParksVenuesClient from "@/components/admin/ParksVenuesClient";
import { ADMIN_SESSION_COOKIE, getAdminUserFromCookieToken } from "@/lib/auth/adminSession";
import { getEffectiveAdminRoleForOrg } from "@/lib/auth/effectiveAdminRole";
import { venuesPageAccess } from "@/lib/venues/access";
import { loadParksScreen } from "@/lib/venues/load";
import { getSiteConfig, isMasterDeployment, resolveAdminTargetOrg } from "@/lib/siteConfig";

export const dynamic = "force-dynamic";

export function generateMetadata() {
  const site = getSiteConfig();
  return {
    title: `Parks | ${site.name}`,
    description: "Link each league park to one shared physical park.",
  };
}

export default async function ParksPage({
  searchParams,
}: {
  searchParams: Promise<{ org?: string }>;
}) {
  if (!isMasterDeployment()) notFound();

  const { org } = await searchParams;
  const currentOrg = resolveAdminTargetOrg(org);
  const adminUser = await getAdminUserFromCookieToken(
    (await cookies()).get(ADMIN_SESSION_COOKIE)?.value,
  );
  const role = adminUser
    ? await getEffectiveAdminRoleForOrg(adminUser.id, adminUser.isMaster, currentOrg)
    : null;
  const access = venuesPageAccess({
    masterDeployment: true,
    authenticated: Boolean(adminUser),
    role,
  });

  if (access === "login") {
    redirect(`/admin/login?next=${encodeURIComponent(`/admin/parks?org=${currentOrg}`)}`);
  }
  if (access === "not_found") notFound();
  if (access !== "ok" || !adminUser) {
    redirect("/admin?denied=parks");
  }

  const model = await loadParksScreen();

  return (
    <main className="min-h-screen bg-zinc-950 py-10 text-white sm:py-14">
      <section className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="mb-8">
          <AdminSectionHeader
            badge="PARKS"
            currentOrg={currentOrg}
            currentPath={`/admin/parks?org=${currentOrg}`}
            allowRolePreview
            allowViewByUser={adminUser.isMaster}
          />
          <h1 className="mb-3 text-4xl font-bold tracking-tight md:text-5xl">Parks</h1>
          <p className="max-w-3xl text-zinc-400">
            Each league keeps its own park list for schedules. This page connects those rows to
            one shared park. Exact names are linked by the staging pre-fill script. Similar names
            stay suggestions until you confirm them. Schedules, rainouts, and the field desk keep
            working when a park is not linked.
          </p>
        </div>
        <ParksVenuesClient initial={model} />
      </section>
    </main>
  );
}
