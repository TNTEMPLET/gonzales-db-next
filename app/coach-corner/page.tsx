import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import CoachCornerClient from "@/components/coach-corner/CoachCornerClient";
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

  return (
    <main className="min-h-screen bg-zinc-950 text-white py-14">
      <section className="max-w-6xl mx-auto px-6">
        <div className="mb-8">
          <div className="inline-block bg-brand-purple text-xs tracking-[3px] px-6 py-2 rounded-full mb-4">
            COACH&apos;S CORNER
          </div>
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-3">
            Team Operations Workspace
          </h1>
          <p className="text-zinc-400 max-w-3xl">
            Manage team contact details, practice plans, player roster statuses, and
            game-specific notes from one page.
          </p>
        </div>
        <CoachCornerClient targetOrg={targetOrg as ContentOrgId} />
      </section>
    </main>
  );
}
