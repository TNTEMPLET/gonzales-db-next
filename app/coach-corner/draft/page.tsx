import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import CoachDraftSessionList from "@/components/coach-corner/CoachDraftSessionList";
import { ADMIN_SESSION_COOKIE, getAdminUserByToken } from "@/lib/auth/adminSession";
import { COACH_SESSION_COOKIE, getCoachUserFromCookieToken } from "@/lib/auth/coachSession";
import { getSiteConfig, resolveAdminTargetOrg } from "@/lib/siteConfig";

export function generateMetadata() {
  const site = getSiteConfig();
  return {
    title: `Live Draft | ${site.name}`,
    description: "Watch the live draft board and pick for your team when it's your turn.",
  };
}

export default async function CoachDraftListPage({
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

  const orgQuery = `org=${targetOrg}`;

  return (
    <main className="min-h-screen bg-zinc-950 py-10 text-white sm:py-14">
      <section className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="mb-8">
          <div className="mb-4 inline-block rounded-full bg-brand-purple px-4 py-2 text-[11px] tracking-[2px] sm:px-6 sm:text-xs sm:tracking-[3px]">
            LIVE DRAFT
          </div>
          <h1 className="mb-3 text-3xl font-bold tracking-tight md:text-5xl">Draft Day</h1>
          <p className="text-zinc-400 max-w-3xl">
            Follow the live board and draft for your team when it&apos;s your turn.
          </p>
        </div>
        <CoachDraftSessionList orgQuery={orgQuery} />
      </section>
    </main>
  );
}
