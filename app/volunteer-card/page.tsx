import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";

import MyVolunteerCardClient from "@/components/volunteers/MyVolunteerCardClient";
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
    title: `My Volunteer Card | ${site.name}`,
    description:
      "View your volunteer compliance card and event access badge readiness.",
  };
}

export default async function VolunteerCardPage({
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

  // Any signed-in coach/volunteer session, or Park Director+ admin.
  const adminOk =
    !!admin &&
    hasAdminRoleAtLeast(toAdminRole(admin.role, admin.isMaster), "PARK_DIRECTOR");
  const sessionOk = !!coach && !coach.isBlocked;

  if (!sessionOk && !adminOk) {
    redirect("/");
  }

  return (
    <main className="min-h-screen bg-zinc-950 py-10 text-white sm:py-14">
      <section className="mx-auto max-w-2xl px-4 sm:px-6">
        <div className="mb-8">
          <div className="mb-4 inline-block rounded-full bg-brand-purple px-4 py-2 text-[11px] tracking-[2px] sm:px-6 sm:text-xs sm:tracking-[3px]">
            VOLUNTEER CARD
          </div>
          <h1 className="mb-3 text-3xl font-bold tracking-tight md:text-4xl">
            My Volunteer Card
          </h1>
          <p className="max-w-xl text-zinc-400">
            Your compliance status for this season. When you are Ready, this card
            can later become an event access badge for tournaments and gates.
          </p>
          <p className="mt-2 text-xs text-zinc-500">
            Need team tools?{" "}
            <Link
              href="/coach-corner"
              className="font-semibold text-brand-gold hover:text-brand-gold/80"
            >
              Coach&apos;s Corner
            </Link>
          </p>
        </div>
        <MyVolunteerCardClient targetOrg={targetOrg as ContentOrgId} />
      </section>
    </main>
  );
}
