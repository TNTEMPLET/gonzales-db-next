import { NextRequest, NextResponse } from "next/server";
import { materializeDraftSession } from "@/lib/draft/materializeDraft";
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
    const result = await materializeDraftSession(id);
    return NextResponse.json(result);
  } catch (e) {
    return draftApiError("session.materialize", e);
  }
}
