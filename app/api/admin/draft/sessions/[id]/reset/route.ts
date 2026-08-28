import { NextRequest, NextResponse } from "next/server";
import { resetDraftSession, getDraftSessionState } from "@/lib/draft/draftEngine";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    await resetDraftSession(id);
    const updatedState = await getDraftSessionState(id);
    return NextResponse.json({ success: true, ...updatedState });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
