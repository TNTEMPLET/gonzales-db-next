import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import CoachCornerClient from "@/components/coach-corner/CoachCornerClient";
import AdminOrgSwitcher from "@/components/admin/AdminOrgSwitcher";
import { hasAdminRoleAtLeast, toAdminRole } from "@/lib/auth/adminRoles";
import {
  ADMIN_SESSION_COOKIE,
  getAdminUserByToken,
} from "@/lib/auth/adminSession";
import {
  COACH_SESSION_COOKIE,
  getCoachUserFromCookieToken,
} from "@/lib/auth/coachSession";
import { getSiteConfig, resolveAdminTargetOrg } from "@/lib/siteConfig";
import type { ContentOrgId } from "@/lib/siteConfig";

export function generateMetadata() {
  const site = getSiteConfig();
  return {
    title: `Coach's Corner | ${site.name}`,
    description: "Manage team details, roster status, and schedule notes.",
  };
}

export default async function CoachCornerPage({
  searchParams,
}: {
  searchParams: Promise<{ org?: string }>;
}) {
  const { org } = await searchParams;
  const targetOrg = resolveAdminTargetOrg(org);
  const cookieStore = await cookies();
  const coachToken = cookieStore.get(COACH_SESSION_COOKIE)?.value;
  const adminToken = cookieStore.get(ADMIN_SESSION_COOKIE)?.value;
  const [coach, admin] = await Promise.all([
    getCoachUserFromCookieToken(coachToken),
    getAdminUserByToken(adminToken),
  ]);

  if (!coach && !admin) {
    redirect("/");
  }

  const canSwitchTargetOrg = admin
    ? hasAdminRoleAtLeast(toAdminRole(admin.role, admin.isMaster), "ADMIN")
    : false;

  return (
    <main className="min-h-screen bg-zinc-950 py-10 text-white sm:py-14">
      <section className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="mb-8">
          <div className="mb-4 inline-block rounded-full bg-brand-purple px-4 py-2 text-[11px] tracking-[2px] sm:px-6 sm:text-xs sm:tracking-[3px]">
            COACH&apos;S CORNER
          </div>
          <h1 className="mb-3 text-3xl font-bold tracking-tight md:text-5xl">
            Team Operations Workspace
          </h1>
          <p className="text-zinc-400 max-w-3xl">
            Manage team contact details, practice plans, player roster statuses, and
            game-specific notes from one page.
          </p>
        </div>
        {canSwitchTargetOrg ? (
          <div className="mb-6">
            <AdminOrgSwitcher currentOrg={targetOrg as ContentOrgId} currentPath="/coach-corner" />
          </div>
        ) : null}
        <CoachCornerClient targetOrg={targetOrg as ContentOrgId} />
      </section>
    </main>
  );
}
