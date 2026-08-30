import { cookies } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";

import CoachDraftRoom from "@/components/coach-corner/CoachDraftRoom";
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

export default async function CoachDraftSessionPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ org?: string }>;
}) {
  const { id } = await params;
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
      <section className="mx-auto max-w-7xl px-4 sm:px-6">
        <div className="mb-6">
          <Link href={`/coach-corner/draft?${orgQuery}`} className="text-xs text-zinc-400 hover:text-white">
            ← Back to Drafts
          </Link>
        </div>
        <CoachDraftRoom sessionId={id} orgQuery={orgQuery} />
      </section>
    </main>
  );
}
