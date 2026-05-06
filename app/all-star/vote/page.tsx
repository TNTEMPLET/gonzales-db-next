import { headers } from "next/headers";
import { redirect } from "next/navigation";

import AllStarVoteClient from "./AllStarVoteClient";
import { resolveCycleIdForVoteRequest } from "@/lib/allStar/voteCycle";
import prisma from "@/lib/prisma";
import {
  getCanonicalBallotOriginForOrganizationId,
  shouldSkipBallotCanonicalHostRedirect,
} from "@/lib/siteConfig";

function firstSearchParam(
  value: string | string[] | undefined,
): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value) && typeof value[0] === "string") return value[0];
  return "";
}

export default async function AllStarVotePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const cycleIdParam =
    firstSearchParam(sp.cycleId) || firstSearchParam(sp.c);
  const tokenParam =
    firstSearchParam(sp.token) || firstSearchParam(sp.t);

  const resolvedCycleId = await resolveCycleIdForVoteRequest(
    cycleIdParam || undefined,
    tokenParam || undefined,
  );

  if (resolvedCycleId) {
    const cycle = await prisma.allStarBallotCycle.findUnique({
      where: { id: resolvedCycleId },
      select: { organizationId: true },
    });
    if (cycle) {
      const canonical = getCanonicalBallotOriginForOrganizationId(
        cycle.organizationId,
      );
      const canonicalHost = new URL(canonical).hostname.toLowerCase();

      const h = await headers();
      const hostHeader = h.get("x-forwarded-host") ?? h.get("host") ?? "";
      const requestHost = hostHeader.split(",")[0]?.trim() ?? "";
      const requestHostname = requestHost.split(":")[0]?.toLowerCase() ?? "";

      if (
        requestHostname &&
        !shouldSkipBallotCanonicalHostRedirect(requestHostname) &&
        requestHostname !== canonicalHost
      ) {
        const qs = new URLSearchParams();
        const cycleIdQ = firstSearchParam(sp.cycleId);
        const cQ = firstSearchParam(sp.c);
        const tokenQ = firstSearchParam(sp.token);
        const tQ = firstSearchParam(sp.t);
        if (cycleIdQ) qs.set("cycleId", cycleIdQ);
        if (cQ) qs.set("c", cQ);
        if (tokenQ) qs.set("token", tokenQ);
        if (tQ) qs.set("t", tQ);
        const suffix = qs.toString();
        redirect(
          suffix
            ? `${canonical}/all-star/vote?${suffix}`
            : `${canonical}/all-star/vote`,
        );
      }
    }
  }

  return (
    <AllStarVoteClient
      initialCycleId={cycleIdParam}
      initialToken={tokenParam}
    />
  );
}
