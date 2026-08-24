import { NextRequest, NextResponse } from "next/server";
import { getDraftSessionState } from "@/lib/draft/draftEngine";
import { prisma } from "@/lib/prisma";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const state = await getDraftSessionState(id);
    return NextResponse.json(state);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 404 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();
    const { status, secondsPerPick, totalRounds } = body;

    const updated = await prisma.draftSession.update({
      where: { id },
      data: {
        ...(status && { status }),
        ...(secondsPerPick !== undefined && { secondsPerPick }),
        ...(totalRounds !== undefined && { totalRounds }),
      },
    });

    return NextResponse.json({ session: updated });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
