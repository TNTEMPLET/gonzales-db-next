import { NextRequest, NextResponse } from "next/server";
import { makeDraftPick, undoLastDraftPick } from "@/lib/draft/draftEngine";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();
    const { playerPoolId, adminUserId } = body;

    if (!playerPoolId) {
      return NextResponse.json({ error: "Missing playerPoolId" }, { status: 400 });
    }

    const result = await makeDraftPick(id, playerPoolId, adminUserId);
    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const result = await undoLastDraftPick(id);
    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
}
