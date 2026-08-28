import { NextRequest, NextResponse } from "next/server";
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
    const teams = await prisma.draftTeam.findMany({
      where: { draftSessionId: id },
      orderBy: { draftOrder: "asc" },
      include: {
        headCoach: { select: { id: true, name: true, email: true } },
        assistantCoach: { select: { id: true, name: true, email: true } },
        protections: true,
        picks: true,
      },
    });
    return NextResponse.json({ teams });
  } catch (e) {
    return draftApiError("teams.list", e);
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
    const { teamName, headCoachUserId, assistantUserId } = body;

    if (!teamName) {
      return NextResponse.json({ error: "teamName is required" }, { status: 400 });
    }

    // Get highest draftOrder
    const highestOrderTeam = await prisma.draftTeam.findFirst({
      where: { draftSessionId: id },
      orderBy: { draftOrder: "desc" },
    });

    const draftOrder = (highestOrderTeam?.draftOrder || 0) + 1;

    const team = await prisma.draftTeam.create({
      data: {
        draftSessionId: id,
        teamName,
        draftOrder,
        headCoachUserId: headCoachUserId || null,
        assistantUserId: assistantUserId || null,
      },
      include: {
        headCoach: { select: { id: true, name: true, email: true } },
        assistantCoach: { select: { id: true, name: true, email: true } },
      },
    });

    return NextResponse.json({ team }, { status: 201 });
  } catch (e) {
    return draftApiError("teams.create", e);
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

    if (body.action === "reorder" && Array.isArray(body.teamOrders)) {
      // [{ teamId, draftOrder }]
      await prisma.$transaction(
        (body.teamOrders as { teamId: string; draftOrder: number }[]).map((item) =>
          prisma.draftTeam.update({
            where: { id: item.teamId, draftSessionId: id },
            data: { draftOrder: item.draftOrder },
          })
        )
      );
      return NextResponse.json({ success: true });
    }

    const { teamId, teamName, draftOrder, headCoachUserId, assistantUserId } = body;
    if (!teamId) {
      return NextResponse.json({ error: "teamId is required" }, { status: 400 });
    }

    const updated = await prisma.draftTeam.update({
      where: { id: teamId, draftSessionId: id },
      data: {
        ...(teamName !== undefined && { teamName }),
        ...(draftOrder !== undefined && { draftOrder: parseInt(String(draftOrder), 10) }),
        ...(headCoachUserId !== undefined && { headCoachUserId: headCoachUserId || null }),
        ...(assistantUserId !== undefined && { assistantUserId: assistantUserId || null }),
      },
      include: {
        headCoach: { select: { id: true, name: true, email: true } },
        assistantCoach: { select: { id: true, name: true, email: true } },
      },
    });

    return NextResponse.json({ team: updated });
  } catch (e) {
    return draftApiError("teams.update", e);
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
    const teamId = searchParams.get("teamId");

    if (!teamId) {
      return NextResponse.json({ error: "teamId is required" }, { status: 400 });
    }

    const team = await prisma.draftTeam.findUnique({
      where: { id: teamId, draftSessionId: id },
      include: { picks: true },
    });

    if (!team) {
      return NextResponse.json({ error: "Team not found" }, { status: 404 });
    }

    if (team.picks.length > 0) {
      return NextResponse.json(
        { error: "Cannot delete a team that already has draft picks. Reset draft or undo picks first." },
        { status: 400 }
      );
    }

    await prisma.draftTeam.delete({
      where: { id: teamId },
    });

    return NextResponse.json({ success: true, message: "Team deleted successfully" });
  } catch (e) {
    return draftApiError("teams.delete", e);
  }
}
