import { NextRequest, NextResponse } from "next/server";

import { ensureAllStarVaultFinalRosterAdmin } from "@/lib/allStar/auth";
import { getAdminUserFromRequest } from "@/lib/auth/adminSession";
import prisma from "@/lib/prisma";

type FinalRosterOverrideBody = {
  cycleId?: string;
  candidateId?: string;
  override?: "SELECTED" | "REMOVED" | null;
  reason?: string | null;
};

export async function PATCH(request: NextRequest) {
  const body = (await request.json()) as FinalRosterOverrideBody;
  const cycleId = body.cycleId?.trim();
  const candidateId = body.candidateId?.trim();
  if (!cycleId || !candidateId) {
    return NextResponse.json({ error: "cycleId and candidateId are required" }, { status: 400 });
  }

  const auth = await ensureAllStarVaultFinalRosterAdmin(request, cycleId);
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });

  const candidate = await prisma.allStarCandidate.findUnique({
    where: { id: candidateId },
    select: { ballotCycleId: true },
  });
  if (!candidate || candidate.ballotCycleId !== cycleId) {
    return NextResponse.json({ error: "Candidate does not belong to cycle" }, { status: 400 });
  }

  const override =
    body.override === "SELECTED" || body.override === "REMOVED" ? body.override : null;
  const admin = await getAdminUserFromRequest(request);
  const reason = body.reason?.trim() || null;

  await prisma.allStarCandidate.update({
    where: { id: candidateId },
    data:
      override === null
        ? {
            finalRosterOverride: null,
            finalRosterOverrideReason: null,
            finalRosterOverrideAt: null,
            finalRosterOverrideByAdminId: null,
          }
        : {
            finalRosterOverride: override,
            finalRosterOverrideReason: reason,
            finalRosterOverrideAt: new Date(),
            finalRosterOverrideByAdminId: admin?.id || null,
          },
  });

  return NextResponse.json({ success: true });
}
