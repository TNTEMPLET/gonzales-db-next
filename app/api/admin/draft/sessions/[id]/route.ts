import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { getDraftSessionState, resolveAutoProtectedPicks } from "@/lib/draft/draftEngine";
import { prisma } from "@/lib/prisma";
import { ensureAdminModule } from "@/lib/auth/ensureAdminModule";
import { draftApiError } from "@/lib/draft/apiError";

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
    await resolveAutoProtectedPicks(id);
    const state = await getDraftSessionState(id);
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

    const updated = await prisma.draftSession.update({
      where: { id },
      data: dataToUpdate,
      include: {
        draftLeader: { select: { id: true, name: true, email: true } },
      },
    });

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
