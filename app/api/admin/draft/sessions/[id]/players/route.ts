import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ensureAdminModule } from "@/lib/auth/ensureAdminModule";
import { draftApiError } from "@/lib/draft/apiError";

type PlayerPayload = {
  firstName?: string | null;
  lastName?: string | null;
  fullName?: string | null;
  guardianEmail?: string | null;
  guardianPhone?: string | null;
  birthDate?: string | null;
  evaluationScore?: number | string | null;
  pitcherRating?: number | string | null;
  catcherRating?: number | string | null;
  notes?: string | null;
};

/** True for any value that should produce a real number, including 0 — only nullish/empty are excluded. */
function hasNumericValue(v: number | string | null | undefined): v is number | string {
  return v !== undefined && v !== null && v !== "";
}

function toPlayerPoolCreateData(draftSessionId: string, p: PlayerPayload) {
  return {
    draftSessionId,
    firstName: p.firstName || null,
    lastName: p.lastName || null,
    fullName: p.fullName || `${p.firstName || ""} ${p.lastName || ""}`.trim(),
    guardianEmail: p.guardianEmail || null,
    guardianPhone: p.guardianPhone || null,
    birthDate: p.birthDate ? new Date(p.birthDate) : null,
    evaluationScore: hasNumericValue(p.evaluationScore) ? parseFloat(String(p.evaluationScore)) : null,
    pitcherRating: hasNumericValue(p.pitcherRating) ? parseInt(String(p.pitcherRating), 10) : null,
    catcherRating: hasNumericValue(p.catcherRating) ? parseInt(String(p.catcherRating), 10) : null,
    notes: p.notes || null,
  };
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
    const players = await prisma.draftPlayerPool.findMany({
      where: { draftSessionId: id },
      orderBy: [{ evaluationScore: "desc" }, { fullName: "asc" }],
    });
    return NextResponse.json({ players });
  } catch (e) {
    return draftApiError("players.list", e);
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

    if (body.action === "import" && Array.isArray(body.players)) {
      // Batch import
      const created = await prisma.draftPlayerPool.createMany({
        data: (body.players as PlayerPayload[]).map((p) => toPlayerPoolCreateData(id, p)),
      });
      return NextResponse.json({ count: created.count }, { status: 201 });
    }

    const playerData = toPlayerPoolCreateData(id, body as PlayerPayload);
    if (!playerData.fullName) {
      return NextResponse.json({ error: "Player name is required" }, { status: 400 });
    }

    const player = await prisma.draftPlayerPool.create({ data: playerData });

    return NextResponse.json({ player }, { status: 201 });
  } catch (e) {
    return draftApiError("players.create", e);
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
      playerId,
      firstName,
      lastName,
      fullName,
      guardianEmail,
      guardianPhone,
      evaluationScore,
      pitcherRating,
      catcherRating,
      notes,
    } = body;

    if (!playerId) {
      return NextResponse.json({ error: "playerId is required" }, { status: 400 });
    }

    const computedFullName = fullName || (firstName || lastName ? `${firstName || ""} ${lastName || ""}`.trim() : undefined);

    const updated = await prisma.draftPlayerPool.update({
      where: { id: playerId, draftSessionId: id },
      data: {
        ...(firstName !== undefined && { firstName }),
        ...(lastName !== undefined && { lastName }),
        ...(computedFullName !== undefined && { fullName: computedFullName }),
        ...(guardianEmail !== undefined && { guardianEmail }),
        ...(guardianPhone !== undefined && { guardianPhone }),
        ...(evaluationScore !== undefined && {
          evaluationScore: evaluationScore !== null && evaluationScore !== "" ? parseFloat(String(evaluationScore)) : null,
        }),
        ...(pitcherRating !== undefined && {
          pitcherRating: pitcherRating !== null && pitcherRating !== "" ? parseInt(String(pitcherRating), 10) : null,
        }),
        ...(catcherRating !== undefined && {
          catcherRating: catcherRating !== null && catcherRating !== "" ? parseInt(String(catcherRating), 10) : null,
        }),
        ...(notes !== undefined && { notes }),
      },
    });

    return NextResponse.json({ player: updated });
  } catch (e) {
    return draftApiError("players.update", e);
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
    const playerId = searchParams.get("playerId");

    if (!playerId) {
      return NextResponse.json({ error: "playerId query parameter required" }, { status: 400 });
    }

    const player = await prisma.draftPlayerPool.findUnique({
      where: { id: playerId, draftSessionId: id },
    });

    if (!player) {
      return NextResponse.json({ error: "Player not found" }, { status: 404 });
    }

    if (player.isDrafted) {
      return NextResponse.json(
        { error: "Cannot delete a player that has already been drafted. Undo pick first." },
        { status: 400 }
      );
    }

    await prisma.draftPlayerPool.delete({
      where: { id: playerId },
    });

    return NextResponse.json({ success: true, message: "Player removed from draft pool" });
  } catch (e) {
    return draftApiError("players.delete", e);
  }
}
