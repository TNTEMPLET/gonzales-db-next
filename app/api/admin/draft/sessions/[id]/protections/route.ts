import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { DraftProtectionType } from "@prisma/client";
import { ensureAdminModule } from "@/lib/auth/ensureAdminModule";
import { draftApiError } from "@/lib/draft/apiError";

function parseProtectionType(value: unknown): DraftProtectionType {
  if (value === "ASSISTANT_COACH_CHILD") return DraftProtectionType.ASSISTANT_COACH_CHILD;
  if (value === "RETURNING_PLAYER") return DraftProtectionType.RETURNING_PLAYER;
  return DraftProtectionType.HEAD_COACH_CHILD;
}

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
    const protections = await prisma.coachPlayerProtection.findMany({
      where: { draftSessionId: id },
      orderBy: [{ protectedRound: "asc" }, { createdAt: "asc" }],
      include: {
        draftTeam: {
          select: { id: true, teamName: true, draftOrder: true },
        },
      },
    });
    return NextResponse.json({ protections });
  } catch (e) {
    return draftApiError("protections.list", e);
  }
}

export async function POST(
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
      draftTeamId,
      registeredUserId,
      playerName,
      guardianEmail,
      protectionType = "HEAD_COACH_CHILD",
      protectedRound = 1,
    } = body;

    if (!draftTeamId || !playerName?.trim()) {
      return NextResponse.json(
        { error: "draftTeamId and playerName are required" },
        { status: 400 }
      );
    }

    const team = await prisma.draftTeam.findUnique({
      where: { id: draftTeamId, draftSessionId: id },
    });

    if (!team) {
      return NextResponse.json({ error: "Draft team not found" }, { status: 404 });
    }

    const protection = await prisma.coachPlayerProtection.create({
      data: {
        draftSessionId: id,
        draftTeamId,
        registeredUserId: registeredUserId || null,
        playerName: playerName.trim(),
        guardianEmail: guardianEmail || null,
        protectionType: parseProtectionType(protectionType),
        protectedRound: parseInt(String(protectedRound), 10) || 1,
        isClaimed: false,
      },
    });

    return NextResponse.json({ protection }, { status: 201 });
  } catch (e) {
    return draftApiError("protections.create", e);
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
    const { protectionId, draftTeamId, playerName, guardianEmail, protectionType, protectedRound, isClaimed, isOverridden } = body;

    if (!protectionId) {
      return NextResponse.json({ error: "protectionId is required" }, { status: 400 });
    }

    const updated = await prisma.coachPlayerProtection.update({
      where: { id: protectionId, draftSessionId: id },
      data: {
        ...(draftTeamId !== undefined && { draftTeamId }),
        ...(playerName !== undefined && { playerName: playerName.trim() }),
        ...(guardianEmail !== undefined && { guardianEmail: guardianEmail || null }),
        ...(protectionType !== undefined && {
          protectionType: parseProtectionType(protectionType),
        }),
        ...(protectedRound !== undefined && {
          protectedRound: parseInt(String(protectedRound), 10) || 1,
        }),
        ...(isClaimed !== undefined && { isClaimed: Boolean(isClaimed) }),
        ...(isOverridden !== undefined && { isOverridden: Boolean(isOverridden) }),
      },
    });

    return NextResponse.json({ protection: updated });
  } catch (e) {
    return draftApiError("protections.update", e);
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
    const { searchParams } = new URL(req.url);
    const protectionId = searchParams.get("protectionId");

    if (!protectionId) {
      return NextResponse.json({ error: "protectionId is required" }, { status: 400 });
    }

    await prisma.coachPlayerProtection.delete({
      where: { id: protectionId, draftSessionId: id },
    });

    return NextResponse.json({ success: true, message: "Protection removed" });
  } catch (e) {
    return draftApiError("protections.delete", e);
  }
}
