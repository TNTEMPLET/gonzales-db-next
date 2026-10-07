import { cookies } from "next/headers";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import ScoutTicketsClient from "@/components/admin/ScoutTicketsClient";
import { ADMIN_SESSION_COOKIE, getAdminUserFromCookieToken } from "@/lib/auth/adminSession";
import { scoutPageAccess } from "@/lib/scout/access";
import { loadScoutPage } from "@/lib/scout/queries";
import { isMasterDeployment, resolveAdminTargetOrg } from "@/lib/siteConfig";

export const dynamic = "force-dynamic";

export function generateMetadata() {
  return {
    title: "Tickets",
    robots: { index: false, follow: false },
  };
}

function firstParam(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

export default async function ScoutTicketsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const master = isMasterDeployment();
  const params = await searchParams;
  const org = resolveAdminTargetOrg(firstParam(params.org));
  const admin = master
    ? await getAdminUserFromCookieToken((await cookies()).get(ADMIN_SESSION_COOKIE)?.value)
    : null;
  const access = scoutPageAccess({
    masterDeployment: master,
    email: admin?.email ?? null,
  });

  if (access === "not_found") notFound();
  if (access === "login") {
    redirect(`/admin/login?next=${encodeURIComponent(`/admin/tickets?org=${org}`)}`);
  }

  const model = await loadScoutPage({
    status: firstParam(params.status),
    orgTag: firstParam(params.orgTag),
    sender: firstParam(params.sender),
    ticketId: firstParam(params.ticket),
  });

  return (
    <main className="min-h-screen bg-zinc-950 py-10 text-white sm:py-14">
      <section className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-red-300/80">Scout</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight">Tickets</h1>
            <p className="mt-2 max-w-xl text-sm text-zinc-400">
              Board mail from the inbox, checked about every 15 minutes. Subject, sender, and a short snippet only.
            </p>
          </div>
          <Link href={`/admin?org=${org}`} className="text-sm text-zinc-400 hover:text-red-200">
            Back to dashboard
          </Link>
        </div>
        <ScoutTicketsClient model={model} org={org} />
      </section>
    </main>
  );
}
