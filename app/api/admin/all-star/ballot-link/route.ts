import { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";

import { ensureAllStarVaultAdmin } from "@/lib/allStar/auth";
import { createBallotLinkToken, hashToken } from "@/lib/allStar/server";
import prisma from "@/lib/prisma";
import {
  getCanonicalBallotOriginForOrganizationId,
  resolveAdminTargetOrg,
} from "@/lib/siteConfig";

function forbidIfNotMaster() {
  return null;
}

export async function POST(request: NextRequest) {
  const auth = await ensureAllStarVaultAdmin(request);
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });
  const forbid = forbidIfNotMaster();
  if (forbid) return forbid;

  const targetOrg = resolveAdminTargetOrg(request.nextUrl.searchParams.get("org"));
  const body = (await request.json()) as { cycleId?: string; rotate?: boolean };
  if (!body.cycleId) {
    return NextResponse.json({ error: "cycleId is required" }, { status: 400 });
  }

  const cycle = await prisma.allStarBallotCycle.findUnique({
    where: { id: body.cycleId },
  });
  if (!cycle) {
    return NextResponse.json({ error: "Cycle not found" }, { status: 404 });
  }
  if (cycle.organizationId !== targetOrg) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const origin = getCanonicalBallotOriginForOrganizationId(cycle.organizationId);
  const shouldRotate =
    body.rotate === true || request.nextUrl.searchParams.get("rotate") === "1";

  // Idempotent behavior: return existing link unless explicit rotation requested.
  if (!shouldRotate && cycle.ballotLinkToken) {
    if (!cycle.ballotLinkTokenHash) {
      await prisma.allStarBallotCycle.update({
        where: { id: cycle.id },
        data: { ballotLinkTokenHash: hashToken(cycle.ballotLinkToken) },
      });
    }
    const existingLink = `${origin}/all-star/vote?t=${encodeURIComponent(cycle.ballotLinkToken)}`;
    return NextResponse.json({
      success: true,
      link: existingLink,
      cycleId: cycle.id,
      reused: true,
    });
  }

  for (let attempt = 0; attempt < 16; attempt++) {
    const token = createBallotLinkToken();
    const tokenHash = hashToken(token);
    try {
      await prisma.allStarBallotCycle.update({
        where: { id: cycle.id },
        data: {
          ballotLinkToken: token,
          ballotLinkTokenHash: tokenHash,
        },
      });
      const link = `${origin}/all-star/vote?t=${encodeURIComponent(token)}`;
      return NextResponse.json({
        success: true,
        link,
        cycleId: cycle.id,
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        continue;
      }
      throw error;
    }
  }

  return NextResponse.json(
    { error: "Could not allocate a unique ballot code. Try again." },
    { status: 409 },
  );

}
