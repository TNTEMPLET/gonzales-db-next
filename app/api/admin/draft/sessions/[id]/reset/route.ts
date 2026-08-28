import { NextRequest, NextResponse } from "next/server";
import { resetDraftSession, getDraftSessionState } from "@/lib/draft/draftEngine";
import { ensureAdminModule } from "@/lib/auth/ensureAdminModule";
import { draftApiError } from "@/lib/draft/apiError";

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
    await resetDraftSession(id);
    const updatedState = await getDraftSessionState(id);
    return NextResponse.json({ success: true, ...updatedState });
  } catch (e) {
    return draftApiError("session.reset", e);
  }
}
