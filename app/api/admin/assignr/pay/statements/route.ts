import { NextRequest, NextResponse } from "next/server";

import { ensureAssignrAdmin } from "@/lib/assignr/adminAuth";
import { listAssignrStatements } from "@/lib/assignr/statements";

export async function GET(request: NextRequest) {
  const auth = await ensureAssignrAdmin(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }

  try {
    const statements = await listAssignrStatements();
    return NextResponse.json({ data: statements });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
