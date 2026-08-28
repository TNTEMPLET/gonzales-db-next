import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const players = await prisma.draftPlayerPool.findMany({
      where: { draftSessionId: id },
      orderBy: [{ evaluationScore: "desc" }, { fullName: "asc" }],
    });
    return NextResponse.json({ players });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();

    if (body.action === "import" && Array.isArray(body.players)) {
      // Batch import
      const created = await prisma.draftPlayerPool.createMany({
        data: body.players.map((p: any) => ({
          draftSessionId: id,
          firstName: p.firstName || null,
          lastName: p.lastName || null,
          fullName: p.fullName || `${p.firstName || ""} ${p.lastName || ""}`.trim(),
          guardianEmail: p.guardianEmail || null,
          guardianPhone: p.guardianPhone || null,
          birthDate: p.birthDate ? new Date(p.birthDate) : null,
          evaluationScore: p.evaluationScore ? parseFloat(String(p.evaluationScore)) : null,
          pitcherRating: p.pitcherRating ? parseInt(String(p.pitcherRating), 10) : null,
          catcherRating: p.catcherRating ? parseInt(String(p.catcherRating), 10) : null,
          notes: p.notes || null,
        })),
      });
      return NextResponse.json({ count: created.count }, { status: 201 });
    }

    const {
      firstName,
      lastName,
      fullName,
      guardianEmail,
      guardianPhone,
      birthDate,
      evaluationScore,
      pitcherRating,
      catcherRating,
      notes,
    } = body;

    const computedFullName = fullName || `${firstName || ""} ${lastName || ""}`.trim();
    if (!computedFullName) {
      return NextResponse.json({ error: "Player name is required" }, { status: 400 });
    }

    const player = await prisma.draftPlayerPool.create({
      data: {
        draftSessionId: id,
        firstName: firstName || null,
        lastName: lastName || null,
        fullName: computedFullName,
        guardianEmail: guardianEmail || null,
        guardianPhone: guardianPhone || null,
        birthDate: birthDate ? new Date(birthDate) : null,
        evaluationScore: evaluationScore !== undefined && evaluationScore !== null && evaluationScore !== "" ? parseFloat(String(evaluationScore)) : null,
        pitcherRating: pitcherRating ? parseInt(String(pitcherRating), 10) : null,
        catcherRating: catcherRating ? parseInt(String(catcherRating), 10) : null,
        notes: notes || null,
      },
    });

    return NextResponse.json({ player }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
