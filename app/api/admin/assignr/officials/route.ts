import { NextRequest, NextResponse } from "next/server";

import { ensureAssignrAdmin } from "@/lib/assignr/adminAuth";
import { listAssignrUsers, officialDisplayName } from "@/lib/assignr/officials";

export async function GET(request: NextRequest) {
  const auth = await ensureAssignrAdmin(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }

  const search = request.nextUrl.searchParams.get("search") || undefined;
  try {
    const users = await listAssignrUsers({ search });
    return NextResponse.json({
      data: users.map((user) => ({
        ...user,
        displayName: officialDisplayName(user),
      })),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
