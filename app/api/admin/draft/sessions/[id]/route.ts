import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { getDraftSessionState, preClaimAllProtections, resolveAutoPicks } from "@/lib/draft/draftEngine";
import { prisma } from "@/lib/prisma";
import { ensureAdminModule } from "@/lib/auth/ensureAdminModule";
import { draftApiError } from "@/lib/draft/apiError";
import { withTransientDbRetry } from "@/lib/prismaRetry";

/**
 * Note: GET deliberately does NOT call resolveAutoPicks -- this route is
 * polled every few seconds by every open admin tab, and running an extra
 * read-modify-write pass on every single poll (instead of only right after a
 * pick/skip/status change actually happens) was a meaningful, unnecessary
 * source of load on live draft night. Every mutation that can leave an
 * auto-resolvable pick pending (pick, skip, the LIVE transition, undo)
 * already triggers resolveAutoPicks itself.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await ensureAdminModule(req, "DRAFT");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }

  try {
    const { id } = await params;
    const state = await withTransientDbRetry(() => getDraftSessionState(id));
    return NextResponse.json(state);
  } catch (e) {
    return draftApiError("session.get", e, 404);
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await ensureAdminModule(req, "DRAFT");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }

  try {
    const { id } = await params;
    const body = await req.json();
    const {
      name,
      status,
      secondsPerPick,
      totalRounds,
      draftType,
      draftLeaderUserId,
      currentRound,
      currentPickIndex,
    } = body;

    const dataToUpdate: Prisma.DraftSessionUncheckedUpdateInput = {};
    if (name !== undefined) dataToUpdate.name = name;
    if (status !== undefined) dataToUpdate.status = status;
    if (secondsPerPick !== undefined) dataToUpdate.secondsPerPick = secondsPerPick === null ? null : parseInt(String(secondsPerPick), 10);
    if (totalRounds !== undefined) dataToUpdate.totalRounds = parseInt(String(totalRounds), 10);
    if (draftType !== undefined) dataToUpdate.draftType = draftType;
    if (draftLeaderUserId !== undefined) dataToUpdate.draftLeaderUserId = draftLeaderUserId || null;
    if (currentRound !== undefined) dataToUpdate.currentRound = parseInt(String(currentRound), 10);
    if (currentPickIndex !== undefined) dataToUpdate.currentPickIndex = parseInt(String(currentPickIndex), 10);

    // Pre-claim every unclaimed reserved player the instant the draft goes
    // (or resumes) live, rather than lazily as the live sequence reaches
    // each round -- run before the status flip so a client polling right
    // after this PATCH already sees the pre-claimed picks.
    let previousStatus: string | undefined;
    if (status === "LIVE") {
      const current = await prisma.draftSession.findUnique({ where: { id }, select: { status: true } });
      previousStatus = current?.status;
    }

    const updated = await prisma.draftSession.update({
      where: { id },
      data: dataToUpdate,
      include: {
        draftLeader: { select: { id: true, name: true, email: true } },
      },
    });

    if (status === "LIVE" && previousStatus !== "LIVE") {
      await withTransientDbRetry(() => preClaimAllProtections(id));
      // Covers a team on the clock from the very start with no protection
      // but auto-draft enabled -- every other case is covered by the pick
      // and skip routes calling this themselves right after they mutate.
      await withTransientDbRetry(() => resolveAutoPicks(id));
    }

    return NextResponse.json({ session: updated });
  } catch (e) {
    return draftApiError("session.update", e);
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await ensureAdminModule(req, "DRAFT");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }

  try {
    const { id } = await params;

    await prisma.draftSession.delete({
      where: { id },
    });

    return NextResponse.json({ success: true, message: "Draft session deleted successfully" });
  } catch (e) {
    return draftApiError("session.delete", e);
  }
}
